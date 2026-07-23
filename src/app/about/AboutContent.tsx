'use client';

import { useI18n } from '../_components/LocaleProvider';
import { LOCALES, type Locale } from '@/lib/i18n';

// The /about content, in both languages. The Swedish is a TRANSCREATION, not a
// translation — written natively so the values and citations read like Swedish,
// not like English wearing a coat. Client component so it follows the locale
// toggle; the page shell (metadata) stays a server component.

type Content = {
  connector: string; // between the value pairs ("over" / "framför")
  tagline: string;
  lead: string;
  h: { value: string; assume: string; do: string; built: string; find: string; need: string };
  valueIntro: string;
  values: [string, string][];
  valueClose: string;
  assumeIntro: string;
  assumptions: { lead: string; body: string; cite: string }[];
  do: string[];
  builtIntro: string;
  built: string[];
  privacy: React.ReactNode;
  find: React.ReactNode[];
  need: React.ReactNode[];
  cta: string;
  login: string;
  footer: string;
};

const EN: Content = {
  connector: 'over',
  tagline: 'A small, free maths trainer for children. One equation, one input, no rewards.',
  lead: 'Built for the children who fail maths several times a week and stay curious anyway. There is already a great deal for the children who find it easy.',
  h: { value: 'What we value', assume: 'What we assume', do: 'What we do about it', built: 'How it is built', find: 'What we are trying to find out', need: 'What we need' },
  valueIntro: 'Through building this, and watching real children use it, we have come to value:',
  values: [
    ['Fluency', 'correctness'],
    ['Witnessing', 'rewarding'],
    ['A child’s own record', 'any comparison'],
    ['Demonstrated ability', 'assumed placement'],
    ['Starting too easy', 'starting too hard'],
    ['Measurement that waits', 'measurement that intrudes'],
  ],
  valueClose: 'That is, while there is value in the items on the right, we value the items on the left more.',
  assumeIntro: 'These are assumptions. They are drawn from published work, they may be wrong, and we are measuring them.',
  assumptions: [
    { lead: 'Fluency, not accuracy, is the thing that transfers.', body: 'A child who can compute 7×8 slowly and effortfully will stall on everything built on top of it. Component skills must become automatic before they can be composed.', cite: 'Precision Teaching; Johnson’s Morningside model.' },
    { lead: 'Fluency exists to free working memory.', body: 'A mind spending its capacity on the arithmetic has none left for the problem containing it. This is why speed matters, and it is the only reason it matters.', cite: 'Sweller, cognitive load.' },
    { lead: 'Difficulty is a property of cognitive operations, not of items.', body: 'Carrying is a distinct competence from not carrying. Borrowing across a zero is its own skill. The curriculum is a graph of these seams.', cite: 'Fischer’s LLTM; Brown & VanLehn’s bug analysis.' },
    { lead: 'Practice should sit near 80% success.', body: 'Below that a child is drowning; above it they are idling.', cite: 'Desirable difficulty; Bjork.' },
    { lead: 'Spacing, interleaving and retrieval work, and feel worse than the things that don’t.', body: 'Learners judge their learning by fluency of the moment, which is precisely backwards.', cite: '' },
    { lead: 'Extrinsic reward corrupts the measurement and the motive.', body: 'A child paid per correct answer is solving a different problem than the one on the screen.', cite: 'Deci, Koestner & Ryan.' },
    { lead: 'Anxiety consumes the working memory that arithmetic requires.', body: 'A tool that makes a child feel measured is working against itself.', cite: 'Beilock.' },
  ],
  do: [
    'Three tiers. Acquisition (meaning, pictorial, pre-reading) → practice (adaptive, untimed, builds accuracy) → fluency (timed, only once a skill is already accurate).',
    'Never a stopwatch on a skill a child cannot yet do. Speed runs are offered only on mastered skills, framed as a victory lap. A sprint can be done; it cannot be failed.',
    'One equation, one input. No score, no streak, no timer on practice, no confetti.',
    'Miss once, retry. Miss twice, the worked solution appears. The failure path is where teaching is delivered.',
    '“I don’t know yet” is a first-class answer, and costs less than a guess.',
    'Ending early is a button, not a failure.',
    'The child’s map is fogged. They can always see their next step and never their tenth.',
    'The only shared goal is cooperative. A family reaches it together; no individual contribution is ever shown, to anyone.',
  ],
  builtIntro: 'Node, TypeScript, SQLite. Perhaps 5,000 lines. It runs on one small server.',
  built: [
    'An append-only ledger. Every answer is a fact that is never edited or deleted. All derived state — a child’s estimated ability, their fluency, what unlocks next — is replayed from that ledger. Any of it can be dropped and rebuilt exactly.',
    'A skill graph. ~80 hand-authored skills with prerequisite edges. Problems are generated from templates, not stored, so practice never repeats.',
    'One ability number per child per skill (θ, an Elo/Glicko-style estimate with an uncertainty term). No machine learning. No training data. The model is about eight lines of arithmetic, and at this scale nothing more complex would be honest.',
    'A calibration monitor that continuously compares what the model predicts against what each child actually does, and complains when they diverge.',
  ],
  privacy: (
    <>No accounts. No email addresses. <strong>The system never learns a child’s name.</strong> A family is two icons and a PIN; a child is one icon. There is no analytics, no advertising, no notification, and nothing to sell.</>
  ),
  find: [
    'Whether a fluency-first, anxiety-free, privacy-preserving trainer produces measurable transfer — and whether the un-monetisable version of this works at all.',
    'Early data from four children is encouraging: on skills held constant, accuracy is rising and response times are falling together. That is consistent with real learning. It is not yet proof, and we say so.',
    <span className="lead" key="pub">We publish our predictions before we test them.</span>,
  ],
  need: [
    <><strong>More children.</strong> Not for growth — for statistical power. Item difficulty can only be learned from many children answering the same problems, and until then every difficulty estimate we hold is a hand-authored guess.</>,
    'Everything is open source. If you want to add a skill, port the curriculum to another country’s syllabus, or check our arithmetic, that is exactly the contribution we need.',
  ],
  cta: 'Create a family or log in →',
  login: 'Log in →',
  footer: 'Celerant is Swedish-language, free, and ad-free. It will remain so.',
};

