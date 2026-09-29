import './reaction-lab.css';
import { findReactantBySmiles, findReactantCandidates, mergePubChemCandidates, type PubChemReactantMatch, type Reactant } from './reactant-entry';

type Byproduct = { name: string; formula: string };
type Reaction = {
  id: string;
  name: string;
  family: string;
  mechanism: string;
  reactants: string[];
  equationReactants: string[];
  productName: string;
  productFormula: string;
  productEquationFormula: string;
  byproducts: Byproduct[];
  conditions: string;
  explanation: string;
  sourceUrl: string;
  assessment?: { state: 'aligned' | 'incomplete' | 'alternative'; note: string };
};
type Catalog = { reactants: Reactant[]; reactions: Reaction[] };
type Product = { molfile: string; formula: string; smiles: string; molarMass: number; atoms: number; bonds: number; forceField: string; converged: boolean };
type RunResult = { productName: string; product: Product; balanced: boolean; assessment: NonNullable<Reaction['assessment']>; interpretationNotes?: string[] };
type Conditions = { solvent: string; temperature: string; catalyst: string };
type ReactionFamily = 'Addition' | 'Elimination' | 'Substitution' | 'Oxidation' | 'Reduction' | 'Condensation' | 'Hydrolysis';
type Example = {
  id: string;
  title: string;
  reactants: [string, string];
  families: ReactionFamily[];
  change: string;
  conditions: Conditions;
};
type Viewer = {
  removeAllModels: () => void;
  addModel: (data: string, format: string) => unknown;
  setStyle: (selection: Record<string, never>, style: Record<string, unknown>) => void;
  zoomTo: () => void;
  resize: () => void;
  render: () => void;
};

