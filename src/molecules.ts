import sharedCatalog from './shared-molecules.json';

export type Molecule = {
  id: string;
  name: string;
  formula: string;
  category: string;
  description: string;
  structureFile: string;
  cid: number;
  aliases: string[];
  structureForm?: string;
  origin?: 'pubchem';
  properties: {
    mass: string;
    geometry: string;
    polarity: string;
    bonds: string;
    melting: string;
    boiling: string;
    everyday: string;
  };
};

export type PubChemMatch = {
  cid: number;
  name: string;
  iupacName: string;
  formula: string;
  molecularWeight: string;
  structure: string;
  multiPart?: boolean;
  hasFormalCharge?: boolean;
};

// The original six retain reviewed teaching notes and bundled 3D files.
// Their identity fields are overridden by sharedCatalog below, which is also
// used by Reaction Lab's chemistry service.
const reviewedMolecules: Molecule[] = [
  {
    id: 'water',
    name: 'Water',
    formula: 'H₂O',
    category: 'Everyday essential',
    description:
      'A small, bent molecule whose polarity helps it dissolve many ionic and polar substances.',
    structureFile: '/molecules/water.sdf',
    cid: 962,
    aliases: ['water', 'h2o'],
    properties: {
      mass: '18.015 g/mol',
      geometry: 'Bent',
      polarity: 'Polar',
      bonds: 'Polar covalent O–H bonds',
      melting: '0 °C',
      boiling: '100 °C at 1 atm',
      everyday: 'Used every day for drinking, cooking, cleaning, and supporting life.',
    },
  },
  {
    id: 'methane',
    name: 'Methane',
    formula: 'CH₄',
    category: 'Fuel molecule',
    description:
      'The simplest hydrocarbon. Its four identical C–H bonds point toward the corners of a tetrahedron.',
    structureFile: '/molecules/methane.sdf',
    cid: 297,
    aliases: ['methane', 'ch4', 'natural gas'],
    properties: {
      mass: '16.043 g/mol',
      geometry: 'Tetrahedral',
      polarity: 'Nonpolar',
      bonds: 'Covalent C–H single bonds',
      melting: '−182.6 °C',
      boiling: '−161.5 °C at 1 atm',
      everyday:
        'The main component of natural gas used for heating, cooking, and electricity generation.',
    },
  },
  {
    id: 'carbon-dioxide',
    name: 'Carbon dioxide',
    formula: 'CO₂',
    category: 'Atmospheric molecule',
    description:
      'A linear molecule with polar C=O bonds whose symmetry makes the whole molecule nonpolar.',
    structureFile: '/molecules/carbon-dioxide.sdf',
    cid: 280,
    aliases: ['carbon dioxide', 'co2'],
    properties: {
      mass: '44.01 g/mol',
      geometry: 'Linear',
      polarity: 'Nonpolar overall',
      bonds: 'Two polar covalent C=O double bonds',
      melting: '−56.6 °C at 5.18 bar',
      boiling: 'Sublimes at −78.5 °C at 1 atm',
      everyday:
        'Found in exhaled breath, carbonated drinks, fire extinguishers, and dry ice.',
    },
  },
  {
    id: 'ethanol',
    name: 'Ethanol',
    formula: 'C₂H₆O',
    category: 'Organic molecule',
    description:
      'A two-carbon alcohol with a polar hydroxyl group and a nonpolar carbon chain.',
    structureFile: '/molecules/ethanol.sdf',
    cid: 702,
    aliases: ['ethanol', 'c2h6o', 'alcohol'],
    properties: {
      mass: '46.07 g/mol',
      geometry: 'Tetrahedral at carbon; bent at oxygen',
      polarity: 'Polar',
      bonds: 'Covalent C–C, C–H, C–O, and O–H bonds',
      melting: '−114.1 °C',
      boiling: '78.4 °C at 1 atm',
      everyday: 'Present in hand sanitizers, solvents, fuels, and alcoholic beverages.',
    },
  },
  {
    id: 'glucose',
    name: 'Glucose',
    formula: 'C₆H₁₂O₆',
    category: 'Biological molecule',
    description:
      'A carbohydrate used by cells as a major source of chemical energy.',
    structureFile: '/molecules/glucose.sdf',
    cid: 5793,
    aliases: ['glucose', 'c6h12o6', 'sugar'],
    properties: {
      mass: '180.16 g/mol',
      geometry: 'Tetrahedral carbon centers; bent oxygen centers in the cyclic form',
      polarity: 'Polar',
      bonds: 'Covalent C–C, C–H, C–O, and O–H bonds',
      melting: '146 °C (decomposes)',
      boiling: 'No normal boiling point; decomposes',
      everyday: 'A sugar in foods and blood that cells use as a major energy source.',
    },
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    formula: 'C₈H₁₀N₄O₂',
    category: 'Familiar stimulant',
    description:
      'A nitrogen-containing organic molecule known for its effects on the central nervous system.',
    structureFile: '/molecules/caffeine.sdf',
    cid: 2519,
    aliases: ['caffeine', 'c8h10n4o2', 'coffee', 'tea'],
    properties: {
      mass: '194.19 g/mol',
      geometry: 'Mostly planar fused-ring structure',
      polarity: 'Polar',
      bonds: 'Covalent C–C, C–N, C=O, and C–H bonds',
      melting: '235–238 °C',
      boiling: 'No normal boiling point listed; can sublime',
      everyday: 'A stimulant in coffee, tea, energy drinks, chocolate, and some medicines.',
    },
  },
];