const SV: Content = {
  connector: 'framför',
  tagline: 'En liten, gratis mattetränare för barn. En uppgift i taget, ett svarsfält, inga belöningar.',
  lead: 'Gjord för barnen som misslyckas med matten flera gånger i veckan och ändå förblir nyfikna. Det finns redan gott om verktyg för barnen som tycker att det är lätt.',
  h: { value: 'Vad vi värderar', assume: 'Vad vi antar', do: 'Vad vi gör åt det', built: 'Hur det är byggt', find: 'Vad vi vill ta reda på', need: 'Vad vi behöver' },
  valueIntro: 'Genom att bygga det här, och se riktiga barn använda det, har vi kommit att värdera:',
  values: [
    ['Flyt', 'rätt svar'],
    ['Att bevittna', 'att belöna'],
    ['Barnets egen historik', 'all jämförelse'],
    ['Visad förmåga', 'antagen nivå'],
    ['Att börja för lätt', 'att börja för svårt'],
    ['Mätning som väntar', 'mätning som tränger sig på'],
  ],
  valueClose: 'Det vill säga: även om det finns värde i det som står till höger, värderar vi det till vänster högre.',
  assumeIntro: 'Det här är antaganden. De vilar på publicerad forskning, de kan vara fel, och vi mäter dem.',
  assumptions: [
    { lead: 'Det är flytet, inte träffsäkerheten, som överförs.', body: 'Ett barn som kan räkna ut 7×8 långsamt och mödosamt kör fast på allt som byggs ovanpå. Delfärdigheter måste bli automatiska innan de kan sättas samman.', cite: 'Precision Teaching; Johnsons Morningside-modell.' },
    { lead: 'Flyt finns för att frigöra arbetsminnet.', body: 'Ett sinne som lägger sin kapacitet på själva räknandet har inget kvar till problemet det ingår i. Det är därför farten spelar roll — och det enda skälet till att den gör det.', cite: 'Sweller, kognitiv belastning.' },
    { lead: 'Svårighet är en egenskap hos tankeoperationer, inte hos uppgifter.', body: 'Att räkna med minnessiffra är en annan färdighet än att räkna utan. Att växla över en nolla är sin egen färdighet. Läroplanen är en graf av sådana sömmar.', cite: 'Fischers LLTM; Brown & VanLehns felanalys.' },
    { lead: 'Övning bör ligga nära 80 % rätt.', body: 'Under det drunknar barnet; över det går det på tomgång.', cite: 'Önskvärd svårighet; Bjork.' },
    { lead: 'Spridd övning, varvning och att plocka fram ur minnet fungerar — och känns sämre än det som inte fungerar.', body: 'Den som lär sig bedömer sitt lärande efter stundens lätthet, vilket är precis bakvänt.', cite: '' },
    { lead: 'Yttre belöning fördärvar både mätningen och drivkraften.', body: 'Ett barn som får betalt per rätt svar löser ett annat problem än det på skärmen.', cite: 'Deci, Koestner & Ryan.' },
    { lead: 'Oro tär på det arbetsminne som räknandet kräver.', body: 'Ett verktyg som får ett barn att känna sig bedömt motarbetar sig självt.', cite: 'Beilock.' },
  ],
  do: [
    'Tre steg. Förståelse (mening, bilder, före läskunnighet) → övning (anpassad, utan tid, bygger säkerhet) → flyt (på tid, först när en färdighet redan sitter).',
    'Aldrig ett tidtagarur på något ett barn ännu inte kan. Fartrundor erbjuds bara på färdigheter som redan sitter, som ett ärevarv. En sprint kan göras — den kan inte misslyckas.',
    'En uppgift, ett svarsfält. Ingen poäng, ingen svit, ingen tid på övningen, inget konfetti.',
    'Fel en gång, försök igen. Fel två gånger, då visas lösningen steg för steg. Det är i felet undervisningen sker.',
    '”Jag vet inte än” är ett fullgott svar, och kostar mindre än en gissning.',
    'Att sluta tidigt är en knapp, inte ett misslyckande.',
    'Barnets karta är höljd i dimma. Man ser alltid sitt nästa steg, aldrig sitt tionde.',
    'Det enda gemensamma målet bygger på samarbete. En familj når det tillsammans; ingen enskild insats visas någonsin, för någon.',
  ],
  builtIntro: 'Node, TypeScript, SQLite. Kanske 5 000 rader kod. Det kör på en liten server.',
  built: [
    'En liggare som bara växer. Varje svar är ett faktum som aldrig ändras eller raderas. All härledd kunskap — barnets uppskattade förmåga, dess flyt, vad som låses upp härnäst — spelas upp på nytt ur liggaren. Vad som helst av det kan slängas och byggas om exakt likadant.',
    'En färdighetsgraf. Ett åttiotal handskrivna färdigheter med förkunskapskanter. Uppgifter genereras ur mallar, de lagras inte, så övningen upprepas aldrig.',
    'Ett förmågetal per barn och färdighet (θ, en Elo/Glicko-liknande skattning med ett osäkerhetsmått). Ingen maskininlärning. Ingen träningsdata. Modellen är ungefär åtta rader aritmetik, och i den här skalan vore något mer avancerat inte ärligt.',
    'En kalibreringsvakt som löpande jämför vad modellen förutsäger med vad varje barn faktiskt gör, och som klagar när de glider isär.',
  ],
  privacy: (
    <>Inga konton. Inga e-postadresser. <strong>Systemet får aldrig veta ett barns namn.</strong> En familj är två ikoner och en PIN; ett barn är en ikon. Ingen analys, ingen reklam, inga notiser, och inget att sälja.</>
  ),
  find: [
    'Om en tränare som sätter flytet först, är ångestfri och värnar integriteten kan ge mätbar överföring — och om den icke-kommersiella versionen av det här överhuvudtaget fungerar.',
    'Tidiga data från fyra barn är uppmuntrande: på färdigheter vi håller konstanta stiger träffsäkerheten samtidigt som svarstiderna sjunker. Det är förenligt med verkligt lärande. Det är ännu inget bevis, och det säger vi.',
    <span className="lead" key="pub">Vi publicerar våra förutsägelser innan vi prövar dem.</span>,
  ],
  need: [
    <><strong>Fler barn.</strong> Inte för tillväxt — för statistisk styrka. En uppgifts svårighet kan bara läras från många barn som svarar på samma problem, och tills dess är varje svårighetsskattning vi har en handgjord gissning.</>,
    'Allt är öppen källkod. Vill du lägga till en färdighet, anpassa läroplanen till ett annat lands kursplan, eller granska vår aritmetik — det är precis det bidrag vi behöver.',
  ],
  cta: 'Skapa en familj eller logga in →',
  login: 'Logga in →',
  footer: 'Celerant är svenskspråkigt, gratis och reklamfritt. Så kommer det att förbli.',
};

