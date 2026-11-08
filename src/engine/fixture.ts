// Test stand-ins written in the same shape as Scryfall data. Generic cards plus a few well-known
// reprints whose rules text is public and short. Used by tests and the simulator (no network).

import type { CardDef, Color, Mana } from './types'

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function colorsOf(cost: string): Color[] {
	const out = new Set<Color>()
	for (const m of cost.matchAll(/\{([WUBRG])/g)) out.add(m[1] as Color)
	return [...out]
}

function cmcOf(cost: string): number {
	let n = 0
	for (const m of cost.matchAll(/\{([^}]+)\}/g)) n += /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === 'X' ? 0 : 1
	return n
}

export function mk(name: string, manaCost: string, typeLine: string, oracle: string, pt?: string, extra: Partial<CardDef> = {}): CardDef {
	const [power, toughness] = pt ? pt.split('/') : [undefined, undefined]
	const produces = [...oracle.matchAll(/Add ((?:\{[WUBRGC]\})+)/g)].flatMap((m) => m[1].match(/[WUBRGC]/g) as Mana[])
	return {
		id: slug(name),
		name,
		manaCost,
		cmc: cmcOf(manaCost),
		typeLine,
		oracle,
		power,
		toughness,
		colors: colorsOf(manaCost),
		identity: colorsOf(manaCost + oracle),
		keywords: [],
		produces: [...new Set(produces)],
		...extra,
	}
}

export const FIXTURE: CardDef[] = [
	mk('Plains', '', 'Basic Land — Plains', '({T}: Add {W}.)'),
	mk('Island', '', 'Basic Land — Island', '({T}: Add {U}.)'),
	mk('Swamp', '', 'Basic Land — Swamp', '({T}: Add {B}.)'),
	mk('Mountain', '', 'Basic Land — Mountain', '({T}: Add {R}.)'),
	mk('Forest', '', 'Basic Land — Forest', '({T}: Add {G}.)'),
	mk('Sol Ring', '{1}', 'Artifact', '{T}: Add {C}{C}.'),
	mk('Arcane Signet', '{2}', 'Artifact', "{T}: Add one mana of any color in your commander's color identity."),
	mk('Talisman of Progress', '{2}', 'Artifact', '{T}: Add {C}.\n{T}: Add {W} or {U}. Talisman of Progress deals 1 damage to you.'),
	mk('Command Tower', '', 'Land', "{T}: Add one mana of any color in your commander's color identity."),
	mk('Glacial Fortress', '', 'Land', 'This land enters tapped unless you control a Plains or an Island.\n{T}: Add {W} or {U}.'),
	mk('Evolving Wilds', '', 'Land', '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'),
	mk('Temple of Enlightenment', '', 'Land', 'This land enters tapped.\nWhen this land enters, scry 1.\n{T}: Add {W} or {U}.'),
	mk('Swords to Plowshares', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.'),
	mk('Wrath of God', '{2}{W}{W}', 'Sorcery', "Destroy all creatures. They can't be regenerated."),
	mk('Negate', '{1}{U}', 'Instant', 'Counter target noncreature spell.'),
	mk('Divination', '{2}{U}', 'Sorcery', 'Draw two cards.'),
	mk('Shock', '{R}', 'Instant', 'Shock deals 2 damage to any target.'),
	mk('Cultivate', '{2}{G}', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.'),
	mk('Rampant Growth', '{1}{G}', 'Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'),
	mk('Lightning Greaves', '{2}', 'Artifact — Equipment', 'Equipped creature has haste and shroud.\nEquip {0}'),
	mk('Bonesplitter', '{1}', 'Artifact — Equipment', 'Equipped creature gets +2/+0.\nEquip {1}'),
	mk('Glorious Anthem', '{1}{W}{W}', 'Enchantment', 'Creatures you control get +1/+1.'),
	mk('Serra Angel', '{3}{W}{W}', 'Creature — Angel', 'Flying, vigilance', '4/4'),
	mk('Wind Drake', '{2}{U}', 'Creature — Drake', 'Flying', '2/2'),
	mk('Grizzly Bears', '{1}{G}', 'Creature — Bear', '', '2/2'),
	mk('Hill Giant', '{3}{R}', 'Creature — Giant', '', '3/3'),
	mk('Typhoid Rats', '{B}', 'Creature — Rat', 'Deathtouch', '1/1'),
	mk('Colossal Dreadmaw', '{4}{G}{G}', 'Creature — Dinosaur', 'Trample', '6/6'),
	mk('Elvish Visionary', '{1}{G}', 'Creature — Elf Shaman', 'When this creature enters, draw a card.', '1/1'),
	mk('Raise the Alarm', '{1}{W}', 'Instant', 'Create two 1/1 white Soldier creature tokens.'),
	mk('Llanowar Elves', '{G}', 'Creature — Elf Druid', '{T}: Add {G}.', '1/1'),
	mk('Benevolent Captain', '{2}{W}{U}', 'Legendary Creature — Human Officer', 'Flying\nWhenever Benevolent Captain attacks, draw a card.', '3/3'),
	mk('Furious Warlord', '{2}{R}{G}', 'Legendary Creature — Klingon Warrior', 'Trample, haste', '4/4'),
	mk('Exploration', '{G}', 'Enchantment', 'You may play an additional land on each of your turns.'),
	mk('Strange Anomaly', '{2}{U}', 'Enchantment', 'At the beginning of your upkeep, look at the top card of target player’s library and do something odd with it.'),
]

export const FIX: Record<string, CardDef> = Object.fromEntries(FIXTURE.map((c) => [c.id, c]))

export function fixDeck(names: [string, number][]): string[] {
	const out: string[] = []
	for (const [n, k] of names) for (let i = 0; i < k; i++) out.push(slug(n))
	return out
}

export const FIX_DECKS = {
	uw: {
		commanders: ['benevolent-captain'],
		deck: fixDeck([
			['Plains', 16], ['Island', 16], ['Sol Ring', 1], ['Arcane Signet', 1], ['Talisman of Progress', 1], ['Command Tower', 1], ['Glacial Fortress', 1],
			['Temple of Enlightenment', 1], ['Evolving Wilds', 1], ['Swords to Plowshares', 4], ['Wrath of God', 2], ['Negate', 3], ['Divination', 6],
			['Lightning Greaves', 1], ['Bonesplitter', 2], ['Glorious Anthem', 3], ['Serra Angel', 12], ['Wind Drake', 12], ['Raise the Alarm', 6], ['Strange Anomaly', 9],
		]),
	},
	rg: {
		commanders: ['furious-warlord'],
		deck: fixDeck([
			['Mountain', 16], ['Forest', 18], ['Sol Ring', 1], ['Arcane Signet', 1], ['Command Tower', 1], ['Evolving Wilds', 1], ['Shock', 6], ['Cultivate', 3],
			['Rampant Growth', 4], ['Lightning Greaves', 1], ['Bonesplitter', 2], ['Grizzly Bears', 10], ['Hill Giant', 10], ['Typhoid Rats', 0], ['Colossal Dreadmaw', 8],
			['Elvish Visionary', 8], ['Llanowar Elves', 6], ['Exploration', 3],
		]),
	},
}
