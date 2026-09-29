"""Behavior checks for the Builder and Reaction Lab chemistry service."""

import unittest
from unittest.mock import patch

from rdkit import Chem

from server.chemistry_server import REACTIONS, ChemistryError, analyze_molfile, match_reactions, reaction_catalog, run_curated_reaction


def molfile_from_smiles(smiles: str) -> str:
    molecule = Chem.MolFromSmiles(smiles)
    assert molecule is not None
    return Chem.MolToMolBlock(molecule)


class ChemistryServiceTests(unittest.TestCase):
    def test_ethanol_generates_hydrogen_complete_3d_coordinates(self):
        result = analyze_molfile(molfile_from_smiles("CCO"))
        self.assertEqual(result["representation"], "3d")
        self.assertEqual(result["formula"], "C2H6O")
        self.assertAlmostEqual(result["molarMass"], 46.069, places=2)
        self.assertEqual(result["atoms"], 9)
        self.assertEqual(result["bonds"], 8)
        self.assertTrue(result["converged"])
        result_molecule = Chem.MolFromMolBlock(result["molfile"], removeHs=False)
        self.assertIsNotNone(result_molecule)
        self.assertTrue(result_molecule.GetConformer().Is3D())

    def test_disconnected_fragments_remain_2d_only(self):
        result = analyze_molfile(molfile_from_smiles("C.O"))
        self.assertEqual(result["representation"], "2d-only")
        self.assertIn("separate components", result["reason"])

    def test_double_bond_is_kept_in_3d_ethene(self):
        result = analyze_molfile(molfile_from_smiles("C=C"))
        self.assertEqual(result["formula"], "C2H4")
        self.assertEqual(result["atoms"], 6)
        self.assertEqual(result["bonds"], 5)
        molecule = Chem.MolFromMolBlock(result["molfile"], removeHs=False)
        self.assertIsNotNone(molecule)
        self.assertEqual(
            sum(bond.GetBondType() == Chem.BondType.DOUBLE for bond in molecule.GetBonds()),
            1,
        )

    def test_aromatic_ring_is_kept_in_3d_benzene(self):
        result = analyze_molfile(molfile_from_smiles("c1ccccc1"))
        self.assertEqual(result["formula"], "C6H6")
        self.assertEqual(result["atoms"], 12)
        self.assertEqual(result["bonds"], 12)
        molecule = Chem.MolFromMolBlock(result["molfile"], removeHs=False)
        self.assertIsNotNone(molecule)
        self.assertEqual(molecule.GetRingInfo().NumRings(), 1)

    def test_overfilled_carbon_is_rejected(self):
        molecule = Chem.RWMol()
        center = molecule.AddAtom(Chem.Atom("C"))
        for _ in range(5):
            neighbor = molecule.AddAtom(Chem.Atom("C"))
            molecule.AddBond(center, neighbor, Chem.BondType.SINGLE)
        with self.assertRaisesRegex(ChemistryError, "Carbon has too many bonds"):
            analyze_molfile(Chem.MolToMolBlock(molecule.GetMol()))

    def test_charged_and_metal_drawings_remain_2d_only(self):
        for smiles in ("[NH4+]", "[Na+].[OH-]", "N.N.Cl[Pt]Cl"):
            with self.subTest(smiles=smiles):
                result = analyze_molfile(molfile_from_smiles(smiles))
                self.assertEqual(result["representation"], "2d-only")
                self.assertTrue(result["formula"])

    def test_bare_periodic_table_metal_does_not_gain_implicit_hydrogen(self):
        for symbol in ("Na", "Mg", "Fe"):
            with self.subTest(symbol=symbol):
                drawing = Chem.RWMol()
                drawing.AddAtom(Chem.Atom(symbol))
                result = analyze_molfile(Chem.MolToMolBlock(drawing.GetMol()))
                self.assertEqual(result["representation"], "2d-only")
                self.assertEqual(result["formula"], symbol)
                self.assertIn("outside the Builder's covalent 3D scope", result["reason"])

    def test_additional_neutral_covalent_element_can_generate_3d(self):
        result = analyze_molfile(molfile_from_smiles("B(O)O"))
        self.assertEqual(result["representation"], "3d")
        self.assertEqual(result["formula"], "H3BO2")


