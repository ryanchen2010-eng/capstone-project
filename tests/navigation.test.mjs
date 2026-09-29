import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the production build includes Home and all three chemistry tools', async () => {
  const config = await read('vite.config.ts');
  for (const [name, file] of [
    ['home', 'index.html'],
    ['explorer', 'explore.html'],
    ['builder', 'builder.html'],
    ['reactionLab', 'reaction-lab.html'],
  ]) {
    assert.ok(config.includes(`${name}: resolve(__dirname, '${file}'),`), `${file} must be a build entry`);
    assert.match(await read(file), /<title>.+<\/title>/);
  }
});

test('the Home page links to each tool and explains the teaching limits', async () => {
  const home = await read('index.html');
  assert.match(home, /<h1 id="home-title">/);
  for (const target of ['/explore.html', '/builder.html', '/reaction-lab.html']) {
    assert.ok(home.includes(`href="${target}"`), `${target} must be reachable from Home`);
  }
  assert.match(home, /No match does not mean no reaction/);
  assert.doesNotMatch(home, /3Dmol-min\.js/, 'Home should not load the 3D viewer unnecessarily');
});

test('every tool links back to Home and to the other tools', async () => {
  for (const file of ['src/main.ts', 'src/builder.ts', 'src/reaction-lab.ts']) {
    const source = await read(file);
    for (const target of ['/', '/explore.html', '/builder.html', '/reaction-lab.html']) {
      assert.ok(source.includes(`href="${target}"`), `${file} must link to ${target}`);
    }
  }
});

test('Reaction Lab offers a concise guide to every supported reaction type', async () => {
  const lab = await read('src/reaction-lab.ts');
  assert.match(lab, /<details class="reaction-guide">/);
  for (const type of ['Hydrogenation', 'Bromination', 'Hydration', 'E1', 'E2', 'SN1', 'SN2', 'Alcohol oxidation', 'Carbonyl hydrogenation', 'Esterification', 'Ester hydrolysis']) {
    assert.ok(lab.includes(`${type}:`), `${type} must appear in the guide`);
  }
});
