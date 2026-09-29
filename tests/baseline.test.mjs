import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFile(projectFile(path), 'utf8');

// Test the actual TypeScript data module, without importing browser UI or CSS.
async function importTypeScript(source) {
  const catalog = JSON.parse(await readSource('src/shared-molecules.json'));
  source = source.replace("import sharedCatalog from './shared-molecules.json';", `const sharedCatalog = ${JSON.stringify(catalog)};`);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { molecules, normalizeQuery, findMolecules, moleculeFromPubChem } = await importTypeScript(
  await readSource('src/molecules.ts'),
);

const expected = {
  water: { cid: 962, formula: 'H2O', atoms: 3, bonds: 2, orders: { 1: 2 }, mass: 18.015 },
  methane: { cid: 297, formula: 'CH4', atoms: 5, bonds: 4, orders: { 1: 4 }, mass: 16.043 },
  'carbon-dioxide': { cid: 280, formula: 'CO2', atoms: 3, bonds: 2, orders: { 2: 2 }, mass: 44.009 },
  ethanol: { cid: 702, formula: 'C2H6O', atoms: 9, bonds: 8, orders: { 1: 8 }, mass: 46.069 },
  glucose: { cid: 5793, formula: 'C6H12O6', atoms: 24, bonds: 24, orders: { 1: 24 }, mass: 180.156 },
  caffeine: { cid: 2519, formula: 'C8H10N4O2', atoms: 24, bonds: 25, orders: { 1: 21, 2: 4 }, mass: 194.190 },
};

function parseSdf(text) {
  const lines = text.split(/\r?\n/);
  assert.match(lines[3], /V2000$/, 'bundled structures use V2000');
  const atomCount = Number(lines[3].slice(0, 3));
  const bondCount = Number(lines[3].slice(3, 6));
  assert.ok(Number.isInteger(atomCount) && atomCount > 0);
  assert.ok(Number.isInteger(bondCount) && bondCount > 0);
  const atomLines = lines.slice(4, 4 + atomCount);
  const bondLines = lines.slice(4 + atomCount, 4 + atomCount + bondCount);
  const counts = {};
  for (const line of atomLines) {
    const element = line.slice(31, 34).trim();
    assert.match(element, /^[A-Z][a-z]?$/);
    counts[element] = (counts[element] ?? 0) + 1;
    for (const offset of [0, 10, 20]) {
      const coordinate = line.slice(offset, offset + 10).trim();
      assert.notEqual(coordinate, '');
      assert.ok(Number.isFinite(Number(coordinate)), 'coordinates must be finite');
    }
  }
  const order = counts.C
    ? ['C', 'H', ...Object.keys(counts).filter((symbol) => !['C', 'H'].includes(symbol)).sort()]
    : Object.keys(counts).sort();
  const formula = order.filter((symbol) => counts[symbol])
    .map((symbol) => `${symbol}${counts[symbol] > 1 ? counts[symbol] : ''}`).join('');
  const adjacency = Array.from({ length: atomCount }, () => []);
  const edges = new Set();
  const orders = {};
  for (const line of bondLines) {
    const a = Number(line.slice(0, 3));
    const b = Number(line.slice(3, 6));
    const order = Number(line.slice(6, 9));
    for (const endpoint of [a, b]) {
      assert.ok(Number.isInteger(endpoint) && endpoint >= 1 && endpoint <= atomCount);
    }
    assert.notEqual(a, b, 'a bond must connect different atoms');
    assert.ok([1, 2, 3].includes(order), 'bundled bond order must be single, double, or triple');
    const edge = [a, b].sort((left, right) => left - right).join('-');
    assert.ok(!edges.has(edge), 'no duplicate bond records');
    edges.add(edge);
    adjacency[a - 1].push(b - 1);
    adjacency[b - 1].push(a - 1);
    orders[order] = (orders[order] ?? 0) + 1;
  }
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length) {
    for (const neighbor of adjacency[pending.pop()]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  assert.equal(visited.size, atomCount, 'each bundled structure must be one connected molecule');
  assert.equal(lines[4 + atomCount + bondCount], 'M  END');
  assert.equal(lines.filter((line) => line === '$$$$').length, 1, 'one SDF record per file');
  const cidMatch = text.match(/>\s*<PUBCHEM_COMPOUND_CID>\s*\n(\d+)/);
  assert.ok(cidMatch, 'each structure must retain its PubChem identity');
  return { cid: Number(cidMatch[1]), formula, atoms: atomCount, bonds: bondCount, orders };
}

test('catalog retains six reviewed starters and shares the expanded compound collection', () => {
  assert.equal(molecules.length, 20);
  assert.equal(new Set(molecules.map(({ cid }) => cid)).size, molecules.length);
  assert.deepEqual(molecules.slice(0, 6).map(({ id }) => id).sort(), Object.keys(expected).sort());
  for (const molecule of molecules.slice(0, 6)) {
    const baseline = expected[molecule.id];
    assert.equal(molecule.cid, baseline.cid, `${molecule.id} source identity`);
    assert.equal(molecule.structureFile, `/molecules/${molecule.id}.sdf`);
    assert.equal(normalizeQuery(molecule.formula), normalizeQuery(baseline.formula));
    for (const field of ['name', 'formula', 'category', 'description']) {
      assert.equal(typeof molecule[field], 'string');
      assert.ok(molecule[field].trim(), `${molecule.id}.${field} must not be empty`);
    }
    assert.ok(Array.isArray(molecule.aliases));
    for (const alias of molecule.aliases) assert.ok(typeof alias === 'string' && alias.trim());
    for (const property of ['mass', 'geometry', 'polarity', 'bonds', 'melting', 'boiling', 'everyday']) {
      assert.equal(typeof molecule.properties[property], 'string');
      assert.ok(molecule.properties[property].trim(), `${molecule.id}.${property} must not be empty`);
    }
    assert.ok(Math.abs(Number.parseFloat(molecule.properties.mass) - baseline.mass) < 0.01,
      `${molecule.id} molar mass must match its catalog identity`);
  }
  for (const molecule of molecules) {
    assert.ok(molecule.structureForm, `${molecule.id} has a structure for Reaction Lab handoff`);
    assert.ok(molecule.name && molecule.formula && molecule.description);
  }
});

for (const [id, baseline] of Object.entries(expected)) {
  test(`bundled SDF: ${id} identity, formula, coordinates, bonds, and connectivity`, async () => {
    const { mass, ...structureBaseline } = baseline;
    assert.deepEqual(parseSdf(await readSource(`public/molecules/${id}.sdf`)), structureBaseline);
  });
}

test('search normalizes Unicode formula digits, casing, and surrounding whitespace', () => {
  assert.equal(normalizeQuery('  H₂O  '), normalizeQuery('h2o'));
  assert.equal(normalizeQuery(' C₈H₁₀N₄O₂ '), normalizeQuery('c8h10n4o2'));
  assert.deepEqual(findMolecules('  eThAnOl  ').map(({ id }) => id), ['ethanol']);
  assert.deepEqual(findMolecules(' C₈H₁₀N₄O₂ ').map(({ id }) => id), ['caffeine']);
  assert.deepEqual(findMolecules('C2H6O').map(({ id }) => id), ['ethanol', 'dimethyl-ether']);
  assert.deepEqual(findMolecules('NaOH').map(({ id }) => id), ['sodium-hydroxide']);
  assert.deepEqual(findMolecules('naoh'), []);
  assert.deepEqual(findMolecules('Ch3br'), []);
});

test('search finds each molecule by name, ASCII/Unicode formula, and its declared aliases', () => {
  for (const molecule of molecules) {
    for (const query of [molecule.name, molecule.formula, ...molecule.aliases]) {
      const results = findMolecules(query);
      assert.ok(Array.isArray(results), 'search returns a collection, never a silently selected molecule');
      assert.ok(results.some(({ id }) => id === molecule.id), `${query} should include ${molecule.id}`);
      assert.equal(new Set(results.map(({ id }) => id)).size, results.length, 'results must be unique');
    }
  }
});

test('search preserves multiple matches and handles an unknown query without falling back to water', () => {
  assert.deepEqual(findMolecules('not-a-real-starter-molecule'), []);
  const matches = findMolecules('c');
  assert.ok(Array.isArray(matches) && matches.length > 1, 'a broad query should expose multiple matches');
  assert.ok(matches.some(({ id }) => id === 'caffeine'));
  assert.ok(matches.some(({ id }) => id === 'carbon-dioxide'));
});

test('PubChem matches expand search while retaining reviewed featured content', () => {
  const ethanol = moleculeFromPubChem({ cid: 702, name: 'Ethanol', iupacName: 'ethanol', formula: 'C2H6O', molecularWeight: '46.07', structure: 'CCO' });
  const ether = moleculeFromPubChem({ cid: 8254, name: 'Dimethyl Ether', iupacName: 'methoxymethane', formula: 'C2H6O', molecularWeight: '46.07', structure: 'COC' });
  assert.equal(ethanol.id, 'ethanol');
  assert.equal(ethanol.properties.everyday, molecules.find((item) => item.id === 'ethanol').properties.everyday);
  assert.equal(ethanol.structureForm, 'CCO');
  assert.equal(ether.id, 'dimethyl-ether');
  assert.equal(ether.structureForm, 'COC');
  assert.equal(ether.structureFile, '/api/pubchem/structure?cid=8254');
  assert.match(ether.properties.geometry, /not reviewed/i);
});

test('Explorer distinguishes charged structures from ordinary same-formula molecules', () => {
  const charged = moleculeFromPubChem({
    cid: 60130942, name: 'Ethyloxidanium', iupacName: '', formula: 'C2H6O',
    molecularWeight: '46.07', structure: 'C[CH-][OH2+]', hasFormalCharge: true,
  });
  const ionic = moleculeFromPubChem({
    cid: 14798, name: 'Sodium Hydroxide', iupacName: '', formula: 'HNaO',
    molecularWeight: '39.997', structure: '[Na+].[OH-]', multiPart: true, hasFormalCharge: true,
  });
  assert.equal(charged.category, 'Charged PubChem structure');
  assert.equal(ionic.category, 'Ionic compound');
});