class ReactionLabTests(unittest.TestCase):
    def test_catalog_exposes_distinct_structures_for_shared_formula(self):
        reactants = {item["id"]: item for item in reaction_catalog()["reactants"]}
        self.assertEqual(reactants["ethanol"]["formula"], "C2H6O")
        self.assertEqual(reactants["dimethyl-ether"]["formula"], "C2H6O")
        self.assertNotEqual(reactants["ethanol"]["smiles"], reactants["dimethyl-ether"]["smiles"])
        self.assertEqual(analyze_molfile(molfile_from_smiles("COC"))["smiles"], reactants["dimethyl-ether"]["smiles"])

    def test_each_curated_reaction_is_balanced_and_generates_3d_product(self):
        expected = {
            "hydrogenation": "C2H6",
            "bromination": "C2H4Br2",
            "hydration": "C2H6O",
            "esterification": "C4H8O2",
            "ester-hydrolysis": "C2H4O2",
            "oxidation-2-propanol": "C3H6O",
            "reduction-acetone": "C3H8O",
            "sn2-bromomethane": "CH4O",
            "sn2-chloromethane": "CH4O",
            "sn2-bromoethane": "C2H6O",
            "e2-bromoethane": "C2H4",
            "e2-2-bromopropane": "C3H6",
            "e2-tert-butyl-chloride": "C4H8",
            "sn1-tert-butyl-chloride": "C4H10O",
            "e1-tert-butyl-chloride": "C4H8",
            "hydrogenation-propene": "C3H8",
            "bromination-propene": "C3H6Br2",
        }
        catalog = reaction_catalog()
        self.assertEqual({item["id"] for item in catalog["reactions"]}, set(expected))
        for reaction in catalog["reactions"]:
            with self.subTest(reaction=reaction["id"]):
                result = run_curated_reaction(reaction["id"], *reaction["reactants"])
                self.assertTrue(result["balanced"])
                self.assertEqual(result["product"]["formula"], expected[reaction["id"]])
                molecule = Chem.MolFromMolBlock(result["product"]["molfile"], removeHs=False)
                self.assertIsNotNone(molecule)
                self.assertTrue(molecule.GetConformer().Is3D())
                self.assertTrue(reaction["conditions"])
                self.assertTrue(reaction["sourceUrl"].startswith("https://"))
                self.assertTrue(reaction["family"])
                self.assertTrue(reaction["mechanism"])

    def test_esterification_includes_water_and_accepts_either_input_order(self):
        ester = next(item for item in reaction_catalog()["reactions"] if item["id"] == "esterification")
        self.assertEqual(ester["byproducts"], [{"name": "Water", "formula": "H2O"}])
        result = run_curated_reaction("esterification", "ethanol", "ethanoic-acid")
        self.assertEqual(result["productName"], "Ethyl ethanoate")

    def test_new_families_match_in_either_order_and_account_for_byproducts(self):
        examples = {
            "ester-hydrolysis": ("ethyl-ethanoate", "water", "Hydrolysis", {"Ethanol"}),
            "oxidation-2-propanol": ("2-propanol", "sodium-hypochlorite", "Oxidation", {"Sodium chloride", "Water"}),
            "reduction-acetone": ("acetone", "hydrogen", "Reduction", set()),
        }
        for identifier, (first, second, family, byproducts) in examples.items():
            with self.subTest(reaction=identifier):
                forward = match_reactions(first, second)["reactions"]
                reverse = match_reactions(second, first)["reactions"]
                self.assertEqual([item["id"] for item in forward], [identifier])
                self.assertEqual([item["id"] for item in reverse], [identifier])
                self.assertEqual(forward[0]["family"], family)
                self.assertEqual({item["name"] for item in forward[0]["byproducts"]}, byproducts)
                self.assertTrue(run_curated_reaction(identifier, second, first)["balanced"])
        oxidation = match_reactions("2-propanol", "sodium-hypochlorite")["reactions"][0]
        self.assertIn({"name": "Sodium chloride", "formula": "NaCl"}, oxidation["byproducts"])

    def test_unlisted_reactant_pair_does_not_claim_a_prediction(self):
        with self.assertRaisesRegex(ChemistryError, "matches both selected"):
            run_curated_reaction("hydrogenation", "ethene", "water")

    def test_competing_sn2_e2_pathways_are_condition_assessed(self):
        aprotic = {"solvent": "polar-aprotic", "temperature": "ambient", "catalyst": "none"}
        heated = {"solvent": "ethanolic-protic", "temperature": "heated", "catalyst": "none"}
        first = {item["id"]: item for item in match_reactions("bromoethane", "hydroxide", aprotic)["reactions"]}
        second = {item["id"]: item for item in match_reactions("hydroxide", "bromoethane", heated)["reactions"]}
        self.assertEqual(set(first), {"sn2-bromoethane", "e2-bromoethane"})
        self.assertEqual(first["sn2-bromoethane"]["assessment"]["state"], "aligned")
        self.assertEqual(first["e2-bromoethane"]["assessment"]["state"], "alternative")
        self.assertEqual(second["e2-bromoethane"]["assessment"]["state"], "aligned")
        self.assertEqual(second["sn2-bromoethane"]["assessment"]["state"], "alternative")

    def test_pubchem_structures_reuse_reviewed_rules_and_unlisted_rules(self):
        known = {item["id"]: item for item in reaction_catalog()["reactants"]}
        bromoethane = {"smiles": known["bromoethane"]["smiles"]}
        hydroxide = {"smiles": known["hydroxide"]["smiles"]}
        matches = match_reactions(bromoethane, hydroxide)["reactions"]
        self.assertEqual({item["id"] for item in matches}, {"sn2-bromoethane", "e2-bromoethane"})
        self.assertEqual(run_curated_reaction("sn2-bromoethane", bromoethane, hydroxide)["product"]["smiles"], "CCO")

        propene = {"smiles": "C=CC"}
        self.assertEqual([item["id"] for item in match_reactions(propene, "hydrogen")["reactions"]], ["hydrogenation-propene"])
        self.assertEqual([item["id"] for item in match_reactions({"smiles": "CC(=O)C"}, "hydrogen")["reactions"]], ["reduction-acetone"])

    def test_alkali_hydroxide_salts_supply_hydroxide_with_explicit_note(self):
        listed = match_reactions("bromomethane", "sodium-hydroxide")
        self.assertEqual([item["id"] for item in listed["reactions"]], ["sn2-bromomethane"])
        self.assertIn("Na⁺ is omitted", listed["interpretationNotes"][0])
        for symbol in ("Li", "Na", "K", "Rb", "Cs"):
            with self.subTest(counterion=symbol):
                salt = {"smiles": f"[OH-].[{symbol}+]"}
                match = match_reactions("bromomethane", salt)
                self.assertEqual([item["id"] for item in match["reactions"]], ["sn2-bromomethane"])
                self.assertIn(f"{symbol}⁺ is omitted", match["interpretationNotes"][0])
                result = run_curated_reaction("sn2-bromomethane", "bromomethane", salt)
                self.assertTrue(result["balanced"])
        for unsupported in ("[OH-].[OH-].[Ca+2]", "N.N.Cl[Pt]Cl", "O.CCO"):
            with self.subTest(unsupported=unsupported), self.assertRaises(ChemistryError):
                match_reactions("bromomethane", {"smiles": unsupported})

    def test_sn1_e1_compete_and_water_is_solvent_for_e1(self):
        cool = {"solvent": "aqueous-protic", "temperature": "ambient", "catalyst": "none"}
        warm = {**cool, "temperature": "heated"}
        first = {item["id"]: item for item in match_reactions("tert-butyl-chloride", "water", cool)["reactions"]}
        second = {item["id"]: item for item in match_reactions("water", "tert-butyl-chloride", warm)["reactions"]}
        self.assertEqual(set(first), {"sn1-tert-butyl-chloride", "e1-tert-butyl-chloride"})
        self.assertEqual(first["sn1-tert-butyl-chloride"]["assessment"]["state"], "aligned")
        self.assertEqual(first["e1-tert-butyl-chloride"]["assessment"]["state"], "alternative")
        self.assertEqual(second["e1-tert-butyl-chloride"]["assessment"]["state"], "aligned")
        self.assertEqual(second["sn1-tert-butyl-chloride"]["assessment"]["state"], "alternative")
        self.assertEqual(first["e1-tert-butyl-chloride"]["equationReactants"], ("tert-butyl-chloride",))
        self.assertEqual(run_curated_reaction("e1-tert-butyl-chloride", "water", "tert-butyl-chloride", warm)["product"]["formula"], "C4H8")

    def test_rule_scope_rejects_unsupported_mechanisms_and_conditions(self):
        self.assertEqual(match_reactions("2-bromopropane", "water")["reactions"], [])
        self.assertEqual({item["mechanism"] for item in match_reactions("tert-butyl-chloride", "hydroxide")["reactions"]}, {"E2"})
        with self.assertRaisesRegex(ChemistryError, "available options"):
            match_reactions("bromoethane", "hydroxide", {"solvent": "liquid nitrogen"})

    def test_sn2_example_shows_hydroxide_methanol_and_bromide(self):
        catalog = reaction_catalog()
        reactants = {item["id"]: item for item in catalog["reactants"]}
        self.assertEqual(reactants["bromomethane"]["formula"], "CH3Br")
        self.assertEqual(reactants["hydroxide"]["formula"], "OH⁻")
        reaction = next(item for item in catalog["reactions"] if item["id"] == "sn2-bromomethane")
        self.assertEqual(reaction["productEquationFormula"], "CH3OH")
        self.assertEqual(reaction["byproducts"], [{"name": "Bromide ion", "formula": "Br⁻"}])
        result = run_curated_reaction("sn2-bromomethane", "hydroxide", "bromomethane")
        self.assertTrue(result["balanced"])
        self.assertEqual(result["product"]["formula"], "CH4O")

    def test_reaction_rejects_charge_imbalance_even_when_atoms_match(self):
        unbalanced = {**REACTIONS["sn2-bromomethane"], "byproducts": [{"name": "Bromine atom", "smiles": "[Br]"}]}
        with patch.dict(REACTIONS, {"sn2-bromomethane": unbalanced}):
            with self.assertRaisesRegex(RuntimeError, "atom- and charge-balanced"):
                run_curated_reaction("sn2-bromomethane", "bromomethane", "hydroxide")

    def test_unlisted_builder_alkyl_halide_matches_and_runs_by_structure(self):
        drawn = {"smiles": "BrCCC"}  # 1-bromopropane is not in the catalog.
        matches = {item["id"]: item for item in match_reactions(drawn, "hydroxide")["reactions"]}
        self.assertEqual(set(matches), {"sn2-drawn-1", "e2-drawn-1"})
        self.assertEqual(matches["sn2-drawn-1"]["productName"], "1-Propanol")
        self.assertEqual(matches["sn2-drawn-1"]["productFormula"], "C3H8O")
        sn2 = run_curated_reaction("sn2-drawn-1", drawn, "hydroxide")
        self.assertTrue(sn2["balanced"])
        self.assertEqual(sn2["product"]["smiles"], "CCCO")
        e2 = run_curated_reaction("e2-drawn-1", drawn, "hydroxide")
        self.assertTrue(e2["balanced"])
        self.assertEqual(e2["product"]["smiles"], "C=CC")
        self.assertEqual({item["id"] for item in match_reactions("hydroxide", drawn)["reactions"]}, {"sn2-drawn-2", "e2-drawn-2"})

    def test_valid_but_unsupported_builder_drawing_does_not_invent_reaction(self):
        self.assertEqual(match_reactions({"smiles": "CCCO"}, "hydroxide")["reactions"], [])
        self.assertEqual(match_reactions({"smiles": "CCC(C)Br"}, "hydroxide")["reactions"], [])
        with self.assertRaisesRegex(ChemistryError, "matches both selected"):
            run_curated_reaction("sn2-drawn-1", {"smiles": "CCCO"}, "hydroxide")
        with self.assertRaisesRegex(ChemistryError, "matches both selected"):
            run_curated_reaction("sn2-drawn-1", {"smiles": "CCCBr"}, "water")

    def test_custom_reactants_are_validated_instead_of_trusting_client(self):
        for invalid in ("C.O", "[NH4+]", "[CH3]", "C1CC"):
            with self.subTest(invalid=invalid), self.assertRaises(ChemistryError):
                match_reactions({"smiles": invalid}, "hydroxide")

    def test_drawn_alkene_matches_additions_without_a_preset_name(self):
        drawn = {"smiles": "C=CCC"}  # 1-Butene is not in the shared catalog.
        hydrogen = match_reactions(drawn, "hydrogen", {"catalyst": "metal"})["reactions"]
        bromine = match_reactions("bromine", drawn, {"solvent": "dry"})["reactions"]
        self.assertEqual([item["id"] for item in hydrogen], ["hydrogenation-drawn-1"])
        self.assertEqual(hydrogen[0]["assessment"]["state"], "aligned")
        self.assertEqual([item["id"] for item in bromine], ["bromination-drawn-2"])
        self.assertEqual(bromine[0]["assessment"]["state"], "aligned")
        with_extra_catalyst = match_reactions("bromine", drawn, {"solvent": "dry", "catalyst": "metal"})["reactions"]
        self.assertEqual(with_extra_catalyst[0]["assessment"]["state"], "incomplete")
        alkane = run_curated_reaction("hydrogenation-drawn-1", drawn, "hydrogen")
        dibromide = run_curated_reaction("bromination-drawn-2", "bromine", drawn)
        self.assertTrue(alkane["balanced"])
        self.assertTrue(dibromide["balanced"])
        self.assertEqual(alkane["product"]["smiles"], "CCCC")
        self.assertEqual(dibromide["product"]["smiles"], "CCC(Br)CBr")
        self.assertEqual(dibromide["product"]["formula"], "C4H8Br2")

    def test_drawn_alkene_rule_rejects_other_bonds_and_unsupported_pairs(self):
        for smiles in ("CC", "C#CC", "C=CC=C", "C1=CCCCC1", "C=CO", "C/C=C/C", "C=CCCCCC"):
            with self.subTest(smiles=smiles):
                self.assertEqual(match_reactions({"smiles": smiles}, "hydrogen")["reactions"], [])
        self.assertEqual(match_reactions({"smiles": "C=CC"}, "water")["reactions"], [])
        with self.assertRaisesRegex(ChemistryError, "matches both selected"):
            run_curated_reaction("hydrogenation-drawn-1", {"smiles": "C=CC"}, "bromine")


if __name__ == "__main__":
    unittest.main()
