import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newGame, apply, tryApply } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { rulesFor } from './rules'
import { findPerm, pt } from './state'
import type { GameState, Intent, Obj } from './types'

// Stand-ins: just enough text for the engine to find each ability; scripts.ts does the rest.
const stargazer = mk('U.S.S. Stargazer, Here and There', '{3}', 'Legendary Artifact Creature — Spacecraft', 'Whenever U.S.S. Stargazer attacks, create a tapped and attacking 4/3 Spacecraft Illusion token with flying. Exile that token at end of combat.', '4/3')
const ownTheDay = mk('Own the Day', '{4}{R}{R}', 'Sorcery', 'Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.')
const passage = mk('Fabled Passage', '', 'Land', '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.')
const arex = mk('Lt. Arex, Ever-Adapting', '{5}{G}{U}', 'Legendary Creature — Edosian Officer', "Trample\nLt. Arex's power and toughness are each equal to the number of differently named lands you control.", '*/*')
const archive = mk("Alhammarret's Archive", '{5}', 'Legendary Artifact', 'If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.')
const vengeance = mk('Right of Vengeance', '{3}{W}', 'Instant', 'Until end of turn, whenever a creature deals combat damage to you, destroy that creature and create a 2/1 red Klingon Warrior creature token with haste.')
const tube = mk('Jefferies Tube', '{1}', 'Artifact', '{4}, {T}: Draw a card. You may put a land card from your hand onto the battlefield tapped.')
const sword = mk('The Sword of Kahless', '{4}', 'Legendary Artifact — Equipment', 'Equipped creature gets +2/+2 and has "Whenever this creature attacks, look at the top five cards of your library. You may put a Klingon or Warrior creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."\nEquip {2}')
const warrior = mk('Klingon Recruit', '{1}{R}', 'Creature — Klingon Warrior', '', '2/2')
const guardian = mk('The Guardian of Forever', '{3}', 'Legendary Artifact Creature — Construct', "Defender\n{4}, Sacrifice another nontoken creature: Return that card to the battlefield under its owner's control at the beginning of the next end step.", '0/6')
const ALL = [stargazer, ownTheDay, passage, arex, archive, vengeance, tube, sword, warrior, guardian]

function start(): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX, ...Object.fromEntries(ALL.map((c) => [c.id, c])) }, seed: 7, format: 'duel', first: 0 })
	s = apply(s, { type: 'keep', player: 0 })
	s = apply(s, { type: 'keep', player: 1 })
	s.players[0].hand = []
	s.players[1].hand = []
	return s
}
function give(s: GameState, p: number, card: string, zone: 'hand' | 'battlefield' | 'graveyard' | 'library'): number {
	const iid = s.nextId++
	const o: Obj = { iid, card, owner: p }
	if (zone === 'battlefield') s.battlefield.push({ ...o, controller: p, tapped: false, sick: false, counters: {}, damage: 0, mods: [] })
	else if (zone === 'library') s.players[p].library.unshift(o)
	else s.players[p][zone].push(o)
	return iid
}
const ok = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(r.error)
	return r.state!
}
const lands = (s: GameState, p: number, n: number, card = 'island') => {
	for (let i = 0; i < n; i++) give(s, p, card, 'battlefield')
}
/** Pass, take the first legal choice and decline to block until `done` holds. */
function until(s: GameState, done: (s: GameState) => boolean, attackers: (s: GameState) => number[] = () => []): GameState {
	for (let i = 0; i < 80 && !done(s); i++) {
		const p = s.pending
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: p.player === 0 ? attackers(s) : [] })
		else if (p.kind === 'blockers') s = ok(s, { type: 'block', player: p.player, blocks: [] })
		else if (p.kind === 'choose') s = ok(s, { type: 'choose', player: p.player, picks: p.question.options.slice(0, Math.max(1, p.question.min)).map((o) => o.id) })
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
		else break
	}
	return s
}

test('Stargazer brings an attacking token that is exiled at end of combat', () => {
	let s = start()
	const sg = give(s, 0, stargazer.id, 'battlefield')
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'main2', () => [sg])
	assert.ok(s.log.some((l) => l === 'Spacecraft Illusion deals 4 damage to B.'), 'the token attacked')
	assert.equal(s.players[1].life, 20 - 8)
	assert.ok(!s.battlefield.some((p) => s.cards[p.card]?.name === 'Spacecraft Illusion'), 'exiled at end of combat')
})

