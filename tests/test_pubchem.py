"""Offline checks for bounded PubChem Explorer lookups."""

import unittest
from unittest.mock import patch

from server.pubchem_service import PubChemError, get_pubchem_depiction, search_pubchem


class PubChemSearchTests(unittest.TestCase):
    def test_formula_shows_distinct_isomers_not_isotopes_or_mixtures(self):
        records = [
            {"CID": 702, "Title": "Ethanol", "IUPACName": "ethanol", "MolecularFormula": "C2H6O", "MolecularWeight": "46.07", "SMILES": "CCO", "ConnectivitySMILES": "CCO"},
            {"CID": 8254, "Title": "Dimethyl Ether", "IUPACName": "methoxymethane", "MolecularFormula": "C2H6O", "MolecularWeight": "46.07", "SMILES": "COC", "ConnectivitySMILES": "COC"},
            {"CID": 102138, "Title": "Ethanol-d6", "MolecularFormula": "C2H6O", "MolecularWeight": "52.11", "SMILES": "[2H]C([2H])([2H])C([2H])([2H])O[2H]", "ConnectivitySMILES": "CCO"},
            {"CID": 22066309, "Title": "Ethene--water", "MolecularFormula": "C2H6O", "MolecularWeight": "46.07", "SMILES": "C=C.O", "ConnectivitySMILES": "C=C.O"},
            {"CID": 167712766, "Title": "Carbon monoxide;methane;molecular hydrogen", "MolecularFormula": "C2H6O", "MolecularWeight": "46.07", "SMILES": "C.[C-]#[O+].[HH]", "ConnectivitySMILES": "C.C#O.[HH]"},
            {"CID": 102461127, "Title": "Charged form", "MolecularFormula": "C2H6O+", "MolecularWeight": "46.07", "SMILES": "CC[OH+]", "ConnectivitySMILES": "CCO"},
        ]

        def response(path):
            if "/fastformula/" in path:
                self.assertIn("/C2H6O/", path)
                return {"IdentifierList": {"CID": [item["CID"] for item in records]}}
            self.assertIn("/property/", path)
            return {"PropertyTable": {"Properties": records}}

        with patch("server.pubchem_service._request_json", side_effect=response):
            result = search_pubchem("C₂H₆O")
        self.assertEqual(result["queryType"], "formula")
        self.assertEqual([(item["cid"], item["structure"]) for item in result["results"]], [(702, "CCO"), (8254, "COC")])
        self.assertFalse(result["limited"])

    def test_name_search_and_no_match_are_distinct(self):
        record = {"CID": 180, "Title": "Acetone", "IUPACName": "propan-2-one", "MolecularFormula": "C3H6O", "MolecularWeight": "58.08", "SMILES": "CC(C)=O", "ConnectivitySMILES": "CC(C)=O"}

        def response(path):
            if "/name/" in path:
                return {"IdentifierList": {"CID": [180]}}
            return {"PropertyTable": {"Properties": [record]}}

        with patch("server.pubchem_service._request_json", side_effect=response):
            result = search_pubchem("acetone")
        self.assertEqual(result["results"][0]["name"], "Acetone")
        self.assertEqual(result["results"][0]["structure"], "CC(C)=O")
        self.assertEqual(result["queryType"], "name")
        with patch("server.pubchem_service._request_json", return_value=None):
            self.assertEqual(search_pubchem("not-a-compound")["results"], [])

    def test_name_search_keeps_ionic_and_metal_compounds(self):
        records = {
            "sodium hydroxide": {"CID": 14798, "Title": "Sodium hydroxide", "MolecularFormula": "HNaO", "MolecularWeight": "39.997", "SMILES": "[OH-].[Na+]"},
            "cisplatin": {"CID": 5460033, "Title": "Cisplatin", "MolecularFormula": "Cl2H6N2Pt", "MolecularWeight": "300.05", "SMILES": "N.N.Cl[Pt]Cl"},
        }

        def response(path):
            query = "sodium hydroxide" if "sodium%20hydroxide" in path or "/14798/" in path else "cisplatin"
            record = records[query]
            return {"IdentifierList": {"CID": [record["CID"]]}} if "/cids/" in path else {"PropertyTable": {"Properties": [record]}}

        with patch("server.pubchem_service._request_json", side_effect=response):
            sodium = search_pubchem("sodium hydroxide")["results"]
            platinum = search_pubchem("cisplatin")["results"]
        self.assertEqual(sodium[0]["cid"], 14798)
        self.assertEqual(platinum[0]["cid"], 5460033)
        self.assertTrue(sodium[0]["multiPart"])
        self.assertTrue(platinum[0]["multiPart"])
        self.assertTrue(sodium[0]["hasFormalCharge"])
        self.assertFalse(platinum[0]["hasFormalCharge"])

    def test_formula_search_uses_element_counts_for_salts(self):
        record = {"CID": 14798, "Title": "Sodium hydroxide", "MolecularFormula": "HNaO", "MolecularWeight": "39.997", "SMILES": "[OH-].[Na+]"}

        def response(path):
            return {"IdentifierList": {"CID": [14798]}} if "/fastformula/" in path else {"PropertyTable": {"Properties": [record]}}

        with patch("server.pubchem_service._request_json", side_effect=response):
            self.assertEqual(search_pubchem("NaOH")["results"][0]["cid"], 14798)

    def test_name_search_prefers_exact_title_over_related_synonym(self):
        related = {"CID": 5702198, "Title": "azane;dichloroplatinum", "MolecularFormula": "Cl2H6N2Pt", "SMILES": "N.N.Cl[Pt]Cl"}
        preferred = {"CID": 5460033, "Title": "Cisplatin", "MolecularFormula": "Cl2H6N2Pt", "SMILES": "N.N.Cl[Pt]Cl"}

        def response(path):
            if "name_type=word" in path:
                return {"IdentifierList": {"CID": [5702198, 5460033]}}
            if "/name/" in path:
                return {"IdentifierList": {"CID": [5702198]}}
            if "/5702198,5460033/" in path:
                return {"PropertyTable": {"Properties": [related, preferred]}}
            return {"PropertyTable": {"Properties": [related]}}

        with patch("server.pubchem_service._request_json", side_effect=response):
            result = search_pubchem("cisplatin")
        self.assertEqual([(item["cid"], item["name"]) for item in result["results"]], [(5460033, "Cisplatin")])

    def test_2d_depiction_requires_valid_png(self):
        png = b"\x89PNG\r\n\x1a\n" + b"test"
        get_pubchem_depiction.cache_clear()
        with patch("server.pubchem_service._request", return_value=png):
            self.assertEqual(get_pubchem_depiction(14798), png)
        get_pubchem_depiction.cache_clear()
        with patch("server.pubchem_service._request", return_value=b"not an image"):
            with self.assertRaises(PubChemError):
                get_pubchem_depiction(14798)

    def test_rejects_empty_or_unbounded_query(self):
        for query in ("", " " * 3, "x" * 101):
            with self.subTest(query=query), self.assertRaises(PubChemError):
                search_pubchem(query)


if __name__ == "__main__":
    unittest.main()
