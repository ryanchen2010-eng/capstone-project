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

The Step 1 baseline was uploaded to Ryan's GitHub branch
`codex/step-1-baseline` on 2026-09-19. The Wix draft was preserved and has not
yet been updated with these local changes.

## 2026-09-24 — Step 2 Builder drawing to 3D

- Replaced the custom flat-coordinate Builder canvas with Ketcher's 2D chemical
  editor. Its atom toolbar includes a periodic table.
- Added a local RDKit HTTP service. It accepts a Molfile from Ketcher, checks
  for a single supported neutral molecule and chemical valence, adds hydrogens,
  generates a 3D conformer, and minimizes it with MMFF94 or UFF.
- Kept 3Dmol.js for the rotatable 3D result and added formula, mass, atom/bond
  counts, a structure check, and the force-field method to the result panel.
- Added an ethanol example to exercise the full workflow.
- Verified ethanol in the browser: C2H6O, 46.069 g/mol, 9 atoms, 8 bonds,
  MMFF94, and a visible 3D model. Python checks cover invalid valence,
  disconnected fragments, and charged inputs.
- Current service runs locally at 127.0.0.1:8000 and has not been deployed or
  added to Wix. The Builder is still limited to the element and molecule scope
  listed in README.md; it does not calculate all possible geometries or prove
  a global energy minimum.

## 2026-09-24 — Step 2 Builder testing pass

- Drew ethene with a double bond and benzene with an aromatic ring in the
  browser. Both generated the expected formula and visible 3D model: C2H4
  (6 atoms, 5 bonds) and C6H6 (12 atoms, 12 bonds).
- Drew a carbon with five single bonds. The Builder correctly rejected it;
  its technical RDKit message was replaced with a plain-language instruction
  to remove or change a bond.
- Added automated double-bond and ring checks. All 6 chemistry tests and all
  10 Explorer catalog tests pass; TypeScript and the production build pass.
- Work remains local on `codex/step-2-builder`; it is not on Wix or GitHub yet.

## 2026-09-24 — Step 3 Reaction Lab first version

- Added a separate `/reaction-lab.html` page with two searchable molecule
  inputs, four curated example pairs, matching reaction selection, conditions,
  a balanced equation, and an interactive 3D main-product preview.
- The reviewed examples are ethene + hydrogen → ethane; ethene + bromine →
  1,2-dibromoethane; ethene + water → ethanol; and ethanoic acid + ethanol →
  ethyl ethanoate + water. Source links point to OpenStax Organic Chemistry.
- The local RDKit endpoint validates the selected pair, checks atom balance
  (including byproducts), and generates the product structure. Unknown pairs
  are explicitly outside the collection rather than labeled impossible.
- Browser-tested esterification and hydrogenation end to end, formula input,
  and an unsupported pair. All 9 Python and 10 catalog tests, TypeScript, and
  the Vite production build pass.
- Work is saved locally on `codex/step-3-reaction-lab`; no Wix publication or
  GitHub upload has been done for this step.

## 2026-09-24 — SN2 examples added to Reaction Lab

- Added bromomethane, chloromethane, and hydroxide ion as selectable reactants.
- The page now shows the requested example, CH3Br + OH⁻ → CH3OH + Br⁻,
  and a chloromethane + hydroxide comparison. Both use textbook-backed SN2
  explanations and list the departing halide ion separately from the 3D
  methanol product.
- The server checks total formal charge as well as atoms for every curated
  reaction. Reaction Lab can use these reviewed ionic reactants while Builder
  remains limited to neutral drawings.
- Browser-tested both SN2 paths, the requested bromomethane equation and 3D
  methanol model, plus searches using CH₃Br and OH⁻. All 11 chemistry tests,
  10 Explorer tests, TypeScript, and the production build pass. Work remains
  local; it has not been uploaded to GitHub or published to Wix.

## 2026-09-24 — Two-input compound entry and Builder handoff

- Reaction Lab now accepts reviewed reactants by name or correctly capitalized
  chemical formula. Unicode subscript digits and ion minus signs also work.
- Added dimethyl ether to expose the shared C2H6O formula with ethanol. Users
  must choose the intended structure; the Lab never silently picks an isomer.
- A validated Builder drawing can be sent to either Reaction Lab reactant box.
  The other input is retained within the browser tab. Drawings are matched by
  canonical molecular structure, not formula alone. An unfamiliar drawing is
  reported as outside the reviewed collection.