test('Own the Day untaps the attackers and adds a combat phase', () => {
	let s = start()
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	lands(s, 0, 6, 'mountain')
	const otd = give(s, 0, ownTheDay.id, 'hand')
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'main2', () => [bears])
	assert.equal(s.players[1].life, 18)
	s = ok(s, { type: 'cast', player: 0, iid: otd })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	assert.equal(findPerm(s, bears)?.tapped, false, 'untapped')
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'main2' || x.step === 'end', () => [bears])
	assert.equal(s.players[1].life, 16, 'attacked twice')
})

test('Fabled Passage untaps the land with four lands; Lt. Arex counts land names; Archive doubles', () => {
	let s = start()
	lands(s, 0, 2, 'island')
	lands(s, 0, 1, 'plains')
	const fp = give(s, 0, passage.id, 'battlefield')
	give(s, 0, 'forest', 'library')
	s = ok(s, { type: 'activate', player: 0, iid: fp, ability: rulesFor(passage).activated[0].index })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	const forest = s.battlefield.find((p) => p.card === 'forest')
	assert.ok(forest && !forest.tapped, 'fetched land untapped (4 lands)')
	const ax = give(s, 0, arex.id, 'battlefield')
	assert.deepEqual(pt(s, findPerm(s, ax)!), [3, 3], 'island, plains, forest')
	assert.ok(rulesFor(arex).fullyAutomated)
	give(s, 0, archive.id, 'battlefield')
	lands(s, 0, 4, 'island')
	const t = give(s, 0, tube.id, 'battlefield')
	const before = s.players[0].hand.length
	s = ok(s, { type: 'activate', player: 0, iid: t, ability: rulesFor(tube).activated[0].index })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	assert.equal(s.players[0].hand.length, before + 2, 'Archive: draw two instead')
})

test('Right of Vengeance destroys the creature that hits you', () => {
	let s = start()
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	lands(s, 1, 4, 'plains')
	const rv = give(s, 1, vengeance.id, 'hand')
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'blockers' || x.pending.kind === 'blockers', () => [bears])
	if (s.pending.kind === 'blockers') s = ok(s, { type: 'block', player: 1, blocks: [] })
	// opponent casts it in the declare blockers step
	for (let i = 0; i < 4 && !(s.pending.kind === 'priority' && s.pending.player === 1); i++) if (s.pending.kind === 'priority') s = ok(s, { type: 'pass', player: s.pending.player })
	s = ok(s, { type: 'cast', player: 1, iid: rv })
	s = until(s, (x) => x.step === 'main2')
	assert.equal(s.players[1].life, 18)
	assert.ok(!findPerm(s, bears), 'destroyed')
	assert.ok(s.battlefield.some((p) => p.controller === 1 && s.cards[p.card]?.name === 'Klingon Warrior'))
})


test('The Sword of Kahless gives +2/+2 and finds a Warrior when its creature attacks', () => {
	let s = start()
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	const sw = give(s, 0, sword.id, 'battlefield')
	findPerm(s, sw)!.attachedTo = bears
	assert.deepEqual(pt(s, findPerm(s, bears)!), [4, 4])
	give(s, 0, warrior.id, 'library')
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'main2', () => [bears])
	assert.ok(s.battlefield.some((p) => p.card === warrior.id && p.controller === 0), 'Warrior put onto the battlefield')
	assert.equal(s.players[1].life, 16)
})

test('The Guardian of Forever brings the sacrificed creature back at the end step', () => {
	let s = start()
	const g = give(s, 0, guardian.id, 'battlefield')
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	lands(s, 0, 4, 'plains')
	s = ok(s, { type: 'activate', player: 0, iid: g, ability: rulesFor(guardian).activated[0].index })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	assert.ok(!findPerm(s, bears), 'sacrificed')
	s = until(s, (x) => x.step === 'cleanup' || x.active === 1)
	assert.ok(findPerm(s, bears), 'returned at the end step')
	assert.ok(rulesFor(guardian).fullyAutomated)
})
