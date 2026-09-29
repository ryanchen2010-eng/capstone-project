import './styles.css';
import { findMolecules, moleculeFromPubChem, molecules, normalizeQuery, type Molecule, type PubChemMatch } from './molecules';

type Viewer = {
  removeAllModels: () => void;
  removeAllSurfaces: () => void;
  removeAllLabels: () => void;
  removeAllShapes: () => void;
  addModel: (data: string, format: string) => unknown;
  setStyle: (selection: Record<string, never>, style: Record<string, unknown>) => void;
  zoomTo: () => void;
  render: () => void;
};

declare global {
  interface Window {
    $3Dmol?: {
      createViewer: (element: HTMLElement, options: Record<string, unknown>) => Viewer;
    };
  }
}

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element was not found: ${selector}`);
  return element;
}

const app = mustElement<HTMLDivElement>('#app');

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Chemistry, made tangible</p>
        <h1>Molecule Playground</h1>
        <p class="hero-copy">Search a compound. Explore its shape and properties.</p>
      </div>
      <div class="hero-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <nav class="hero-nav" aria-label="Project pages">
        <a class="builder-link" href="/">Home</a>
        <a class="builder-link is-current" href="/explore.html" aria-current="page">Explore molecules</a>
        <a class="builder-link" href="/builder.html">Build a molecule →</a>
        <a class="builder-link" href="/reaction-lab.html">Reaction Lab →</a>
      </nav>
    </header>

    <section class="workspace" aria-label="Interactive molecule explorer">
      <aside class="library">
        <div class="section-heading">
          <p class="eyebrow">Molecule search</p>
          <h2>Find a molecule</h2>
        </div>
        <form id="molecule-search-form" class="molecule-search" role="search">
          <label for="molecule-search">Search by name or formula</label>
          <div class="molecule-search__controls">
            <input id="molecule-search" type="search" placeholder="Water, caffeine, H₂O…" autocomplete="off" />
            <button type="submit">Search</button>
          </div>
          <p id="search-status" role="status">${molecules.length} featured compounds. Search PubChem for more.</p>
          <details class="search-help"><summary>Search tips</summary><p>Use a full name or correctly capitalized formula. If structures share a formula, brackets show their atom connections. Searches go to PubChem. Some compounds have a 2D view only.</p></details>
        </form>
        <div id="molecule-list" class="molecule-list"></div>
      </aside>

      <section class="viewer-panel">
        <div class="viewer-toolbar">
          <div>
            <p id="category" class="eyebrow"></p>
            <h2 id="molecule-title"></h2>
          </div>
          <div id="formula" class="formula" aria-label="Molecular formula"></div>
        </div>

        <div class="viewer-stage">
          <div id="molecule-viewer" aria-label="Interactive 3D molecule viewer"></div>
          <div id="molecule-fallback" class="molecule-fallback" hidden>
            <img id="molecule-fallback-image" alt="" />
            <p>PubChem 2D depiction · no 3D model available here</p>
          </div>
          <div id="viewer-status" class="viewer-status" role="status">
            Preparing the 3D viewer…
          </div>
          <div id="viewer-hint" class="viewer-hint">Drag to rotate · scroll to zoom · right-drag to move</div>
        </div>

        <div class="details">
          <p id="description" class="description"></p>
          <p id="everyday" class="fact-everyday"></p>
          <div class="explorer-transfer" aria-label="Use this compound in Reaction Lab">
            <span>Use in Reaction Lab</span>
            <button type="button" data-reaction-slot="0">Use as molecule 1</button>
            <button type="button" data-reaction-slot="1">Use as molecule 2</button>
          </div>
          <dl id="quick-facts" class="fact-grid quick-facts"></dl>
          <details class="more-properties"><summary>More properties and source</summary><dl id="fact-grid" class="fact-grid"></dl></details>
        </div>
      </section>
    </section>
  </main>
`;

const moleculeList = mustElement<HTMLDivElement>('#molecule-list');
const searchForm = mustElement<HTMLFormElement>('#molecule-search-form');
const searchInput = mustElement<HTMLInputElement>('#molecule-search');
const searchStatus = mustElement<HTMLParagraphElement>('#search-status');
const moleculeTitle = mustElement<HTMLHeadingElement>('#molecule-title');
const category = mustElement<HTMLParagraphElement>('#category');
const formula = mustElement<HTMLDivElement>('#formula');
const description = mustElement<HTMLParagraphElement>('#description');
const everyday = mustElement<HTMLParagraphElement>('#everyday');
const quickFacts = mustElement<HTMLDListElement>('#quick-facts');
const factGrid = mustElement<HTMLDListElement>('#fact-grid');
const viewerStatus = mustElement<HTMLDivElement>('#viewer-status');
const fallbackView = mustElement<HTMLDivElement>('#molecule-fallback');
const fallbackImage = mustElement<HTMLImageElement>('#molecule-fallback-image');
const viewerHint = mustElement<HTMLDivElement>('#viewer-hint');
const transferButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-reaction-slot]')];
const EXPLORER_TRANSFER_KEY = 'molecule-playground.explorer-reactant.v1';

