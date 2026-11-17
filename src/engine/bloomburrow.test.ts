// Bloomburrow mechanics: offspring (a 1/1 copy) and gift (the opponent gets something, you get the bonus).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, newGame, tryApply } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { pt } from './state'
import type { GameState, Intent, Obj } from './types'

const pup = mk('Burrow Pup', '{1}{G}', 'Creature — Raccoon', 'Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)', '3/3')
const snack = mk('Acorn Feast', '{1}{G}', 'Sorcery', 'Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nYou gain 2 life. If the gift was promised, draw two cards.')
const turnGift = mk('Long Nap', '{G}', 'Sorcery', 'Gift an extra turn\nYou gain 1 life.')
const ALL = [pup, snack, turnGift]

function start(): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX, ...Object.fromEntries(ALL.map((c) => [c.id, c])) }, seed: 9, format: 'duel', first: 0 })
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
/** Answer choices with the given option ids (first match wins), then settle. */
function cast(s: GameState, iid: number, answer: string) {
	s = ok(s, { type: 'cast', player: 0, iid })
	for (let i = 0; i < 20 && (s.stack.length || s.pending.kind === 'choose'); i++) {
		const p = s.pending
		if (p.kind === 'choose') s = ok(s, { type: 'choose', player: p.player, picks: [p.question.options.find((o) => o.id === answer)?.id ?? p.question.options[0].id] })
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
	}
	return s
}
const forest = (s: GameState, n: number) => {
	for (let i = 0; i < n; i++) give(s, 0, 'forest', 'battlefield')
}

test('offspring: pay extra for a 1/1 token copy', () => {
	let s = start()
	forest(s, 4)
	s = cast(s, give(s, 0, pup.id, 'hand'), '1')
	const pups = s.battlefield.filter((p) => p.card === pup.id)
	assert.equal(pups.length, 2)
	assert.deepEqual(pups.map((p) => pt(s, p)).sort(), [[1, 1], [3, 3]])
})

test('gift a card: the opponent draws, and the bonus happens', () => {
	let s = start()
	forest(s, 2)
	const [h0, h1] = [s.players[0].hand.length, s.players[1].hand.length]
	s = cast(s, give(s, 0, snack.id, 'hand'), 'yes')
	assert.equal(s.players[1].hand.length, h1 + 1, 'the gift')
	assert.equal(s.players[0].hand.length, h0 + 2, 'the bonus')
	assert.equal(s.players[0].life, 22)
	let t = start()
	forest(t, 2)
	t = cast(t, give(t, 0, snack.id, 'hand'), 'no')
	assert.equal(t.players[0].hand.length, h0, 'no gift, no bonus')
})

test('gift an extra turn: the opponent goes twice, then we do', () => {
	let s = start()
	forest(s, 1)
	s = cast(s, give(s, 0, turnGift.id, 'hand'), 'yes')
	const order: number[] = []
	let last = s.turn
	for (let i = 0; i < 200 && order.length < 3; i++) {
		const p = s.pending
		if (s.turn !== last) {
			order.push(s.active)
			last = s.turn
		}
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: [] })
		else if (p.kind === 'blockers') s = ok(s, { type: 'block', player: p.player, blocks: [] })
		else if (p.kind === 'choose') s = ok(s, { type: 'choose', player: p.player, picks: p.question.options.slice(0, p.question.min).map((o) => o.id) })
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
	}
	assert.deepEqual(order, [1, 1, 0])
})
