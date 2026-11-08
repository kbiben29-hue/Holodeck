// "Ensign" — a simple greedy computer opponent. It plays a land, casts the biggest things it can,
// equips, attacks when its creatures survive, blocks to stay alive or to trade up, and answers
// questions by the option scores. Cards it can't play automatically it mostly leaves alone.

import { abilityProblem, canAttack, canBlock, canCast, canPlayLand, tryApply } from '../engine/engine'
import { def, findPerm, hasKw, isCreature, keywords, opp, pt, rulesOf } from '../engine/state'
import type { GameState, Intent, Perm } from '../engine/types'

/** Candidate intents in order of preference; the caller uses the first legal one. */
export function botIntents(s: GameState, me: number): Intent[] {
	const pend = s.pending
	if (pend.kind === 'over') return []
	if (pend.kind === 'mulligan' && pend.player === me) {
		const lands = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('land')).length
		const ok = (lands >= 2 && lands <= 5) || s.players[me].mulligans >= 2
		return [{ type: ok ? 'keep' : 'mulligan', player: me }]
	}
	if (pend.kind === 'bottom' && pend.player === me) {
		const hand = s.players[me].hand.slice()
		const lands = hand.filter((o) => rulesOf(s, o).types.includes('land'))
		const score = (o: (typeof hand)[0]) => (rulesOf(s, o).types.includes('land') ? (lands.length > 3 ? 5 : -5) : def(s, o.card).cmc)
		hand.sort((a, b) => score(b) - score(a))
		return [{ type: 'bottom', player: me, iids: hand.slice(0, pend.count).map((o) => o.iid) }]
	}
	if (pend.kind === 'choose' && pend.player === me) {
		const q = pend.question
		if (q.key === 'manual') return [{ type: 'choose', player: me, picks: ['done'] }]
		const sorted = q.options.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
		let n = q.min
		if (q.ordered) n = Math.max(q.min, sorted.filter((o) => (o.score ?? 0) > 0).length)
		else if (q.max > q.min) n = Math.max(q.min, Math.min(q.max, sorted.filter((o) => (o.score ?? 0) > 0).length))
		return [{ type: 'choose', player: me, picks: sorted.slice(0, Math.min(q.max, n)).map((o) => o.id) }]
	}
	if (pend.kind === 'attackers' && pend.player === me) return [{ type: 'attack', player: me, attackers: chooseAttackers(s, me) }, { type: 'attack', player: me, attackers: [] }]
	if (pend.kind === 'blockers' && pend.player === me) return [{ type: 'block', player: me, blocks: chooseBlocks(s, me) }, { type: 'block', player: me, blocks: [] }]
	if (pend.kind !== 'priority' || pend.player !== me) return []
	const out: Intent[] = []
	const pl = s.players[me]
	// land
	const lands = pl.hand.filter((o) => rulesOf(s, o).types.includes('land'))
	for (const l of lands) if (!canPlayLand(s, me, l.iid)) out.push({ type: 'playLand', player: me, iid: l.iid })
	// spells, biggest first; commanders count as cards in hand
	const cards = [...pl.command, ...pl.hand].filter((o) => !rulesOf(s, o).types.includes('land'))
	const scored = cards
		.map((o) => {
			const r = rulesOf(s, o)
			const isSpell = r.types.includes('instant') || r.types.includes('sorcery')
			let v = def(s, o.card).cmc + (o.commander ? 1.5 : 0)
			if (isSpell && !r.spell) v -= 100 // can't do it automatically
			if (isSpell && r.spell?.effects.some((e) => e.e === 'counter')) v -= 100
			if (isSpell && r.spell?.effects.some((e) => e.e === 'destroyAll' || e.e === 'exileAll')) v += boardWipeValue(s, me)
			if (isSpell && r.spell?.targets.length && r.spell.effects.some((e) => e.e === 'destroy' || e.e === 'exile') && !s.battlefield.some((p) => p.controller !== me && isCreature(s, p))) v -= 100
			if (!isSpell && !r.fullyAutomated && !r.types.includes('creature') && !r.types.includes('artifact')) v -= 1
			return { o, v }
		})
		.filter((x) => x.v > -50)
		.sort((a, b) => b.v - a.v)
	for (const { o } of scored) if (!canCast(s, me, o.iid)) out.push({ type: 'cast', player: me, iid: o.iid })
	// equip unattached equipment to the best creature
	for (const p of s.battlefield) {
		if (p.controller !== me || p.attachedTo !== undefined) continue
		for (const a of rulesOf(s, p).activated) if (a.equip && !abilityProblem(s, me, p, a) && s.battlefield.some((c) => c.controller === me && isCreature(s, c))) out.push({ type: 'activate', player: me, iid: p.iid, ability: a.index })
	}
	// simple auto abilities on our own stuff (draw a card, make tokens…), not every turn-wasting one
	for (const p of s.battlefield) {
		if (p.controller !== me) continue
		for (const a of rulesOf(s, p).activated) {
			if (a.equip || !a.compiled || a.cost.sacrificeSelf || a.cost.life || a.loyalty) continue
			if (!a.compiled.effects.every((e) => ['draw', 'token', 'counters', 'scry', 'life'].includes(e.e))) continue
			if (s.stack.length || !(s.step === 'main2' || s.step === 'end')) continue
			if (!abilityProblem(s, me, p, a)) out.push({ type: 'activate', player: me, iid: p.iid, ability: a.index })
		}
	}
	out.push({ type: 'pass', player: me })
	return out
}

