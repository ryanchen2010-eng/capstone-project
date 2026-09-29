"""Local RDKit service for the small-molecule Builder and Reaction Lab.

Run with ``.venv/bin/python server/chemistry_server.py``. Vite proxies
``/api/chemistry`` to this loopback-only process during local development.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors

if __package__:
    from .pubchem_service import PubChemError, get_pubchem_depiction, get_pubchem_smiles, get_pubchem_structure, search_pubchem
else:  # Also support the documented ``python server/chemistry_server.py`` command.
    from pubchem_service import PubChemError, get_pubchem_depiction, get_pubchem_smiles, get_pubchem_structure, search_pubchem


MAX_BODY_BYTES = 200_000
MAX_ATOMS = 80
ALLOWED_ELEMENTS = {"H", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Br", "I"}
BUILDER_3D_ELEMENTS = {"H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Ge", "As", "Se", "Br", "Sb", "Te", "I"}
ELEMENT_NAMES = {"C": "Carbon", "N": "Nitrogen", "O": "Oxygen", "H": "Hydrogen"}

# A small, reviewed teaching collection—not a general reaction predictor.
# The source links explain the reaction classes and required conditions.
REACTANTS = {
    "ethene": {"name": "Ethene", "smiles": "C=C", "aliases": ["ethylene"]},
    "hydrogen": {"name": "Hydrogen", "smiles": "[H][H]", "aliases": ["H2"]},
    "bromine": {"name": "Bromine", "smiles": "BrBr", "aliases": ["Br2"]},
    "water": {"name": "Water", "smiles": "O", "aliases": ["H2O"]},
    "ethanol": {"name": "Ethanol", "smiles": "CCO", "aliases": ["ethyl alcohol"]},
    "dimethyl-ether": {"name": "Dimethyl ether", "smiles": "COC", "aliases": ["methoxymethane"]},
    "ethanoic-acid": {"name": "Ethanoic acid", "smiles": "CC(=O)O", "aliases": ["acetic acid"]},
    "bromomethane": {"name": "Bromomethane", "smiles": "CBr", "aliases": ["methyl bromide"]},
    "chloromethane": {"name": "Chloromethane", "smiles": "CCl", "aliases": ["methyl chloride"]},
    "bromoethane": {"name": "Bromoethane", "smiles": "CCBr", "aliases": ["ethyl bromide"]},
    "2-bromopropane": {"name": "2-Bromopropane", "smiles": "CC(C)Br", "aliases": ["isopropyl bromide"]},
    "tert-butyl-chloride": {"name": "2-Chloro-2-methylpropane", "smiles": "CC(C)(C)Cl", "aliases": ["tert-butyl chloride"]},
    "hydroxide": {"name": "Hydroxide ion", "smiles": "[OH-]", "formula": "OH⁻", "aliases": ["hydroxide", "OH-", "HO-"]},
    "sodium-hypochlorite": {"name": "Sodium hypochlorite", "smiles": "[Na+].[O-]Cl", "formula": "NaClO", "aliases": ["sodium oxychloride", "NaClO"]},
}

# Explorer and Reaction Lab use the same source of compound names, structures,
# formulas, and PubChem identities. Reagents specific to Reaction Lab stay above.
SHARED_MOLECULES = json.loads((Path(__file__).resolve().parents[1] / "src" / "shared-molecules.json").read_text(encoding="utf-8"))
FORMULA_SUBSCRIPTS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
REACTANTS.update({item["id"]: {"name": item["name"], "smiles": item["smiles"],
                               "formula": item["formula"].translate(FORMULA_SUBSCRIPTS), "aliases": item["aliases"]}
                  for item in SHARED_MOLECULES})
REACTIONS = {
    "hydrogenation": {
        "name": "Hydrogenation", "reactants": ("ethene", "hydrogen"),
        "family": "Addition", "mechanism": "Hydrogenation", "profile": {"catalyst": "metal"},
        "productName": "Ethane", "productSmiles": "CC", "byproducts": [],
        "conditions": "Requires a metal catalyst such as palladium or platinum.",
        "explanation": "The carbon–carbon double bond becomes a single bond as two hydrogen atoms add.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/8-summary",
    },
    "bromination": {
        "name": "Bromine addition", "reactants": ("ethene", "bromine"),
        "family": "Addition", "mechanism": "Bromination", "profile": {"solvent": "dry"},
        "productName": "1,2-Dibromoethane", "productSmiles": "BrCCBr", "byproducts": [],
        "conditions": "Shown for bromine addition to ethene without water as a competing reactant.",
        "explanation": "The double bond becomes a single bond and one bromine bonds to each carbon.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/8-2-halogenation-of-alkenes-addition-of-x2",
    },
    "hydration": {
        "name": "Alkene hydration", "reactants": ("ethene", "water"),
        "family": "Addition", "mechanism": "Hydration", "profile": {"catalyst": "acid"},
        "productName": "Ethanol", "productSmiles": "CCO", "byproducts": [],
        "conditions": "Requires acid-catalyzed hydration; simply mixing ethene and water is not enough.",
        "explanation": "Hydrogen and an OH group add across the carbon–carbon double bond.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/8-summary",
    },
    "esterification": {
        "name": "Fischer esterification", "reactants": ("ethanoic-acid", "ethanol"),
        "family": "Condensation", "mechanism": "Esterification", "profile": {"catalyst": "acid"},
        "productName": "Ethyl ethanoate", "productSmiles": "CC(=O)OCC",
        "byproducts": [{"name": "Water", "smiles": "O"}],
        "conditions": "Requires an acid catalyst. This reaction is reversible and depends on conditions.",
        "explanation": "The acid and alcohol form an ester and water; the display shows one possible equilibrium direction.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/21-3-reactions-of-carboxylic-acids",
    },
    "ester-hydrolysis": {
        "name": "Acid-catalyzed ester hydrolysis", "reactants": ("ethyl-ethanoate", "water"),
        "family": "Hydrolysis", "mechanism": "Ester hydrolysis", "profile": {"solvent": "aqueous-protic", "catalyst": "acid"},
        "productName": "Ethanoic acid", "productSmiles": "CC(=O)O",
        "byproducts": [{"name": "Ethanol", "smiles": "CCO"}],
        "conditions": "Acid-catalyzed hydrolysis in water; this is the reversible counterpart of Fischer esterification.",
        "explanation": "Water helps split the ester linkage. The displayed net products are ethanoic acid and ethanol; the acid catalyst is not consumed.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/21-6-chemistry-of-esters",
    },
    "oxidation-2-propanol": {
        "name": "Secondary alcohol oxidation", "reactants": ("2-propanol", "sodium-hypochlorite"),
        "family": "Oxidation", "mechanism": "Alcohol oxidation", "profile": {"solvent": "aqueous-protic"},
        "productName": "Acetone", "productSmiles": "CC(C)=O",
        "byproducts": [{"name": "Sodium chloride", "smiles": "[Na+].[Cl-]", "formula": "NaCl"}, {"name": "Water", "smiles": "O"}],
        "conditions": "A simplified net equation for hypochlorite oxidation in an aqueous medium. Actual mixtures and side reactions are not modeled; do not treat this as a procedure or mix household chemicals.",
        "explanation": "The secondary alcohol carbon loses hydrogen as its C–O bond becomes a carbonyl C=O bond. Hypochlorite is reduced to chloride in this net equation.",
        "sourceUrl": "https://pubs.acs.org/doi/abs/10.1021/ed059p862",
    },
    "reduction-acetone": {
        "name": "Ketone hydrogenation", "reactants": ("acetone", "hydrogen"),
        "family": "Reduction", "mechanism": "Carbonyl hydrogenation", "profile": {"catalyst": "metal"},
        "productName": "2-Propanol", "productSmiles": "CC(C)O", "byproducts": [],
        "conditions": "Requires a suitable metal catalyst and hydrogenation conditions. Ketones may need more demanding conditions than alkenes; this lab does not model pressure or yield.",
        "explanation": "Hydrogen adds across the ketone C=O bond, converting acetone into the secondary alcohol 2-propanol.",
        "sourceUrl": "https://iris.cnr.it/handle/20.500.14243/209294",
    },
    "sn2-bromomethane": {
        "name": "SN2 substitution", "reactants": ("bromomethane", "hydroxide"),
        "family": "Substitution", "mechanism": "SN2", "profile": {"solvent": "polar-aprotic"},
        "productName": "Methanol", "productSmiles": "CO", "productEquationFormula": "CH3OH",
        "byproducts": [{"name": "Bromide ion", "smiles": "[Br-]", "formula": "Br⁻"}],
        "conditions": "Shown for an unhindered methyl halide and hydroxide; solvent affects the reaction rate.",
        "explanation": "Hydroxide forms a C–O bond as bromide leaves in one concerted SN2 step. Methyl carbon is not chiral, so there is no inversion to display here.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction",
    },
    "sn2-chloromethane": {
        "name": "SN2 substitution", "reactants": ("chloromethane", "hydroxide"),
        "family": "Substitution", "mechanism": "SN2", "profile": {"solvent": "polar-aprotic"},
        "productName": "Methanol", "productSmiles": "CO", "productEquationFormula": "CH3OH",
        "byproducts": [{"name": "Chloride ion", "smiles": "[Cl-]", "formula": "Cl⁻"}],
        "conditions": "Shown for an unhindered methyl halide and hydroxide; substrate, leaving group, and solvent affect the rate.",
        "explanation": "Hydroxide forms a C–O bond as chloride leaves in one concerted SN2 step. This example changes the leaving group, not the organic product.",
        "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-3-characteristics-of-the-sn2-reaction",
    },
}

# Profiles compare illustrative conditions; they are not kinetic predictions.
# Non-aligned pathways remain visible because mechanisms may compete.
CONDITION_VALUES = {
    "solvent": {"", "polar-aprotic", "aqueous-protic", "ethanolic-protic", "dry"},
    "temperature": {"", "ambient", "heated"},
    "catalyst": {"", "none", "acid", "metal"},
}

PRODUCT_NAMES = {
    "CCO": "Ethanol",
    "CCC": "Propane",
    "CCCC": "Butane",
    "CCCO": "1-Propanol",
    "CC(C)O": "2-Propanol",
    "CC(C)(C)O": "2-Methyl-2-propanol",
    "CC(Br)CBr": "1,2-Dibromopropane",
    "CCC(Br)CBr": "1,2-Dibromobutane",
    "C=C": "Ethene",
    "C=CC": "Propene",
    "C=C(C)C": "2-Methylpropene",
}


class ChemistryError(ValueError):
    """A requested structure or curated reaction is outside the current scope."""


def _molecule(smiles: str) -> Chem.Mol:
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        raise RuntimeError(f"Invalid curated structure: {smiles}")
    return molecule


def _formula(smiles: str) -> str:
    return rdMolDescriptors.CalcMolFormula(_molecule(smiles))


def _element_counts(smiles: str) -> Counter[str]:
    return Counter(atom.GetSymbol() for atom in Chem.AddHs(_molecule(smiles)).GetAtoms())


def _formal_charge(smiles: str) -> int:
    return sum(atom.GetFormalCharge() for atom in _molecule(smiles).GetAtoms())


def _alkyl_halide_site(smiles: str) -> dict[str, object] | None:
    """Recognize a narrow, uncharged, acyclic C/H/Cl/Br teaching substrate."""
    molecule = _molecule(smiles)
    if molecule.GetRingInfo().NumRings() or any(atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED for atom in molecule.GetAtoms()):
        return None
    if any(atom.GetSymbol() not in {"C", "Cl", "Br"} or atom.GetFormalCharge() for atom in molecule.GetAtoms()):
        return None
    if any(bond.GetBondType() != Chem.BondType.SINGLE for bond in molecule.GetBonds()):
        return None
    halogens = [atom for atom in molecule.GetAtoms() if atom.GetSymbol() in {"Cl", "Br"}]
    if len(halogens) != 1 or molecule.GetNumHeavyAtoms() > 5:
        return None
    halogen = halogens[0]
    if len(halogen.GetNeighbors()) != 1 or halogen.GetNeighbors()[0].GetSymbol() != "C":
        return None
    carbon = halogen.GetNeighbors()[0]
    carbon_neighbors = [atom for atom in carbon.GetNeighbors() if atom.GetSymbol() == "C"]
    beta_sites = [atom.GetIdx() for atom in carbon_neighbors if atom.GetTotalNumHs() > 0]
    return {
        "carbon": carbon.GetIdx(), "halogen": halogen.GetIdx(),
        "symbol": halogen.GetSymbol(), "degree": len(carbon_neighbors),
        "beta_sites": beta_sites,
    }


def _alcohol_product(smiles: str, site: dict[str, object]) -> str:
    editor = Chem.RWMol(_molecule(smiles))
    carbon = int(site["carbon"])
    halogen = int(site["halogen"])
    editor.RemoveAtom(halogen)
    oxygen = editor.AddAtom(Chem.Atom("O"))
    editor.AddBond(carbon - (halogen < carbon), oxygen, Chem.BondType.SINGLE)
    product = editor.GetMol()
    Chem.SanitizeMol(product)
    return Chem.MolToSmiles(product, canonical=True)


def _unique_alkene_product(smiles: str, site: dict[str, object]) -> str | None:
    products = set()
    for beta in site["beta_sites"]:
        editor = Chem.RWMol(_molecule(smiles))
        carbon = int(site["carbon"])
        halogen = int(site["halogen"])
        editor.RemoveBond(carbon, halogen)
        bond = editor.GetBondBetweenAtoms(carbon, int(beta))
        if bond is None:
            continue
        bond.SetBondType(Chem.BondType.DOUBLE)
        editor.RemoveAtom(halogen)
        product = editor.GetMol()
        Chem.SanitizeMol(product)
        products.add(Chem.MolToSmiles(product, canonical=True))
    # Avoid pretending to choose a regioisomer or stereoisomer automatically.
    return next(iter(products)) if len(products) == 1 else None


def _simple_alkene_bond(smiles: str) -> tuple[int, int] | None:
    """Find one C=C in a small, acyclic hydrocarbon without specified stereo."""
    molecule = _molecule(smiles)
    if molecule.GetRingInfo().NumRings() or not 2 <= molecule.GetNumHeavyAtoms() <= 6:
        return None
    if any(atom.GetSymbol() != "C" or atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED
           for atom in molecule.GetAtoms()):
        return None
    double_bonds = []
    for bond in molecule.GetBonds():
        if bond.GetStereo() != Chem.BondStereo.STEREONONE:
            return None
        if bond.GetBondType() == Chem.BondType.DOUBLE:
            double_bonds.append(bond)
        elif bond.GetBondType() != Chem.BondType.SINGLE:
            return None
    if len(double_bonds) != 1:
        return None
    return double_bonds[0].GetBeginAtomIdx(), double_bonds[0].GetEndAtomIdx()


def _alkene_addition_product(smiles: str, ends: tuple[int, int], halogen: str | None = None) -> str:
    editor = Chem.RWMol(_molecule(smiles))
    bond = editor.GetBondBetweenAtoms(*ends)
    if bond is None:
        raise RuntimeError("The alkene bond was not found in the selected structure.")
    bond.SetBondType(Chem.BondType.SINGLE)
    if halogen:
        for carbon in ends:
            atom = editor.AddAtom(Chem.Atom(halogen))
            editor.AddBond(carbon, atom, Chem.BondType.SINGLE)
    product = editor.GetMol()
    Chem.SanitizeMol(product)
    return Chem.MolToSmiles(product, canonical=True)


def _generate_alkene_reactions(custom_reactants: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    generated = {}
    for substrate_id, substrate in custom_reactants.items():
        ends = _simple_alkene_bond(substrate["smiles"])
        if ends is None:
            continue
        alkane = _alkene_addition_product(substrate["smiles"], ends)
        dibromide = _alkene_addition_product(substrate["smiles"], ends, "Br")
        generated[f"hydrogenation-{substrate_id}"] = {
            "name": "Alkene hydrogenation", "family": "Addition", "mechanism": "Hydrogenation",
            "reactants": (substrate_id, "hydrogen"), "profile": {"catalyst": "metal"},
            "productName": PRODUCT_NAMES.get(alkane, "Alkane product"), "productSmiles": alkane, "byproducts": [],
            "conditions": "Hydrogenation requires a metal catalyst such as palladium or platinum. Stereochemical outcomes are not assigned in this preview.",
            "explanation": "The C=C bond becomes a single bond as one hydrogen adds to each carbon. This shows connectivity, not a guaranteed stereoisomer or yield.",
            "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation",
        }
        generated[f"bromination-{substrate_id}"] = {
            "name": "Bromine addition", "family": "Addition", "mechanism": "Bromination",
            "reactants": (substrate_id, "bromine"), "profile": {"solvent": "dry"},
            "productName": PRODUCT_NAMES.get(dibromide, "Dibromoalkane product"), "productSmiles": dibromide, "byproducts": [],
            "conditions": "Bromine addition is shown without water as a competing reactant. The product connectivity is shown, but anti-addition stereochemistry is not assigned.",
            "explanation": "The C=C bond becomes a single bond and one bromine attaches to each carbon. The 3D view is one unassigned conformer, not a stereochemical prediction.",
            "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/8-2-halogenation-of-alkenes-addition-of-x2",
        }
    return generated


def _generate_rule_reactions(reactants: dict[str, dict[str, object]] = REACTANTS) -> dict[str, dict[str, object]]:
    generated = {}
    for substrate_id, substrate in reactants.items():
        site = _alkyl_halide_site(substrate["smiles"])
        if not site:
            continue
        symbol = str(site["symbol"])
        halide = {"name": "Bromide ion" if symbol == "Br" else "Chloride ion", "smiles": f"[{symbol}-]", "formula": f"{symbol}⁻"}
        hydrogen_halide = {"name": "Hydrogen bromide" if symbol == "Br" else "Hydrogen chloride", "smiles": symbol}
        degree = int(site["degree"])
        alcohol = _alcohol_product(substrate["smiles"], site)
        alkene = _unique_alkene_product(substrate["smiles"], site)

        if degree <= 1 and f"sn2-{substrate_id}" not in REACTIONS:
            generated[f"sn2-{substrate_id}"] = {
                "name": "SN2 substitution", "family": "Substitution", "mechanism": "SN2",
                "reactants": (substrate_id, "hydroxide"),
                "productName": PRODUCT_NAMES.get(alcohol, "Alcohol product"), "productSmiles": alcohol,
                "byproducts": [halide], "profile": {"solvent": "polar-aprotic"},
                "conditions": "An unhindered alkyl halide and hydroxide; a polar aprotic medium supports SN2. Other pathways may compete.",
                "explanation": "Hydroxide replaces the halogen in a concerted substitution. This narrow model does not handle chiral inversion.",
                "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-3-characteristics-of-the-sn2-reaction",
            }

        if alkene is not None:
            generated[f"e2-{substrate_id}"] = {
                "name": "E2 elimination", "family": "Elimination", "mechanism": "E2",
                "reactants": (substrate_id, "hydroxide"),
                "productName": PRODUCT_NAMES.get(alkene, "Alkene product"), "productSmiles": alkene,
                "byproducts": [{"name": "Water", "smiles": "O"}, halide],
                "profile": {"solvent": "ethanolic-protic", "temperature": "heated"},
                "conditions": "Strong base and heat can support E2; a beta hydrogen is required. This simple model does not check anti-periplanar geometry or product ratios.",
                "explanation": "The base takes a beta hydrogen while the halide leaves and a carbon–carbon double bond forms in one step.",
                "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-8-the-e2-reaction-and-the-deuterium-isotope-effect",
            }

        if degree == 3:
            generated[f"sn1-{substrate_id}"] = {
                "name": "SN1 substitution", "family": "Substitution", "mechanism": "SN1",
                "reactants": (substrate_id, "water"),
                "productName": PRODUCT_NAMES.get(alcohol, "Alcohol product"), "productSmiles": alcohol,
                "byproducts": [hydrogen_halide],
                "profile": {"solvent": "aqueous-protic", "temperature": "ambient"},
                "conditions": "A tertiary alkyl halide in water can undergo SN1 solvolysis. E1 can compete, especially on warming.",
                "explanation": "The halide leaves to form a carbocation; water then captures it to make an alcohol. Carbocation rearrangements are outside this prototype.",
                "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-4-the-sn1-reaction",
            }

        if degree == 3 and alkene is not None:
            generated[f"e1-{substrate_id}"] = {
                "name": "E1 elimination", "family": "Elimination", "mechanism": "E1",
                "reactants": (substrate_id, "water"),
                "equationReactants": (substrate_id,),  # Water is the selected solvent, not consumed.
                "productName": PRODUCT_NAMES.get(alkene, "Alkene product"), "productSmiles": alkene,
                "byproducts": [hydrogen_halide],
                "profile": {"solvent": "aqueous-protic", "temperature": "heated"},
                "conditions": "In a warm protic medium, E1 can compete with SN1. Water is shown as the medium, not a stoichiometric reactant.",
                "explanation": "The halide leaves to form a carbocation, then a beta hydrogen is lost to form an alkene. Product mixtures and rearrangements are not modeled.",
                "sourceUrl": "https://openstax.org/books/organic-chemistry/pages/11-10-the-e1-and-e1cb-reactions",
            }
    return generated


GENERATED_REACTIONS = _generate_rule_reactions()
GENERATED_ALKENE_REACTIONS = _generate_alkene_reactions(
    {key: value for key, value in REACTANTS.items() if key != "ethene"}
)
ALKALI_COUNTERIONS = {"Li", "Na", "K", "Rb", "Cs"}


def _all_reactions(custom_reactants: dict[str, dict[str, object]] | None = None) -> dict[str, dict[str, object]]:
    return {
        **REACTIONS, **GENERATED_REACTIONS, **GENERATED_ALKENE_REACTIONS,
        **(_generate_rule_reactions(custom_reactants) if custom_reactants else {}),
        **(_generate_alkene_reactions(custom_reactants) if custom_reactants else {}),
    }


def _hydroxide_from_salt(molecule: Chem.Mol) -> str | None:
    """Recognize a single alkali cation plus hydroxide for an ionic equation."""
    fragments = Chem.GetMolFrags(molecule, asMols=True)
    if len(fragments) != 2:
        return None
    hydroxides = [fragment for fragment in fragments if Chem.MolToSmiles(fragment, canonical=True) == "[OH-]"]
    cations = [fragment for fragment in fragments if fragment.GetNumAtoms() == 1
               and fragment.GetAtomWithIdx(0).GetSymbol() in ALKALI_COUNTERIONS
               and fragment.GetAtomWithIdx(0).GetFormalCharge() == 1]
    return cations[0].GetAtomWithIdx(0).GetSymbol() if len(hydroxides) == len(cations) == 1 else None


def _resolve_reactants(reactant_a: str | dict[str, str], reactant_b: str | dict[str, str]) -> tuple[tuple[str, str], dict[str, dict[str, object]], list[str]]:
    """Keep reviewed IDs stable and validate searched or drawn structures."""
    custom = {}
    ids = []
    interpretation_notes = []
    for slot, reference in enumerate((reactant_a, reactant_b)):
        if isinstance(reference, str) and reference in REACTANTS:
            if reference == "sodium-hydroxide":
                ids.append("hydroxide")
                interpretation_notes.append(f"Molecule {slot + 1}: sodium hydroxide supplies OH⁻; Na⁺ is omitted from the simplified ionic equation.")
                continue
            ids.append(reference)
            continue
        if not isinstance(reference, dict) or not isinstance(reference.get("smiles"), str):
            raise ChemistryError("Choose a listed molecule or send a valid Builder drawing.")
        smiles = reference["smiles"]
        if not smiles or len(smiles) > 1024:
            raise ChemistryError("The Builder structure is empty or too large.")
        molecule = Chem.MolFromSmiles(smiles)
        if molecule is None or not molecule.GetNumAtoms() or molecule.GetNumAtoms() > MAX_ATOMS:
            raise ChemistryError("The Builder structure is invalid or too large.")
        if len(Chem.GetMolFrags(molecule)) != 1:
            counterion = _hydroxide_from_salt(molecule)
            if counterion:
                ids.append("hydroxide")
                interpretation_notes.append(f"Molecule {slot + 1}: this alkali-metal hydroxide supplies OH⁻; {counterion}⁺ is omitted from the simplified ionic equation.")
                continue
            raise ChemistryError("This multi-part compound is outside the current reaction rules.")
        canonical = Chem.MolToSmiles(molecule, canonical=True)
        reviewed_id = next(
            (key for key, item in REACTANTS.items()
             if Chem.MolToSmiles(_molecule(item["smiles"]), canonical=True) == canonical),
            None,
        )
        if reviewed_id:
            ids.append(reviewed_id)
            continue
        if any(atom.GetSymbol() not in ALLOWED_ELEMENTS or atom.GetFormalCharge() or atom.HasQuery()
               or atom.GetNumRadicalElectrons() or atom.GetIsotope() for atom in molecule.GetAtoms()):
            raise ChemistryError("This structure is outside the supported neutral, non-radical molecule scope.")
        identifier = f"drawn-{slot + 1}"
        custom[identifier] = {"name": "Drawn molecule", "smiles": canonical}
        ids.append(identifier)
    return (ids[0], ids[1]), custom, interpretation_notes


def _conditions(raw: dict[str, str] | None) -> dict[str, str]:
    if raw is None:
        return {key: "" for key in CONDITION_VALUES}
    if not isinstance(raw, dict):
        raise ChemistryError("Choose the reaction conditions from the available options.")
    result = {}
    for key, allowed in CONDITION_VALUES.items():
        value = raw.get(key, "")
        if not isinstance(value, str) or value not in allowed:
            raise ChemistryError("Choose the reaction conditions from the available options.")
        result[key] = value
    return result


def _profile(reaction: dict[str, object]) -> dict[str, str]:
    return reaction["profile"]


def _assessment(reaction: dict[str, object], conditions: dict[str, str]) -> dict[str, str]:
    profile = _profile(reaction)
    missing = [key for key, value in profile.items() if not conditions[key]]
    different = [key for key, value in profile.items() if conditions[key] and conditions[key] != value]
    if different:
        return {"state": "alternative", "note": "Selected conditions differ from this pathway's teaching example; it may still compete."}
    if missing:
        return {"state": "incomplete", "note": "Set the remaining conditions to compare this pathway."}
    if "catalyst" not in profile and conditions["catalyst"] in {"acid", "metal"}:
        return {"state": "incomplete", "note": "The required conditions align, but this additional catalyst is not evaluated for this pathway."}
    return {"state": "aligned", "note": "Selected conditions align with this reviewed pathway; this does not predict yield or certainty."}


def _serialize_reaction(reaction_id: str, reaction: dict[str, object], conditions: dict[str, str] | None = None) -> dict[str, object]:
    payload = {
        "id": reaction_id, "name": reaction["name"], "family": reaction["family"], "mechanism": reaction["mechanism"],
        "reactants": reaction["reactants"],
        "equationReactants": reaction.get("equationReactants", reaction["reactants"]),
        "productName": reaction["productName"], "productFormula": _formula(reaction["productSmiles"]),
        "productEquationFormula": reaction.get("productEquationFormula", _formula(reaction["productSmiles"])),
        "byproducts": [{"name": item["name"], "formula": item.get("formula", _formula(item["smiles"]))} for item in reaction["byproducts"]],
        "conditions": reaction["conditions"], "explanation": reaction["explanation"], "sourceUrl": reaction["sourceUrl"],
    }
    if conditions is not None:
        payload["assessment"] = _assessment(reaction, conditions)
    return payload


def reaction_catalog() -> dict[str, object]:
    return {
        "reactants": [
            {
                "id": key, "name": value["name"],
                "formula": value.get("formula", _formula(value["smiles"])),
                "smiles": Chem.MolToSmiles(_molecule(value["smiles"]), canonical=True),
                "aliases": value["aliases"],
            }
            for key, value in REACTANTS.items()
        ],
        "reactions": [_serialize_reaction(key, value) for key, value in _all_reactions().items()],
    }


def match_reactions(reactant_a: str | dict[str, str], reactant_b: str | dict[str, str], conditions: dict[str, str] | None = None) -> dict[str, object]:
    pair_ids, custom, interpretation_notes = _resolve_reactants(reactant_a, reactant_b)
    context = _conditions(conditions)
    pair = sorted(pair_ids)
    matches = [
        _serialize_reaction(key, value, context)
        for key, value in _all_reactions(custom).items()
        if sorted(value["reactants"]) == pair
    ]
    return {"reactions": matches, "interpretationNotes": interpretation_notes}


def run_curated_reaction(reaction_id: str, reactant_a: str | dict[str, str], reactant_b: str | dict[str, str], conditions: dict[str, str] | None = None) -> dict[str, object]:
    pair_ids, custom, interpretation_notes = _resolve_reactants(reactant_a, reactant_b)
    reaction = _all_reactions(custom).get(reaction_id)
    if not reaction or sorted(reaction["reactants"]) != sorted(pair_ids):
        raise ChemistryError("Choose a reaction that matches both selected molecules.")

    inputs = Counter()
    input_charge = 0
    for reactant_id in reaction.get("equationReactants", reaction["reactants"]):
        reactant_smiles = {**REACTANTS, **custom}[reactant_id]["smiles"]
        inputs.update(_element_counts(reactant_smiles))
        input_charge += _formal_charge(reactant_smiles)
    outputs = _element_counts(reaction["productSmiles"])
    output_charge = _formal_charge(reaction["productSmiles"])
    for byproduct in reaction["byproducts"]:
        outputs.update(_element_counts(byproduct["smiles"]))
        output_charge += _formal_charge(byproduct["smiles"])
    if inputs != outputs or input_charge != output_charge:
        raise RuntimeError(f"Curated reaction {reaction_id} is not atom- and charge-balanced.")

    product = _molecule(reaction["productSmiles"])
    return {
        "productName": reaction["productName"],
        "product": analyze_molfile(Chem.MolToMolBlock(product)),
        "balanced": True,
        "assessment": _assessment(reaction, _conditions(conditions)),
        "interpretationNotes": interpretation_notes,
    }


def analyze_molfile(molfile: str) -> dict[str, object]:
    if not molfile.strip():
        raise ChemistryError("Draw a molecule before generating its 3D model.")
    if len(molfile) > MAX_BODY_BYTES:
        raise ChemistryError("That drawing is too large for the current Builder.")

    molecule = Chem.MolFromMolBlock(molfile, sanitize=False, removeHs=False)
    if molecule is None or molecule.GetNumAtoms() == 0:
        raise ChemistryError("The drawing could not be read as a molecule.")
    if molecule.GetNumAtoms() > MAX_ATOMS:
        raise ChemistryError(f"The current Builder supports at most {MAX_ATOMS} drawn atoms.")
    for atom in molecule.GetAtoms():
        if atom.HasQuery():
            raise ChemistryError("Replace query atoms with specific elements before generating 3D.")
        if atom.GetSymbol() not in BUILDER_3D_ELEMENTS:
            # A periodic-table atom placed alone in Ketcher has no drawn H.
            # The Molfile can carry a computed H count even though no H was
            # drawn. RDKit otherwise reports e.g. NaH for a bare Na atom.
            atom.SetNumExplicitHs(0)
            atom.SetNoImplicit(True)

    try:
        Chem.SanitizeMol(molecule)
    except Exception as exc:
        overfilled = re.search(r"Explicit valence for atom # \d+ ([A-Za-z]+), \d+, is greater than permitted", str(exc))
        if overfilled:
            element = ELEMENT_NAMES.get(overfilled.group(1), overfilled.group(1))
            raise ChemistryError(f"{element} has too many bonds in this drawing. Remove or change a bond, then try again.") from exc
        raise ChemistryError("This drawing has an invalid bond or valence. Check the atoms and their bonds, then try again.") from exc

    smiles = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    base = {
        "formula": rdMolDescriptors.CalcMolFormula(molecule),
        "molarMass": round(Descriptors.MolWt(molecule), 3),
        "smiles": smiles,
        "atoms": molecule.GetNumAtoms(),
        "bonds": molecule.GetNumBonds(),
    }
    reason = None
    if len(Chem.GetMolFrags(molecule)) != 1:
        reason = "This drawing has separate components. The 2D editor can show them, but one molecular 3D conformer would be misleading."
    elif any(atom.GetFormalCharge() for atom in molecule.GetAtoms()):
        reason = "This drawing contains charged atoms. Ionic structures remain 2D-only in this Builder."
    elif any(atom.GetSymbol() not in BUILDER_3D_ELEMENTS for atom in molecule.GetAtoms()):
        reason = "This drawing contains an element outside the Builder's covalent 3D scope. Metal or coordination bonding needs a different geometry method."
    elif any(atom.GetNumRadicalElectrons() for atom in molecule.GetAtoms()):
        reason = "This drawing contains a radical. The current 3D method does not cover its electronic state."
    if reason:
        return {**base, "representation": "2d-only", "reason": reason}

    molecule = Chem.AddHs(molecule)
    settings = AllChem.ETKDGv3()
    settings.randomSeed = 42
    settings.maxIterations = 200
    try:
        embedded = AllChem.EmbedMolecule(molecule, settings) == 0
    except Exception:
        embedded = False
    if not embedded:
        return {**base, "representation": "2d-only", "reason": "A reliable 3D shape could not be generated for this drawing."}

    try:
        if AllChem.MMFFHasAllMoleculeParams(molecule):
            force_field = "MMFF94"
            optimization_status = AllChem.MMFFOptimizeMolecule(molecule, maxIters=300)
        elif AllChem.UFFHasAllMoleculeParams(molecule):
            force_field = "UFF"
            optimization_status = AllChem.UFFOptimizeMolecule(molecule, maxIters=300)
        else:
            return {**base, "representation": "2d-only", "reason": "No supported force field is available for this structure; the 2D drawing is retained."}
    except Exception:
        return {**base, "representation": "2d-only", "reason": "3D optimization failed for this structure; the 2D drawing is retained."}

    return {
        "representation": "3d",
        "molfile": Chem.MolToMolBlock(molecule),
        "formula": rdMolDescriptors.CalcMolFormula(molecule),
        "molarMass": round(Descriptors.MolWt(molecule), 3),
        "smiles": Chem.MolToSmiles(Chem.RemoveHs(molecule), canonical=True),
        "atoms": molecule.GetNumAtoms(),
        "bonds": molecule.GetNumBonds(),
        "forceField": force_field,
        "converged": optimization_status == 0,
    }


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload: dict[str, object], code: int) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_structure(self, structure: str) -> None:
        data = structure.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "chemical/x-mdl-sdfile; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_png(self, data: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/api/reactions/catalog":
            self._send_json(reaction_catalog(), 200)
            return
        if parsed.path == "/api/pubchem/search":
            query = parse_qs(parsed.query).get("q", [""])[0]
            try:
                self._send_json(search_pubchem(query), 200)
            except PubChemError as exc:
                self._send_json({"error": str(exc)}, 503)
            return
        if parsed.path in ("/api/pubchem/structure", "/api/pubchem/depiction"):
            raw_cid = parse_qs(parsed.query).get("cid", [""])[0]
            if not raw_cid.isdecimal() or len(raw_cid) > 10 or int(raw_cid) <= 0:
                self._send_json({"error": "Choose a valid PubChem compound."}, 422)
                return
            try:
                cid = int(raw_cid)
                if parsed.path == "/api/pubchem/depiction":
                    depiction = get_pubchem_depiction(cid)
                    if depiction:
                        self._send_png(depiction)
                    else:
                        self._send_json({"error": "A 2D depiction is not available for this PubChem compound."}, 404)
                    return
                structure = get_pubchem_structure(cid)
                if structure is None:
                    smiles = get_pubchem_smiles(cid)
                    molecule = Chem.MolFromSmiles(smiles) if smiles else None
                    if molecule is not None:
                        try:
                            generated = analyze_molfile(Chem.MolToMolBlock(molecule))
                            structure = generated.get("molfile") if generated["representation"] == "3d" else None
                        except ChemistryError:
                            pass
                if structure:
                    self._send_structure(structure)
                else:
                    self._send_json({"error": "A 3D structure is not available for this PubChem compound."}, 404)
            except PubChemError as exc:
                self._send_json({"error": str(exc)}, 503)
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if self.path not in ("/api/chemistry", "/api/reactions/match", "/api/reactions/run"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ChemistryError("The drawing request is empty or too large.")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ChemistryError("Expected a molecule request.")
            if self.path == "/api/chemistry":
                if not isinstance(body.get("molfile"), str):
                    raise ChemistryError("Expected a molecule drawing in Molfile format.")
                payload = analyze_molfile(body["molfile"])
            else:
                if self.path == "/api/reactions/run" and not isinstance(body.get("reactionId"), str):
                    raise ChemistryError("Choose two molecules and a matching reaction.")
                if not all(isinstance(body.get(key), (str, dict)) for key in ("reactantA", "reactantB")):
                    raise ChemistryError("Choose two molecules and a matching reaction.")
                if self.path == "/api/reactions/match":
                    payload = match_reactions(body["reactantA"], body["reactantB"], body.get("conditions"))
                else:
                    payload = run_curated_reaction(body["reactionId"], body["reactantA"], body["reactantB"], body.get("conditions"))
            code = 200
        except (ChemistryError, ValueError, TypeError) as exc:
            payload = {"error": str(exc)}
            code = 422
        except Exception as exc:
            self.log_error("Unexpected chemistry failure: %s", exc)
            payload = {"error": "The chemistry service could not process this drawing."}
            code = 500

        self._send_json(payload, code)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("RDKit chemistry service ready at http://127.0.0.1:8000", flush=True)
    server.serve_forever()
