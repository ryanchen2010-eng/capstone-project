"""Offline, source-to-Builder-to-Lab consistency checks across varied compounds.

PubChem transport is mocked here; these tests check how the app handles a
returned structure, not whether PubChem currently indexes a particular name.
The few live PubChem/browser checks are recorded separately in project history.
"""

import unittest
from unittest.mock import patch

from rdkit import Chem

from server.chemistry_server import ChemistryError, SHARED_MOLECULES, analyze_molfile, match_reactions, reaction_catalog, run_curated_reaction
from server.pubchem_service import _formula_counts, search_pubchem


# Name, source SMILES, source formula, Builder result, Lab partner, Lab outcome.
# Lab outcome is a mechanism set, "none", or "outside" the supported rule set.
COMPOUNDS = [
    ("Water", "O", "H2O", "3d", "tert-butyl-chloride", {"SN1", "E1"}),
    ("Methane", "C", "CH4", "3d", "hydrogen", "none"),
    ("Carbon dioxide", "O=C=O", "CO2", "3d", "hydrogen", "none"),
    ("Ethanol", "CCO", "C2H6O", "3d", "ethanoic-acid", {"Esterification"}),
    ("Dimethyl ether", "COC", "C2H6O", "3d", "ethanoic-acid", "none"),
    ("Acetone", "CC(C)=O", "C3H6O", "3d", "hydrogen", {"Carbonyl hydrogenation"}),
    ("2-Propanol", "CC(C)O", "C3H8O", "3d", "sodium-hypochlorite", {"Alcohol oxidation"}),
    ("Ethyl ethanoate", "CC(=O)OCC", "C4H8O2", "3d", "water", {"Ester hydrolysis"}),
    ("Benzene", "c1ccccc1", "C6H6", "3d", "bromine", "none"),
    ("Glucose", "C(C1C(C(C(C(O1)O)O)O)O)O", "C6H12O6", "3d", "hydrogen", "none"),
    ("Caffeine", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "C8H10N4O2", "3d", "hydrogen", "none"),
    ("Ethene", "C=C", "C2H4", "3d", "hydrogen", {"Hydrogenation"}),
    ("Propene", "C=CC", "C3H6", "3d", "hydrogen", {"Hydrogenation"}),
    ("1-Bromopropane", "CCCBr", "C3H7Br", "3d", "hydroxide", {"SN2", "E2"}),
    ("2-Chloro-2-methylpropane", "CC(C)(C)Cl", "C4H9Cl", "3d", "water", {"SN1", "E1"}),
    ("2-Bromobutane", "CCC(C)Br", "C4H9Br", "3d", "hydroxide", "none"),
    ("1-Bromo-2-methylpropane", "CC(C)CBr", "C4H9Br", "3d", "hydroxide", {"SN2", "E2"}),
    ("Sodium hydroxide", "[Na+].[OH-]", "HNaO", "2d-only", "bromomethane", {"SN2"}),
    ("Potassium hydroxide", "[K+].[OH-]", "HKO", "2d-only", "bromomethane", {"SN2"}),
    ("Sodium chloride", "[Na+].[Cl-]", "ClNa", "2d-only", "bromomethane", "outside"),
    ("Calcium hydroxide", "[Ca+2].[OH-].[OH-]", "CaH2O2", "2d-only", "bromomethane", "outside"),
    ("Ammonium", "[NH4+]", "H4N+", "2d-only", "bromomethane", "outside"),
    ("Cisplatin", "N.N.Cl[Pt]Cl", "Cl2H6N2Pt", "2d-only", "hydrogen", "outside"),
    ("Boric acid", "B(O)(O)O", "H3BO3", "3d", "hydrogen", "outside"),
]


class CrossPageCompoundTests(unittest.TestCase):
    def test_shared_explorer_reaction_catalog_preserves_structure_identity(self):
        listed = {item["id"]: item for item in reaction_catalog()["reactants"]}
        self.assertGreaterEqual(len(SHARED_MOLECULES), 20)
        self.assertEqual(len({item["cid"] for item in SHARED_MOLECULES}), len(SHARED_MOLECULES))
        for item in SHARED_MOLECULES:
            with self.subTest(compound=item["id"]):
                self.assertEqual(listed[item["id"]]["name"], item["name"])
                self.assertEqual(listed[item["id"]]["smiles"], Chem.MolToSmiles(Chem.MolFromSmiles(item["smiles"]), canonical=True))
                self.assertEqual(_formula_counts(listed[item["id"]]["formula"]),
                                 _formula_counts(item["formula"].translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789"))))

    def test_pubchem_structure_builder_and_reaction_scope_agree(self):
        self.assertGreaterEqual(len(COMPOUNDS), 20)
        for cid, (name, smiles, source_formula, expected_view, partner, outcome) in enumerate(COMPOUNDS, start=900001):
            with self.subTest(compound=name):
                record = {
                    "CID": cid, "Title": name, "IUPACName": name,
                    "MolecularFormula": source_formula, "MolecularWeight": "1.0", "SMILES": smiles,
                }

                def response(path):
                    if "/cids/" in path:
                        return {"IdentifierList": {"CID": [cid]}}
                    return {"PropertyTable": {"Properties": [record]}}

                with patch("server.pubchem_service._request_json", side_effect=response):
                    results = search_pubchem(name)["results"]
                self.assertEqual(len(results), 1)
                found = results[0]
                self.assertEqual(found["cid"], cid)
                self.assertEqual(found["name"], name)

                molecule = Chem.MolFromSmiles(found["structure"])
                self.assertIsNotNone(molecule)
                builder = analyze_molfile(Chem.MolToMolBlock(molecule))
                self.assertEqual(builder["representation"], expected_view)
                source_counts = _formula_counts(source_formula)
                if source_counts is None:
                    self.assertEqual(builder["formula"], source_formula)
                else:
                    self.assertEqual(_formula_counts(builder["formula"]), source_counts)
                if expected_view == "3d":
                    self.assertIn("molfile", builder)
                    self.assertTrue(Chem.MolFromMolBlock(builder["molfile"], removeHs=False).GetConformer().Is3D())
                else:
                    self.assertNotIn("molfile", builder)
                    self.assertTrue(builder["reason"])

                reference = {"smiles": found["structure"]}
                if outcome == "outside":
                    with self.assertRaises(ChemistryError):
                        match_reactions(reference, partner)
                    continue
                matched = match_reactions(reference, partner)
                self.assertEqual({item["mechanism"] for item in matched["reactions"]}, outcome if isinstance(outcome, set) else set())
                if outcome == "none":
                    continue
                for reaction in matched["reactions"]:
                    product = run_curated_reaction(reaction["id"], reference, partner)
                    self.assertTrue(product["balanced"])
                    self.assertEqual(product["product"]["representation"], "3d")
                if name in {"Sodium hydroxide", "Potassium hydroxide"}:
                    self.assertIn("omitted", matched["interpretationNotes"][0])


if __name__ == "__main__":
    unittest.main()
