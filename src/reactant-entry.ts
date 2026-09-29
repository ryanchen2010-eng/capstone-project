export type Reactant = { id: string; name: string; formula: string; smiles: string; aliases: string[] };
export type PubChemReactantMatch = { cid: number; name: string; iupacName: string; formula: string; structure: string };

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, '');
}

function normalizedFormula(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
}

function isFormulaAlias(value: string): boolean {
  return /[0-9+\-−⁺⁻]/.test(value) || /^(?:[A-Z][a-z]?){2,}$/.test(value);
}

// Names ignore case; chemical symbols in formulas never do. Return every exact
// formula match so isomers cannot be selected silently.
export function findReactantCandidates(reactants: Reactant[], query: string): Reactant[] {
  if (!query.trim()) return [];
  const name = normalizedName(query);
  const formula = normalizedFormula(query);
  return reactants.filter((reactant) =>
    normalizedName(reactant.name) === name
    || normalizedFormula(reactant.formula) === formula
    || reactant.aliases.some((alias) => isFormulaAlias(alias)
      ? normalizedFormula(alias) === formula
      : normalizedName(alias) === name),
  );
}

export function findReactantBySmiles(reactants: Reactant[], smiles: string): Reactant | undefined {
  return reactants.find((reactant) => reactant.smiles === smiles);
}

/** Merge a submitted PubChem lookup with reviewed reactants, keyed by structure. */
export function mergePubChemCandidates(reactants: Reactant[], query: string, matches: PubChemReactantMatch[]): Reactant[] {
  const candidates = findReactantCandidates(reactants, query);
  const seen = new Set(candidates.map((reactant) => reactant.smiles));
  for (const match of matches) {
    if (!Number.isSafeInteger(match.cid) || match.cid <= 0 || !match.structure || match.structure.length > 1024
        || !match.formula || match.formula.length > 40 || !match.name || match.name.length > 200) continue;
    const reviewed = findReactantBySmiles(reactants, match.structure);
    const candidate = reviewed ?? {
      id: `pubchem-${match.cid}`,
      name: match.name,
      formula: match.formula,
      smiles: match.structure,
      aliases: match.iupacName ? [match.iupacName] : [],
    };
    if (!seen.has(candidate.smiles)) {
      candidates.push(candidate);
      seen.add(candidate.smiles);
    }
  }
  return candidates;
}
