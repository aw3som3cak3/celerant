/**
 * icons.ts — identity, and the only thing in this system a child ever names.
 *
 * Icons live in code, like skills. The database stores `key`, never the glyph:
 * a curation change must never orphan a family.
 *
 * CURATION RULES. Read before adding anything.
 *
 *   1. No faces or people. Skin-tone and gender modifiers are a status axis
 *      by construction. Animal faces are fine; human ones are not.
 *   2. No flags. National identity is not a login credential.
 *   3. No religious symbols.
 *   4. Nothing scary, gory, or scatological. The six-year-old will choose 💩
 *      and the eight-year-old will care.
 *   5. NO RANK ORDERING. This is the one that matters. If 🐉 and 🐌 are both
 *      present, one child got the good one. Cut the dragon. Cut the lion, the
 *      tiger, the unicorn, the shark, the T-rex. What remains is a set where
 *      no icon is better than another, which is the same property the rest of
 *      this system spends so much effort preserving.
 *   6. No innuendo. 🍆 and 🍑 are not on this list and you know why.
 *
 * `name` and `keywords` are Swedish and are hand-written here. They should be
 * replaced by Unicode CLDR annotations (`common/annotations/sv.xml` and
 * `annotationsDerived/sv.xml`), which give a short name and a keyword list per
 * emoji, maintained and translated by someone other than us. Treat this file's
 * strings as a placeholder that must be reconciled with CLDR before launch.
 *
 * Search is diacritic-folded: `kott` must find `kött`.
 * Search exists for PARENTS, on create-family and admin screens.
 * The child's screen is a grid. Never put a text field in front of a child
 * whose only other text field is the answer to a maths problem.
 */

export type Category =
  | "frukt" | "mat" | "djur" | "vader" | "vaxter"
  | "verktyg" | "instrument" | "fordon" | "sport";

export type Icon = {
  key: string;          // stable, ascii, stored in the db
  glyph: string;
  name: string;         // Swedish, singular
  category: Category;
  keywords: string[];   // Swedish, for the parent's filter box
};

const I = (key: string, glyph: string, name: string, category: Category, ...keywords: string[]): Icon =>
  ({ key, glyph, name, category, keywords });

/* ── frukt & grönt ────────────────────────────────────────────── 20 */
const frukt: Icon[] = [
  I("apple", "🍎", "äpple", "frukt", "frukt", "röd"),
  I("green_apple", "🍏", "grönt äpple", "frukt", "frukt", "grön"),
  I("pear", "🍐", "päron", "frukt", "frukt"),
  I("orange", "🍊", "apelsin", "frukt", "citrus", "frukt"),
  I("lemon", "🍋", "citron", "frukt", "citrus", "sur"),
  I("banana", "🍌", "banan", "frukt", "gul"),
  I("watermelon", "🍉", "vattenmelon", "frukt", "melon", "sommar"),
  I("grapes", "🍇", "vindruvor", "frukt", "druva"),
  I("strawberry", "🍓", "jordgubbe", "frukt", "bär", "sommar"),
  I("blueberries", "🫐", "blåbär", "frukt", "bär", "skog"),
  I("cherries", "🍒", "körsbär", "frukt", "bär"),
  I("mango", "🥭", "mango", "frukt", "tropisk"),
  I("pineapple", "🍍", "ananas", "frukt", "tropisk"),
  I("coconut", "🥥", "kokosnöt", "frukt", "nöt", "tropisk"),
  I("kiwi", "🥝", "kiwi", "frukt", "grön"),
  I("tomato", "🍅", "tomat", "frukt", "grönsak", "röd"),
  I("avocado", "🥑", "avokado", "frukt", "grön"),
  I("carrot", "🥕", "morot", "frukt", "grönsak", "orange"),
  I("corn", "🌽", "majs", "frukt", "grönsak", "gul"),
  I("broccoli", "🥦", "broccoli", "frukt", "grönsak", "grön"),
];