const buttons = new Map<string, HTMLButtonElement>();
let displayedMolecules: Molecule[] = [...molecules];
let searchRevision = 0;

function renderMoleculeCards(items: Molecule[], emptyMessage = 'No molecule found. Try a full name or correctly capitalized formula.') {
  displayedMolecules = items;
  moleculeList.replaceChildren();
  buttons.clear();
  const formulaCounts = new Map<string, number>();
  for (const molecule of items) {
    const key = normalizeQuery(molecule.formula);
    formulaCounts.set(key, (formulaCounts.get(key) ?? 0) + 1);
  }
  for (const molecule of items) {
    const button = document.createElement('button');
    button.className = 'molecule-card';
    button.type = 'button';
    button.dataset.moleculeId = molecule.id;
    const formulaBadge = document.createElement('span');
    formulaBadge.className = 'molecule-card__formula';
    formulaBadge.textContent = molecule.formula;
    const text = document.createElement('span');
    text.className = 'molecule-card__text';
    const name = document.createElement('strong');
    name.textContent = molecule.name;
    const detail = document.createElement('small');
    const sameFormula = (formulaCounts.get(normalizeQuery(molecule.formula)) ?? 0) > 1;
    detail.textContent = sameFormula && molecule.structureForm
      ? `[${molecule.structureForm}] · ${molecule.category}`
      : molecule.category;
    if (sameFormula && molecule.structureForm) detail.title = 'Bracketed SMILES notation shows this molecule’s atom connections.';
    text.append(name, detail);
    const arrow = document.createElement('span');
    arrow.className = 'molecule-card__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    button.append(formulaBadge, text, arrow);
    moleculeList.append(button);
    buttons.set(molecule.id, button);
  }
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'molecule-list__empty';
    empty.textContent = emptyMessage;
    moleculeList.append(empty);
  }
}

renderMoleculeCards(molecules);

const viewerHost = mustElement<HTMLDivElement>('#molecule-viewer');
const viewerFactory = window.$3Dmol;
if (!viewerFactory) throw new Error('3Dmol.js did not load. Check the network connection.');
const viewer = viewerFactory.createViewer(viewerHost, {
  backgroundColor: '#f5f3ee',
  antialias: true,
});

let activeMoleculeId = '';
let activeMolecule: Molecule | null = null;
let loadSequence = 0;
let modelReady = false;
let depictionUrl: string | null = null;

async function showMolecule(molecule: Molecule) {
  activeMolecule = molecule;
  if (activeMoleculeId === molecule.id && modelReady) {
    for (const [id, button] of buttons) {
      button.classList.toggle('is-active', id === molecule.id);
      button.setAttribute('aria-pressed', String(id === molecule.id));
    }
    return;
  }

  activeMoleculeId = molecule.id;
  modelReady = false;
  const sequence = ++loadSequence;

  for (const [id, button] of buttons) {
    const selected = id === molecule.id;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = true;
  }

  category.textContent = molecule.category;
  moleculeTitle.textContent = molecule.name;
  formula.textContent = molecule.formula;
  description.textContent = molecule.description;
  const facts = [
    ['Molar mass', molecule.properties.mass],
    ['Geometry', molecule.properties.geometry],
    ['Polarity', molecule.properties.polarity],
    ['Bond types', molecule.properties.bonds],
    ['Melting point', molecule.properties.melting],
    ['Boiling / phase behaviour', molecule.properties.boiling],
  ].map(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    return wrapper;
  });
  quickFacts.replaceChildren(...facts.slice(0, 3));
  factGrid.replaceChildren(...facts.slice(3));
  everyday.textContent = `Everyday life: ${molecule.properties.everyday}`;
  const source = document.createElement('a');
  source.href = `https://pubchem.ncbi.nlm.nih.gov/compound/${molecule.cid}`;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = `PubChem · CID ${molecule.cid}`;
  const sourceWrapper = document.createElement('div');
  const sourceTerm = document.createElement('dt');
  const sourceDetail = document.createElement('dd');
  sourceTerm.textContent = 'Structure source';
  sourceDetail.append(source);
  sourceWrapper.append(sourceTerm, sourceDetail);
  sourceWrapper.className = 'fact-source';
  factGrid.append(sourceWrapper);

  viewerStatus.textContent = `Loading ${molecule.name}…`;
  viewerStatus.classList.remove('is-hidden', 'is-error');
  fallbackView.hidden = true;
  fallbackImage.removeAttribute('src');
  if (depictionUrl) URL.revokeObjectURL(depictionUrl);
  depictionUrl = null;
  viewerHint.textContent = 'Drag to rotate · scroll to zoom · right-drag to move';

  try {
    viewer.removeAllModels();
    viewer.render();
    const response = await fetch(molecule.structureFile);
    if (!response.ok) throw new Error('A 3D structure is not available for this compound.');
    const structure = await response.text();

    if (sequence !== loadSequence) return;

    viewer.removeAllSurfaces();
    viewer.removeAllLabels();
    viewer.removeAllShapes();
    viewer.addModel(structure, 'sdf');
    viewer.setStyle({}, { stick: { colorscheme: 'Jmol', radius: 0.1 }, sphere: { scale: 0.25 } });
    viewer.zoomTo();
    viewer.render();
    modelReady = true;

    if (sequence === loadSequence) {
      viewerStatus.textContent = `${molecule.name} ready`;
      window.setTimeout(() => {
        if (sequence === loadSequence) viewerStatus.classList.add('is-hidden');
      }, 700);
    }
  } catch (error) {
    if (sequence !== loadSequence) return;
    if (molecule.origin === 'pubchem') {
      try {
        const response = await fetch(`/api/pubchem/depiction?cid=${molecule.cid}`);
        if (!response.ok) throw new Error('Neither a 3D model nor a 2D depiction is available for this compound.');
        const blob = await response.blob();
        if (sequence !== loadSequence) return;
        depictionUrl = URL.createObjectURL(blob);
        fallbackImage.src = depictionUrl;
        fallbackImage.alt = `PubChem 2D depiction of ${molecule.name}`;
        fallbackView.hidden = false;
        viewerHint.textContent = '2D reference · rotation is unavailable';
        viewerStatus.textContent = '3D model unavailable here; showing PubChem’s 2D depiction.';
        modelReady = true;
        return;
      } catch (fallbackError) {
        if (sequence !== loadSequence) return;
        error = fallbackError;
      }
    }
    console.error(error);
    modelReady = false;
    viewerStatus.textContent = error instanceof Error ? error.message : `Could not load ${molecule.name}.`;
    viewerStatus.classList.add('is-error');
  } finally {
    if (sequence === loadSequence) {
      for (const button of buttons.values()) button.disabled = false;
    }
  }
}

