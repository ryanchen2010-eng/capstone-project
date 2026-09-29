"""Small, bounded PubChem lookups for Explorer and Reaction Lab.

Searches are initiated only when a visitor submits a name or formula. Keep
requests cached and capped so this educational app does not bulk-query PubChem.
"""

from __future__ import annotations

import json
import re
import ssl
from functools import lru_cache
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from rdkit import Chem


PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
MAX_QUERY_LENGTH = 100
MAX_CIDS = 80
MAX_RESULTS = 20
MAX_RESPONSE_BYTES = 1_000_000
SUBSCRIPT_DIGITS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
PROPERTY_NAMES = "MolecularFormula,MolecularWeight,IUPACName,Title,ConnectivitySMILES,SMILES"
FORMULA_PART = re.compile(r"([A-Z][a-z]?)(\d*)")


class PubChemError(Exception):
    """A PubChem search cannot be completed safely or is unavailable."""


def _request(path: str) -> bytes | None:
    request = Request(f"{PUBCHEM_BASE}{path}", headers={"User-Agent": "MoleculePlayground/0.1 (educational local app)"})
    default_paths = ssl.get_default_verify_paths()
    system_bundle = Path("/etc/ssl/cert.pem")
    context = ssl.create_default_context(
        cafile=str(system_bundle) if not default_paths.cafile and system_bundle.is_file() else None,
    )
    try:
        with urlopen(request, timeout=10, context=context) as response:
            data = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        if exc.code in (400, 404):
            return None
        raise PubChemError("PubChem is temporarily unavailable. Try again later.") from exc
    except (URLError, TimeoutError) as exc:
        raise PubChemError("PubChem is temporarily unavailable. Try again later.") from exc
    if len(data) > MAX_RESPONSE_BYTES:
        raise PubChemError("The PubChem response was too large for this Explorer search.")
    return data


@lru_cache(maxsize=160)
def _request_json(path: str) -> dict[str, object] | None:
    data = _request(path)
    if data is None:
        return None
    try:
        payload = json.loads(data)
    except (ValueError, UnicodeDecodeError) as exc:
        raise PubChemError("PubChem returned an unreadable response.") from exc
    if not isinstance(payload, dict):
        raise PubChemError("PubChem returned an unexpected response.")
    return payload


def _property_records(cids: list[int]) -> list[dict[str, object]]:
    if not cids:
        return []
    path = f"/compound/cid/{','.join(str(cid) for cid in cids)}/property/{PROPERTY_NAMES}/JSON"
    payload = _request_json(path)
    table = payload.get("PropertyTable") if payload else None
    records = table.get("Properties") if isinstance(table, dict) else None
    if not isinstance(records, list):
        return []
    return [record for record in records if isinstance(record, dict)]


def _formula_counts(formula: str) -> dict[str, int] | None:
    """Compare simple formulas by composition, not PubChem's element order."""
    counts: dict[str, int] = {}
    end = 0
    for match in FORMULA_PART.finditer(formula):
        if match.start() != end:
            return None
        symbol, quantity = match.groups()
        counts[symbol] = counts.get(symbol, 0) + int(quantity or "1")
        end = match.end()
    return counts if end == len(formula) and counts else None


def _include_formula_result(molecule: Chem.Mol) -> bool:
    """Keep salts and metal compounds, but omit disconnected neutral mixtures."""
    fragments = Chem.GetMolFrags(molecule, asMols=True)
    if len(fragments) == 1:
        return True
    fragment_charges = [sum(atom.GetFormalCharge() for atom in fragment.GetAtoms()) for fragment in fragments]
    ionic_assembly = any(charge > 0 for charge in fragment_charges) and any(charge < 0 for charge in fragment_charges)
    has_metal = any(atom.GetSymbol() not in {"H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Se", "Br", "I"}
                    for atom in molecule.GetAtoms())
    return ionic_assembly or has_metal


