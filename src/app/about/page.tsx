// Public "what is this" page — reachable logged-out, linked from the login card.
// A server component: static content, no client JS, so it renders instantly and is
// readable by anyone we point at it (curious families, contributors). Content is the
// project manifest, verbatim in intent. Kept deliberately calm, like the app itself.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Celerant — what it is',
  description: 'A small, free, ad-free maths trainer for children. Fluency over correctness; witnessing over rewarding; a child’s own record over any comparison.',
};

const VALUES: [string, string][] = [
  ['Fluency', 'correctness'],
  ['Witnessing', 'rewarding'],
  ["A child’s own record", 'any comparison'],
  ['Demonstrated ability', 'assumed placement'],
  ['Starting too easy', 'starting too hard'],
  ['Measurement that waits', 'measurement that intrudes'],
];

const ASSUMPTIONS: { lead: string; body: string; cite: string }[] = [
  {
    lead: 'Fluency, not accuracy, is the thing that transfers.',
    body: 'A child who can compute 7×8 slowly and effortfully will stall on everything built on top of it. Component skills must become automatic before they can be composed.',
    cite: 'Precision Teaching; Johnson’s Morningside model.',
  },
  {
    lead: 'Fluency exists to free working memory.',
    body: 'A mind spending its capacity on the arithmetic has none left for the problem containing it. This is why speed matters, and it is the only reason it matters.',
    cite: 'Sweller, cognitive load.',
  },
  {
    lead: 'Difficulty is a property of cognitive operations, not of items.',
    body: 'Carrying is a distinct competence from not carrying. Borrowing across a zero is its own skill. The curriculum is a graph of these seams.',
    cite: 'Fischer’s LLTM; Brown & VanLehn’s bug analysis.',
  },
  {
    lead: 'Practice should sit near 80% success.',
    body: 'Below that a child is drowning; above it they are idling.',
    cite: 'Desirable difficulty; Bjork.',
  },
  {
    lead: 'Spacing, interleaving and retrieval work, and feel worse than the things that don’t.',
    body: 'Learners judge their learning by fluency of the moment, which is precisely backwards.',
    cite: '',
  },
  {
    lead: 'Extrinsic reward corrupts the measurement and the motive.',
    body: 'A child paid per correct answer is solving a different problem than the one on the screen.',
    cite: 'Deci, Koestner & Ryan.',
  },
  {
    lead: 'Anxiety consumes the working memory that arithmetic requires.',
    body: 'A tool that makes a child feel measured is working against itself.',
    cite: 'Beilock.',
  },
];

const DO: string[] = [
  'Three tiers. Acquisition (meaning, pictorial, pre-reading) → practice (adaptive, untimed, builds accuracy) → fluency (timed, only once a skill is already accurate).',
  'Never a stopwatch on a skill a child cannot yet do. Speed runs are offered only on mastered skills, framed as a victory lap. A sprint can be done; it cannot be failed.',
  'One equation, one input. No score, no streak, no timer on practice, no confetti.',
  'Miss once, retry. Miss twice, the worked solution appears. The failure path is where teaching is delivered.',
  '“I don’t know yet” is a first-class answer, and costs less than a guess.',
  'Ending early is a button, not a failure.',
  'The child’s map is fogged. They can always see their next step and never their tenth.',
  'The only shared goal is cooperative. A family reaches it together; no individual contribution is ever shown, to anyone.',
];

const BUILT: string[] = [
  'An append-only ledger. Every answer is a fact that is never edited or deleted. All derived state — a child’s estimated ability, their fluency, what unlocks next — is replayed from that ledger. Any of it can be dropped and rebuilt exactly.',
  'A skill graph. ~80 hand-authored skills with prerequisite edges. Problems are generated from templates, not stored, so practice never repeats.',
  'One ability number per child per skill (θ, an Elo/Glicko-style estimate with an uncertainty term). No machine learning. No training data. The model is about eight lines of arithmetic, and at this scale nothing more complex would be honest.',
  'A calibration monitor that continuously compares what the model predicts against what each child actually does, and complains when they diverge.',
];

export default function About() {
  return (
    <main className="about">
      <nav className="about-nav">
        <a className="about-brand" href="/">
          <img src="/logo.png" alt="" width={24} height={24} />
          Celerant
        </a>
        <a className="about-tolink" href="/">Log in →</a>
      </nav>

      <h1>Celerant</h1>
      <p className="tagline">A small, free maths trainer for children. One equation, one input, no rewards.</p>
      <p className="lead">
        Built for the children who fail maths several times a week and stay curious anyway. There is
        already a great deal for the children who find it easy.
      </p>

      <hr />

      <h2>What we value</h2>
      <p>Through building this, and watching real children use it, we have come to value:</p>
      <ul className="value-list">
        {VALUES.map(([l, r]) => (
          <li key={l}>
            <span className="l">{l}</span> <span className="o">over</span> <span className="r">{r}.</span>
          </li>
        ))}
      </ul>
      <p>
        That is, while there is value in the items on the right, we value the items on the left more.
      </p>

      <hr />

      <h2>What we assume</h2>
      <p>
        These are assumptions. They are drawn from published work, they may be wrong, and we are
        measuring them.
      </p>
      <ol className="assume-list">
        {ASSUMPTIONS.map((a) => (
          <li key={a.lead}>
            <strong>{a.lead}</strong> {a.body}
            {a.cite && <span className="cite"> ({a.cite})</span>}
          </li>
        ))}
      </ol>

      <hr />

      <h2>What we do about it</h2>
      <ul className="plain-bullets">
        {DO.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <hr />

      <h2>How it is built</h2>
      <p className="lead">Node, TypeScript, SQLite. Perhaps 5,000 lines. It runs on one small server.</p>
      <ul className="plain-bullets">
        {BUILT.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p>
        No accounts. No email addresses. <strong>The system never learns a child’s name.</strong> A
        family is two icons and a PIN; a child is one icon. There is no analytics, no advertising, no
        notification, and nothing to sell.
      </p>

      <hr />

      <h2>What we are trying to find out</h2>
      <p>
        Whether a fluency-first, anxiety-free, privacy-preserving trainer produces measurable transfer
        — and whether the un-monetisable version of this works at all.
      </p>
      <p>
        Early data from four children is encouraging: on skills held constant, accuracy is rising and
        response times are falling together. That is consistent with real learning. It is not yet proof,
        and we say so.
      </p>
      <p className="lead">We publish our predictions before we test them.</p>

      <hr />

      <h2>What we need</h2>
      <p>
        <strong>More children.</strong> Not for growth — for statistical power. Item difficulty can
        only be learned from many children answering the same problems, and until then every difficulty
        estimate we hold is a hand-authored guess.
      </p>
      <p>
        Everything is open source. If you want to add a skill, port the curriculum to another country’s
        syllabus, or check our arithmetic, that is exactly the contribution we need.
      </p>

      <p style={{ marginTop: '2rem' }}>
        <a className="primary about-cta" href="/">Create a family or log in →</a>
      </p>

      <p className="about-foot">Celerant is Swedish-language, free, and ad-free. It will remain so.</p>
    </main>
  );
}
