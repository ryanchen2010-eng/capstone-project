import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/reactant-entry.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { findReactantCandidates, findReactantBySmiles, mergePubChemCandidates } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const reactants = [
  { id: 'ethanol', name: 'Ethanol', formula: 'C2H6O', smiles: 'CCO', aliases: ['ethyl alcohol'] },
  { id: 'dimethyl-ether', name: 'Dimethyl ether', formula: 'C2H6O', smiles: 'COC', aliases: ['methoxymethane'] },
  { id: 'bromomethane', name: 'Bromomethane', formula: 'CH3Br', smiles: 'CBr', aliases: ['methyl bromide'] },
  { id: 'hydroxide', name: 'Hydroxide ion', formula: 'OH⁻', smiles: '[OH-]', aliases: ['OH-', 'HO-'] },
  { id: 'sodium-hydroxide', name: 'Sodium hydroxide', formula: 'NaOH', smiles: '[Na+].[OH-]', aliases: ['NaOH', 'caustic soda'] },
];

test('formula search retains all structural isomers instead of silently choosing one', () => {
  assert.deepEqual(findReactantCandidates(reactants, ' C₂H₆O ').map(({ id }) => id), ['ethanol', 'dimethyl-ether']);
  assert.deepEqual(findReactantCandidates(reactants, 'ethanol').map(({ id }) => id), ['ethanol']);
  assert.deepEqual(findReactantCandidates(reactants, 'ETHYL ALCOHOL').map(({ id }) => id), ['ethanol']);
});

test('chemical formula symbols are case-sensitive, but Unicode digits and charge signs normalize', () => {
  assert.deepEqual(findReactantCandidates(reactants, 'CH₃Br').map(({ id }) => id), ['bromomethane']);
  assert.deepEqual(findReactantCandidates(reactants, 'Ch3br'), []);
  assert.deepEqual(findReactantCandidates(reactants, 'c2h6o'), []);
  assert.deepEqual(findReactantCandidates(reactants, 'OH−').map(({ id }) => id), ['hydroxide']);
  assert.deepEqual(findReactantCandidates(reactants, 'OH-').map(({ id }) => id), ['hydroxide']);
  assert.deepEqual(findReactantCandidates(reactants, 'NaOH').map(({ id }) => id), ['sodium-hydroxide']);
  assert.deepEqual(findReactantCandidates(reactants, 'naoh'), []);
});

test('Builder handoff identifies connectivity, not just the formula', () => {
  assert.equal(findReactantBySmiles(reactants, 'COC')?.id, 'dimethyl-ether');
  assert.equal(findReactantBySmiles(reactants, 'CCO')?.id, 'ethanol');
  assert.equal(findReactantBySmiles(reactants, 'CCC'), undefined);
});

test('PubChem formula results keep separate structures and reuse reviewed identities', () => {
  const matches = [
    { cid: 702, name: 'Ethanol', iupacName: 'ethanol', formula: 'C2H6O', structure: 'CCO' },
    { cid: 8254, name: 'Dimethyl Ether', iupacName: 'methoxymethane', formula: 'C2H6O', structure: 'COC' },
  ];
  assert.deepEqual(mergePubChemCandidates(reactants, 'C₂H₆O', matches).map(({ id }) => id), ['ethanol', 'dimethyl-ether']);
  assert.deepEqual(mergePubChemCandidates(reactants, 'ethyl alcohol', matches).map(({ id }) => id), ['ethanol', 'dimethyl-ether']);
});

test('an unlisted PubChem structure becomes a separate reactant candidate', () => {
  const propene = { cid: 11597, name: 'Propene', iupacName: 'prop-1-ene', formula: 'C3H6', structure: 'C=CC' };
  assert.deepEqual(mergePubChemCandidates(reactants, 'propene', [propene]), [{
    id: 'pubchem-11597', name: 'Propene', formula: 'C3H6', smiles: 'C=CC', aliases: ['prop-1-ene'],
  }]);
});
