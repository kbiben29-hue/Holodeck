import assert from 'node:assert/strict'
import { test } from 'node:test'
import { botStep } from '../bot/bot'
import { apply, newGame, tryApply } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { parseCost, solvePayment } from './mana'
import { parse } from './rules'
import { findPerm, pt } from './state'
import type { CardDef, GameState, Intent, Obj } from './types'

const R = (c: CardDef) => parse({ name: c.name, oracle: c.oracle, typeLine: c.typeLine })

test('reads mana abilities, lands, triggers, equipment and anthems', () => {
	assert.deepEqual(R(FIX['sol-ring']).manaAbilities[0].mana, ['C', 'C'])
	assert.deepEqual(R(FIX['forest']).manaAbilities[0].mana, ['G'])
	assert.deepEqual(R(FIX['glacial-fortress']).entersTapped, { unlessControl: ['Plains', 'Island'] })
	const tal = R(FIX['talisman-of-progress']).manaAbilities
	assert.equal(tal.length, 2)
	assert.equal(tal[1].pain, 1)
	assert.equal(R(FIX['arcane-signet']).manaAbilities[0].kind, 'identity')
	const wilds = R(FIX['evolving-wilds'])
	assert.equal(wilds.activated.length, 1)
	assert.equal(wilds.activated[0].cost.sacrificeSelf, true)
	assert.equal(wilds.activated[0].compiled?.effects[0].e, 'search')
	const temple = R(FIX['temple-of-enlightenment'])
	assert.equal(temple.entersTapped, 'yes')
	assert.equal(temple.triggers[0].event, 'etb')
	assert.equal(temple.triggers[0].compiled?.effects[0].e, 'scry')
	assert.deepEqual(R(FIX['serra-angel']).keywords, ['flying', 'vigilance'])
	const greaves = R(FIX['lightning-greaves'])
	assert.deepEqual(greaves.statics[0].keywords, ['haste', 'shroud'])
	assert.equal(greaves.activated[0].equip, true)
	assert.equal(R(FIX['glorious-anthem']).statics[0].kind, 'anthem')
	assert.equal(R(FIX['wrath-of-god']).spell?.effects[0].e, 'destroyAll')
	assert.equal(R(FIX['elvish-visionary']).triggers[0].compiled?.effects[0].e, 'draw')
	assert.equal(R(FIX['raise-the-alarm']).spell?.effects[0].e, 'token')
	assert.equal(R(FIX['benevolent-captain']).triggers[0].event, 'attacks')
	assert.equal(R(FIX['strange-anomaly']).fullyAutomated, false)
	assert.equal(R(FIX['shock']).spell?.targets[0].kind, 'any')
})

test('more templates', () => {
	const c = (t: string, type = 'Instant') => parse({ name: 'X', oracle: t, typeLine: type })
	assert.equal(c('Destroy target artifact or enchantment.').spell?.targets.length, 1)
	assert.equal(c('Return target nonland permanent to its owner’s hand.'.replace('’', "'")).spell?.effects[0].e, 'bounce')
	assert.equal(c('Exile target nonland permanent an opponent controls. You lose 3 life.').spell?.effects.length, 2)
	assert.equal(c('Draw three cards.').spell?.effects[0].e, 'draw')
	assert.equal(c('You draw two cards and you lose 2 life.').spell?.effects.length, 2)
	assert.equal(c('Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.', 'Sorcery').spell?.effects[0].e, 'search')
	assert.equal(c('Create a Treasure token.', 'Sorcery').spell?.effects[0].e, 'token')
	assert.equal(c('Target creature gets +3/+3 and gains trample until end of turn.').spell?.effects[0].e, 'pump')
	assert.equal(c('Creatures you control get +1/+1 and gain vigilance until end of turn.').spell?.effects[0].e, 'pumpAll')
	assert.equal(c('Counter target spell.').spell?.targets[0].kind, 'spell')
	assert.equal(c('Each opponent sacrifices a creature of their choice.').spell?.effects[0].e, 'sacrifice')
	const nl = parse({ name: 'Nomad Thing', oracle: 'This land enters tapped unless you control two or more basic lands.\n{T}: Add {R} or {W}.', typeLine: 'Land' })
	assert.deepEqual(nl.entersTapped, { unlessBasics: 2 })
	const ch = parse({ name: 'Everflowing Chalice', oracle: 'Multikicker {2}\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact.', typeLine: 'Artifact' })
	assert.equal(ch.manaAbilities[0].kind, 'charge')
})