/* ── mat ──────────────────────────────────────────────────────── 24 */
const mat: Icon[] = [
  I("hotdog", "🌭", "varmkorv", "mat", "korv", "bröd", "kiosk"),
  I("hamburger", "🍔", "hamburgare", "mat", "burgare", "bröd"),
  I("fries", "🍟", "pommes frites", "mat", "potatis"),
  I("pizza", "🍕", "pizza", "mat", "ost", "skiva"),
  I("sandwich", "🥪", "smörgås", "mat", "macka", "bröd"),
  I("taco", "🌮", "taco", "mat", "tortilla"),
  I("burrito", "🌯", "burrito", "mat", "tortilla", "rulle"),
  I("falafel", "🧆", "falafel", "mat", "kikärta"),
  I("egg", "🥚", "ägg", "mat", "skal"),
  I("fried_egg", "🍳", "stekt ägg", "mat", "stekpanna", "frukost"),
  I("pancakes", "🥞", "pannkakor", "mat", "frukost", "sirap"),
  I("waffle", "🧇", "våffla", "mat", "frukost"),
  I("pretzel", "🥨", "kringla", "mat", "bröd", "salt"),
  I("croissant", "🥐", "croissant", "mat", "bröd", "frukost"),
  I("baguette", "🥖", "baguette", "mat", "bröd", "fransk"),
  I("bread", "🍞", "bröd", "mat", "limpa", "skiva"),
  I("cheese", "🧀", "ost", "mat", "gul"),
  I("salad", "🥗", "sallad", "mat", "skål", "grön"),
  I("popcorn", "🍿", "popcorn", "mat", "majs", "bio"),
  I("rice", "🍚", "ris", "mat", "skål"),
  I("sushi", "🍣", "sushi", "mat", "fisk", "ris"),
  I("ice_cream", "🍦", "glass", "mat", "strut", "sommar"),
  I("doughnut", "🍩", "munk", "mat", "bakverk", "socker"),
  I("cookie", "🍪", "kaka", "mat", "bakverk", "choklad"),
];

/* ── djur ─────────────────────────────────────────────────────── 42 */
const djur: Icon[] = [
  I("dog", "🐶", "hund", "djur", "husdjur", "valp"),
  I("cat", "🐱", "katt", "djur", "husdjur", "kattunge"),
  I("mouse", "🐭", "mus", "djur", "gnagare"),
  I("hamster", "🐹", "hamster", "djur", "gnagare", "husdjur"),
  I("rabbit", "🐰", "kanin", "djur", "hare"),
  I("fox", "🦊", "räv", "djur", "skog", "röd"),
  I("bear", "🐻", "björn", "djur", "skog"),
  I("panda", "🐼", "panda", "djur", "bambu"),
  I("koala", "🐨", "koala", "djur", "träd", "eukalyptus"),
  I("cow", "🐮", "ko", "djur", "bonde", "mjölk"),
  I("pig", "🐷", "gris", "djur", "bonde"),
  I("frog", "🐸", "groda", "djur", "damm", "grön"),
  I("monkey", "🐵", "apa", "djur", "djungel", "svans"),
  I("chicken", "🐔", "höna", "djur", "bonde", "ägg"),
  I("penguin", "🐧", "pingvin", "djur", "is"),
  I("bird", "🐦", "fågel", "djur", "vinge"),
  I("chick", "🐤", "kyckling", "djur", "gul"),
  I("duck", "🦆", "anka", "djur", "damm"),
  I("owl", "🦉", "uggla", "djur", "natt", "skog"),
  I("bat", "🦇", "fladdermus", "djur", "natt"),
  I("bee", "🐝", "bi", "djur", "insekt", "honung"),
  I("butterfly", "🦋", "fjäril", "djur", "insekt", "vinge"),
  I("snail", "🐌", "snigel", "djur", "skal", "långsam"),
  I("ladybug", "🐞", "nyckelpiga", "djur", "insekt", "prick"),
  I("ant", "🐜", "myra", "djur", "insekt"),
  I("cricket", "🦗", "syrsa", "djur", "insekt"),
  I("turtle", "🐢", "sköldpadda", "djur", "skal"),
  I("octopus", "🐙", "bläckfisk", "djur", "hav"),
  I("squid", "🦑", "tioarmad bläckfisk", "djur", "hav"),
  I("shrimp", "🦐", "räka", "djur", "hav", "skaldjur"),
  I("crab", "🦀", "krabba", "djur", "hav", "skaldjur"),
  I("lobster", "🦞", "hummer", "djur", "hav", "skaldjur"),
  I("fish", "🐟", "fisk", "djur", "hav"),
  I("tropical_fish", "🐠", "tropisk fisk", "djur", "hav", "korall"),
  I("dolphin", "🐬", "delfin", "djur", "hav"),
  I("whale", "🐳", "val", "djur", "hav"),
  I("horse", "🐴", "häst", "djur", "bonde"),
  I("zebra", "🦓", "zebra", "djur", "rand"),
  I("elephant", "🐘", "elefant", "djur", "snabel"),
  I("giraffe", "🦒", "giraff", "djur", "hals"),
  I("hedgehog", "🦔", "igelkott", "djur", "tagg", "skog"),
  I("squirrel", "🐿", "ekorre", "djur", "skog", "nöt"),
];

