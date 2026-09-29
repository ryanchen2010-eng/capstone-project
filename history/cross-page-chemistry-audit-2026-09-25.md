# Cross-page chemistry test pass — 2026-09-25

This pass checks whether one identified structure stays consistent as it moves
from a PubChem-style Explorer result through Builder's structure check and into
Reaction Lab. The permanent 22-compound matrix is in
`tests/test_cross_page.py`. PubChem responses in that matrix are mocked, so it
tests our handling of returned structures, not PubChem's live name index. The
live API and browser spot checks below complement it.

| Compound (source formula) | Builder | Reaction Lab check |
| --- | --- | --- |
| Water (H2O) | 3D | With tert-butyl chloride: SN1 and E1 |
| Methane (CH4) | 3D | With hydrogen: no supported rule |
| Carbon dioxide (CO2) | 3D | With hydrogen: no supported rule |
| Ethanol (C2H6O) | 3D | With ethanoic acid: esterification |
| Dimethyl ether (C2H6O) | 3D | With ethanoic acid: no supported rule; not confused with ethanol |
| Acetone (C3H6O) | 3D | With hydrogen: no supported rule |
| Benzene (C6H6) | 3D | With bromine: no supported rule |
| Glucose (C6H12O6) | 3D | With hydrogen: no supported rule |
| Caffeine (C8H10N4O2) | 3D | With hydrogen: no supported rule |
| Ethene (C2H4) | 3D | With hydrogen: hydrogenation |
| Propene (C3H6) | 3D | With hydrogen: hydrogenation |
| 1-Bromopropane (C3H7Br) | 3D | With hydroxide: SN2 and E2 |
| 2-Chloro-2-methylpropane (C4H9Cl) | 3D | With water: SN1 and E1 |
| 2-Bromobutane (C4H9Br) | 3D | With hydroxide: no current rule; secondary-substrate/regioisomer coverage gap |
| 1-Bromo-2-methylpropane (C4H9Br) | 3D | With hydroxide: SN2 and E2 |
| Sodium hydroxide (HNaO) | 2D only | With bromomethane: SN2 via OH⁻, Na⁺ omitted and explained |
| Potassium hydroxide (HKO) | 2D only | With bromomethane: SN2 via OH⁻, K⁺ omitted and explained |
| Sodium chloride (ClNa) | 2D only | With bromomethane: outside current rules |
| Calcium hydroxide (CaH2O2) | 2D only | With bromomethane: outside current rules |
| Ammonium (H4N+) | 2D only | With bromomethane: outside current rules |
| Cisplatin (Cl2H6N2Pt) | 2D only | With hydrogen: outside current rules |
| Boric acid (H3BO3) | 3D | With hydrogen: outside current rules |

The matrix checks equivalent elemental composition even where PubChem and RDKit
print formulas in different element orders. Every offered reaction is executed
and checked for atom/charge balance and a 3D main product. “No supported rule”
and “outside current rules” do **not** mean that no chemical reaction exists.

## Live PubChem checks

- Name/formula searches resolved benzene (CID 241), acetone (180), sodium
  chloride (5234), calcium hydroxide (6093208), cisplatin (5460033), sodium
  hydroxide (14798), water (962), ammonium (223), and the ethanol (702) versus
  dimethyl ether (8254) formula pair. `NaOH`, `Ca(OH)2`, and `NH4+` also found
  their relevant records. Search results may contain additional ionic forms;
  they are distinct source records, not silently selected as the neutral form.
- PubChem supplied 3D SDFs for benzene and acetone. Sodium chloride, calcium
  hydroxide, and cisplatin used the source's 2D PNG fallback instead.
- A `C2H6O` formula lookup exposed a disconnected mixture that happened to
  contain internal formal charges. We fixed the formula filter to require
  opposite **fragment net charges** for an ionic assembly; unrelated neutral
  mixtures no longer pass solely because a fragment contains charged atoms.
  Explorer now also labels connected charged structures separately.

## Browser checks

- Explorer: `C2H6O` kept ethanol and dimethyl ether distinct; sodium chloride
  selected its PubChem record and displayed a fully loaded 500×500 2D image.
- Reaction Lab: bromomethane + sodium chloride showed “outside current rules,”
  with no product button; bromomethane + potassium hydroxide showed the SN2
  option and the K⁺ spectator-ion note.
- Builder → Reaction Lab: the ethanol example generated 3D, transferred as
  ethanol, matched ethanoic-acid esterification, and showed a balanced equation
  and 3D ethyl ethanoate product. A periodic-table Na atom remained 2D-only,
  transferred as Na, and was rejected by the Lab's narrow reaction rules
  instead of receiving a made-up product.
- Corrected Reaction Lab's outdated claim that Builder cannot accept charged
  drawings. Builder parses many such drawings but intentionally leaves them
  2D-only; Lab coverage remains narrower.

## Remaining limits

- This is a consistency and scope pass, not independent expert verification of
  every possible reaction. Mentor review is still needed before presenting the
  rule set as authoritative chemistry guidance.
- 2-Bromobutane illustrates a deliberate coverage gap: the current rules avoid
  secondary-substrate and competing regioisomer predictions. Other complex
  substrates, stereochemistry, reaction mixtures, rates, and yields remain out
  of scope.
- PubChem results are bounded; the site is not an exhaustive compound browser.
  The Python service is still local. Nothing in this pass was published to Wix
  or uploaded to GitHub.

## Verification

All 32 Python tests and 17 JavaScript tests pass. TypeScript checking, the Vite
production build, and `git diff --check` pass. The 22 rows above are one
table-driven Python test with a separate assertion set for each compound.