- Browser-tested formula ambiguity, CH3Br + OH- SN2 product, and Builder's
  ethanol handoff. All 12 Python tests and 13 JavaScript tests passed;
  TypeScript and production build passed. Work remains local, not on Wix or
  GitHub.

## 2026-09-24 — Multi-pathway reaction-rule foundation

- Added solvent, temperature, and catalyst controls to Reaction Lab. The new
  matching endpoint compares selected structures and conditions, then shows
  multiple supported pathways with an educational condition assessment.
- Added narrow structure-derived SN2 and E2 rules for simple acyclic alkyl
  halides, plus SN1 and E1 examples for a tertiary halide in water. Existing
  addition and esterification examples use the same matching interface.
- Reviewed pairs now include bromoethane + hydroxide (SN2/E2) and
  2-chloro-2-methylpropane + water (SN1/E1). E1 correctly treats water as the
  solvent rather than a stoichiometric reactant. Every displayed product is
  checked for atom and formal-charge balance and given a 3D conformer.
- Rules deliberately avoid unsupported regioisomer/stereoisomer decisions,
  carbocation rearrangements, and rate/yield claims. Drawn molecules still
  must match the reviewed reactant collection; arbitrary reaction prediction
  remains out of scope.
- Browser-tested SN1, E1, E2, and an existing addition path; automated
  chemistry and entry checks pass. This work is local only, not on Wix or
  GitHub.

## 2026-09-25 — Builder drawings checked against supported reaction rules

- Builder now sends the validated drawing's canonical structure and formula to
  either Reaction Lab input. Unlisted drawings are retained within the tab and
  checked by structure rather than rejected for lacking a catalog name.
- The server validates each custom structure on match and run, then applies
  only the existing narrow alkyl-halide SN1/SN2/E1/E2 teaching rules. Products
  outside the small naming map receive a generic label plus exact SMILES.
- Drawn 1-bromopropane + hydroxide is covered (SN2 1-propanol structure and E2
  propene); unsupported structures remain explicitly unsupported, not claimed
  unreactive. No general reaction predictor, regioisomer selection, or
  stereochemistry was added.
- Browser-tested drawing 1-bromopropane in Ketcher, generating its 3D model,
  transferring it to Reaction Lab, matching SN2/E2 with hydroxide, and showing
  the balanced SN2 product (CCCO). The transferred structure survives reload.
  All 18 Python chemistry tests and 13 JavaScript tests pass; TypeScript and
  the production build pass.
- Work remains local; nothing was published to Wix or GitHub.

## 2026-09-25 — Automatic alkene additions from new drawings

- Added structure-based recognition of small, acyclic hydrocarbons containing
  exactly one C=C bond (two to six carbons), even if the drawing is absent from
  the preset reactant list. Listed H2 offers metal-catalyzed hydrogenation;
  listed Br2 offers bromine addition in a dry medium.
- Products are built from the drawn bond, sanitized, checked for atom and
  charge balance, and rendered in 3D. The Lab shows exact product SMILES and
  labels unnamed products by class. The preview does not assign stereo or
  claim a yield; rings, multiple double bonds, alkynes, heteroatom-containing
  alkenes, and specified stereochemistry remain outside this automatic rule.
- Browser-tested drawn propene through Builder into Reaction Lab: H2 gave
  balanced propane connectivity (CCC) and Br2 gave balanced
  1,2-dibromopropane connectivity (CC(Br)CBr). Added a warning when an extra
  catalyst is selected for a pathway that does not evaluate it.
- All 20 Python chemistry tests and 13 JavaScript tests pass; the production
  build succeeds. Work remains local, not published to Wix or GitHub.

## 2026-09-25 — Explorer search beyond six featured molecules

- Kept the six reviewed Explorer molecules as featured examples, but removed
  them as the search limit. A submitted full name or correctly capitalized
  formula now searches PubChem through the local chemistry service.
- Same-formula structures appear as separate choices, with bracketed SMILES
  notation showing their different atom connections. C2H6O returns ethanol
  [CCO] and dimethyl ether [COC]; isotope-labelled, charged, and disconnected
  records are excluded from this introductory list.
- PubChem results load a 3D structure when available. Small supported molecules
  can use an RDKit-generated 3D fallback if PubChem has no 3D record. The six
  existing entries keep their curated teaching notes; new results show formula,
  mass, and source while unreviewed properties remain clearly labelled.
- Browser-checked C2H6O isomer selection and an unlisted acetone search with
  a working 3D model. All 23 Python and 14 JavaScript tests pass, and the
  production build succeeds. This remains local and is not on Wix or GitHub.