/* ── väder & natur ───────────────────────────────────────────── 18 */
const vader: Icon[] = [
  I("sun", "☀️", "sol", "vader", "dag", "varm"),
  I("cloud", "☁️", "moln", "vader", "grå"),
  I("sun_behind_cloud", "⛅", "sol bakom moln", "vader", "halvklart"),
  I("rain", "🌧", "regn", "vader", "vatten", "blöt"),
  I("thunder", "⛈", "åska", "vader", "storm", "blixt"),
  I("snow_cloud", "🌨", "snöfall", "vader", "vinter"),
  I("snowflake", "❄️", "snöflinga", "vader", "vinter", "is"),
  I("snowman", "☃️", "snögubbe", "vader", "vinter"),
  I("tornado", "🌪", "tromb", "vader", "vind", "storm"),
  I("fog", "🌫", "dimma", "vader", "grå"),
  I("rainbow", "🌈", "regnbåge", "vader", "färg"),
  I("droplet", "💧", "droppe", "vader", "vatten"),
  I("wave", "🌊", "våg", "vader", "hav", "vatten"),
  I("star", "⭐", "stjärna", "vader", "natt", "himmel"),
  I("lightning", "⚡", "blixt", "vader", "el", "storm"),
  I("crescent_moon", "🌙", "månskära", "vader", "natt"),
  I("planet", "🪐", "planet", "vader", "rymd", "ring"),
  I("comet", "🌠", "stjärnfall", "vader", "natt", "rymd"),
];

/* ── växter ──────────────────────────────────────────────────── 16 */
const vaxter: Icon[] = [
  I("seedling", "🌱", "grodd", "vaxter", "planta", "grön"),
  I("herb", "🌿", "ört", "vaxter", "blad", "grön"),
  I("clover", "🍀", "fyrklöver", "vaxter", "tur", "grön"),
  I("maple_leaf", "🍁", "lönnlöv", "vaxter", "höst", "löv"),
  I("fallen_leaf", "🍂", "fallna löv", "vaxter", "höst"),
  I("leaves", "🍃", "löv i vinden", "vaxter", "blad"),
  I("wheat", "🌾", "ax", "vaxter", "säd", "gul"),
  I("cactus", "🌵", "kaktus", "vaxter", "öken", "tagg"),
  I("palm_tree", "🌴", "palm", "vaxter", "träd", "strand"),
  I("deciduous_tree", "🌳", "lövträd", "vaxter", "träd", "skog"),
  I("evergreen_tree", "🌲", "barrträd", "vaxter", "träd", "gran", "skog"),
  I("tulip", "🌷", "tulpan", "vaxter", "blomma", "vår"),
  I("rose", "🌹", "ros", "vaxter", "blomma", "röd"),
  I("sunflower", "🌻", "solros", "vaxter", "blomma", "gul"),
  I("cherry_blossom", "🌸", "körsbärsblomma", "vaxter", "blomma", "vår", "rosa"),
  I("mushroom", "🍄", "svamp", "vaxter", "skog"),
];