test('mana payment uses the right sources', () => {
	const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
	const plan = solvePayment(parseCost('{2}{W}{U}'), 0, pool, [
		{ key: 'a', options: ['W'], amount: 1, weight: 0 },
		{ key: 'b', options: ['C'], amount: 2, weight: 1 },
		{ key: 'c', options: ['W', 'U'], amount: 1, weight: 0 },
	])
	assert.ok(plan)
	assert.equal(plan!.used.length, 3)
	assert.equal(solvePayment(parseCost('{U}{U}'), 0, pool, [{ key: 'a', options: ['W', 'U'], amount: 1, weight: 0 }]), null)
	assert.ok(solvePayment(parseCost('{X}{R}'), 3, pool, [{ key: 'a', options: ['R'], amount: 1, weight: 0 }, { key: 'b', options: ['C'], amount: 2, weight: 0 }, { key: 'c', options: ['G'], amount: 1, weight: 0 }]))
})

// ───────── game helpers ─────────

function start(first = 0): GameState {
	let s = newGame({
		players: [
			{ name: 'Picard', ...FIX_DECKS.uw },
			{ name: 'Worf', ...FIX_DECKS.rg },
		],
		cards: { ...FIX },
		seed: 42,
		format: 'duel',
		first,
	})
	s = apply(s, { type: 'keep', player: first })
	s = apply(s, { type: 'keep', player: 1 - first })
	return s
}

/** Put a named card into a player's zone (taken from anywhere, or made fresh). */
function give(s: GameState, p: number, card: string, zone: 'hand' | 'battlefield', opts: { sick?: boolean; tapped?: boolean } = {}): number {
	const iid = s.nextId++
	const o: Obj = { iid, card, owner: p }
	if (zone === 'hand') s.players[p].hand.push(o)
	else s.battlefield.push({ ...o, controller: p, tapped: !!opts.tapped, sick: opts.sick ?? false, counters: {}, damage: 0, mods: [] })
	return iid
}

const ok = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(r.error)
	return r.state!
}

test('game starts in the first player’s main phase without a draw', () => {
	const s = start(0)
	assert.equal(s.turn, 1)
	assert.equal(s.step, 'main1')
	assert.deepEqual(s.pending, { kind: 'priority', player: 0 })
	assert.equal(s.players[0].hand.length, 7)
	assert.equal(s.players[0].life, 20)
})

test('play a land, cast a creature with automatic payment', () => {
	let s = start(0)
	s.players[0].hand = []
	const isl = give(s, 0, 'island', 'hand')
	give(s, 0, 'plains', 'battlefield')
	give(s, 0, 'plains', 'battlefield')
	const drake = give(s, 0, 'wind-drake', 'hand')
	s = ok(s, { type: 'playLand', player: 0, iid: isl })
	assert.ok(tryApply(s, { type: 'playLand', player: 0, iid: give(s, 0, 'island', 'hand') }).error)
	s = ok(s, { type: 'cast', player: 0, iid: drake })
	// opponent can't respond, so it resolves
	assert.equal(s.stack.length, 0)
	const p = findPerm(s, drake)!
	assert.ok(p)
	assert.equal(p.sick, true)
	assert.equal(s.battlefield.filter((x) => x.controller === 0 && x.tapped).length, 3)
})

test('commander tax and returning to the command zone', () => {
	let s = start(0)
	for (let i = 0; i < 8; i++) give(s, 0, i % 2 ? 'plains' : 'island', 'battlefield')
	const cmd = s.players[0].command[0].iid
	s = ok(s, { type: 'cast', player: 0, iid: cmd })
	assert.ok(findPerm(s, cmd))
	assert.equal(s.players[0].commanderCasts['benevolent-captain'], 1)
	// destroy it by hand: it goes to the command zone instead
	s.players[0].hand.push({ iid: 9999, card: 'wrath-of-god', owner: 0 })
	s = ok(s, { type: 'cast', player: 0, iid: 9999 })
	assert.ok(!findPerm(s, cmd))
	assert.equal(s.players[0].command[0].iid, cmd)
	assert.equal(s.players[0].graveyard.some((o) => o.card === 'wrath-of-god'), true)
	// 4 + 2 tax = 6, only 0 untapped left
	assert.ok(tryApply(s, { type: 'cast', player: 0, iid: cmd }).error?.includes('Not enough mana'))
})

function toCombat(s: GameState): GameState {
	// pass main 1 -> attackers
	return ok(s, { type: 'pass', player: s.active })
}

test('combat: unblocked damage, flying, deathtouch blocks, trample', () => {
	let s = start(0)
	const drake = give(s, 0, 'wind-drake', 'battlefield')
	const dread = give(s, 0, 'colossal-dreadmaw', 'battlefield')
	const bears = give(s, 1, 'grizzly-bears', 'battlefield')
	const rats = give(s, 1, 'typhoid-rats', 'battlefield')
	s = toCombat(s)
	assert.equal(s.pending.kind, 'attackers')
	s = ok(s, { type: 'attack', player: 0, attackers: [drake, dread] })
	assert.equal(s.pending.kind, 'blockers')
	assert.ok(tryApply(s, { type: 'block', player: 1, blocks: [{ blocker: bears, attacker: drake }] }).error)
	s = ok(s, { type: 'block', player: 1, blocks: [{ blocker: rats, attacker: dread }] })
	// drake 2 + trample: 6 power, rats need 1 (deathtouch not relevant for lethal to rats: toughness 1) → 5 tramples over
	assert.equal(s.players[1].life, 20 - 2 - 5)
	assert.ok(!findPerm(s, dread), 'dreadmaw died to deathtouch')
	assert.ok(!findPerm(s, rats))
	assert.equal(s.step, 'main2')
})