function boardWipeValue(s: GameState, me: number): number {
	const mine = s.battlefield.filter((p) => p.controller === me && isCreature(s, p)).reduce((n, p) => n + def(s, p.card).cmc, 0)
	const theirs = s.battlefield.filter((p) => p.controller !== me && isCreature(s, p)).reduce((n, p) => n + def(s, p.card).cmc, 0)
	return theirs - mine * 1.5 - 4
}

function chooseAttackers(s: GameState, me: number): number[] {
	const mine = s.battlefield.filter((p) => p.controller === me && canAttack(s, p))
	const theirs = s.battlefield.filter((p) => p.controller === opp(me) && isCreature(s, p) && !p.tapped)
	const out: number[] = []
	const oppLife = s.players[opp(me)].life
	const totalPower = mine.reduce((n, p) => n + Math.max(0, pt(s, p)[0]), 0)
	for (const a of mine) {
		const [ap, at] = pt(s, a)
		if (ap <= 0) continue
		const blockers = theirs.filter((b) => canBlock(s, b, a))
		const dies = blockers.some((b) => {
			const [bp] = pt(s, b)
			return bp >= at || hasKw(s, b, 'deathtouch')
		})
		const evasive = blockers.length === 0
		if (evasive || !dies || totalPower >= oppLife + blockers.length * 2) out.push(a.iid)
	}
	return out
}

function chooseBlocks(s: GameState, me: number): { blocker: number; attacker: number }[] {
	const c = s.combat
	if (!c) return []
	const attackers = c.attackers.map((a) => findPerm(s, a.iid)).filter(Boolean) as Perm[]
	attackers.sort((a, b) => pt(s, b)[0] - pt(s, a)[0])
	const free = s.battlefield.filter((p) => p.controller === me && isCreature(s, p) && !p.tapped)
	const blocks: { blocker: number; attacker: number }[] = []
	let incoming = attackers.reduce((n, a) => n + Math.max(0, pt(s, a)[0]), 0)
	const life = s.players[me].life
	for (const a of attackers) {
		const [ap, at] = pt(s, a)
		const menace = keywords(s, a).includes('menace')
		const can = free.filter((b) => !blocks.some((x) => x.blocker === b.iid) && canBlock(s, b, a))
		if (!can.length || menace) continue
		// a block that kills it and survives
		let pick = can.find((b) => {
			const [bp, bt] = pt(s, b)
			return (bp >= at || hasKw(s, b, 'deathtouch')) && (bt > ap && !hasKw(s, a, 'deathtouch'))
		})
		// a block that survives
		pick ??= can.find((b) => pt(s, b)[1] > ap && !hasKw(s, a, 'deathtouch'))
		// a good trade
		pick ??= can.find((b) => (pt(s, b)[0] >= at || hasKw(s, b, 'deathtouch')) && def(s, b.card).cmc <= def(s, a.card).cmc)
		// chump when the damage would kill us
		if (!pick && incoming >= life) pick = can.slice().sort((x, y) => def(s, x.card).cmc - def(s, y.card).cmc)[0]
		if (pick) {
			blocks.push({ blocker: pick.iid, attacker: a.iid })
			if (!hasKw(s, a, 'trample')) incoming -= ap
		}
	}
	return blocks
}

/** Pick and apply the bot's move. Returns the new state, or null if the bot has nothing to do. */
export function botStep(s: GameState, me: number): GameState | null {
	for (const intent of botIntents(s, me)) {
		const r = tryApply(s, intent)
		if (r.state) return r.state
	}
	return null
}

/** Who must act now (for the bot loop and the UI). */
export function actor(s: GameState): number | null {
	const p = s.pending
	return p.kind === 'over' ? null : p.player
}