## 2026-09-25 — PubChem reactants in both Reaction Lab boxes

- Added a PubChem search action beside each reactant input. Exact names and
  correctly capitalized formulas resolve to connected, neutral structures;
  same-formula isomers remain separate bracketed-SMILES choices.
- Known PubChem structures reuse the reviewed reaction IDs. Other supported
  structures enter the existing narrow RDKit rules; PubChem supplies structure
  identity, not reaction predictions. Unsupported pairs say no current rule
  matches, without asserting that no reaction is possible.
- Selected structures and conditions survive a reload within the browser tab.
  The existing Builder handoff and example buttons still work.
- Browser-tested PubChem propene + listed hydrogen through a balanced 3D
  hydrogenation product; C2H6O with ethanoic acid offers esterification only
  for ethanol, not dimethyl ether. The second input's PubChem search and the
  selected-isomer reload were also checked in the browser. All 24 Python and
  16 JavaScript tests, TypeScript, and the production build pass. Work remains
  local and is not on Wix or GitHub.

## 2026-09-25 — Broader compound handling across the three tools

- Explorer search no longer discards every charged or multi-part PubChem record.
  Formula matching compares element counts instead of element order, so a
  search such as NaOH can match PubChem's HNaO record. Formula searches still
  filter isotope variants and disconnected neutral mixtures; search results
  remain bounded and source-labelled. Name lookup prefers an exact PubChem
  title when a synonym initially resolves to a different related record.
- Explorer now uses a PubChem 2D depiction when a usable 3D structure cannot
  be obtained. Tested cisplatin and sodium hydroxide in the browser; both
  display their identified PubChem records and 2D depictions. Water still
  displays in 3D. This is a fallback, not a fabricated 3D geometry.
- Reaction Lab recognizes the class of simple Li, Na, K, Rb, and Cs hydroxide
  salts as OH⁻ sources for its existing supported ionic reaction equations.
  It labels the omitted spectator cation. Tested sodium hydroxide with
  bromomethane in the browser. Other salts and complexes remain outside the
  Lab's current structural rules unless individually supported.
- Builder now parses a wider range of periodic-table drawings. It attempts
  3D only for eligible neutral, connected covalent structures with supported
  optimization parameters; salts, charges, metal complexes, and failed
  geometry calculations retain a 2D-only result with a reason. Invalid valence
  still fails validation. The 2D-only drawing can be passed to Reaction Lab,
  where the Lab may report that no reaction rule covers it.
- Browser-tested Builder ethanol as a 3D result and a separately placed sodium
  atom as a 2D-only result. Corrected RDKit's inferred NaH formula from a bare
  periodic-table Na drawing so it reports Na instead.
- All 31 Python and 16 JavaScript tests pass; TypeScript, production build, and
  `git diff --check` pass. Work remains local, not published to Wix or GitHub.

## 2026-09-25 — Cross-page chemistry test pass

- Added a permanent 22-compound Explorer-result → Builder → Reaction Lab matrix,
  spanning ordinary molecules, isomers, alkenes, alkyl halides, salts, an ion,
  a metal complex, and an unsupported secondary substrate. The matrix checks
  source/formula identity, 3D versus 2D-only classification, reaction-rule
  scope, and atom/charge balance for every offered pathway.
- Checked 11 live PubChem name/formula queries and five live 3D/2D availability
  cases. Browser-tested formula ambiguity, sodium chloride's loaded 2D image,
  potassium hydroxide's SN2 interpretation, unsupported sodium chloride, a
  successful Builder ethanol → Lab esterification with 3D product, and a
  2D-only sodium Builder handoff rejected by the Lab's narrow rules.
- Fixed a formula-search filter that admitted an unrelated disconnected neutral
  mixture merely because one fragment had internal formal charges. Explorer
  now labels charged connected records separately, and Lab copy accurately
  describes Builder's 2D-only handling of charged drawings.
- Detailed outcomes and limits are in
  `history/cross-page-chemistry-audit-2026-09-25.md`. All 32 Python and 17
  JavaScript tests pass; TypeScript, production build, and `git diff --check`
  pass. Nothing was published to Wix or uploaded to GitHub.

## 2026-09-25 — Home page and four-page navigation

- Added a Home page at `/` with clear entry points to Explore Molecules,
  Molecule Builder, and Reaction Lab. It explains the prototype's chemistry
  and 3D-model limitations without presenting the illustration as a live model.
