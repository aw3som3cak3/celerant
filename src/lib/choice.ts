// Pure types for the recognition (choice) item format — shared by the item generators
// (skills.ts) and the render surface (ChoiceStage). No React, no server-only, so a pure
// skill generator and a client component can both import them. A recognition rung carries
// one of these on Item.choice; its `answer` (an int for a numeral/group pick, or the word
// 'combine'/'separate' for structure) is graded by the same shared grade().

export type ChoicePromptData =
  | { show: 'group'; kind: string; a: number } // one bunch — "how many?"
  | { show: 'sum'; kind: string; a: number; b: number } // a + b — "how many together?"
  | { show: 'structure'; kind: string; a: number; b: number; structure: 'combine' | 'separate' } // arrive / leave
  | { show: 'listen'; code: string; word: string } // a spelling AUDIO prompt — play spellingAudio(code, word); nothing shown
  | { show: 'word'; word: string } // a PRINTED word shown (English print bridge, Phase D) — read it, then pick the picture
  // A PRINTED SENTENCE shown (English sentence-mode, the interference slice). `text` is read by the
  // child; a `___` in it marks a CLOZE blank (rendered as a gap). `lang` says which tongue the
  // sentence is in — 'sv' when the Swedish sentence carries the MEANING and the options are the
  // candidate English renderings (the L1-pull discrimination), 'en' for an English cloze.
  | { show: 'sentence'; text: string; lang: 'sv' | 'en' };

export type ChoiceOption =
  | { value: number; render: 'numeral' } // tap the digit
  | { value: number; render: 'group'; kind: string } // tap the picture-group of `value`
  | { value: 'combine' | 'separate'; render: 'more' | 'fewer'; label: string } // Fler / Färre (label shown, value graded)
  | { value: string; render: 'picture'; kind: string } // tap the emoji whose Swedish name starts with the target sound (T0)
  | { value: string; render: 'letter' } // tap the letter — value IS the glyph, graded as a word (T1)
  | { value: string; render: 'swatch'; color: string } // tap the COLOUR — value is the colour word (graded), color is the CSS fill (English on-ramp Phase B)
  | { value: string; render: 'picto'; kind: string } // tap the ARASAAC pictogram /pictos/<kind>.png — for verbs/attributes the emoji photo-set lacks (English Phase B/C)
  | { value: string; render: 'sizednoun'; kind: string; big: boolean } // two-word recombination: the noun emoji shown BIG or small ("big cat") — English Phase B
  | { value: string; render: 'nounverb'; noun: string; verb: string } // SVO frame: agent emoji + action picto ("the dog is running") — English Phase C
  | { value: string; render: 'word' }; // tap the printed WORD — value IS the word string, graded (English print bridge, Phase D)

// Carried on Item.choice for a recognition rung. `question` and any option `label`s are
// display strings held here (Swedish, like the maths `steps`) — the render layer shows
// them verbatim, so no i18n plumbing reaches the pure generator.
export type ChoiceSpec = { prompt: ChoicePromptData; question: string; options: ChoiceOption[] };