test('anthem and equipment change power', () => {
	let s = start(0)
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	give(s, 0, 'glorious-anthem', 'battlefield')
	const bone = give(s, 0, 'bonesplitter', 'battlefield')
	give(s, 0, 'plains', 'battlefield')
	assert.deepEqual(pt(s, findPerm(s, bears)!), [3, 3])
	s = ok(s, { type: 'activate', player: 0, iid: bone, ability: 1 })
	assert.equal(findPerm(s, bone)!.attachedTo, bears)
	assert.deepEqual(pt(s, findPerm(s, bears)!), [5, 3])
})

test('removal, counterspells and triggers', () => {
	let s = start(0)
	s.players[0].hand = []
	s.players[1].hand = []
	give(s, 0, 'plains', 'battlefield')
	give(s, 0, 'island', 'battlefield')
	give(s, 0, 'island', 'battlefield')
	const giant = give(s, 1, 'hill-giant', 'battlefield')
	const stp = give(s, 0, 'swords-to-plowshares', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: stp })
	assert.ok(!findPerm(s, giant))
	assert.equal(s.players[1].life, 23)
	// Elvish Visionary draws on entering
	let t = start(1)
	t.players[1].hand = []
	give(t, 1, 'forest', 'battlefield')
	give(t, 1, 'forest', 'battlefield')
	const ev = give(t, 1, 'elvish-visionary', 'hand')
	t = ok(t, { type: 'cast', player: 1, iid: ev })
	assert.equal(t.players[1].hand.length, 1)
})

test('opponent with a counterspell gets to respond', () => {
	let s = start(0)
	s.players[0].hand = []
	s.players[1].hand = []
	for (let i = 0; i < 3; i++) give(s, 0, 'island', 'battlefield')
	give(s, 1, 'island', 'battlefield')
	give(s, 1, 'island', 'battlefield')
	const div = give(s, 0, 'divination', 'hand')
	const neg = give(s, 1, 'negate', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: div })
	assert.deepEqual(s.pending, { kind: 'priority', player: 1 })
	s = ok(s, { type: 'cast', player: 1, iid: neg })
	assert.equal(s.stack.length, 0)
	assert.equal(s.players[0].hand.length, 0, 'divination was countered')
	assert.ok(s.players[0].graveyard.some((o) => o.card === 'divination'))
})

test('searching with Evolving Wilds and choosing', () => {
	let s = start(0)
	const w = give(s, 0, 'evolving-wilds', 'battlefield')
	s = ok(s, { type: 'activate', player: 0, iid: w, ability: 0 })
	assert.equal(s.pending.kind, 'choose')
	if (s.pending.kind !== 'choose') return
	const pick = s.pending.question.options[0].id
	s = ok(s, { type: 'choose', player: 0, picks: [pick] })
	const land = findPerm(s, Number(pick))!
	assert.ok(land)
	assert.equal(land.tapped, true)
})

test('manual cards ask the player to do them by hand', () => {
	let s = start(0)
	s.players[0].hand = []
	for (let i = 0; i < 3; i++) give(s, 0, 'island', 'battlefield')
	const odd = give(s, 0, 'strange-anomaly', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: odd })
	assert.ok(findPerm(s, odd), 'a permanent with unknown text still resolves')
	const odd2 = mk('Odd Spell', '{U}', 'Instant', 'Do a strange thing with each player’s library.')
	s.cards[odd2.id] = odd2
	give(s, 0, 'island', 'battlefield')
	const iid = give(s, 0, odd2.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid })
	assert.equal(s.pending.kind, 'choose')
	if (s.pending.kind === 'choose') assert.equal(s.pending.question.key, 'manual')
	s = ok(s, { type: 'choose', player: 0, picks: ['done'] })
	assert.ok(s.players[0].graveyard.some((o) => o.iid === iid))
})

test('bot vs bot games finish', () => {
	let finished = 0
	for (let seed = 1; seed <= 12; seed++) {
		let s = newGame({
			players: [
				{ name: 'A', ...FIX_DECKS.uw, bot: true },
				{ name: 'B', ...FIX_DECKS.rg, bot: true },
			],
			cards: { ...FIX },
			seed,
			format: 'duel',
		})
		for (let i = 0; i < 6000 && s.pending.kind !== 'over'; i++) {
			const who = s.pending.player
			const n = botStep(s, who)
			assert.ok(n, `bot stuck: ${JSON.stringify(s.pending).slice(0, 200)}`)
			s = n!
			if (s.turn > 60) break
		}
		if (s.pending.kind === 'over') finished++
	}
	assert.ok(finished >= 10, `only ${finished} games finished`)
})
