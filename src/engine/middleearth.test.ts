// The Lord of the Rings mechanics: the Ring tempts you, amass, the monarch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, canBlock, newGame, tryApply } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { findPerm, pt } from './state'
import type { GameState, Intent, Obj } from './types'

const tempter = mk('Ringwraith Scout', '{1}{B}', 'Creature — Wraith', 'When this creature enters, the Ring tempts you.', '2/2')
const amasser = mk('Orc Muster', '{1}{B}', 'Sorcery', 'Amass Orcs 2.')
const crown = mk('Royal Summons', '{1}{W}', 'Sorcery', 'You become the monarch.')
const ALL = [tempter, amasser, crown]

function start(): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX, ...Object.fromEntries(ALL.map((c) => [c.id, c])) }, seed: 4, format: 'duel', first: 0 })
	s = apply(s, { type: 'keep', player: 0 })
	s = apply(s, { type: 'keep', player: 1 })
	s.players[0].hand = []
	s.players[1].hand = []
	return s
}
function give(s: GameState, p: number, card: string, zone: 'hand' | 'battlefield'): number {
	const iid = s.nextId++
	const o: Obj = { iid, card, owner: p }
	if (zone === 'battlefield') s.battlefield.push({ ...o, controller: p, tapped: false, sick: false, counters: {}, damage: 0, mods: [] })
	else s.players[p].hand.push(o)
	return iid
}
const ok = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(r.error)
	return r.state!
}
function until(s: GameState, done: (s: GameState) => boolean, attackers: () => number[] = () => [], pick?: (opts: string[]) => string) {
	for (let i = 0; i < 80 && !done(s); i++) {
		const p = s.pending
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: p.player === 0 ? attackers() : [] })
		else if (p.kind === 'blockers') s = ok(s, { type: 'block', player: p.player, blocks: [] })
		else if (p.kind === 'choose') {
			const ids = p.question.options.map((o) => o.id)
			s = ok(s, { type: 'choose', player: p.player, picks: pick ? [pick(ids)] : ids.slice(0, Math.max(1, p.question.min)) })
		} else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
		else break
	}
	return s
}
const lands = (s: GameState, p: number, n: number, c: string) => {
	for (let i = 0; i < n; i++) give(s, p, c, 'battlefield')
}

test('the Ring tempts you: a Ring-bearer, then stronger abilities', () => {
	let s = start()
	lands(s, 0, 4, 'swamp')
	const bears = give(s, 0, 'grizzly-bears', 'battlefield')
	const w = give(s, 0, tempter.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: w })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority', undefined, (ids) => ids.find((i) => Number(i) === bears) ?? ids[0])
	assert.deepEqual(s.players[0].ring, { level: 1, bearer: bears })
	// level 1: a creature with greater power can't block the Ring-bearer
	const giant = give(s, 1, 'hill-giant', 'battlefield')
	assert.equal(canBlock(s, findPerm(s, giant)!, findPerm(s, bears)!), false)
	const rats = give(s, 1, 'typhoid-rats', 'battlefield')
	assert.equal(canBlock(s, findPerm(s, rats)!, findPerm(s, bears)!), true)
	// level 4: combat damage makes the opponent lose 3 more
	s.players[0].ring = { level: 4, bearer: bears }
	s.battlefield = s.battlefield.filter((p) => p.iid !== rats && p.iid !== giant)
	s = ok(s, { type: 'pass', player: 0 })
	s = until(s, (x) => x.step === 'main2', () => [bears], (ids) => ids[0])
	assert.equal(s.players[1].life, 20 - 2 - 3)
	assert.equal(s.players[0].hand.length >= 0, true)
})

test('amass Orcs: one Army that keeps growing', () => {
	let s = start()
	lands(s, 0, 4, 'swamp')
	for (let i = 0; i < 2; i++) {
		const c = give(s, 0, amasser.id, 'hand')
		s = ok(s, { type: 'cast', player: 0, iid: c })
		s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	}
	const armies = s.battlefield.filter((p) => s.cards[p.card]?.name === 'Orc Army')
	assert.equal(armies.length, 1)
	assert.deepEqual(pt(s, armies[0]), [4, 4])
})

test('the monarch draws at the end step and loses the crown to combat damage', () => {
	let s = start()
	lands(s, 0, 2, 'plains')
	const c = give(s, 0, crown.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: c })
	s = until(s, (x) => !x.stack.length && x.pending.kind === 'priority')
	assert.equal(s.monarch, 0)
	const hand = s.players[0].hand.length
	s = until(s, (x) => x.active === 1)
	assert.equal(s.players[0].hand.length, hand + 1, 'drew as the monarch')
	// the opponent hits us with a creature and takes the crown
	const bears = give(s, 1, 'grizzly-bears', 'battlefield')
	s = until(s, (x) => x.pending.kind === 'attackers' || x.step === 'main2')
	if (s.pending.kind === 'attackers') s = ok(s, { type: 'attack', player: 1, attackers: [bears] })
	s = until(s, (x) => x.step === 'main2' || x.active === 0)
	assert.equal(s.monarch, 1)
})
