import React from 'react';
import { createRoot } from 'react-dom/client';
import { type Ketcher } from 'ketcher-core';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import 'ketcher-react/dist/index.css';
import './builder.css';

type Viewer = {
  removeAllModels: () => void;
  addModel: (data: string, format: string) => unknown;
  setStyle: (selection: Record<string, never>, style: Record<string, unknown>) => void;
  zoomTo: () => void;
  resize: () => void;
  render: () => void;
};

type ChemistryBase = {
  smiles: string;
  formula: string;
  molarMass: number;
  atoms: number;
  bonds: number;
};
type ChemistryResult = ChemistryBase & ({
  representation: '3d';
  molfile: string;
  forceField: string;
  converged: boolean;
} | { representation: '2d-only'; reason: string });

const app = document.querySelector<HTMLDivElement>('#builder-app');
if (!app) throw new Error('Builder root was not found.');
app.innerHTML = `
  <main class="builder-shell">
    <header class="builder-header">
      <div>
        <p class="eyebrow">Molecule Playground · Builder</p>
        <h1>Build a molecule</h1>
        <p class="builder-copy">Draw in 2D. Preview in 3D when possible.</p>
      </div>
      <nav class="builder-nav" aria-label="Project pages">
        <a href="/">Home</a>
        <a href="/explore.html">Explore molecules</a>
        <a class="is-current" href="/builder.html" aria-current="page">Build a molecule</a>
        <a href="/reaction-lab.html">Reaction Lab</a>
      </nav>
    </header>
    <section class="builder-workspace" aria-label="Molecule builder">
      <section class="editor-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">2D drawing</p>
            <h2>Draw a structure</h2>
            <p>Choose atoms and bonds, then check your drawing.</p>
            <details class="builder-help"><summary>Drawing and 3D help</summary><p>Use the toolbar or periodic table. Your drawing is saved in this browser tab. Some ions, salts, and metal compounds can be checked but cannot make a reliable 3D preview here.</p></details>
          </div>
          <button id="load-ethanol" class="secondary-button" type="button" disabled>Load ethanol example</button>
        </div>
        <div id="ketcher-editor" class="ketcher-frame" aria-label="2D chemical structure editor"></div>
        <div class="editor-actions">
          <button id="generate-3d" class="primary-button" type="button" disabled>Check + preview 3D</button>
          <p id="builder-status" role="status">Loading the drawing editor…</p>
        </div>
      </section>
      <aside class="preview-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Structure result</p><h2>Explore the shape</h2></div>
          <span id="preview-badge" class="preview-badge">3Dmol.js</span>
        </div>
        <div id="builder-viewer" class="builder-viewer" aria-label="Interactive 3D molecule preview">
          <p id="viewer-placeholder" class="viewer-placeholder">Draw a molecule to preview it.</p>
        </div>
        <p class="preview-hint">Drag to rotate · scroll to zoom</p>
        <div class="builder-facts">
          <div><span>Formula</span><strong id="builder-formula">—</strong></div>
          <div><span>Molar mass</span><strong id="builder-mass">—</strong></div>
          <div><span id="atom-label">3D atoms, including H</span><strong id="atom-count">—</strong></div>
          <div><span id="bond-label">3D bonds</span><strong id="bond-count">—</strong></div>
          <div><span>Structure check</span><strong id="rule-check">Waiting</strong></div>
          <div><span>3D method</span><strong id="energy-method">—</strong></div>
        </div>
        <div class="reactant-transfer">
          <p>Use in Reaction Lab</p>
          <button id="use-reactant-1" class="secondary-button" type="button" disabled>Use as molecule 1</button>
          <button id="use-reactant-2" class="secondary-button" type="button" disabled>Use as molecule 2</button>
        </div>
        <details class="prototype-note"><summary>About this preview</summary><p>A 3D shape is one calculated candidate, not necessarily the lowest-energy shape. A 2D-only result means no reliable 3D shape is available here. Reaction Lab may not support the drawing.</p></details>
      </aside>
    </section>
  </main>
`;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Builder element: ${selector}`);
  return element;
}

const editorHost = required<HTMLDivElement>('#ketcher-editor');
const viewerHost = required<HTMLDivElement>('#builder-viewer');
const placeholder = required<HTMLParagraphElement>('#viewer-placeholder');
const generateButton = required<HTMLButtonElement>('#generate-3d');
const ethanolButton = required<HTMLButtonElement>('#load-ethanol');
const status = required<HTMLParagraphElement>('#builder-status');
const formula = required<HTMLElement>('#builder-formula');
const mass = required<HTMLElement>('#builder-mass');
const atomCount = required<HTMLElement>('#atom-count');
const bondCount = required<HTMLElement>('#bond-count');
const ruleCheck = required<HTMLElement>('#rule-check');
const energyMethod = required<HTMLElement>('#energy-method');
const atomLabel = required<HTMLElement>('#atom-label');
const bondLabel = required<HTMLElement>('#bond-label');
const previewBadge = required<HTMLElement>('#preview-badge');
const transferButtons = [required<HTMLButtonElement>('#use-reactant-1'), required<HTMLButtonElement>('#use-reactant-2')] as const;
const TRANSFER_KEY = 'molecule-playground.builder-reactant.v1';
const DRAFT_KEY = 'molecule-playground.builder-draft.v1';

const viewerFactory = (window as unknown as { $3Dmol?: { createViewer: (element: HTMLElement, options: Record<string, unknown>) => Viewer } }).$3Dmol;
if (!viewerFactory) throw new Error('3Dmol.js did not load.');
const viewer = viewerFactory.createViewer(viewerHost, { backgroundColor: '#f5f3ee', antialias: true });

let ketcher: Ketcher | null = null;
let generating = false;
let editRevision = 0;
let lastResult: ChemistryResult | null = null;
let saveTimer: number | undefined;
let saveRevision = 0;

async function saveDrawing(revision: number) {
  const instance = ketcher;
  if (!instance) return;
  try {
    const molfile = await instance.getMolfile('v2000');
    if (revision === saveRevision && molfile.length <= 200_000) sessionStorage.setItem(DRAFT_KEY, molfile);
  } catch { /* The editor remains usable if draft storage is unavailable. */ }
}

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function resetResult() {
  editRevision += 1;
  lastResult = null;
  transferButtons.forEach((button) => { button.disabled = true; });
  viewer.removeAllModels();
  viewer.render();
  placeholder.textContent = 'Draw a molecule to preview it.';
  placeholder.hidden = false;
  formula.textContent = '—';
  mass.textContent = '—';
  atomCount.textContent = '—';
  bondCount.textContent = '—';
  ruleCheck.textContent = 'Waiting';
  ruleCheck.classList.remove('is-valid', 'is-invalid');
  energyMethod.textContent = '—';
  atomLabel.textContent = '3D atoms, including H';
  bondLabel.textContent = '3D bonds';
  previewBadge.textContent = '3Dmol.js';
}

function displayResult(result: ChemistryResult) {
  lastResult = result;
  transferButtons.forEach((button) => { button.disabled = false; });
  viewer.removeAllModels();
  viewer.render();
  formula.textContent = result.formula;
  mass.textContent = `${result.molarMass.toFixed(3)} g/mol`;
  atomCount.textContent = String(result.atoms);
  bondCount.textContent = String(result.bonds);
  if (result.representation === '2d-only') {
    placeholder.textContent = result.reason;
    placeholder.hidden = false;
    atomLabel.textContent = 'Drawn atoms';
    bondLabel.textContent = 'Drawn bonds';
    ruleCheck.textContent = '2D only';
    energyMethod.textContent = 'Not available';
    previewBadge.textContent = '2D only';
    setStatus(`Drawing checked. ${result.reason}`);
    return;
  }
  viewer.addModel(result.molfile, 'mol');
  viewer.setStyle({}, { stick: { colorscheme: 'Jmol', radius: 0.1 }, sphere: { scale: 0.3 } });
  viewer.zoomTo();
  viewer.resize();
  viewer.render();
  placeholder.hidden = true;
  ruleCheck.textContent = 'Passed';
  ruleCheck.classList.add('is-valid');
  energyMethod.textContent = result.converged ? result.forceField : `${result.forceField} · not fully minimized`;
  setStatus(`${result.formula} is ready. Rotate or zoom the 3D model.`);
}

async function generate3D() {
  if (!ketcher || generating) return;
  const revision = editRevision;
  generating = true;
  generateButton.disabled = true;
  setStatus('Checking the drawing and calculating a 3D shape…');
  try {
    const molfile = await ketcher.getMolfile('v2000');
    if (revision !== editRevision) return;
    const response = await fetch('/api/chemistry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ molfile }),
    });
    const payload = await response.json() as ChemistryResult | { error: string };
    if (revision !== editRevision) return;
    if (!response.ok || 'error' in payload) {
      throw new Error('error' in payload ? payload.error : 'The chemistry service could not process this drawing.');
    }
    displayResult(payload);
  } catch (error) {
    if (revision === editRevision) {
      const message = error instanceof SyntaxError || error instanceof TypeError
        ? 'The local chemistry service is unavailable. Run start-local.command again.'
        : error instanceof Error ? error.message : 'Could not generate a 3D model.';
      ruleCheck.textContent = 'Needs changes';
      ruleCheck.classList.add('is-invalid');
      setStatus(message, true);
    }
  } finally {
    generating = false;
    generateButton.disabled = !ketcher;
  }
}

generateButton.addEventListener('click', generate3D);
transferButtons.forEach((button, slot) => button.addEventListener('click', () => {
  if (!lastResult) return;
  try {
    sessionStorage.setItem(TRANSFER_KEY, JSON.stringify({ slot, smiles: lastResult.smiles, formula: lastResult.formula }));
    window.location.assign('/reaction-lab.html');
  } catch {
    setStatus('Browser storage is unavailable, so the drawing could not be sent to Reaction Lab.', true);
  }
}));
ethanolButton.addEventListener('click', async () => {
  if (!ketcher) return;
  ethanolButton.disabled = true;
  try {
    await ketcher.setMolecule('CCO');
    resetResult();
    setStatus('Ethanol is loaded. Select Check + preview 3D.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not load ethanol.', true);
  } finally {
    ethanolButton.disabled = false;
  }
});

createRoot(editorHost).render(React.createElement(Editor, {
  staticResourcesUrl: '/',
  structServiceProvider: new StandaloneStructServiceProvider(),
  disableMacromoleculesEditor: true,
  buttons: { miew: { hidden: true } },
  onInit: (instance: Ketcher) => {
    ketcher = instance;
    generateButton.disabled = false;
    ethanolButton.disabled = false;
    instance.editor.subscribe('change', () => {
      resetResult();
      setStatus('Drawing changed. Check it again when ready.');
      window.clearTimeout(saveTimer);
      const revision = ++saveRevision;
      saveTimer = window.setTimeout(() => { void saveDrawing(revision); }, 350);
    });
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(DRAFT_KEY); } catch { /* Private browsing can disable storage. */ }
    if (saved && saved.length <= 200_000 && saved.includes('V2000')) {
      void instance.setMolecule(saved).then(() => setStatus('Your drawing was restored from this browser tab. Check it when ready.'))
        .catch(() => setStatus('The saved drawing could not be restored. Start a new drawing.', true));
    } else {
      setStatus('Drawing editor ready. Add atoms or load the ethanol example.');
    }
  },
  errorHandler: (message: string) => setStatus(message, true),
}));

new ResizeObserver(() => {
  viewer.resize();
  viewer.render();
}).observe(viewerHost);