const app = document.querySelector<HTMLDivElement>('#reaction-app');
if (!app) throw new Error('Reaction Lab root was not found.');
app.innerHTML = `
  <main class="lab-shell">
    <header class="lab-header">
      <div>
        <p class="eyebrow">Molecule Playground · Reaction Lab</p>
        <h1>Reaction Lab</h1>
        <p class="lab-copy">Choose two reactants. Explore a pathway and its product.</p>
      </div>
      <nav class="lab-nav" aria-label="Project pages">
        <a href="/">Home</a>
        <a href="/explore.html">Explore molecules</a>
        <a href="/builder.html">Build a molecule</a>
        <a class="is-current" href="/reaction-lab.html" aria-current="page">Reaction Lab</a>
      </nav>
    </header>
    <div class="lab-notice">Teaching tool · A matching pathway is not a prediction or lab instruction.</div>
    <details class="reaction-guide">
      <summary><span>Reaction guide</span><small>Brief explanations of every supported type</small></summary>
      <div class="guide-grid">
        <section><h2>Addition</h2><p>Atoms add across a double bond.</p><ul><li><strong>Hydrogenation:</strong> H₂ adds across C=C.</li><li><strong>Bromination:</strong> Br₂ adds across C=C.</li><li><strong>Hydration:</strong> H and OH add across C=C.</li></ul></section>
        <section><h2>Elimination</h2><p>A small group leaves and a C=C bond forms.</p><ul><li><strong>E1:</strong> The leaving group goes first; a hydrogen is removed next.</li><li><strong>E2:</strong> Hydrogen removal and leaving-group loss happen together.</li></ul></section>
        <section><h2>Substitution</h2><p>One group replaces another.</p><ul><li><strong>SN1:</strong> The leaving group goes first; the new group attaches next.</li><li><strong>SN2:</strong> The new group attaches as the leaving group departs.</li></ul></section>
        <section><h2>Oxidation</h2><p><strong>Alcohol oxidation:</strong> A secondary alcohol becomes a ketone. The hypochlorite example is a simplified net equation, not a procedure.</p></section>
        <section><h2>Reduction</h2><p><strong>Carbonyl hydrogenation:</strong> H₂ converts a ketone C=O into an alcohol. Alkene hydrogenation is also a reduction.</p></section>
        <section><h2>Condensation</h2><p><strong>Esterification:</strong> An acid and an alcohol form an ester plus water.</p></section>
        <section><h2>Hydrolysis</h2><p><strong>Ester hydrolysis:</strong> Water splits an ester into an acid and an alcohol.</p></section>
      </div>
    </details>
    <section class="lab-workspace" aria-label="Interactive reaction lab">
      <section class="lab-input-panel">
        <div class="panel-heading"><p class="eyebrow">01 · Reactants</p><h2>Choose two molecules</h2></div>
        <form id="reactant-form" autocomplete="off">
          <div class="reactant-fields">
            <div><label for="reactant-a">Molecule 1</label><div class="reactant-lookup"><input id="reactant-a" list="reactant-options" placeholder="Name or formula" required /><button id="reactant-a-search" type="button">Search PubChem</button></div><p id="reactant-a-lookup-status" class="reactant-lookup-status" role="status"></p><div id="reactant-a-choices" class="reactant-choices"></div></div>
            <span class="reactant-plus" aria-hidden="true">+</span>
            <div><label for="reactant-b">Molecule 2 · reagent or solvent</label><div class="reactant-lookup"><input id="reactant-b" list="reactant-options" placeholder="Name or formula" required /><button id="reactant-b-search" type="button">Search PubChem</button></div><p id="reactant-b-lookup-status" class="reactant-lookup-status" role="status"></p><div id="reactant-b-choices" class="reactant-choices"></div></div>
          </div>
          <datalist id="reactant-options"></datalist>
          <details class="field-help"><summary>Input tips</summary><p>Use a full name or correctly capitalized formula (CH3Br, not Ch3br). Choose a bracketed structure if several match. PubChem lookup needs internet. You can also draw in <a href="/builder.html">Builder</a>.</p></details>
          <p id="reactant-interpretation" class="reactant-interpretation" hidden></p>
          <div class="condition-fields" aria-label="Reaction conditions">
            <div><label for="reaction-solvent">Solvent / medium</label><select id="reaction-solvent"><option value="">Not specified</option><option value="polar-aprotic">Polar aprotic</option><option value="aqueous-protic">Water · polar protic</option><option value="ethanolic-protic">Ethanol · protic</option><option value="dry">Dry / no water</option></select></div>
            <div><label for="reaction-temperature">Temperature</label><select id="reaction-temperature"><option value="">Not specified</option><option value="ambient">Room temperature</option><option value="heated">Heated</option></select></div>
            <div><label for="reaction-catalyst">Catalyst</label><select id="reaction-catalyst"><option value="">Not specified</option><option value="none">None added</option><option value="acid">Acid</option><option value="metal">Metal (Pd/Pt)</option></select></div>
          </div>
        </form>
        <section class="example-library" aria-labelledby="example-library-heading">
          <div class="library-heading"><div><p class="eyebrow">Guided examples</p><h3 id="example-library-heading">Try an example</h3></div><span id="example-count"></span></div>
          <div id="family-filters" class="family-filters" role="group" aria-label="Filter example reactions"></div>
          <div id="example-cards" class="example-cards"><p class="library-loading">Loading examples…</p></div>
        </section>
        <div class="panel-heading reaction-heading"><p class="eyebrow">02 · Matching options</p><h2>Choose a reaction</h2></div>
        <div id="reaction-options" class="reaction-options" aria-live="polite"><p class="empty-options">Choose both molecules to see supported pathways.</p></div>
        <div class="lab-actions">
          <button id="run-reaction" type="button" disabled>Show product in 3D</button>
          <p id="lab-status" role="status">Loading the reaction collection…</p>
        </div>
      </section>
      <aside class="lab-result-panel">
        <div class="panel-heading"><p class="eyebrow">03 · Result</p><h2>Explore the product</h2></div>
        <p class="equation-label">Proposed net equation</p>
        <p id="reaction-equation" class="reaction-equation">Choose a pathway to preview its equation.</p>
        <p id="condition-assessment" class="condition-assessment" hidden></p>
        <p id="formula-note" class="formula-note" hidden></p>
        <div id="reaction-viewer" class="reaction-viewer" aria-label="Interactive 3D product preview"><p id="result-placeholder">Choose a matching reaction and show its product.</p></div>
        <p class="viewer-hint">Drag to rotate · scroll to zoom</p>
        <div id="result-details" class="result-details" hidden>
          <div class="result-facts">
            <div><span>Main product</span><strong id="product-name"></strong></div>
            <div><span>Molecular formula</span><strong id="product-formula"></strong></div>
            <div><span>Exact product structure · SMILES</span><strong id="product-smiles"></strong></div>
            <div><span>Atom + charge balance</span><strong id="atom-balance"></strong></div>
            <div><span>3D method</span><strong id="product-method"></strong></div>
          </div>
          <details class="result-learning"><summary>Why and conditions</summary>
            <h3>What happens?</h3><p id="reaction-explanation"></p>
            <h3>Conditions matter</h3><p id="reaction-conditions"></p>
            <a id="reaction-source" target="_blank" rel="noopener noreferrer">Chemistry source ↗</a>
          </details>
        </div>
        <details class="lab-limits"><summary>What this lab cannot predict</summary><p>These limited rules cannot determine rates, yields, product mixtures, rearrangements, or stereochemistry. 3D shows one calculated main-product shape; byproducts appear in the equation. Many charged or multi-part drawings remain 2D-only or outside this Lab's rules.</p></details>
      </aside>
    </section>
  </main>
`;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Reaction Lab element: ${selector}`);
  return element;
}

const inputA = required<HTMLInputElement>('#reactant-a');
const inputB = required<HTMLInputElement>('#reactant-b');
const solventInput = required<HTMLSelectElement>('#reaction-solvent');
const temperatureInput = required<HTMLSelectElement>('#reaction-temperature');
const catalystInput = required<HTMLSelectElement>('#reaction-catalyst');
const inputs = [inputA, inputB] as const;
const searchButtons = [required<HTMLButtonElement>('#reactant-a-search'), required<HTMLButtonElement>('#reactant-b-search')] as const;
const lookupStatuses = [required<HTMLParagraphElement>('#reactant-a-lookup-status'), required<HTMLParagraphElement>('#reactant-b-lookup-status')] as const;
const choiceHosts = [required<HTMLDivElement>('#reactant-a-choices'), required<HTMLDivElement>('#reactant-b-choices')] as const;
const datalist = required<HTMLDataListElement>('#reactant-options');
const optionsHost = required<HTMLDivElement>('#reaction-options');
const runButton = required<HTMLButtonElement>('#run-reaction');
const status = required<HTMLParagraphElement>('#lab-status');
const interpretation = required<HTMLParagraphElement>('#reactant-interpretation');
const viewerHost = required<HTMLDivElement>('#reaction-viewer');
const placeholder = required<HTMLParagraphElement>('#result-placeholder');
const equation = required<HTMLParagraphElement>('#reaction-equation');
const conditionAssessment = required<HTMLParagraphElement>('#condition-assessment');
const formulaNote = required<HTMLParagraphElement>('#formula-note');
const details = required<HTMLDivElement>('#result-details');
const source = required<HTMLAnchorElement>('#reaction-source');
const familyFilters = required<HTMLDivElement>('#family-filters');
const exampleCards = required<HTMLDivElement>('#example-cards');
const exampleCount = required<HTMLSpanElement>('#example-count');

const FAMILIES: ReactionFamily[] = ['Addition', 'Elimination', 'Substitution', 'Oxidation', 'Reduction', 'Condensation', 'Hydrolysis'];
const EXAMPLES: Example[] = [
  { id: 'alkene-hydrogenation', title: 'Hydrogenate ethene', reactants: ['ethene', 'hydrogen'], families: ['Addition', 'Reduction'], change: 'C=C becomes C–C; hydrogen adds', conditions: { solvent: '', temperature: '', catalyst: 'metal' } },
  { id: 'alkene-bromination', title: 'Add bromine to ethene', reactants: ['ethene', 'bromine'], families: ['Addition'], change: 'C=C becomes C–C; two C–Br bonds form', conditions: { solvent: 'dry', temperature: '', catalyst: '' } },
  { id: 'alkene-hydration', title: 'Hydrate ethene', reactants: ['ethene', 'water'], families: ['Addition'], change: 'H and OH add across C=C', conditions: { solvent: '', temperature: '', catalyst: 'acid' } },
  { id: 'methyl-substitution', title: 'Substitute bromomethane', reactants: ['bromomethane', 'hydroxide'], families: ['Substitution'], change: 'SN2: C–Br breaks as C–O forms', conditions: { solvent: 'polar-aprotic', temperature: '', catalyst: '' } },
  { id: 'ethyl-competition', title: 'Compare SN2 and E2', reactants: ['bromoethane', 'hydroxide'], families: ['Substitution', 'Elimination'], change: 'Same pair; conditions can favor different pathways', conditions: { solvent: 'ethanolic-protic', temperature: 'heated', catalyst: '' } },
  { id: 'secondary-elimination', title: 'Eliminate from 2-bromopropane', reactants: ['2-bromopropane', 'hydroxide'], families: ['Elimination'], change: 'E2: C–Br breaks as C=C forms', conditions: { solvent: 'ethanolic-protic', temperature: 'heated', catalyst: '' } },
  { id: 'tertiary-competition', title: 'Compare SN1 and E1', reactants: ['tert-butyl-chloride', 'water'], families: ['Substitution', 'Elimination'], change: 'Same pair; temperature changes the comparison', conditions: { solvent: 'aqueous-protic', temperature: 'ambient', catalyst: '' } },
  { id: 'fischer-esterification', title: 'Make an ester', reactants: ['ethanoic-acid', 'ethanol'], families: ['Condensation'], change: 'Acid + alcohol → ester + water', conditions: { solvent: '', temperature: '', catalyst: 'acid' } },
  { id: 'ester-hydrolysis', title: 'Split an ester', reactants: ['ethyl-ethanoate', 'water'], families: ['Hydrolysis'], change: 'Ester + water → acid + alcohol', conditions: { solvent: 'aqueous-protic', temperature: '', catalyst: 'acid' } },
  { id: 'secondary-oxidation', title: 'Oxidize 2-propanol', reactants: ['2-propanol', 'sodium-hypochlorite'], families: ['Oxidation'], change: 'Secondary alcohol → ketone; simplified net equation', conditions: { solvent: 'aqueous-protic', temperature: '', catalyst: '' } },
  { id: 'ketone-reduction', title: 'Reduce acetone', reactants: ['acetone', 'hydrogen'], families: ['Reduction'], change: 'Ketone C=O → secondary alcohol C–OH', conditions: { solvent: '', temperature: '', catalyst: 'metal' } },
];
let activeFamily: ReactionFamily | 'All' = 'All';

const viewerFactory = (window as unknown as { $3Dmol?: { createViewer: (host: HTMLElement, options: Record<string, unknown>) => Viewer } }).$3Dmol;
const viewer = viewerFactory?.createViewer(viewerHost, { backgroundColor: '#f5f3ee', antialias: true });
if (viewer) new ResizeObserver(() => { viewer.resize(); viewer.render(); }).observe(viewerHost);

let catalog: Catalog | null = null;
let selectedReaction: Reaction | null = null;
let revision = 0;
let running = false;
let selectedIds: [string | null, string | null] = [null, null];
let drawnInputs: [Reactant | null, Reactant | null] = [null, null];
type PubChemLookup = { query: string; items: Reactant[] };
let pubchemLookups: [PubChemLookup | null, PubChemLookup | null] = [null, null];
const lookupRevisions = [0, 0];
const DRAFT_KEY = 'molecule-playground.reaction-draft.v1';
const TRANSFER_KEY = 'molecule-playground.builder-reactant.v1';
const EXPLORER_TRANSFER_KEY = 'molecule-playground.explorer-reactant.v1';

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function conditionLabel(state: Reaction['assessment']): string {
  if (state?.state === 'aligned') return 'Conditions fit the example · outcome not guaranteed';
  if (state?.state === 'alternative') return 'Conditions differ from the example';
  return 'Check the conditions for this pathway';
}

function renderExampleLibrary() {
  if (!catalog) return;
  familyFilters.replaceChildren();
  for (const family of ['All', ...FAMILIES] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = family;
    button.setAttribute('aria-pressed', String(activeFamily === family));
    button.addEventListener('click', () => {
      activeFamily = family;
      renderExampleLibrary();
    });
    familyFilters.append(button);
  }
  const visible = EXAMPLES.filter((example) => activeFamily === 'All' || example.families.includes(activeFamily));
  exampleCount.textContent = `${visible.length} example${visible.length === 1 ? '' : 's'}`;
  exampleCards.replaceChildren();
  for (const example of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-card';
    button.dataset.example = example.id;
    const badges = document.createElement('span');
    badges.className = 'example-families';
    badges.textContent = example.families.join(' · ');
    const title = document.createElement('strong');
    title.textContent = example.title;
    const pair = document.createElement('span');
    pair.className = 'example-pair';
    pair.textContent = example.reactants.map((id) => catalog!.reactants.find((item) => item.id === id)?.name ?? id).join(' + ');
    button.title = example.change;
    button.setAttribute('aria-description', example.change);
    button.append(badges, title, pair);
    exampleCards.append(button);
  }
}

function candidatesFor(slot: 0 | 1): Reactant[] {
  const drawn = drawnInputs[slot];
  if (drawn && inputs[slot].value === drawn.name) return [drawn];
  const lookup = pubchemLookups[slot];
  if (lookup && lookup.query === inputs[slot].value.trim()) return lookup.items;
  return catalog ? findReactantCandidates(catalog.reactants, inputs[slot].value) : [];
}

function resolveReactant(slot: 0 | 1): Reactant | undefined {
  const candidates = candidatesFor(slot);
  if (candidates.length === 1) return candidates[0];
  return candidates.find((item) => item.id === selectedIds[slot]);
}

function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ values: inputs.map((input) => input.value), selectedIds, drawnInputs, pubchemLookups, conditions: currentConditions() }));
  } catch { /* Entries still work when browser storage is unavailable. */ }
}

function currentConditions(): Conditions {
  return { solvent: solventInput.value, temperature: temperatureInput.value, catalyst: catalystInput.value };
}

function isReviewedReactant(reactant: Reactant): boolean {
  return Boolean(catalog?.reactants.some((item) => item.id === reactant.id && item.smiles === reactant.smiles));
}

function restoreLookup(value: unknown, slot: 0 | 1): PubChemLookup | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<PubChemLookup>;
  if (typeof saved.query !== 'string' || saved.query !== inputs[slot].value.trim() || saved.query.length > 100
      || !Array.isArray(saved.items) || saved.items.length > 25) return null;
  const valid = saved.items.every((item) => item && typeof item === 'object'
    && typeof item.id === 'string' && item.id.length <= 60
    && typeof item.name === 'string' && item.name.length <= 200
    && typeof item.formula === 'string' && item.formula.length <= 40
    && typeof item.smiles === 'string' && item.smiles.length <= 1024
    && Array.isArray(item.aliases) && item.aliases.every((alias: unknown) => typeof alias === 'string' && alias.length <= 200));
  return valid ? saved as PubChemLookup : null;
}

function reactantReference(reactant: Reactant): string | { smiles: string } {
  return isReviewedReactant(reactant) ? reactant.id : { smiles: reactant.smiles };
}

function renderChoices(slot: 0 | 1) {
  const host = choiceHosts[slot];
  host.replaceChildren();
  const candidates = candidatesFor(slot);
  if (candidates.length < 2) return;
  const prompt = document.createElement('p');
  prompt.textContent = `${inputs[slot].value.trim()} matches multiple structures. Choose one:`;
  host.append(prompt);
  for (const candidate of candidates) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${candidate.name} [${candidate.smiles}] · ${candidate.formula}`;
    button.setAttribute('aria-pressed', String(selectedIds[slot] === candidate.id));
    button.addEventListener('click', () => {
      selectedIds[slot] = candidate.id;
      saveDraft();
      updateMatches();
    });
    host.append(button);
  }
}