/* ── verktyg ─────────────────────────────────────────────────── 18 */
const verktyg: Icon[] = [
  I("hammer", "🔨", "hammare", "verktyg", "spik", "snickare"),
  I("axe", "🪓", "yxa", "verktyg", "ved", "hugga"),
  I("wrench", "🔧", "skiftnyckel", "verktyg", "skruv"),
  I("screwdriver", "🪛", "skruvmejsel", "verktyg", "skruv"),
  I("nut_and_bolt", "🔩", "skruv och mutter", "verktyg", "metall"),
  I("gear", "⚙️", "kugghjul", "verktyg", "maskin"),
  I("magnet", "🧲", "magnet", "verktyg", "metall"),
  I("ladder", "🪜", "stege", "verktyg", "klättra"),
  I("toolbox", "🧰", "verktygslåda", "verktyg", "låda"),
  I("saw", "🪚", "såg", "verktyg", "trä"),
  I("flashlight", "🔦", "ficklampa", "verktyg", "ljus", "mörker"),
  I("compass", "🧭", "kompass", "verktyg", "norr", "riktning"),
  I("hourglass", "⌛", "timglas", "verktyg", "sand", "tid"),
  I("key", "🔑", "nyckel", "verktyg", "lås"),
  I("paperclip", "📎", "gem", "verktyg", "papper"),
  I("scissors", "✂️", "sax", "verktyg", "klippa"),
  I("ruler", "📏", "linjal", "verktyg", "mäta", "rak"),
  I("triangular_ruler", "📐", "vinkelhake", "verktyg", "mäta", "vinkel"),
];

/* ── instrument ──────────────────────────────────────────────── 12 */
const instrument: Icon[] = [
  I("guitar", "🎸", "gitarr", "instrument", "sträng", "musik"),
  I("violin", "🎻", "fiol", "instrument", "sträng", "musik"),
  I("drum", "🥁", "trumma", "instrument", "slag", "musik"),
  I("piano", "🎹", "piano", "instrument", "tangent", "musik"),
  I("trumpet", "🎺", "trumpet", "instrument", "blås", "musik"),
  I("saxophone", "🎷", "saxofon", "instrument", "blås", "musik"),
  I("banjo", "🪕", "banjo", "instrument", "sträng", "musik"),
  I("accordion", "🪗", "dragspel", "instrument", "musik"),
  I("microphone", "🎤", "mikrofon", "instrument", "sjunga", "musik"),
  I("headphone", "🎧", "hörlurar", "instrument", "lyssna", "musik"),
  I("bell", "🔔", "klocka", "instrument", "ringa", "ljud"),
  I("maracas", "🪇", "maracas", "instrument", "skaka", "musik"),
];

/* ── fordon ──────────────────────────────────────────────────── 20 */
const fordon: Icon[] = [
  I("car", "🚗", "bil", "fordon", "väg"),
  I("taxi", "🚕", "taxi", "fordon", "gul", "väg"),
  I("bus", "🚌", "buss", "fordon", "väg"),
  I("fire_engine", "🚒", "brandbil", "fordon", "röd", "brand"),
  I("ambulance", "🚑", "ambulans", "fordon", "sjukhus"),
  I("truck", "🚚", "lastbil", "fordon", "väg", "last"),
  I("tractor", "🚜", "traktor", "fordon", "bonde", "åker"),
  I("scooter", "🛵", "moped", "fordon", "två hjul"),
  I("bicycle", "🚲", "cykel", "fordon", "två hjul", "trampa"),
  I("kick_scooter", "🛴", "sparkcykel", "fordon", "två hjul"),
  I("locomotive", "🚂", "ånglok", "fordon", "tåg", "räls"),
  I("train", "🚄", "snabbtåg", "fordon", "tåg", "räls"),
  I("helicopter", "🚁", "helikopter", "fordon", "rotor", "flyga"),
  I("airplane", "✈️", "flygplan", "fordon", "flyga", "vinge"),
  I("rocket", "🚀", "raket", "fordon", "rymd"),
  I("sailboat", "⛵", "segelbåt", "fordon", "båt", "segel", "vatten"),
  I("speedboat", "🚤", "motorbåt", "fordon", "båt", "vatten"),
  I("canoe", "🛶", "kanot", "fordon", "båt", "paddel"),
  I("anchor", "⚓", "ankare", "fordon", "båt", "hav"),
  I("ship", "🚢", "fartyg", "fordon", "båt", "hav"),
];

