// Pure types for the recognition (choice) item format — shared by the item generators
// (skills.ts) and the render surface (ChoiceStage). No React, no server-only, so a pure
// skill generator and a client component can both import them. A recognition rung carries
// one of these on Item.choice; its `answer` (an int for a numeral/group pick, or the word
// 'combine'/'separate' for structure) is graded by the same shared grade().

export type ChoicePromptData =
  | { show: 'group'; kind: string; a: number } // one bunch — "how many?"
  | { show: 'sum'; kind: string; a: number; b: number } // a + b — "how many together?"
  | { show: 'structure'; kind: string; a: number; b: number; structure: 'combine' | 'separate' }; // arrive / leave

export type ChoiceOption =
  | { value: number; render: 'numeral' } // tap the digit
  | { value: number; render: 'group'; kind: string } // tap the picture-group of `value`
  | { value: 'combine' | 'separate'; render: 'more' | 'fewer'; label: string }; // Fler / Färre (label shown, value graded)

// Carried on Item.choice for a recognition rung. `question` and any option `label`s are
// display strings held here (Swedish, like the maths `steps`) — the render layer shows
// them verbatim, so no i18n plumbing reaches the pure generator.
export type ChoiceSpec = { prompt: ChoicePromptData; question: string; options: ChoiceOption[] };