async function searchPubChem(slot: 0 | 1) {
  if (!catalog) return;
  const query = inputs[slot].value.trim();
  if (!query) {
    lookupStatuses[slot].textContent = 'Enter a molecule name or formula first.';
    inputs[slot].focus();
    return;
  }
  const requestRevision = ++lookupRevisions[slot];
  const button = searchButtons[slot];
  button.disabled = true;
  lookupStatuses[slot].textContent = 'Searching PubChem…';
  try {
    const response = await fetch(`/api/pubchem/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json() as { results: PubChemReactantMatch[]; limited: boolean } | { error: string };
    if (requestRevision !== lookupRevisions[slot] || inputs[slot].value.trim() !== query) return;
    if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'PubChem search failed.');
    const candidates = mergePubChemCandidates(catalog.reactants, query, payload.results);
    pubchemLookups[slot] = { query, items: candidates };
    if (!candidates.some((candidate) => candidate.id === selectedIds[slot])) selectedIds[slot] = null;
    lookupStatuses[slot].textContent = candidates.length
      ? `${candidates.length} distinct structure${candidates.length === 1 ? '' : 's'} available${payload.limited ? ' (first results shown)' : ''}.${candidates.length > 1 ? ' Choose one below.' : ''}`
      : 'No PubChem record found. Try a full name or formula.';
    saveDraft();
    updateMatches();
  } catch (error) {
    if (requestRevision !== lookupRevisions[slot]) return;
    pubchemLookups[slot] = null;
    lookupStatuses[slot].textContent = error instanceof Error ? error.message : 'PubChem search is unavailable.';
    updateMatches();
  } finally {
    if (requestRevision === lookupRevisions[slot]) button.disabled = false;
  }
}

function resetResult() {
  revision += 1;
  viewer?.removeAllModels();
  viewer?.render();
  placeholder.hidden = false;
  details.hidden = true;
  equation.textContent = 'Choose a pathway to preview its equation.';
  conditionAssessment.hidden = true;
  formulaNote.hidden = true;
}

function formatEquation(reaction: Reaction, first: Reactant, second: Reactant): string {
  if (!catalog) return '';
  const active = [first, second] as const;
  const availableReactants = [...catalog.reactants, ...active.flatMap((item, index) =>
    isReviewedReactant(item) ? [] : [{ ...item, id: `drawn-${index + 1}` }])];
  const equationInputs = reaction.equationReactants.map((id) => availableReactants.find((item) => item.id === id)).filter((item): item is Reactant => Boolean(item));
  const mediumId = reaction.reactants.find((id) => !reaction.equationReactants.includes(id));
  const medium = availableReactants.find((item) => item.id === mediumId);
  const mediumNote = medium ? ` · ${medium.name} is the medium` : '';
  return `${equationInputs.map((item) => `${item.name} (${item.formula})`).join(' + ')} → ${reaction.productName} (${reaction.productEquationFormula})${reaction.byproducts.map((item) => ` + ${item.name} (${item.formula})`).join('')}${mediumNote}`;
}

function showEmpty(message: string) {
  optionsHost.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-options';
  paragraph.textContent = message;
  optionsHost.append(paragraph);
}

async function updateMatches() {
  resetResult();
  interpretation.hidden = true;
  interpretation.textContent = '';
  selectedReaction = null;
  runButton.disabled = true;
  if (!catalog) return;
  renderChoices(0);
  renderChoices(1);
  const first = resolveReactant(0);
  const second = resolveReactant(1);
  if (!inputA.value.trim() || !inputB.value.trim()) {
    showEmpty('Choose both molecules to see supported pathways.');
    setStatus('Choose two molecules and, if known, their conditions.');
    return;
  }
  if (inputs.some((_, index) => candidatesFor(index as 0 | 1).length === 0)) {
    showEmpty('One or both molecules are not recognized yet. Search PubChem beside that input, type a listed molecule, or send a drawing from Builder.');
    setStatus('Search for an unlisted molecule or choose a reviewed example.');
    return;
  }
  if (!first || !second) {
    showEmpty('A formula matches more than one structure. Choose the intended molecule above.');
    setStatus('Select a structure for each ambiguous formula.');
    return;
  }
  const requestRevision = revision;
  showEmpty('Checking supported reaction rules…');
  setStatus('Matching structures and comparing conditions…');
  let matches: Reaction[];
  try {
    const response = await fetch('/api/reactions/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reactantA: reactantReference(first), reactantB: reactantReference(second), conditions: currentConditions() }),
    });
    const payload = await response.json() as { reactions: Reaction[]; interpretationNotes?: string[] } | { error: string };
    if (requestRevision !== revision) return;
    if (!response.ok || 'error' in payload) {
      if (response.status === 422) {
        showEmpty('A selected structure is outside the current reaction-rule scope. This does not mean the molecules cannot react.');
        setStatus('This structure is not supported by the current teaching rules.');
        return;
      }
      throw new Error('error' in payload ? payload.error : 'Could not check the reaction rules.');
    }
    matches = payload.reactions;
    if (payload.interpretationNotes?.length) {
      interpretation.textContent = payload.interpretationNotes.join(' ');
      interpretation.hidden = false;
    }
  } catch (error) {
    if (requestRevision === revision) {
      showEmpty('Could not check the reaction rules right now.');
      setStatus(error instanceof Error ? error.message : 'The chemistry service is unavailable.', true);
    }
    return;
  }
  if (!matches.length) {
    const customInput = [first, second].some((reactant) => !isReviewedReactant(reactant));
    showEmpty(customInput
      ? 'No supported rule for this pair. Current automatic rules cover simple acyclic alkyl halides with listed hydroxide or water, and small acyclic hydrocarbons with one C=C bond plus listed hydrogen or bromine. PubChem identifies structures; it does not predict a reaction here. This does not mean the molecules cannot react.'
      : 'No supported pathway for this pair yet. That does not prove the molecules cannot react.');
    setStatus('No supported rule matches these structures.');
    return;
  }
  optionsHost.replaceChildren();
  for (const reaction of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reaction-option';
    button.setAttribute('aria-pressed', 'false');
    const title = document.createElement('strong');
    title.textContent = `${reaction.mechanism} · ${reaction.family}`;
    const summary = document.createElement('span');
    summary.textContent = `Main product: ${reaction.productName} · ${reaction.productEquationFormula}`;
    const assessment = document.createElement('em');
    assessment.className = `assessment-${reaction.assessment?.state ?? 'incomplete'}`;
    assessment.textContent = conditionLabel(reaction.assessment);
    button.append(title, summary, assessment);
    if (reaction.family === 'Oxidation') {
      const warning = document.createElement('small');
      warning.textContent = 'Illustrative equation only · Never mix chemicals to test it.';
      button.append(warning);
    }
    button.addEventListener('click', () => {
      resetResult();
      selectedReaction = reaction;
      equation.textContent = formatEquation(reaction, first, second);
      conditionAssessment.textContent = conditionLabel(reaction.assessment);
      conditionAssessment.className = `condition-assessment assessment-${reaction.assessment?.state ?? 'incomplete'}`;
      conditionAssessment.hidden = false;
      for (const option of optionsHost.querySelectorAll<HTMLButtonElement>('button')) {
        option.setAttribute('aria-pressed', String(option === button));
      }
      runButton.disabled = running;
      setStatus(`${reaction.name} selected. Show the product when ready.`);
    });
    optionsHost.append(button);
  }
  setStatus(matches.length > 1
    ? `${matches.length} supported pathways found. They may compete; select one to inspect.`
    : '1 supported pathway found. Select it to inspect.');
}

required<HTMLFormElement>('#reactant-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const slot = document.activeElement === inputB ? 1 : 0;
  void searchPubChem(slot);
});
searchButtons.forEach((button, index) => button.addEventListener('click', () => void searchPubChem(index as 0 | 1)));
inputs.forEach((input, index) => input.addEventListener('input', () => {
  const slot = index as 0 | 1;
  lookupRevisions[slot] += 1;
  searchButtons[slot].disabled = false;
  lookupStatuses[slot].textContent = '';
  pubchemLookups[slot] = null;
  selectedIds[slot] = null;
  drawnInputs[slot] = null;
  saveDraft();
  updateMatches();
}));
for (const select of [solventInput, temperatureInput, catalystInput]) select.addEventListener('change', () => {
  saveDraft();
  updateMatches();
});
exampleCards.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-example]');
  if (!target || !catalog) return;
  const example = EXAMPLES.find((item) => item.id === target.dataset.example);
  if (!example) return;
  const [firstId, secondId] = example.reactants;
  inputA.value = catalog.reactants.find((item) => item.id === firstId)?.name ?? '';
  inputB.value = catalog.reactants.find((item) => item.id === secondId)?.name ?? '';
  solventInput.value = example.conditions.solvent;
  temperatureInput.value = example.conditions.temperature;
  catalystInput.value = example.conditions.catalyst;
  selectedIds = [null, null];
  drawnInputs = [null, null];
  pubchemLookups = [null, null];
  lookupRevisions[0] += 1;
  lookupRevisions[1] += 1;
  searchButtons.forEach((button) => { button.disabled = false; });
  lookupStatuses.forEach((item) => { item.textContent = ''; });
  saveDraft();
  updateMatches();
});

runButton.addEventListener('click', async () => {
  const first = resolveReactant(0);
  const second = resolveReactant(1);
  const reaction = selectedReaction;
  if (!first || !second || !reaction || running) return;
  const requestRevision = revision;
  running = true;
  runButton.disabled = true;
  setStatus('Checking atom balance and calculating the product shape…');
  try {
    const response = await fetch('/api/reactions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reactionId: reaction.id, reactantA: reactantReference(first), reactantB: reactantReference(second), conditions: currentConditions() }),
    });
    const payload = await response.json() as RunResult | { error: string };
    if (requestRevision !== revision) return;
    if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'Could not calculate this reaction.');
    if (!viewer) throw new Error('The 3D viewer did not load. Check the network connection.');
    viewer.removeAllModels();
    viewer.addModel(payload.product.molfile, 'mol');
    viewer.setStyle({}, { stick: { colorscheme: 'Jmol', radius: 0.1 }, sphere: { scale: 0.28 } });
    viewer.zoomTo();
    viewer.resize();
    viewer.render();
    placeholder.hidden = true;
    equation.textContent = formatEquation(reaction, first, second);
    conditionAssessment.textContent = conditionLabel(payload.assessment);
    conditionAssessment.className = `condition-assessment assessment-${payload.assessment.state}`;
    conditionAssessment.hidden = false;
    formulaNote.hidden = reaction.productEquationFormula === payload.product.formula;
    formulaNote.textContent = `${reaction.productEquationFormula} is a condensed structural formula; ${payload.product.formula} is the molecular formula.`;
    required<HTMLElement>('#product-name').textContent = payload.productName;
    required<HTMLElement>('#product-formula').textContent = payload.product.formula;
    required<HTMLElement>('#product-smiles').textContent = payload.product.smiles;
    required<HTMLElement>('#atom-balance').textContent = payload.balanced ? 'Atoms and charge accounted for' : 'Not balanced';
    required<HTMLElement>('#product-method').textContent = payload.product.converged ? payload.product.forceField : `${payload.product.forceField} · not fully minimized`;
    required<HTMLElement>('#reaction-explanation').textContent = reaction.explanation;
    required<HTMLElement>('#reaction-conditions').textContent = reaction.conditions;
    source.href = reaction.sourceUrl;
    details.hidden = false;
    setStatus(`${payload.productName} is ready (${reaction.mechanism} pathway). Rotate the 3D model.`);
  } catch (error) {
    if (requestRevision === revision) {
      setStatus(error instanceof Error ? error.message : 'Could not show this product.', true);
    }
  } finally {
    running = false;
    runButton.disabled = !selectedReaction;
  }
});

try {
  const response = await fetch('/api/reactions/catalog');
  if (!response.ok) throw new Error('The local chemistry service is unavailable.');
  catalog = await response.json() as Catalog;
  renderExampleLibrary();
  for (const reactant of catalog.reactants) {
    const option = document.createElement('option');
    option.value = reactant.name;
    option.label = reactant.formula;
    datalist.append(option);
  }
  for (const formula of new Set(catalog.reactants.map((item) => item.formula))) {
    const option = document.createElement('option');
    option.value = formula;
    option.label = catalog.reactants.filter((item) => item.formula === formula).map((item) => item.name).join(' / ');
    datalist.append(option);
  }
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as { values?: unknown; selectedIds?: unknown; drawnInputs?: unknown; pubchemLookups?: unknown; conditions?: Record<string, unknown> } | null;
    if (Array.isArray(draft?.values) && draft.values.length === 2 && draft.values.every((value) => typeof value === 'string')) {
      inputs.forEach((input, index) => { input.value = (draft.values as string[])[index]; });
      if (Array.isArray(draft.selectedIds) && draft.selectedIds.length === 2) {
        selectedIds = draft.selectedIds.map((id) => typeof id === 'string' ? id : null) as [string | null, string | null];
      }
      if (Array.isArray(draft.drawnInputs) && draft.drawnInputs.length === 2) {
        drawnInputs = draft.drawnInputs.map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const saved = item as Partial<Reactant>;
          if (saved.id !== `drawn-${index + 1}` || typeof saved.name !== 'string' || typeof saved.formula !== 'string'
              || typeof saved.smiles !== 'string' || saved.smiles.length > 1024 || inputs[index].value !== saved.name) return null;
          return { id: saved.id, name: saved.name, formula: saved.formula, smiles: saved.smiles, aliases: [] };
        }) as [Reactant | null, Reactant | null];
      }
      if (Array.isArray(draft.pubchemLookups) && draft.pubchemLookups.length === 2) {
        pubchemLookups = [restoreLookup(draft.pubchemLookups[0], 0), restoreLookup(draft.pubchemLookups[1], 1)];
        pubchemLookups.forEach((lookup, index) => {
          if (lookup) lookupStatuses[index].textContent = `${lookup.items.length} saved structure${lookup.items.length === 1 ? '' : 's'} available.`;
        });
      }
      for (const [key, select] of [['solvent', solventInput], ['temperature', temperatureInput], ['catalyst', catalystInput]] as const) {
        const value = draft.conditions?.[key];
        if (typeof value === 'string' && [...select.options].some((option) => option.value === value)) select.value = value;
      }
    }
    const transfer = JSON.parse(sessionStorage.getItem(TRANSFER_KEY) ?? 'null') as { slot?: unknown; smiles?: unknown; formula?: unknown } | null;
    sessionStorage.removeItem(TRANSFER_KEY);
    const explorerTransfer = JSON.parse(sessionStorage.getItem(EXPLORER_TRANSFER_KEY) ?? 'null') as { slot?: unknown; id?: unknown; name?: unknown; formula?: unknown; smiles?: unknown } | null;
    sessionStorage.removeItem(EXPLORER_TRANSFER_KEY);
    if (transfer && (transfer.slot === 0 || transfer.slot === 1) && typeof transfer.smiles === 'string') {
      const found = findReactantBySmiles(catalog.reactants, transfer.smiles);
      if (found) {
        inputs[transfer.slot].value = found.name;
        selectedIds[transfer.slot] = found.id;
        drawnInputs[transfer.slot] = null;
        pubchemLookups[transfer.slot] = null;
        saveDraft();
        updateMatches();
        setStatus(`${found.name} was added from Builder as molecule ${transfer.slot + 1}.`);
      } else if (typeof transfer.formula === 'string' && transfer.formula.length <= 40 && transfer.smiles.length <= 1024) {
        const slot = transfer.slot;
        const drawn: Reactant = { id: `drawn-${slot + 1}`, name: `Drawn structure · ${transfer.formula}`, formula: transfer.formula, smiles: transfer.smiles, aliases: [] };
        drawnInputs[slot] = drawn;
        inputs[slot].value = drawn.name;
        selectedIds[slot] = drawn.id;
        pubchemLookups[slot] = null;
        saveDraft();
        updateMatches();
        setStatus(`Drawing added as molecule ${slot + 1}. Checking supported structural rules…`);
      } else {
        updateMatches();
        setStatus('The Builder transfer was incomplete. Please generate the drawing again.', true);
      }
    } else if (explorerTransfer && (explorerTransfer.slot === 0 || explorerTransfer.slot === 1)
        && typeof explorerTransfer.name === 'string' && explorerTransfer.name.length <= 200
        && typeof explorerTransfer.formula === 'string' && explorerTransfer.formula.length <= 40
        && typeof explorerTransfer.smiles === 'string' && explorerTransfer.smiles.length <= 1024) {
      const slot = explorerTransfer.slot;
      const found = catalog.reactants.find((item) => item.id === explorerTransfer.id && item.smiles === explorerTransfer.smiles)
        ?? findReactantBySmiles(catalog.reactants, explorerTransfer.smiles);
      const molecule: Reactant = found ?? {
        id: typeof explorerTransfer.id === 'string' ? explorerTransfer.id : `explorer-${slot + 1}`,
        name: explorerTransfer.name, formula: explorerTransfer.formula,
        smiles: explorerTransfer.smiles, aliases: [],
      };
      inputs[slot].value = molecule.name;
      selectedIds[slot] = molecule.id;
      drawnInputs[slot] = null;
      pubchemLookups[slot] = found ? null : { query: molecule.name, items: [molecule] };
      saveDraft();
      updateMatches();
      setStatus(`${molecule.name} was added from Explorer as molecule ${slot + 1}. Choose the other molecule to compare supported reactions.`);
    } else if (inputA.value || inputB.value) {
      updateMatches();
    } else {
      setStatus('Type two molecules, draw in Builder, or try an example pair.');
    }
  } catch {
    setStatus('Type two molecules or try an example pair.');
  }
} catch (error) {
  setStatus(error instanceof Error ? error.message : 'Could not load the reaction collection.', true);
}
