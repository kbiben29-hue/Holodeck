// Bot-vs-bot games with the stand-in decks, every state checked against the invariants.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { botStep } from '../bot/bot'
import { newGame } from './engine'
import { FIX, FIX_DECKS } from './fixture'
import { invariantErrors } from './invariants'
import { ST } from './startrek.fixture'

const GAMES = Number(process.env.FUZZ ?? 24)

test(`fuzz: ${GAMES} bot games keep every invariant`, () => {
	const problems: string[] = []
	for (let seed = 1; seed <= GAMES; seed++) {
		const format = (['duel', 'oneVsOne', 'classic'] as const)[seed % 3]
		let s = newGame({ players: [{ name: 'UW', ...FIX_DECKS.uw, bot: true }, { name: 'RG', ...FIX_DECKS.rg, bot: true }], cards: { ...FIX, ...ST }, seed: 7000 + seed, format })
		for (let step = 0; step < 20000 && s.pending.kind !== 'over' && s.turn <= 60; step++) {
			const next = botStep(s, s.pending.player)
			if (!next) {
				problems.push(`game ${seed}: stuck at ${JSON.stringify(s.pending).slice(0, 160)}`)
				break
			}
			s = next
			const errs = invariantErrors(s)
			if (errs.length) {
				problems.push(`game ${seed} turn ${s.turn} ${s.step}: ${errs.slice(0, 3).join('; ')} — after: ${s.log.slice(-3).join(' | ')}`)
				break
			}
		}
	}
	assert.deepEqual(problems, [])
})