- Moved the existing Explorer entry point to `/explore.html` and connected all
  four pages through consistent navigation. Updated the Vite build and README
  for the new routes.
- Added navigation tests and checked the Home page on desktop and mobile. The
  mobile layout has no horizontal overflow, and Home → Explorer → Home works
  in the browser. The Explorer water model still loads in 3D.
- The site remains local; it has not been published to Wix or GitHub.

## 2026-09-26 — One-command local launcher

- Added `start-local.command` for macOS. One run starts the RDKit chemistry
  service and Vite website, waits for both to respond, and opens Home in the
  default browser. Control-C stops only the two processes it started.
- The launcher reuses already-running local services, checks for unrelated
  processes on ports 8000/5173, and reports missing Python, Node, or Vite
  dependencies instead of failing silently. Updated the README instructions.
- Verified startup, the already-running path, and cleanup after Control-C;
  neither local port remained in use after stopping. This remains a local
  preview, not a Wix publication or GitHub upload.

## 2026-09-28 — Shared compound catalog and cross-page workflow

- Added one source of identity (`src/shared-molecules.json`) for 18 featured
  compounds used by both Explorer and Reaction Lab. Explorer retains its six
  fully reviewed property panels and adds twelve common compounds with clearly
  labelled unreviewed properties. Ionic sodium chloride and sodium hydroxide
  use PubChem's 2D fallback when a molecular 3D model is unavailable.
- Added Explorer buttons to send the selected structure—not just its formula—
  to either Reaction Lab input. The Lab keeps the selected structure distinct
  from same-formula isomers and still requires the user to choose a supported
  reaction pathway. Listed sodium hydroxide is interpreted as hydroxide plus
  an omitted sodium spectator in the simplified ionic equation.
- The Lab now recognizes listed propene for supported hydrogenation and bromine
  addition; unsupported pairs still do not produce invented reactions. Builder
  now saves the current drawing in the browser tab and restores it when
  returning from another page; no more example drawings were added.
- Browser-tested Builder drawing restoration, Explorer propene → Reaction Lab
  handoff, competing SN2/E2 choices, listed sodium hydroxide interpretation,
  and a balanced 3D propane product from propene + hydrogen. Verified 33 Python
  and 20 JavaScript tests, TypeScript checking, and a production build. All changes remain local;
  nothing was published to Wix or uploaded to GitHub.

## 2026-09-28 — Seven-family Reaction Lab library

- Replaced the small example-chip row with a filterable Organic Reaction
  Library spanning addition, elimination, substitution, oxidation, reduction,
  condensation, and hydrolysis. A loaded pair still requires the user to choose
  a supported pathway. Choosing one now previews the proposed net equation
  before the 3D calculation.
- Added three reviewed, atom- and charge-balanced teaching examples: ethyl
  ethanoate + water → ethanoic acid + ethanol (acid-catalyzed hydrolysis),
  2-propanol + sodium hypochlorite → acetone + sodium chloride + water
  (simplified oxidation), and acetone + hydrogen → 2-propanol (reduction).
  The oxidation card and result warn that the net equation is not a procedure
  and does not capture other possible products.
- Added 2-propanol and ethyl ethanoate to the shared Explorer/Lab compound
  catalog, bringing it to 20. Sodium hypochlorite remains a Lab-only reagent.
- Verified all 34 Python and 20 JavaScript tests, TypeScript checking, and a
  production build. Browser-tested family filtering, each new pair, net
  equations, atom balance, and 3D products. The site remains local and was
  not published to Wix or GitHub.

## 2026-09-29 — Shorter pages and Reaction Lab guide

- Shortened visible copy on Home, Explorer, Builder, and Reaction Lab. Search
  tips, drawing guidance, extra molecule properties, and detailed reaction
  interpretation now open on demand without removing them.
- Added a compact, expandable Reaction guide describing all seven supported
  families and their current mechanisms (including SN1, SN2, E1, and E2).
  Kept the Lab's educational-warning label visible.
- Verified 34 Python and 21 JavaScript tests, TypeScript checking, and a
  production build. Browser-checked Home, Explorer, Builder, and the collapsed
  and expanded Reaction guide. These changes remain local; nothing was
  published to Wix or GitHub.

## 2026-09-29 — Explorer layout correction

- Decoupled the Explorer's 3D stage height from the sample-molecule list. The
  list now scrolls within its own area while the viewer and property panel keep
  a stable size. Stacked the Explorer header navigation on narrower screens.
- Browser-checked desktop and mobile layouts and scrolling through the full
  compound list. The production build passed; the fix remains local.
