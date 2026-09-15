# Molecule Playground

A small 3Dmol.js-powered starter app for exploring common molecules in 3D.

## Included molecules

- Water
- Methane
- Carbon dioxide
- Ethanol
- Glucose
- Caffeine

The bundled SDF structures are sourced from PubChem's PUG REST service using
the compound identifiers documented in `src/molecules.ts` and the download
script below.

## Run locally

```bash
pnpm install
pnpm dev
```

Then open `http://127.0.0.1:5173/` in a browser. Do not open `index.html`
directly from Finder: 3Dmol.js and the bundled molecule files must be served over
HTTP for browser module loading to work.

## Refresh molecule structures

```bash
mkdir -p public/molecules
curl -L --fail -o public/molecules/water.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/962/SDF?record_type=3d'
curl -L --fail -o public/molecules/methane.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/297/SDF?record_type=3d'
curl -L --fail -o public/molecules/carbon-dioxide.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/280/SDF?record_type=3d'
curl -L --fail -o public/molecules/ethanol.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/702/SDF?record_type=3d'
curl -L --fail -o public/molecules/glucose.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5793/SDF?record_type=3d'
curl -L --fail -o public/molecules/caffeine.sdf 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/SDF?record_type=3d'
```

3Dmol.js is loaded from its hosted browser script and integrated through its
`createViewer` API. The same viewer can be embedded in Wix using an HTML
embed and a public GitHub/jsDelivr SDF URL.

## Public jsDelivr molecule URLs

- [Water](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/water.sdf)
- [Methane](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/methane.sdf)
- [Carbon dioxide](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/carbon-dioxide.sdf)
- [Ethanol](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/ethanol.sdf)
- [Glucose](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/glucose.sdf)
- [Caffeine](https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/caffeine.sdf)

Use one of those URLs in a Wix HTML embed. This starter snippet loads water:

```html
<script src="https://3dmol.org/build/3Dmol-min.js"></script>
<div id="molecule-viewer" style="height:420px; width:100%;"></div>
<script>
  const viewer = $3Dmol.createViewer("molecule-viewer", { backgroundColor: "#f5f3ee" });
  fetch("https://cdn.jsdelivr.net/gh/ryanchen2010-eng/capstone-project@main/public/molecules/water.sdf")
    .then((response) => response.text())
    .then((sdf) => {
      viewer.addModel(sdf, "sdf");
      viewer.setStyle({}, { stick: { colorscheme: "Jmol" }, sphere: { scale: 0.25 } });
      viewer.zoomTo();
      viewer.render();
    });
</script>
```