transferButtons.forEach((button) => button.addEventListener('click', () => {
  const molecule = activeMolecule;
  if (!molecule?.structureForm) {
    searchStatus.textContent = 'This compound has no structure to send to Reaction Lab.';
    return;
  }
  try {
    sessionStorage.setItem(EXPLORER_TRANSFER_KEY, JSON.stringify({
      slot: Number(button.dataset.reactionSlot), id: molecule.id, name: molecule.name,
      formula: molecule.formula, smiles: molecule.structureForm,
    }));
    window.location.assign('/reaction-lab.html');
  } catch {
    searchStatus.textContent = 'Browser storage is unavailable; this compound could not be sent to Reaction Lab.';
  }
}));

moleculeList.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-molecule-id]',
  );
  if (!target) return;

  const molecule = displayedMolecules.find((item) => item.id === target.dataset.moleculeId);
  if (molecule) void showMolecule(molecule);
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  const requestRevision = ++searchRevision;
  if (!query) {
    renderMoleculeCards(molecules);
    searchStatus.textContent = `${molecules.length} featured compounds. Search PubChem for more.`;
    return;
  }
  const local = findMolecules(query);
  renderMoleculeCards(local, 'Searching PubChem…');
  searchStatus.textContent = 'Searching PubChem by name or formula…';
  try {
    const response = await fetch(`/api/pubchem/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json() as { results: PubChemMatch[]; limited: boolean } | { error: string };
    if (requestRevision !== searchRevision) return;
    if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'PubChem search failed.');
    const remote = payload.results.map(moleculeFromPubChem);
    const byCid = new Map(remote.map((item) => [item.cid, item]));
    const combined = [...local.map((item) => byCid.get(item.cid) ?? item), ...remote.filter((item) => !local.some((localItem) => localItem.cid === item.cid))];
    renderMoleculeCards(combined);
    searchStatus.textContent = combined.length
      ? `${combined.length} structure${combined.length === 1 ? '' : 's'} found${payload.limited ? ' (first results shown)' : ''}. Select a form to explore.`
      : 'No PubChem record found. Try a full name or correctly capitalized formula.';
    const exact = combined.filter((molecule) => [molecule.name, molecule.formula, molecule.id].some((value) => normalizeQuery(value) === normalizeQuery(query)));
    if (combined.length === 1 && exact.length === 1) void showMolecule(exact[0]);
  } catch (error) {
    if (requestRevision !== searchRevision) return;
    renderMoleculeCards(local);
    searchStatus.textContent = local.length
      ? 'PubChem is unavailable; showing matching featured molecules only.'
      : error instanceof Error ? error.message : 'PubChem is unavailable. Try again later.';
  }
});

searchInput.addEventListener('input', () => {
  searchRevision += 1;
  if (!searchInput.value.trim()) {
    renderMoleculeCards(molecules);
    searchStatus.textContent = `${molecules.length} featured compounds. Search PubChem for more.`;
  }
});

await showMolecule(molecules[0]);
