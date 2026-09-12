export type Molecule = {
  id: string;
  name: string;
  formula: string;
  category: string;
  description: string;
  structureFile: string;
  facts: Array<{ label: string; value: string }>;
};

export const molecules: Molecule[] = [
  {
    id: 'water',
    name: 'Water',
    formula: 'H₂O',
    category: 'Everyday essential',
    description:
      'A small, bent molecule whose polarity helps it dissolve many ionic and polar substances.',
    structureFile: '/molecules/water.sdf',
    facts: [
      { label: 'Molar mass', value: '18.015 g/mol' },
      { label: 'Geometry', value: 'Bent' },
      { label: 'Polarity', value: 'Polar' },
      { label: 'Everyday connection', value: 'Drinking water, weather, and cells' },
      { label: 'Structure source', value: 'PubChem CID 962' },
    ],
  },
  {
    id: 'methane',
    name: 'Methane',
    formula: 'CH₄',
    category: 'Fuel molecule',
    description:
      'The simplest hydrocarbon. Its four identical C–H bonds point toward the corners of a tetrahedron.',
    structureFile: '/molecules/methane.sdf',
    facts: [
      { label: 'Molar mass', value: '16.043 g/mol' },
      { label: 'Geometry', value: 'Tetrahedral' },
      { label: 'Polarity', value: 'Nonpolar' },
      { label: 'Everyday connection', value: 'Main component of natural gas' },
      { label: 'Structure source', value: 'PubChem CID 297' },
    ],
  },
  {
    id: 'carbon-dioxide',
    name: 'Carbon dioxide',
    formula: 'CO₂',
    category: 'Atmospheric molecule',
    description:
      'A linear molecule with polar C=O bonds whose symmetry makes the whole molecule nonpolar.',
    structureFile: '/molecules/carbon-dioxide.sdf',
    facts: [
      { label: 'Molar mass', value: '44.009 g/mol' },
      { label: 'Geometry', value: 'Linear' },
      { label: 'Polarity', value: 'Nonpolar overall' },
      { label: 'Everyday connection', value: 'Respiration, carbonation, and climate' },
      { label: 'Structure source', value: 'PubChem CID 280' },
    ],
  },
  {
    id: 'ethanol',
    name: 'Ethanol',
    formula: 'C₂H₆O',
    category: 'Organic molecule',
    description:
      'A two-carbon alcohol with a polar hydroxyl group and a nonpolar carbon chain.',
    structureFile: '/molecules/ethanol.sdf',
    facts: [
      { label: 'Molar mass', value: '46.069 g/mol' },
      { label: 'Functional group', value: 'Alcohol (–OH)' },
      { label: 'Polarity', value: 'Polar' },
      { label: 'Everyday connection', value: 'Sanitizers, solvents, and fuels' },
      { label: 'Structure source', value: 'PubChem CID 702' },
    ],
  },
  {
    id: 'glucose',
    name: 'Glucose',
    formula: 'C₆H₁₂O₆',
    category: 'Biological molecule',
    description:
      'A carbohydrate used by cells as a major source of chemical energy.',
    structureFile: '/molecules/glucose.sdf',
    facts: [
      { label: 'Molar mass', value: '180.156 g/mol' },
      { label: 'Molecule family', value: 'Monosaccharide' },
      { label: 'Polarity', value: 'Polar' },
      { label: 'Everyday connection', value: 'Food, photosynthesis, and respiration' },
      { label: 'Structure source', value: 'PubChem CID 5793' },
    ],
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    formula: 'C₈H₁₀N₄O₂',
    category: 'Familiar stimulant',
    description:
      'A nitrogen-containing organic molecule known for its effects on the central nervous system.',
    structureFile: '/molecules/caffeine.sdf',
    facts: [
      { label: 'Molar mass', value: '194.190 g/mol' },
      { label: 'Molecule family', value: 'Alkaloid' },
      { label: 'Notable atoms', value: 'Carbon, hydrogen, nitrogen, oxygen' },
      { label: 'Everyday connection', value: 'Coffee, tea, and some soft drinks' },
      { label: 'Structure source', value: 'PubChem CID 2519' },
    ],
  },
];
