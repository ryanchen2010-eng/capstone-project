import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFile(projectFile(path), 'utf8');

// Test the actual TypeScript data module, without importing browser UI or CSS.
async function importTypeScript(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { molecules, normalizeQuery, findMolecules } = await importTypeScript(
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

test('catalog retains the six starter molecules and complete property/source records', () => {
  assert.deepEqual(molecules.map(({ id }) => id).sort(), Object.keys(expected).sort());
  assert.equal(new Set(molecules.map(({ cid }) => cid)).size, 6);
  for (const molecule of molecules) {
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
});

test('search finds each molecule by name, ASCII/Unicode formula, and its declared aliases', () => {
  for (const molecule of molecules) {
    for (const query of [molecule.name, molecule.formula, expected[molecule.id].formula, ...molecule.aliases]) {
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

const builderSource = await readSource('src/builder.ts');
const builderAst = ts.createSourceFile('builder.ts', builderSource, ts.ScriptTarget.Latest, true);

function declaration(name) {
  for (const statement of builderAst.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const result = statement.declarationList.declarations.find((node) => node.name.getText(builderAst) === name);
    if (result) return result;
  }
  assert.fail(`Builder source is missing ${name}`);
}

async function literalValue(name) {
  const initializer = declaration(name).initializer;
  assert.ok(initializer, `${name} needs an initializer`);
  return (await importTypeScript(`export const value = ${initializer.getText(builderAst)};`)).value;
}

test('Builder source contract: table has all 118 elements and only the 11 supported choices', async () => {
  const [rows, symbols, info] = await Promise.all([
    literalValue('periodicRows'), literalValue('elementSymbols'), literalValue('elementInfo'),
  ]);
  assert.equal(rows.length, 9);
  for (const row of rows) assert.equal(row.length, 18);
  const entries = rows.flat().filter(Boolean);
  assert.equal(entries.length, 118);
  assert.equal(new Set(entries).size, 118);
  assert.equal(symbols.length, 118);
  assert.equal(new Set(symbols).size, 118);
  assert.deepEqual([...entries].sort(), [...symbols].sort());
  assert.equal(symbols[0], 'H');
  assert.equal(symbols[5], 'C');
  assert.equal(symbols[7], 'O');
  assert.equal(symbols[117], 'Og');
  assert.deepEqual(Object.keys(info).sort(), ['H', 'C', 'N', 'O', 'F', 'Si', 'P', 'S', 'Cl', 'Br', 'I'].sort());
  assert.match(builderSource, /button\.disabled\s*=\s*true/, 'unsupported elements are disabled');
});

test('Builder source contract: element choice stays selected after placement and closes the picker', () => {
  assert.equal(declaration('selectedElement').initializer.getText(builderAst), "'C'");
  const selectionFunction = builderAst.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'setSelectedElement',
  );
  assert.ok(selectionFunction);
  const selectionText = selectionFunction.getText(builderAst);
  assert.match(selectionText, /selectedElement\s*=\s*symbol/);
  assert.match(selectionText, /classList\.toggle\('is-selected',\s*selected\)/);
  assert.match(selectionText, /setAttribute\('aria-pressed',\s*String\(selected\)\)/);
  assert.match(builderSource, /setSelectedElement\(symbol as ElementSymbol\);\s*closePeriodicTable\(\)/);
  assert.match(builderSource, /element:\s*selectedElement/, 'new atoms use the current selected element');
  const assignments = [];
  function inspect(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(builderAst) === 'selectedElement') assignments.push(node);
    ts.forEachChild(node, inspect);
  }
  inspect(builderAst);
  assert.equal(assignments.length, 1, 'placement and clear must not reset the element choice');
  assert.ok(assignments[0].pos >= selectionFunction.pos && assignments[0].end <= selectionFunction.end);
});

test('rendering source contract: both viewers use thin 0.1 bonds and the canvas uses 2.25 lines', async () => {
  const mainSource = await readSource('src/main.ts');
  for (const [page, source] of [['Explorer', mainSource], ['Builder', builderSource]]) {
    assert.match(source, /stick:\s*\{[^}]*radius:\s*0\.1\s*[,}]/, `${page} should retain thin 3D bonds`);
  }
  assert.match(await readSource('src/builder.css'), /\.bond-line\s*\{[^}]*stroke-width:\s*2\.25\s*;/);
});