const reviewedById = new Map(reviewedMolecules.map((molecule) => [molecule.id, molecule]));
const additionalMasses: Record<string, string> = {
  oxygen: '31.998 g/mol', ammonia: '17.031 g/mol', 'hydrogen-peroxide': '34.014 g/mol',
  methanol: '32.042 g/mol', ethane: '30.070 g/mol', propene: '42.081 g/mol',
  acetone: '58.080 g/mol', 'ethanoic-acid': '60.052 g/mol',
  '2-propanol': '60.096 g/mol', 'ethyl-ethanoate': '88.106 g/mol',
  'dimethyl-ether': '46.069 g/mol', bromomethane: '94.939 g/mol',
  'sodium-chloride': '58.443 g/mol', 'sodium-hydroxide': '39.997 g/mol',
};

export const molecules: Molecule[] = sharedCatalog.map((identity) => {
  const reviewed = reviewedById.get(identity.id);
  return {
    id: identity.id,
    name: identity.name,
    formula: identity.formula,
    category: identity.category,
    description: identity.description,
    cid: identity.cid,
    aliases: identity.aliases,
    structureForm: identity.smiles,
    structureFile: reviewed?.structureFile ?? `/api/pubchem/structure?cid=${identity.cid}`,
    origin: reviewed ? undefined : 'pubchem',
    properties: reviewed?.properties ?? {
      mass: additionalMasses[identity.id] ?? 'Not reviewed',
      geometry: identity.category === 'Ionic compound' ? 'Ionic lattice; no single-molecule geometry' : 'See 3D structure; explanation not reviewed',
      polarity: identity.category === 'Ionic compound' ? 'Ionic' : 'Not reviewed',
      bonds: identity.category === 'Ionic compound' ? 'Ionic interactions; see 2D ion depiction' : 'See the structure; explanation not reviewed',
      melting: 'Not reviewed',
      boiling: 'Not reviewed',
      everyday: identity.description,
    },
  };
});

/** Treat ordinary digits and displayed chemical subscripts as equivalent. */
export function normalizeQuery(value: string): string {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return value
    .toLowerCase()
    .replace(/[₀-₉]/g, (character) => String(subscripts.indexOf(character)))
    .replace(/[^a-z0-9]/g, '');
}

function plainFormula(value: string): string {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return value.trim().replace(/[₀-₉]/g, (character) => String(subscripts.indexOf(character))).replace(/\s+/g, '');
}

function isFormula(value: string): boolean {
  const plain = plainFormula(value);
  return /^(?:[A-Z][a-z]?\d*)+$/.test(plain) && (/\d/.test(plain) || (plain.match(/[A-Z]/g)?.length ?? 0) > 1);
}

/** Return every matching entry so the UI can show ambiguous search results. */
export function findMolecules(query: string): Molecule[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [...molecules];
  const queryFormula = isFormula(query) ? plainFormula(query) : null;
  const nameValues = (molecule: Molecule) => [molecule.id, molecule.name, ...molecule.aliases.filter((alias) => !isFormula(alias))];
  const formulaValues = (molecule: Molecule) => [molecule.formula, ...molecule.aliases.filter(isFormula)].map(plainFormula);
  const exact = molecules.filter((molecule) =>
    nameValues(molecule).some((value) => normalizeQuery(value) === normalizedQuery)
    || (queryFormula !== null && formulaValues(molecule).includes(queryFormula)));
  if (exact.length) return exact;
  return molecules.filter((molecule) =>
    nameValues(molecule).some((value) => normalizeQuery(value).includes(normalizedQuery))
    || (queryFormula !== null && formulaValues(molecule).some((value) => value.includes(queryFormula))));
}

/** Preserve curated teaching notes when a PubChem hit is one of our examples. */
export function moleculeFromPubChem(record: PubChemMatch): Molecule {
  const featured = molecules.find((molecule) => molecule.cid === record.cid);
  if (featured) return { ...featured, structureForm: record.structure };
  return {
    id: `pubchem-${record.cid}`,
    name: record.name,
    formula: record.formula,
    category: record.multiPart ? 'Multi-part PubChem record'
      : record.hasFormalCharge ? 'Charged PubChem structure' : 'PubChem structure',
    description: 'This compound was found by name or formula in PubChem. A 3D view is shown only when coordinates are available; otherwise you will see its 2D depiction. Its everyday-life explanation has not been curated for this project yet.',
    structureFile: `/api/pubchem/structure?cid=${record.cid}`,
    cid: record.cid,
    aliases: record.iupacName ? [record.iupacName] : [],
    structureForm: record.structure,
    origin: 'pubchem',
    properties: {
      mass: record.molecularWeight ? `${record.molecularWeight} g/mol` : 'Not available',
      geometry: 'Not reviewed',
      polarity: 'Not reviewed',
      bonds: 'See the structure; explanation not reviewed',
      melting: 'Not reviewed',
      boiling: 'Not reviewed',
      everyday: 'No curated everyday-life note yet.',
    },
  };
}
