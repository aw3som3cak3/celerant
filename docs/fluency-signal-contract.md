# Celerant flytsignal — integrationskontrakt (utkast v0.1)

En utåtriktad läsning: *"var står det här barnet på den här färdighetskoden?"* Ett barn, en kod,
per anrop. Byggd för den externa konsumenten (verkstadsrummet), inte för föräldravyn.

Detta är kontraktet — **fältformen är stabil**; interna ändringar (θ-modell, seed, replay) får
aldrig ändra fälten eller deras betydelse. Om vi måste bryta det får ni en versionsbump, inte en
tyst ändring.

---

## Anropet

```
GET /api/fluency?player=<playerId>&code=<skillCode>
Authorization: Bearer <family-scoped read token>
```

- **Ett barn, en kod.** Det finns **medvetet ingen** endpoint som tar en familj och returnerar
  flera barn, och ingen som sorterar på förmåga. En rangordnad lista är omöjlig *by construction*,
  inte *by policy* — samma hållning som er egen (i returtyperna, inte i en policy).
- **Auth:** en familjescopad läs-token (utfärdas en gång till ledaren, bunden till familjen).
  Endpointen validerar att `player` tillhör tokenens familj. Fler familjer = samma form upprepad,
  en token per familj som väljer in.
- **Volym:** trivial (≈5 koder/vecka × 12 barn). Ingen batch behövs; en cache på er sida på några
  minuter räcker gott.

## Svaret (200)

```jsonc
{
  "met":        true,                    // "mött koden" — exponeringströskeln
  "fluent":     true,                    // får barnet försöka vid bänken
  "confidence": "measured"               // "measured" | "provisional" | "unknown"
}
```

### Fältens betydelse (och exakt vad de läser internt)

| Fält | Betyder | Internt uttryck |
|---|---|---|
| `met` | Barnet har **mött** koden (svarat minst en gång) | ability-rad med `last_seen_at != null` |
| `fluent` | Barnet **får försöka** — grinden är öppen | `componentFluent` (steady ∧ (seedgrant ∨ earnat ∨ rate ≥ aim)) |
| `confidence` | **Hur** flytet fastställts | ability-radens `rate_state` (ingen rad → `unknown`) |

- `measured` — en trovärdig sprint har satt raten (barnet har **förtjänat** det).
- `provisional` — seedad ur årskurs, aldrig sprintad (en gissning **vi** gjorde).
- `unknown` — ingen ability-rad: placering/replay har inte producerat en rad för (barn, kod).

`met` och `confidence` är **oberoende axlar** — ett barn kan ha `met=false` men ändå `fluent=true,
confidence=provisional` (seedad grind, aldrig rörd). Det är själva skälet att inte platta till en
boolean.

## De två situationerna → villkor

| Situation | Villkor att kontrollera |
|---|---|
| **Barnet får materialet** (exponering) | `met === true` |
| **Barnet arbetar ensamt** (bänk) | `fluent === true && confidence === "measured"` |

- **Acceptera aldrig `provisional` för bänken.** En seedad grind är inte en korsning.
- **`unknown` = ni frågade för tidigt.** Behandla som ett fel på er sida (koden är inte placerad
  för barnet ännu) — inte som "inte flytande". Det kommer som `200`, inte `404`: barnet och koden
  finns, men det finns ingen mätning att svara med.

## Fel

| Kod | När |
|---|---|
| `401` | ogiltig/utebliven token |
| `403` | `player` tillhör inte tokenens familj |
| `404` | okänd `skillCode` (finns inte i grafen) |
| `200` med `confidence: "unknown"` | giltig fråga, men ingen mätning ännu (≠ fel-i-anropet) |

## Exempel — hur (met, fluent, confidence) läses

| met | fluent | confidence | Innebörd | Får materialet? | Arbetar ensam? |
|---|---|---|---|---|---|
| false | false | unknown | oplacerad — fråga för tidigt | nej | nej |
| true | false | provisional | mött, seedad, ännu inte flytande | **ja** | nej |
| true | true | provisional | grinden öppen på en **gissning** | ja | **nej** (ej measured) |
| true | false | measured | sprintad, men under aim (mätt ≠ snabb nog) | ja | nej |
| true | true | measured | **förtjänad korsning** | ja | **ja** |

Den nedersta raden — och bara den — är veckan att stämpla mot för Application-datan.

## Stabilitetslöfte

Fälten `met` / `fluent` / `confidence` och deras betydelse är kontraktet. De tolv koder ni
konsumerar är alla **komponenter** (bär en rate), så `confidence` är meningsfull för var och en.
Konsumera aldrig en `compound`-kod mot den här signalen — kompositer bär ingen rate och skulle
alltid ge `confidence: "unknown"`. (Era nuvarande koder är alla komponenter; detta är en regel för
framtida kanter.)