// Star Trek stand-ins plus the scripted cards: commanders with triggers, extra combats, equipment, sagas.
import { mk, fixDeck } from './fixture'
const EXTRA = [
	mk('U.S.S. Stargazer, Here and There', '{3}', 'Legendary Artifact Creature — Spacecraft', 'Whenever U.S.S. Stargazer attacks, create a tapped and attacking 4/3 Spacecraft Illusion token with flying. Exile that token at end of combat.', '4/3'),
	mk('Own the Day', '{4}{R}{R}', 'Sorcery', 'Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.'),
	mk('World at War', '{3}{R}{R}', 'Sorcery', "After the second main phase this turn, there's an additional combat phase followed by an additional main phase. At the beginning of that combat, untap all creatures that attacked this turn.\nRebound"),
	mk("Alhammarret's Archive", '{5}', 'Legendary Artifact', 'If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.'),
	mk('Right of Vengeance', '{3}{W}', 'Instant', 'Until end of turn, whenever a creature deals combat damage to you, destroy that creature and create a 2/1 red Klingon Warrior creature token with haste.'),
	mk('The Sword of Kahless', '{4}', 'Legendary Artifact — Equipment', 'Equipped creature gets +2/+2 and has "Whenever this creature attacks, look at the top five cards of your library. You may put a Klingon or Warrior creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."\nEquip {2}'),
	mk('Klingon Recruit', '{1}{R}', 'Creature — Klingon Warrior', '', '2/2'),
	mk('The Guardian of Forever', '{3}', 'Legendary Artifact Creature — Construct', "Defender\n{4}, Sacrifice another nontoken creature: Return that card to the battlefield under its owner's control at the beginning of the next end step.", '0/6'),
	mk('Unsummon', '{U}', 'Instant', "Return target creature to its owner's hand."),
	mk('Hinder Path', '{1}{U}', 'Instant', "Put target creature on top of its owner's library."),
	mk('Curzon Dax, Bound by Blood', '{2}{R}{W}', 'Legendary Creature — Trill Warrior', 'Whenever another Klingon or Warrior you control dies, Curzon Dax deals 1 damage to each opponent.\nWhen Curzon Dax dies, you may put a creature card with mana value 3 or less from your hand onto the battlefield.', '4/3'),
	mk('Combat Celebrant', '{2}{R}', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", '4/1'),
	mk('Scute Swarm', '{2}{G}', 'Creature — Insect', "Landfall — Whenever a land you control enters, create a 1/1 green Insect creature token. If you control six or more lands, create a token that's a copy of this creature instead.", '1/1'),
]
const lands5: [string, number][] = [['Plains', 8], ['Island', 7], ['Swamp', 7], ['Mountain', 7], ['Forest', 7], ['Sol Ring', 1], ['Arcane Signet', 1], ['Command Tower', 1]]
const deckOf = (names: [string, number][]) => fixDeck([...lands5, ...names])
const DECK_A = { commanders: ['jean-luc-picard-luminary'], deck: deckOf([['Ro Laren, Double Agent', 4], ['Rom and Leeta, Unlikely Pair', 4], ['Dr. Pulaski, Cynical Clinician', 4], ['Commander William Riker', 4], ['Dispatch', 3], ['U.S.S. Stargazer, Here and There', 3], ['Own the Day', 2], ['The Guardian of Forever', 2], ['Unsummon', 4], ['Hinder Path', 3], ["Alhammarret's Archive", 2], ['Captain Kirk, Boldly Going', 2], ['Starship Enterprise', 2], ['Scute Swarm', 3], ['Serra Angel', 6], ['Swords to Plowshares', 4], ['Divination', 7]]) }
const DECK_B = { commanders: ['worf-defiant-commander'], deck: deckOf([['Gnarling Targ', 4], ['Kurn, Son of Mogh', 4], ['Worf, Son of Mogh', 3], ['Klingon Recruit', 8], ['Right of Vengeance', 3], ['The Sword of Kahless', 2], ['World at War', 2], ['Curzon Dax, Bound by Blood', 2], ['Combat Celebrant', 4], ['The Borg Queen', 2], ['Hill Giant', 8], ['Shock', 6], ['Typhoid Rats', 6], ['Grizzly Bears', 6]]) }

test(`fuzz: ${GAMES} Star Trek stand-in games keep every invariant`, () => {
	const cards = { ...FIX, ...ST, ...Object.fromEntries(EXTRA.map((c) => [c.id, c])) }
	const problems: string[] = []
	const stats = { turns: 0, commanderCasts: 0, extraCombats: 0, over: 0 }
	for (let seed = 1; seed <= GAMES; seed++) {
		const format = (['duel', 'oneVsOne', 'classic'] as const)[seed % 3]
		let s = newGame({ players: [{ name: 'Fed', ...DECK_A, bot: true }, { name: 'Kli', ...DECK_B, bot: true }], cards, seed: 9000 + seed, format })
		for (let step = 0; step < 30000 && s.pending.kind !== 'over' && s.turn <= 60; step++) {
			const next = botStep(s, s.pending.player)
			if (!next) {
				problems.push(`game ${seed}: stuck at ${JSON.stringify(s.pending).slice(0, 200)} — ${s.log.slice(-3).join(' | ')}`)
				break
			}
			s = next
			const errs = invariantErrors(s)
			if (errs.length) {
				problems.push(`game ${seed} turn ${s.turn} ${s.step}: ${errs.slice(0, 3).join('; ')} — after: ${s.log.slice(-4).join(' | ')}`)
				break
			}
		}
		stats.turns += s.turn
		stats.over += s.pending.kind === 'over' ? 1 : 0
		stats.commanderCasts += s.players.reduce((n, p) => n + Object.values(p.commanderCasts).reduce((a, b) => a + b, 0), 0)
		stats.extraCombats += s.log.filter((l) => /additional combat phase\.$/.test(l)).length
		if (process.env.FUZZ_STATS) for (const l of s.log) if (/Own the Day|World at War|Celebrant|Stargazer|Sword of Kahless|Guardian|Hinder|Unsummon|Vengeance/.test(l)) (stats as Record<string, unknown>)[l.slice(0, 60)] = ((stats as Record<string, number>)[l.slice(0, 60)] ?? 0) + 1
	}
	if (process.env.FUZZ_STATS) console.log(stats)
	assert.deepEqual(problems, [])
})
