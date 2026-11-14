// Commander rules: command zone, tax, where the commander goes, commander damage, identity mana.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, commanderTax, newGame, tryApply, type Setup } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { findPerm, locate } from './state'
import type { GameState, Intent, Obj } from './types'

const bounce = mk('Unsummon', '{U}', 'Instant', "Return target creature to its owner's hand.")
const tuck = mk('Hinder Path', '{1}{U}', 'Instant', "Put target creature on top of its owner's library.")
const bigHit = mk('Fireball Lite', '{R}', 'Instant', 'Fireball Lite deals 5 damage to target creature.')
const EXTRA = [bounce, tuck, bigHit]

function start(format: Setup['format'] = 'oneVsOne'): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX, ...Object.fromEntries(EXTRA.map((c) => [c.id, c])) }, seed: 11, format, first: 0 })
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
const lands = (s: GameState, p: number, n: number, card: string) => {
	for (let i = 0; i < n; i++) give(s, p, card, 'battlefield')
}
function settleAll(s: GameState, attackers: (s: GameState) => number[] = () => [], until: (s: GameState) => boolean = (x) => !x.stack.length && x.pending.kind === 'priority'): GameState {
	for (let i = 0; i < 80 && !until(s); i++) {
		const p = s.pending
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: p.player === 0 ? attackers(s) : [] })
		else if (p.kind === 'blockers') s = ok(s, { type: 'block', player: p.player, blocks: [] })
		else if (p.kind === 'choose') s = ok(s, { type: 'choose', player: p.player, picks: p.question.options.slice(0, Math.max(1, p.question.min)).map((o) => o.id) })
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
		else break
	}
	return s
}
const cmd = (s: GameState, p: number) => s.players[p].command[0] ?? null
/** Cast player 0's commander from the command zone and let it resolve. */
function castCommander(s: GameState): [GameState, number] {
	const c = cmd(s, 0)!
	s = ok(s, { type: 'cast', player: 0, iid: c.iid })
	s = settleAll(s)
	return [s, c.iid]
}

test('commander: cast from the command zone, tax goes up by {2} each time', () => {
	let s = start()
	lands(s, 0, 4, 'plains')
	lands(s, 0, 4, 'island')
	let iid: number
	;[s, iid] = castCommander(s)
	assert.ok(findPerm(s, iid), 'on the battlefield')
	assert.equal(commanderTax(s, 0, s.players[0].commanders[0]), 2)
	// it dies: back to the command zone
	s.battlefield = s.battlefield.map((p) => (p.iid === iid ? { ...p, damage: 99 } : p))
	s = ok(s, { type: 'pass', player: 0 })
	assert.equal(locate(s, iid)?.zone, 'command', 'died → command zone')
	// second cast costs 4 + 2 = 6 of our 8 lands (they untapped? no — same turn, so use fresh lands)
	for (const p of s.battlefield) if (p.controller === 0) p.tapped = false
	;[s, iid] = castCommander(s)
	assert.ok(findPerm(s, iid))
	assert.equal(s.battlefield.filter((p) => p.controller === 0 && p.tapped).length, 6, 'paid {2} tax')
	assert.equal(commanderTax(s, 0, s.players[0].commanders[0]), 4)
})

test('commander: exiled by Swords goes to the command zone; dies triggers still happen', () => {
	let s = start()
	lands(s, 0, 4, 'plains')
	lands(s, 0, 4, 'island')
	let iid: number
	;[s, iid] = castCommander(s)
	const sw = give(s, 0, 'swords-to-plowshares', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: sw })
	if (s.pending.kind === 'choose') s = ok(s, { type: 'choose', player: 0, picks: [String(iid)] })
	s = settleAll(s)
	assert.equal(locate(s, iid)?.zone, 'command')
	assert.equal(s.players[0].life, 30 + 3)
})

test('commander: bounced to hand stays in hand (and costs no tax from there)', () => {
	let s = start()
	lands(s, 0, 4, 'plains')
	lands(s, 0, 5, 'island')
	let iid: number
	;[s, iid] = castCommander(s)
	const u = give(s, 0, bounce.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: u })
	if (s.pending.kind === 'choose') s = ok(s, { type: 'choose', player: 0, picks: [String(iid)] })
	s = settleAll(s)
	assert.equal(locate(s, iid)?.zone, 'hand', 'rule 903.9b: the owner may leave it in hand')
	for (const p of s.battlefield) if (p.controller === 0) p.tapped = false
	s = ok(s, { type: 'cast', player: 0, iid })
	s = settleAll(s)
	assert.ok(findPerm(s, iid))
	assert.equal(commanderTax(s, 0, s.players[0].commanders[0]), 2, 'casting from hand does not add tax')
})

