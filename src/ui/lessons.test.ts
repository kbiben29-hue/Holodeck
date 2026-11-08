import assert from 'node:assert/strict'
import { test } from 'node:test'
import { botStep } from '../bot/bot'
import { tryApply } from '../engine/engine'
import { FIX } from '../engine/fixture'
import { findPerm, isCreature, pt } from '../engine/state'
import { ST } from '../engine/startrek.fixture'
import type { GameState, Intent } from '../engine/types'
import { coachFor, INTRO } from './coach'
import { DRILLS, drillCoach } from './lessons'

const cards = { ...FIX, ...ST }

const go = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(`${JSON.stringify(i)}: ${r.error}`)
	return r.state!
}

/** Let the Ensign act and answer "do it by hand" prompts for us, until it's our normal decision. */
function settle(s: GameState): GameState {
	for (let i = 0; i < 50 && s.pending.kind !== 'over'; i++) {
		const p = s.pending
		if (p.player === 1) {
			s = botStep(s, 1)!
			continue
		}
		if (p.kind === 'choose' && p.question.key === 'manual') {
			s = go(s, { type: 'choose', player: 0, picks: ['skip'] })
			continue
		}
		break
	}
	return s
}
const passUntilEmpty = (s: GameState) => {
	for (let i = 0; i < 20 && s.stack.length && s.pending.kind === 'priority' && s.pending.player === 0; i++) s = settle(go(s, { type: 'pass', player: 0 }))
	return s
}
const byName = (s: GameState, p: number, name: string) => s.battlefield.find((q) => q.controller === p && s.cards[q.card]?.name === name)!

test('every drill can be solved', () => {
	for (const d of DRILLS) {
		const start = d.build(cards, 7)
		let s = start
		assert.ok(drillCoach(d, s, start), `${d.id}: has a first step`)
		if (d.id === 'fed-seek') {
			s = settle(go(s, { type: 'activate', player: 0, iid: byName(s, 0, 'Commander William Riker').iid, ability: 1 }))
			s = passUntilEmpty(s)
		}
		if (d.id === 'kli-battlefront' || d.id === 'borg-swarm' || d.id === 'land-enterprise') {
			if (d.id === 'borg-swarm') {
				const disp = s.players[0].hand.find((o) => o.card === 'dispatch')!
				s = settle(go(s, { type: 'cast', player: 0, iid: disp.iid }))
				if (s.pending.kind === 'choose') {
					const kirk = byName(s, 1, 'Captain Kirk, Boldly Going')
					s = settle(go(s, { type: 'choose', player: 0, picks: [`p:${kirk.iid}`] }))
				}
				s = passUntilEmpty(s)
				assert.ok(!s.battlefield.some((q) => q.controller === 1 && isCreature(s, q)), 'Kirk exiled by metalcraft')
				const q = byName(s, 0, 'The Borg Queen')
				assert.deepEqual(pt(s, q), [6, 6])
			}
			if (d.id === 'land-enterprise') {
				const forest = s.players[0].hand.find((o) => o.card === 'forest')!
				s = settle(go(s, { type: 'playLand', player: 0, iid: forest.iid }))
				s = passUntilEmpty(s)
				const e = byName(s, 0, 'Starship Enterprise')
				assert.equal(e.counters.charge, 16)
				assert.ok(isCreature(s, e))
				assert.deepEqual(pt(s, e), [7, 9])
			}
			s = settle(go(s, { type: 'pass', player: 0 }))
			assert.equal(s.pending.kind, 'attackers', d.id)
			const attackers = d.id === 'land-enterprise' ? [byName(s, 0, 'Starship Enterprise').iid] : s.battlefield.filter((q) => q.controller === 0 && isCreature(s, q)).map((q) => q.iid)
			s = settle(go(s, { type: 'attack', player: 0, attackers }))
			s = passUntilEmpty(s)
			for (let i = 0; i < 10 && s.pending.kind === 'priority' && s.pending.player === 0 && s.players[1].life > 0; i++) s = passUntilEmpty(settle(go(s, { type: 'pass', player: 0 })))
		}
		assert.ok(d.success(s, start), `${d.id} not solved: opp life ${s.players[1].life}, pending ${JSON.stringify(s.pending).slice(0, 120)}, log: ${s.log.slice(-6).join(' | ')}`)
		void findPerm
	}
})

test('the coach always has something to say in a practice game', () => {
	assert.ok(INTRO.length >= 4)
	const d = DRILLS[0]
	const s = d.build(cards, 3)
	const c = coachFor(s, 0, new Set())
	assert.ok(c && c.title)
})
