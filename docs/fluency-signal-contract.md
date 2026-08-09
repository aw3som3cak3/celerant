# Celerant flytsignal — integrationskontrakt (v0.2)

En utåtriktad läsning: *"var står det här barnet på den här färdighetskoden?"* Ett barn, en kod,
per anrop. Byggd för den externa konsumenten (verkstadsrummet), inte för föräldravyn.

Detta är kontraktet — **fältformen är stabil**; interna ändringar (θ-modell, seed, replay) får
aldrig ändra fälten eller deras betydelse. Om vi måste bryta det får ni en versionsbump, inte en
tyst ändring.

> **v0.2:** auth är nu en **barnscopad** läs-token i stället för en familjesession (least
> privilege — ett syskon utan egen token är oåtkomligt), och identifieraren är barnets **stabila
> uuid** (`player.id`). Celerant modellerar aldrig er organisation; ni håller avbildningen
> "vårt barn ↔ Celerant-uuid" på er sida.

---

## Identifierare — barnets uuid

`player.id` är ett `randomUUID` som sätts en gång och aldrig ändras. Det är **oberoende av familj
och grupp** (Celerant känner inte till patruller/kårer), så det överlever att familjer ombildas,
att barn byter grupp och att er instansmodell ändras. Lagra det som er främmande nyckel; det är
identifieraren, inte behörigheten.

## Behörighet — barnscopad läs-token

Minta en token per barn (guardian-åtgärd, förälder-PIN-gate), en gång vid kontoskapandet:

```
POST /api/player-token          Authorization: parent session (PIN)
body: { "player": "<uuid>" }
→ 200 { "uuid": "<uuid>", "token": "<secret, visas EN gång>" }
```

- Tokenen **auktoriserar exakt ett barn** — det samtycket gäller. Rotera genom att minta en ny;
  återkalla när samtycket dras tillbaka (den blir då död).
- Endast tokenens **SHA-256** lagras; den råa strängen visas en gång.

## Läsanropet

```
GET /api/fluency?code=<skillCode>[&player=<uuid>]
Authorization: Bearer <per-child read token>
```

- **Ett barn, en kod.** Tokenen bär identiteten; `?player` är valfritt och måste, om det anges,
  matcha tokenens barn (annars `403`). Det finns **medvetet ingen** endpoint som tar en familj
  och returnerar flera barn, och ingen som sorterar på förmåga — en rangordnad lista är omöjlig
  *by construction*, inte *by policy*.
- **Ledarvyn** är tolv sådana enkeluppslag med tolv tokens, hopsatta hos er; garantin ligger i
  returtypen, inte i en policy. Gör aldrig en server-side lista/sortering av det.
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
| `401` | ogiltig/utebliven/återkallad läs-token |
| `403` | `?player` angavs och matchar inte tokenens barn |
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