test('commander: put into the library goes to the command zone instead', () => {
	let s = start()
	lands(s, 0, 4, 'plains')
	lands(s, 0, 6, 'island')
	let iid: number
	;[s, iid] = castCommander(s)
	const t = give(s, 0, tuck.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: t })
	if (s.pending.kind === 'choose') s = ok(s, { type: 'choose', player: 0, picks: [String(iid)] })
	s = settleAll(s)
	assert.equal(locate(s, iid)?.zone, 'command')
})

test('commander damage: 21 combat damage from one commander loses (1v1 Commander), not in Duel Commander', () => {
	for (const format of ['oneVsOne', 'duel'] as const) {
		let s = start(format)
		const iid = cmd(s, 0)!.iid
		// put the commander onto the battlefield directly
		s.players[0].command = []
		s.battlefield.push({ iid, card: s.players[0].commanders[0], owner: 0, commander: true, controller: 0, tapped: false, sick: false, counters: { '+1/+1': 18 }, damage: 0, mods: [] })
		s.players[1].life = 60
		s = ok(s, { type: 'pass', player: 0 })
		s = settleAll(s, () => [iid], (x) => x.step === 'main2' || x.pending.kind === 'over')
		if (format === 'oneVsOne') {
			assert.equal(s.pending.kind, 'over', '21 commander damage')
			assert.match(s.players[1].lost ?? '', /commander/)
		} else {
			assert.notEqual(s.pending.kind, 'over')
			assert.equal(s.players[1].life, 60 - 21)
		}
	}
})

test('commander: Command Tower and Arcane Signet make only colours in the commander’s identity', () => {
	const s = start()
	assert.deepEqual([...s.players[0].identity].sort(), ['U', 'W'])
	const tower = give(s, 0, 'command-tower', 'battlefield')
	let t = ok(s, { type: 'tapForMana', player: 0, iid: tower, ability: 0, color: 'R' })
	assert.equal(t.players[0].pool.R, 0, 'red is outside W/U')
	assert.equal(t.players[0].pool.W + t.players[0].pool.U, 1)
	t = start()
	const sig = give(t, 0, 'arcane-signet', 'battlefield')
	t = ok(t, { type: 'tapForMana', player: 0, iid: sig, ability: 0, color: 'U' })
	assert.equal(t.players[0].pool.U, 1)
})

test('commander: the computer recasts its commander after it dies', async () => {
	const { botStep } = await import('../bot/bot')
	let s = start()
	lands(s, 1, 4, 'mountain')
	lands(s, 1, 4, 'forest')
	// player 1's turn, main phase
	s.active = 1
	s.step = 'main1'
	s.pending = { kind: 'priority', player: 1 }
	s.players[1].commanderCasts[s.players[1].commanders[0]] = 1
	for (let i = 0; i < 6; i++) {
		const n = botStep(s, 1)
		if (!n) break
		s = n
		if (s.battlefield.some((p) => p.commander && p.controller === 1)) break
	}
	assert.ok(s.battlefield.some((p) => p.commander && p.controller === 1), 'recast with tax')
})

test('commander: the computer chump-blocks a commander that would reach 21 commander damage', async () => {
	const { botIntents } = await import('../bot/bot')
	let s = start('oneVsOne')
	const iid = cmd(s, 0)!.iid
	s.players[0].command = []
	s.battlefield.push({ iid, card: s.players[0].commanders[0], owner: 0, commander: true, controller: 0, tapped: false, sick: false, counters: {}, damage: 0, mods: [] })
	const elf = give(s, 1, 'wind-drake', 'battlefield') // a 2/2 flyer: blocking the 3/3 flying commander is a chump
	s.players[1].commanderDamage[s.players[0].commanders[0]] = 18
	s = ok(s, { type: 'pass', player: 0 })
	s = settleAll(s, () => [iid], (x) => x.pending.kind === 'blockers')
	assert.equal(s.pending.kind, 'blockers')
	const [i] = botIntents(s, 1)
	assert.deepEqual(i.type === 'block' ? i.blocks : null, [{ blocker: elf, attacker: iid }], 'life is 30, but 18 + 3 would be 21')
})
