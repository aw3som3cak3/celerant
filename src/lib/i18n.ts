// Minimal i18n. Swedish is the source language; English is the alternate. New
// strings: add a key here with both locales, then use t('key') in a component.

export type Locale = 'sv' | 'en';
export const LOCALES: Locale[] = ['sv', 'en'];
export const LOCALE_LABEL: Record<Locale, string> = { sv: 'Svenska', en: 'English' };
export const DEFAULT_LOCALE: Locale = 'sv';

type Dict = Record<string, string>;

const sv: Dict = {
  'app.name': 'Celerant',
  'nav.login': 'Logga in',
  'login.title': 'Logga in',
  'login.pickTwo': 'Välj familjens två ikoner',
  'login.pressPlus': 'Tryck på + för att välja en ikon.',
  'login.pin': 'Skriv PIN',
  'login.restart': 'börja om',
  'login.error': 'Fel — kontrollera ikonerna och PIN.',
  'login.orCached': 'eller logga in med en av dessa',
  'login.newFamily': 'Ny familj',
  'common.or': 'eller',
  'common.back': 'tillbaka',
  'common.close': 'stäng',
  'slot.choose': 'välj ikon',
  'slot.change': 'byt ikon',
  'modal.pickIcon': 'Välj en ikon',
  'players.parent': 'förälder',
  'players.switch': 'byt familj',
  'create.firstIcon': 'Välj första ikonen',
  'create.secondIcon': 'Välj andra ikonen',
  'create.familyIsTwo': 'En familj är två ikoner — t.ex. räven och varmkorven.',
  'create.familyPin': 'Familjens PIN',
  'create.familyPinHint': 'Barnen kommer att kunna den.',
  'create.parentPin': 'Förälderns PIN',
  'create.parentPinHint': 'Måste skilja sig från familjens PIN. Barnen ska inte kunna den.',
  'create.pinsMustDiffer': 'Förälderns PIN måste skilja sig.',
  'create.pairTaken': 'Paret är taget.',
  'create.weakPin': 'För enkel PIN (inga 1111 eller 1234).',
  'create.somethingWrong': 'Något blev fel.',
  'pin.again': 'Skriv igen',
  'pin.four': 'Fyra siffror',
  'pin.noMatch': 'Matchade inte, försök igen.',
  'player.firstIcon': 'Nu barnet: välj en ikon',
  'player.pickIcon': 'Välj en ikon',
  'player.whichYear': 'Vilken årskurs?',
  'player.yearHint': 'Inte ålder — årskurs. F är förskoleklass.',
  'player.iconTaken': 'Ikonen är tagen — välj en annan.',
};

const en: Dict = {
  'app.name': 'Celerant',
  'nav.login': 'Log in',
  'login.title': 'Log in',
  'login.pickTwo': "Choose your family's two icons",
  'login.pressPlus': 'Tap + to choose an icon.',
  'login.pin': 'Enter PIN',
  'login.restart': 'start over',
  'login.error': 'Wrong — check the icons and PIN.',
  'login.orCached': 'or log in with one of these',
  'login.newFamily': 'New family',
  'common.or': 'or',
  'common.back': 'back',
  'common.close': 'close',
  'slot.choose': 'choose icon',
  'slot.change': 'change icon',
  'modal.pickIcon': 'Choose an icon',
  'players.parent': 'parent',
  'players.switch': 'switch family',
  'create.firstIcon': 'Choose the first icon',
  'create.secondIcon': 'Choose the second icon',
  'create.familyIsTwo': 'A family is two icons — e.g. the fox and the hot dog.',
  'create.familyPin': 'Family PIN',
  'create.familyPinHint': 'The children will know this one.',
  'create.parentPin': 'Parent PIN',
  'create.parentPinHint': 'Must differ from the family PIN. The children must not know it.',
  'create.pinsMustDiffer': 'The parent PIN must differ.',
  'create.pairTaken': 'That pair is taken.',
  'create.weakPin': 'Too simple a PIN (no 1111 or 1234).',
  'create.somethingWrong': 'Something went wrong.',
  'pin.again': 'Type it again',
  'pin.four': 'Four digits',
  'pin.noMatch': "Didn't match, try again.",
  'player.firstIcon': 'Now the child: choose an icon',
  'player.pickIcon': 'Choose an icon',
  'player.whichYear': 'Which school year?',
  'player.yearHint': 'Not age — school year. F is preschool class (förskoleklass).',
  'player.iconTaken': 'That icon is taken — choose another.',
};

const DICT: Record<Locale, Dict> = { sv, en };

export function translate(locale: Locale, key: string): string {
  return DICT[locale][key] ?? DICT[DEFAULT_LOCALE][key] ?? key;
}
