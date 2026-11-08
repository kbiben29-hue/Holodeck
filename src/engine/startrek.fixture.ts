// Test stand-ins for the Star Trek cards used by the combo drills: just the rules the drills rely on,
// in the wording the engine reads. The real cards are loaded from Scryfall in the app.

import { mk } from './fixture'
import type { CardDef } from './types'

const ID = (name: string) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })

export const STAR_TREK_FIXTURE: CardDef[] = [
	mk('Jean-Luc Picard, Luminary', '{1}{U}{R}{W}', 'Legendary Creature — Human Officer', 'Seek out — Whenever you draw your second card each turn, put a +1/+1 counter on up to one other target creature.', '2/4'),
	mk('Ro Laren, Double Agent', '{2}{R}', 'Legendary Creature — Bajoran Rogue Officer', 'Seek out — Whenever you draw your second card each turn, Ro Laren deals 2 damage to each opponent.', '3/2'),
	mk('Rom and Leeta, Unlikely Pair', '{3}{R}', 'Legendary Creature — Ferengi Bajoran', 'Seek out — Whenever you draw your second card each turn, create two tapped Treasure tokens.', '4/3'),
	mk('Dr. Pulaski, Cynical Clinician', '{1}{W}', 'Legendary Creature — Human Doctor', 'Seek out — Whenever you draw your second card each turn, you gain 4 life.', '2/2'),
	mk('Commander William Riker', '{1}{R}{W}', 'Legendary Creature — Human Officer', 'Vigilance, haste\n{1}, {T}: You and target opponent each draw two cards.', '3/3'),
	mk('Worf, Defiant Commander', '{2}{R}{W}{B}', 'Legendary Creature — Klingon Warrior Officer', 'When Worf enters, create a 2/1 red Klingon Warrior creature token with haste.\nBattlefront — Whenever you attack, exile the top X cards of your library, where X is the number of opponents you attacked this turn. Until the end of your next turn, you may play those cards.', '3/4'),
	mk('Gnarling Targ', '{4}{R}', 'Creature — Boar', 'Trample\nWhenever you attack, Klingons and Warriors you control get +2/+0 and gain trample until end of turn.', '4/5'),
	mk('Kurn, Son of Mogh', '{2}{B}', 'Legendary Creature — Klingon Warrior Officer', 'Deathtouch\nBattlefront — Whenever Kurn attacks, you draw X cards and lose X life, where X is the number of opponents you attacked this turn.', '2/3'),
	mk('The Borg Queen', '{4}{W}{U}{B}', 'Legendary Artifact Creature — Borg Noble', 'Artifact creatures you control get +2/+2.\nWhenever The Borg Queen enters or attacks, target opponent exiles cards from the top of their library until they exile a creature card. Assimilate that card.', '4/4'),
	mk('Dispatch', '{W}', 'Instant', 'Tap target creature.\nMetalcraft — If you control three or more artifacts, exile that creature instead.'),
	mk('Captain Kirk, Boldly Going', '{1}{G}{W}{U}', 'Legendary Creature — Human Officer', 'Vigilance\nSpacecraft creatures you control get +3/+3.\nWhenever Captain Kirk enters or attacks, search your library and/or graveyard for a basic land card or a card named Starship Enterprise, reveal it, and put it into your hand.', '3/4'),
	mk('Starship Enterprise', '{5}', 'Legendary Artifact — Spacecraft', 'Landfall — Whenever a land you control enters, put four charge counters on Starship Enterprise.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It’s an artifact creature at 16+.)\n16+ | Flying\nWhenever Starship Enterprise deals combat damage to a player, draw that many cards.', '4/6'),
	mk('Worf, Son of Mogh', '{1}{R}{W}', 'Legendary Creature — Klingon Warrior Officer', 'Menace\nOther Officers you control get +1/+1.', '3/3'),
].map((c) => ({ ...c, ...ID(c.name) }))

export const ST: Record<string, CardDef> = Object.fromEntries(STAR_TREK_FIXTURE.map((c) => [c.id, c]))
