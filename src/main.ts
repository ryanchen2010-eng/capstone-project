import './styles.css';
import { molecules, type Molecule } from './molecules';

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
        <p class="hero-copy">
          Pick a familiar molecule, explore its structure in 3D, and connect its
          shape to the chemistry you meet in everyday life.
        </p>
      </div>
      <div class="hero-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </header>

    <section class="workspace" aria-label="Interactive molecule explorer">
      <aside class="library">
        <div class="section-heading">
          <p class="eyebrow">Starter collection</p>
          <h2>Common molecules</h2>
        </div>
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
          <div id="viewer-status" class="viewer-status" role="status">
            Preparing the 3D viewer…
          </div>
          <div class="viewer-hint">Drag to rotate · scroll to zoom · right-drag to move</div>
        </div>

        <div class="details">
          <p id="description" class="description"></p>
          <dl id="fact-grid" class="fact-grid"></dl>
        </div>
      </section>
    </section>
  </main>
`;

const moleculeList = mustElement<HTMLDivElement>('#molecule-list');
const moleculeTitle = mustElement<HTMLHeadingElement>('#molecule-title');
const category = mustElement<HTMLParagraphElement>('#category');
const formula = mustElement<HTMLDivElement>('#formula');
const description = mustElement<HTMLParagraphElement>('#description');
const factGrid = mustElement<HTMLDListElement>('#fact-grid');
const viewerStatus = mustElement<HTMLDivElement>('#viewer-status');

const buttons = new Map<string, HTMLButtonElement>();

for (const molecule of molecules) {
  const button = document.createElement('button');
  button.className = 'molecule-card';
  button.type = 'button';
  button.dataset.moleculeId = molecule.id;
  button.innerHTML = `
    <span class="molecule-card__formula">${molecule.formula}</span>
    <span class="molecule-card__text">
      <strong>${molecule.name}</strong>
      <small>${molecule.category}</small>
    </span>
    <span class="molecule-card__arrow" aria-hidden="true">→</span>
  `;
  moleculeList.append(button);
  buttons.set(molecule.id, button);
}

const viewerHost = mustElement<HTMLDivElement>('#molecule-viewer');
const viewerFactory = window.$3Dmol;
if (!viewerFactory) throw new Error('3Dmol.js did not load. Check the network connection.');
const viewer = viewerFactory.createViewer(viewerHost, {
  backgroundColor: '#f5f3ee',
  antialias: true,
});

let activeMoleculeId = '';
let loadSequence = 0;

async function showMolecule(molecule: Molecule) {
  if (activeMoleculeId === molecule.id) return;

  activeMoleculeId = molecule.id;
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
  factGrid.replaceChildren(
    ...molecule.facts.flatMap((fact) => {
      const wrapper = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = fact.label;
      detail.textContent = fact.value;
      wrapper.append(term, detail);
      return [wrapper];
    }),
  );

  viewerStatus.textContent = `Loading ${molecule.name}…`;
  viewerStatus.classList.remove('is-hidden', 'is-error');

  try {
    const response = await fetch(molecule.structureFile);
    if (!response.ok) throw new Error(`Could not fetch ${molecule.structureFile}`);
    const structure = await response.text();

    viewer.removeAllModels();
    viewer.removeAllSurfaces();
    viewer.removeAllLabels();
    viewer.removeAllShapes();
    viewer.addModel(structure, 'sdf');
    viewer.setStyle({}, { stick: { colorscheme: 'Jmol' }, sphere: { scale: 0.25 } });
    viewer.zoomTo();
    viewer.render();

    if (sequence === loadSequence) {
      viewerStatus.textContent = `${molecule.name} ready`;
      window.setTimeout(() => {
        if (sequence === loadSequence) viewerStatus.classList.add('is-hidden');
      }, 700);
    }
  } catch (error) {
    console.error(error);
    if (sequence === loadSequence) {
      viewerStatus.textContent = `Could not load ${molecule.name}.`;
      viewerStatus.classList.add('is-error');
    }
  } finally {
    if (sequence === loadSequence) {
      for (const button of buttons.values()) button.disabled = false;
    }
  }
}

moleculeList.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-molecule-id]',
  );
  if (!target) return;

  const molecule = molecules.find((item) => item.id === target.dataset.moleculeId);
  if (molecule) void showMolecule(molecule);
});

await showMolecule(molecules[0]);