export function AboutContent() {
  const { locale, setLocale } = useI18n();
  const c = locale === 'sv' ? SV : EN;

  return (
    <main className="about">
      <nav className="about-nav">
        <a className="about-brand" href="/">
          <img src="/logo.png" alt="" width={24} height={24} />
          Celerant
        </a>
        <div className="about-nav-right">
          <div role="group" aria-label="language">
            {LOCALES.map((l: Locale) => (
              <button key={l} className={`lang-btn ${locale === l ? 'on' : ''}`} onClick={() => setLocale(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <a className="about-tolink" href="/">{c.login}</a>
        </div>
      </nav>

      <h1>Celerant</h1>
      <p className="tagline">{c.tagline}</p>
      <p className="lead">{c.lead}</p>

      <hr />

      <h2>{c.h.value}</h2>
      <p>{c.valueIntro}</p>
      <ul className="value-list">
        {c.values.map(([l, r]) => (
          <li key={l}>
            <span className="l">{l}</span> <span className="o">{c.connector}</span> <span className="r">{r}.</span>
          </li>
        ))}
      </ul>
      <p>{c.valueClose}</p>

      <hr />

      <h2>{c.h.assume}</h2>
      <p>{c.assumeIntro}</p>
      <ol className="assume-list">
        {c.assumptions.map((a) => (
          <li key={a.lead}>
            <strong>{a.lead}</strong> {a.body}
            {a.cite && <span className="cite"> ({a.cite})</span>}
          </li>
        ))}
      </ol>

      <hr />

      <h2>{c.h.do}</h2>
      <ul className="plain-bullets">
        {c.do.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <hr />

      <h2>{c.h.built}</h2>
      <p className="lead">{c.builtIntro}</p>
      <ul className="plain-bullets">
        {c.built.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p>{c.privacy}</p>

      <hr />

      <h2>{c.h.find}</h2>
      {c.find.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <hr />

      <h2>{c.h.need}</h2>
      {c.need.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <p style={{ marginTop: '2rem' }}>
        <a className="primary about-cta" href="/">{c.cta}</a>
      </p>

      <p className="about-foot">{c.footer}</p>
    </main>
  );
}