/* ── sport & lek ─────────────────────────────────────────────── 16 */
const sport: Icon[] = [
  I("soccer", "⚽", "fotboll", "sport", "boll", "spark"),
  I("basketball", "🏀", "basketboll", "sport", "boll", "korg"),
  I("baseball", "⚾", "baseboll", "sport", "boll", "slagträ"),
  I("tennis", "🎾", "tennisboll", "sport", "boll", "racket"),
  I("volleyball", "🏐", "volleyboll", "sport", "boll", "nät"),
  I("rugby", "🏉", "rugbyboll", "sport", "boll"),
  I("flying_disc", "🥏", "frisbee", "sport", "kasta"),
  I("eight_ball", "🎱", "biljardboll", "sport", "boll", "svart"),
  I("ping_pong", "🏓", "pingis", "sport", "racket", "boll"),
  I("badminton", "🏸", "badminton", "sport", "racket", "fjäderboll"),
  I("ice_hockey", "🏒", "ishockey", "sport", "klubba", "puck"),
  I("field_hockey", "🏑", "landhockey", "sport", "klubba", "boll"),
  I("kite", "🪁", "drake", "sport", "vind", "flyga", "lek"),
  I("dart", "🎯", "måltavla", "sport", "pil", "träffa"),
  I("bowling", "🎳", "bowling", "sport", "klot", "käglor"),
  I("skis", "🎿", "skidor", "sport", "vinter", "snö"),
];

export const ICONS: Icon[] = [
  ...frukt, ...mat, ...djur, ...vader, ...vaxter,
  ...verktyg, ...instrument, ...fordon, ...sport,
];

export const BY_KEY = new Map(ICONS.map((i) => [i.key, i]));

export const CATEGORIES: Category[] =
  ["djur", "mat", "frukt", "vaxter", "vader", "fordon", "verktyg", "instrument", "sport"];

/* ── family identity is a PAIR ─────────────────────────────────────── */

/**
 * Global uniqueness of a single icon caps families at ICONS.length, and a grid
 * of hundreds is not a grid — a five-year-old scrolls past their own fox.
 *
 * A family is therefore an unordered pair: "räven och varmkorven".
 * With n icons that is n(n-1)/2 families, and a pair is far more memorable to
 * a child than the 187th animal would be.
 *
 * Canonical form: the two keys, sorted, joined with "+". Store that string.
 */
export const familyKey = (a: string, b: string): string => {
  if (a === b) throw new Error("a family is two different icons");
  if (!BY_KEY.has(a) || !BY_KEY.has(b)) throw new Error("unknown icon key");
  return [a, b].sort().join("+");
};

export const familyIcons = (key: string): [Icon, Icon] => {
  const [a, b] = key.split("+");
  return [BY_KEY.get(a)!, BY_KEY.get(b)!];
};

export const PAIR_COUNT = (ICONS.length * (ICONS.length - 1)) / 2;

/* ── search, for parents only ──────────────────────────────────────── */

/** å→a, ä→a, ö→o, é→e. `kott` must find `kött`. */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const search = (q: string): Icon[] => {
  const f = fold(q.trim());
  if (!f) return ICONS;
  return ICONS.filter(
    (i) => fold(i.name).includes(f) || i.keywords.some((k) => fold(k).includes(f)) || fold(i.key).includes(f),
  );
};
