# Capstone progress

## 2026-09-19 — Step 1 baseline and direction

- Local project: `/Users/rc/Documents/Capstone project`.
- GitHub repository: `ryanchen2010-eng/capstone-project`.
- Website: Wix Site 1 only; publishing still requires Ryan's go-ahead.
- Local branch: `codex/step-1-baseline`.
- Pre-consolidation backup: commit `84ff533`, including the local Builder and
  an exact snapshot of the existing Wix Explorer embed.
- Consolidated all six Wix molecule property records and search aliases into
  `src/molecules.ts`; retained the existing PubChem SDF files and identifiers.
- Added local Explorer search, full property fields, everyday uses, source links,
  and checks against stale model responses. The current interface shows matching
  molecule cards; matching the Wix suggestion-only interaction is still pending.
- Preserved the Builder periodic-table selection and thin bond styling.
- Baseline checks: 13 tests passed, TypeScript passed, and Vite production build
  passed on 2026-09-18. Builder tests are source checks; full browser verification
  remains pending.
- Local Explorer opened successfully on 2026-09-19 and reported Water ready.
- Known Builder limits: single bonds only, simple fixed neutral-valence limits,
  flat coordinates, and formula hydrogens that are not drawn in the preview.
- Thermal property conditions and molecular forms need a fuller content review
  before release.
- Ryan ruled out MolView integration. The planned Builder tools are Ketcher,
  RDKit, and 3Dmol.js. No Ketcher/RDKit integration has been implemented yet.
- Next chemistry milestone: draw ethanol, validate its molecular graph, calculate
  formula/mass, and generate a real 3D conformer.

The source of truth is this repository. The Wix draft was preserved and has not
yet been updated with these local changes. GitHub backup status should be checked
against the remote branch before describing this baseline as uploaded.