def search_pubchem(query: str) -> dict[str, object]:
    normalized = query.strip().translate(SUBSCRIPT_DIGITS)
    if not normalized or len(normalized) > MAX_QUERY_LENGTH:
        raise PubChemError("Enter a molecule name or formula of at most 100 characters.")
    query_formula = _formula_counts(normalized)
    is_formula = query_formula is not None
    if is_formula:
        path = f"/compound/fastformula/{quote(normalized, safe='')}/cids/JSON?MaxRecords={MAX_CIDS}"
    else:
        path = f"/compound/name/{quote(normalized, safe='')}/cids/JSON"
    payload = _request_json(path)
    identifier_list = payload.get("IdentifierList") if payload else None
    raw_cids = identifier_list.get("CID") if isinstance(identifier_list, dict) else None
    if not isinstance(raw_cids, list):
        return {"results": [], "limited": False, "queryType": "formula" if is_formula else "name"}
    cids = [cid for cid in raw_cids if type(cid) is int and cid > 0][:MAX_CIDS]
    records = _property_records(cids)
    if not is_formula and not any(
        isinstance(record.get("Title"), str) and record["Title"].casefold() == normalized.casefold()
        for record in records
    ):
        # A synonym can resolve to a related CID whose title differs from the
        # searched name. Look for preferred, exact-title entries before showing it.
        try:
            word_path = f"/compound/name/{quote(normalized, safe='')}/cids/JSON?name_type=word&MaxRecords=20"
            word_payload = _request_json(word_path)
            word_list = word_payload.get("IdentifierList") if word_payload else None
            word_cids = word_list.get("CID") if isinstance(word_list, dict) else None
            if isinstance(word_cids, list):
                exact = [record for record in _property_records(
                    [cid for cid in word_cids[:20] if type(cid) is int and cid > 0]
                ) if isinstance(record.get("Title"), str) and record["Title"].casefold() == normalized.casefold()]
                if exact:
                    records = exact
        except PubChemError:
            pass  # Keep the first, source-labelled PubChem name result.
    results = []
    seen_structures = set()
    for record in records:
        smiles = record.get("SMILES")
        cid = record.get("CID")
        if type(cid) is not int or not isinstance(smiles, str):
            continue
        formula = record.get("MolecularFormula")
        if is_formula and (not isinstance(formula, str) or _formula_counts(formula) != query_formula):
            continue
        molecule = Chem.MolFromSmiles(smiles)
        if molecule is None:
            continue
        if is_formula and (not _include_formula_result(molecule)
                           or any(atom.GetIsotope() for atom in molecule.GetAtoms())):
            continue  # Keep introductory formula results free of neutral mixtures and isotope variants.
        canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
        if canonical in seen_structures:
            continue
        seen_structures.add(canonical)
        title = record.get("Title")
        iupac = record.get("IUPACName")
        results.append({
            "cid": cid,
            "name": title if isinstance(title, str) and title else (iupac if isinstance(iupac, str) else f"CID {cid}"),
            "iupacName": iupac if isinstance(iupac, str) else "",
            "formula": str(formula or ""),
            "molecularWeight": str(record.get("MolecularWeight") or ""),
            "structure": canonical,
            "multiPart": len(Chem.GetMolFrags(molecule)) > 1,
            "hasFormalCharge": any(atom.GetFormalCharge() for atom in molecule.GetAtoms()),
        })
        if len(results) >= MAX_RESULTS:
            break
    return {
        "results": results,
        "limited": len(raw_cids) > MAX_CIDS or len(cids) == MAX_CIDS or len(results) == MAX_RESULTS,
        "queryType": "formula" if is_formula else "name",
    }


@lru_cache(maxsize=100)
def get_pubchem_structure(cid: int) -> str | None:
    if cid <= 0:
        raise PubChemError("Choose a valid PubChem compound.")
    data = _request(f"/compound/cid/{cid}/SDF?record_type=3d")
    return data.decode("utf-8") if data else None


def get_pubchem_smiles(cid: int) -> str | None:
    records = _property_records([cid])
    if not records:
        return None
    smiles = records[0].get("SMILES")
    return smiles if isinstance(smiles, str) else None


@lru_cache(maxsize=100)
def get_pubchem_depiction(cid: int) -> bytes | None:
    """Use PubChem's own 2D depiction when no reliable 3D record exists."""
    if cid <= 0:
        raise PubChemError("Choose a valid PubChem compound.")
    data = _request(f"/compound/cid/{cid}/PNG?image_size=500x500")
    if data is not None and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise PubChemError("PubChem returned an unreadable 2D depiction.")
    return data
