// Arena-style priority: your own spells resolve without a second click unless you hold full control;
// steps you mark as stops always give you priority.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, newGame, tryApply } from './engine'
import { FIX, FIX_DECKS } from './fixture'
import type { GameState, Intent, Obj } from './types'

function start(): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX }, seed: 3, format: 'duel', first: 0 })
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

test('arena: your own spell resolves without clicking Resolve; full control keeps priority', () => {
	for (const full of [false, true]) {
		let s = start()
		for (let i = 0; i < 3; i++) give(s, 0, 'island', 'battlefield')
		for (let i = 0; i < 5; i++) give(s, 0, 'plains', 'battlefield')
		const div = give(s, 0, 'divination', 'hand')
		give(s, 0, 'raise-the-alarm', 'hand') // an instant we could respond with, so we'd normally get a stop
		if (full) s = ok(s, { type: 'manual', player: 0, m: { op: 'prefs', player: 0, fullControl: true } })
		s = ok(s, { type: 'cast', player: 0, iid: div })
		if (full) {
			assert.equal(s.stack.length, 1, 'still on the stack')
			assert.equal(s.pending.kind === 'priority' && s.pending.player, 0, 'we keep priority')
		} else assert.equal(s.stack.length, 0, 'resolved straight away')
	}
})

test('arena: a stop on the opponent’s upkeep gives you priority there', () => {
	let s = start()
	s = ok(s, { type: 'manual', player: 0, m: { op: 'prefs', player: 0, stops: ['upkeep'] } })
	// pass through our turn to theirs
	for (let i = 0; i < 40 && !(s.active === 1 && s.step === 'upkeep'); i++) {
		const p = s.pending
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: [] })
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
		else break
	}
	assert.equal(s.active, 1)
	assert.equal(s.step, 'upkeep')
	assert.deepEqual(s.pending, { kind: 'priority', player: 0 }, 'stopped for us on their upkeep')
})
