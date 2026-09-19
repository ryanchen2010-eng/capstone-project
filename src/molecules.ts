export type Molecule = {
  id: string;
  name: string;
  formula: string;
  category: string;
  description: string;
  structureFile: string;
  cid: number;
  aliases: string[];
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

// Curated properties carried over from the preserved Wix Site 1 Explorer.
// The CID links each entry to its PubChem source and local structure file.
export const molecules: Molecule[] = [
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

/** Treat ordinary digits and displayed chemical subscripts as equivalent. */
export function normalizeQuery(value: string): string {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return value
    .toLowerCase()
    .replace(/[₀-₉]/g, (character) => String(subscripts.indexOf(character)))
    .replace(/[^a-z0-9]/g, '');
}

/** Return every matching entry so the UI can show ambiguous search results. */
export function findMolecules(query: string): Molecule[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [...molecules];

  return molecules.filter((molecule) =>
    [molecule.id, molecule.name, molecule.formula, ...molecule.aliases].some((value) =>
      normalizeQuery(value).includes(normalizedQuery),
    ),
  );
}
