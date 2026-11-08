// Runs compiled effects (from rules.ts) and the few card scripts in named.ts.
// A Task re-runs from the start whenever it needs a new answer (deterministic replay): `ctx.ask`
// returns a recorded answer or throws NeedChoice, and the engine discards that run's changes.

import { NAMED } from './named'
import type { Compiled, Effect, Filter, TargetSpec } from './rules'
import { cardName, def, findPerm, hasKw, isCreature, log, matches, opp, permName, pt, rulesOf } from './state'
import type { ChoiceOption, GameState, Perm, Question, StackItem, Target, Task } from './types'

export class NeedChoice {
	constructor(
		public player: number,
		public question: Question,
	) {}
}

export class Illegal extends Error {}

export interface Ctx {
	s: GameState
	task: Task
	ask(player: number, q: Question): string[]
}

export function makeCtx(s: GameState, task: Task): Ctx {
	return {
		s,
		task,
		ask(player, q) {
			const rec = task.answers[q.key]
			if (rec) return rec
			if (q.options.length === 0) return []
			if (q.min === q.options.length && q.max === q.options.length && !q.ordered) return q.options.map((o) => o.id)
			if (q.options.length === 1 && q.min === 1) return [q.options[0].id]
			throw new NeedChoice(player, q)
		},
	}
}

// Hooks supplied by engine.ts (avoids an import cycle at module load).
export interface EngineHooks {
	move(s: GameState, iid: number, to: 'graveyard' | 'exile' | 'hand' | 'library' | 'libraryBottom' | 'battlefield', opts?: { controller?: number; tapped?: boolean; cause?: string }): void
	destroy(s: GameState, iid: number): boolean
	damage(s: GameState, src: { card: string; controller: number; iid?: number }, target: Target, n: number, combat?: boolean): void
	draw(s: GameState, p: number, n: number): void
	createToken(s: GameState, p: number, card: string, n: number, tapped?: boolean): number[]
	makeTokenDef(s: GameState, e: Extract<Effect, { e: 'token' }>, x: number): string
	gainLife(s: GameState, p: number, n: number): void
	shuffle(s: GameState, p: number): void
}

let hooks: EngineHooks
export function setHooks(h: EngineHooks) {
	hooks = h
}
export const H = () => hooks

// ───────── targets ─────────

function shielded(s: GameState, p: Perm, chooser: number, srcCard: string): boolean {
	const kws = rulesOf(s, p).keywords.concat(p.mods.flatMap((m) => m.keywords ?? []))
	const all = new Set(kws)
	for (const q of s.battlefield) if (q.attachedTo === p.iid) for (const st of rulesOf(s, q).statics) st.keywords.forEach((k) => all.add(k))
	if (all.has('shroud')) return true
	if (all.has('hexproof') && p.controller !== chooser) return true
	const cols = def(s, srcCard).colors
	const names: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }
	for (const k of all) if (k.startsWith('protection from') && cols.some((c) => k.includes(names[c]))) return true
	return false
}

export function targetOptions(s: GameState, spec: TargetSpec, chooser: number, src: { card: string; iid?: number }): ChoiceOption[] {
	const out: ChoiceOption[] = []
	const permOk = (p: Perm, f: Filter | null) => (!f || matches(s, f, p, chooser, p.controller, src.iid, p)) && !shielded(s, p, chooser, src.card)
	const addPerm = (p: Perm) => {
		const [pw, t] = pt(s, p)
		out.push({ id: `p:${p.iid}`, label: `${permName(s, p)}${isCreature(s, p) ? ` ${pw}/${t}` : ''} (${s.players[p.controller].name})`, card: p.card, iid: p.iid, score: (p.controller === chooser ? -1 : 1) * (def(s, p.card).cmc + 1) })
	}
	const addPlayer = (i: number) => out.push({ id: `pl:${i}`, label: s.players[i].name, score: i === chooser ? -5 : 5 })
	if (spec.kind === 'perm') for (const p of s.battlefield) permOk(p, spec.filter) && addPerm(p)
	if (spec.kind === 'any' || spec.kind === 'creatureOrPlayer') {
		for (const p of s.battlefield) if ((isCreature(s, p) || (spec.kind === 'any' && rulesOf(s, p).types.includes('planeswalker'))) && permOk(p, null)) addPerm(p)
		s.players.forEach((_, i) => addPlayer(i))
	}
	if (spec.kind === 'player') s.players.forEach((_, i) => (!spec.opponent || i !== chooser) && addPlayer(i))
	if (spec.kind === 'spell')
		for (const it of s.stack) {
			if (it.kind !== 'spell') continue
			if (matches(s, spec.filter, { card: it.card }, chooser, it.controller)) out.push({ id: `s:${it.sid}`, label: `${cardName(s, it.card)} (${s.players[it.controller].name}'s spell)`, card: it.card, score: it.controller === chooser ? -5 : def(s, it.card).cmc })
		}
	return out
}

export const parseTargetId = (id: string): Target => {
	const [k, v] = id.split(':')
	return { kind: k === 'p' ? 'perm' : k === 'pl' ? 'player' : 'stack', id: Number(v) }
}

export function chooseTargets(ctx: Ctx, compiled: Compiled, chooser: number, src: { card: string; iid?: number }, keyPrefix: string): Target[] | null {
	const out: Target[] = []
	for (let i = 0; i < compiled.targets.length; i++) {
		const spec = compiled.targets[i]
		const opts = targetOptions(ctx.s, spec, chooser, src).filter((o) => !out.some((t) => `${t.kind === 'perm' ? 'p' : t.kind === 'player' ? 'pl' : 's'}:${t.id}` === o.id))
		if (!opts.length) return null
		const [pick] = ctx.ask(chooser, { key: `${keyPrefix}t${i}`, prompt: `${cardName(ctx.s, src.card)}: choose ${describeSpec(spec)}`, options: opts, min: 1, max: 1 })
		out.push(parseTargetId(pick))
	}
	return out
}

export function describeSpec(spec: TargetSpec): string {
	if (spec.kind === 'any') return 'any target'
	if (spec.kind === 'player') return spec.opponent ? 'target opponent' : 'target player'
	if (spec.kind === 'creatureOrPlayer') return 'target creature or player'
	if (spec.kind === 'spell') return 'target spell'
	const f = spec.filter
	return `target ${f.not.map((x) => 'non' + x + ' ').join('')}${f.types.join(' or ') || 'permanent'}${f.controller === 'opp' ? ' an opponent controls' : f.controller === 'you' ? ' you control' : ''}`
}

/** Is a chosen target still legal on resolution? */
export function stillLegal(s: GameState, spec: TargetSpec, t: Target, controller: number, src: { card: string; iid?: number }): boolean {
	if (t.kind === 'player') return !s.players[t.id].lost
	if (t.kind === 'stack') return s.stack.some((it) => it.sid === t.id)
	const p = findPerm(s, t.id)
	if (!p) return false
	if (spec.kind === 'perm') return matches(s, spec.filter, p, controller, p.controller, src.iid, p) && !shielded(s, p, controller, src.card)
	return true
}

// ───────── running effects ─────────

const N = (n: number | 'x', x: number) => (n === 'x' ? x : n)

export function runCompiled(ctx: Ctx, item: StackItem, compiled: Compiled, keyPrefix = 'e') {
	const s = ctx.s
	const me = item.controller
	const x = item.x ?? 0
	const src = { card: item.card, controller: me, iid: item.iid }
	const legal = compiled.targets.map((spec, i) => (item.targets[i] ? stillLegal(s, spec, item.targets[i], me, src) : false))
	if (compiled.optional) {
		const [yn] = ctx.ask(me, { key: `${keyPrefix}opt`, prompt: `${cardName(s, item.card)}: use this ability?`, options: [{ id: 'yes', label: 'Yes', score: 1 }, { id: 'no', label: 'No' }], min: 1, max: 1 })
		if (yn === 'no') return
	}
	const tgt = (i: number): Target | null => (legal[i] ? item.targets[i] : null)
	const tperm = (i: number) => {
		const t = tgt(i)
		return t && t.kind === 'perm' ? findPerm(s, t.id) : undefined
	}
	const targetPlayer = () => {
		const i = compiled.targets.findIndex((sp) => sp.kind === 'player')
		const t = i >= 0 ? tgt(i) : null
		return t ? t.id : null
	}
	compiled.effects.forEach((e, ei) => {
		const k = `${keyPrefix}${ei}`
		switch (e.e) {
			case 'draw': {
				const n = N(e.n, x)
				if (e.who === 'you') H().draw(s, me, n)
				else if (e.who === 'each') s.players.forEach((_, i) => H().draw(s, i, n))
				else {
					const p = targetPlayer()
					if (p !== null) H().draw(s, p, n)
				}
				break
			}
			case 'life': {
				const n = N(e.n, x)
				if (e.who === 'you') H().gainLife(s, me, n)
				else if (e.who === 'each') s.players.forEach((_, i) => H().gainLife(s, i, n))
				else if (e.who === 'eachOpp') H().gainLife(s, opp(me), n)
				break
			}
			case 'loseLife': {
				const n = N(e.n, x)
				const lose = (p: number) => {
					s.players[p].life -= n
					log(s, `${s.players[p].name} loses ${n} life.`)
				}
				if (e.who === 'you') lose(me)
				else if (e.who === 'eachOpp') lose(opp(me))
				else if (e.who === 'each') s.players.forEach((_, i) => lose(i))
				else {
					const p = targetPlayer()
					if (p !== null) lose(p)
				}
				break
			}
			case 'destroy': {
				const p = tperm(e.t)
				if (p) H().destroy(s, p.iid)
				break
			}
			case 'exile': {
				const p = tperm(e.t)
				if (p) H().move(s, p.iid, 'exile')
				break
			}
			case 'bounce': {
				const p = tperm(e.t)
				if (p) H().move(s, p.iid, 'hand')
				break
			}
			case 'tap': {
				const p = tperm(e.t)
				if (p) p.tapped = !e.untap
				break
			}
			case 'destroyAll':
			case 'exileAll':
			case 'bounceAll': {
				const victims = s.battlefield.filter((p) => matches(s, e.filter, p, me, p.controller, item.iid, p)).map((p) => p.iid)
				for (const v of victims) {
					if (e.e === 'destroyAll') H().destroy(s, v)
					else H().move(s, v, e.e === 'exileAll' ? 'exile' : 'hand')
				}
				break
			}
			case 'damage': {
				const t = tgt(e.t)
				if (t) H().damage(s, src, t, N(e.n, x))
				break
			}
			case 'damageEach': {
				const n = N(e.n, x)
				if (e.filter) for (const p of s.battlefield.filter((p) => matches(s, e.filter!, p, me, p.controller, item.iid, p))) H().damage(s, src, { kind: 'perm', id: p.iid }, n)
				if (e.players) s.players.forEach((_, i) => (e.players === 'each' || i !== me) && H().damage(s, src, { kind: 'player', id: i }, n))
				break
			}
			case 'counter': {
				const t = tgt(e.t)
				if (t && t.kind === 'stack') {
					const it = s.stack.find((z) => z.sid === t.id)
					if (it && rulesOf(s, { card: it.card }).canBeCountered) {
						if (it.obj && !it.copy) H().move(s, it.obj.iid, 'graveyard')
						else s.stack = s.stack.filter((z) => z.sid !== t.id)
						log(s, `${cardName(s, it.card)} is countered.`)
					}
				}
				break
			}
			case 'token': {
				const card = H().makeTokenDef(s, e, x)
				H().createToken(s, me, card, N(e.n, x), e.tapped)
				break
			}
			case 'counters': {
				const n = N(e.n, x)
				const put = (p: Perm) => {
					p.counters[e.kind] = (p.counters[e.kind] ?? 0) + n
				}
				if (e.t === 'self') {
					const p = findPerm(s, item.iid)
					if (p) put(p)
				} else if (e.t === 'each') s.battlefield.filter((p) => matches(s, e.filter!, p, me, p.controller, item.iid, p)).forEach(put)
				else {
					const p = tperm(e.t)
					if (p) put(p)
				}
				break
			}
			case 'pump': {
				const p = e.t === 'self' ? findPerm(s, item.iid) : tperm(e.t)
				if (p) p.mods.push({ power: e.p, toughness: e.tough, keywords: e.keywords, until: 'eot' })
				break
			}
			case 'pumpAll': {
				for (const p of s.battlefield.filter((p) => isCreature(s, p) && matches(s, e.filter, p, me, p.controller, item.iid, p))) p.mods.push({ power: e.p, toughness: e.tough, keywords: e.keywords, until: 'eot' })
				break
			}
			case 'search':
				search(ctx, me, e, k)
				break
			case 'scry':
			case 'surveil':
				scry(ctx, me, e.n, e.e === 'surveil', k)
				break
			case 'mill': {
				const who = e.who === 'you' ? [me] : e.who === 'eachOpp' ? [opp(me)] : [targetPlayer() ?? opp(me)]
				for (const p of who) mill(s, p, e.n)
				break
			}
			case 'discard': {
				const who = e.who === 'you' ? me : e.who === 'eachOpp' ? opp(me) : (targetPlayer() ?? opp(me))
				discard(ctx, who, e.n, k)
				break
			}
			case 'sacrifice': {
				const who = e.who === 'you' ? me : e.who === 'eachOpp' ? opp(me) : (targetPlayer() ?? opp(me))
				const opts = s.battlefield.filter((p) => p.controller === who && matches(s, e.filter, p, who, p.controller, undefined, p))
				if (opts.length) {
					const [pick] = ctx.ask(who, { key: k, prompt: `Sacrifice ${e.filter.types.join(' or ') || 'a permanent'}`, options: opts.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: -def(s, p.card).cmc })), min: 1, max: 1 })
					H().move(s, Number(pick), 'graveyard', { cause: 'sacrifice' })
				}
				break
			}
			case 'returnFromGy': {
				const gy = s.players[me].graveyard.filter((o) => matches(s, e.filter, o, me, me))
				if (gy.length) {
					const [pick] = ctx.ask(me, { key: k, prompt: 'Choose a card in your graveyard', options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true })
					H().move(s, Number(pick), e.dest)
				}
				break
			}
			case 'shuffle':
				H().shuffle(s, me)
				break
			case 'putLand': {
				const lands = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('land'))
				if (lands.length) {
					const picks = ctx.ask(me, { key: k, prompt: 'You may put a land from your hand onto the battlefield', options: lands.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 })), min: 0, max: 1, cards: true })
					for (const id of picks) H().move(s, Number(id), 'battlefield')
				}
				break
			}
			case 'mana':
				break
			case 'named':
				NAMED[e.name]?.run(ctx, item, legal)
				break
		}
	})
}

export function search(ctx: Ctx, me: number, e: Extract<Effect, { e: 'search' }>, key: string) {
	const s = ctx.s
	const lib = s.players[me].library
	const ok = lib.filter((o) => {
		if (e.names) return e.names.some((n) => rulesOf(s, o).subtypes.some((st) => st.toLowerCase() === n) || cardName(s, o.card).toLowerCase() === n)
		return matches(s, e.filter, o, me, me)
	})
	// one option per distinct card name keeps the list short
	const seen = new Map<string, number>()
	const opts: ChoiceOption[] = []
	for (const o of ok) {
		if ((seen.get(o.card) ?? 0) >= e.count) continue
		seen.set(o.card, (seen.get(o.card) ?? 0) + 1)
		opts.push({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 })
	}
	const picks = opts.length ? ctx.ask(me, { key, prompt: `Search your library (up to ${e.count})`, options: opts, min: 0, max: Math.min(e.count, opts.length), cards: true }) : []
	const names = picks.map((id) => cardName(s, lib.find((o) => o.iid === Number(id))!.card))
	for (const id of picks) {
		if (e.dest === 'battlefield') H().move(s, Number(id), 'battlefield', { tapped: e.tapped })
		else if (e.dest === 'hand') H().move(s, Number(id), 'hand')
	}
	H().shuffle(s, me)
	for (const id of picks) if (e.dest === 'top') H().move(s, Number(id), 'library')
	if (picks.length) log(s, `${s.players[me].name} searches their library${e.dest === 'hand' ? ` and puts ${picks.length} card${picks.length > 1 ? 's' : ''} into their hand` : ` and puts ${names.join(', ')} ${e.dest === 'top' ? 'on top' : 'onto the battlefield'}`}.`)
	else log(s, `${s.players[me].name} searches their library.`)
}

export function scry(ctx: Ctx, me: number, n: number, surveil: boolean, key: string) {
	const s = ctx.s
	const lib = s.players[me].library
	const top = lib.slice(0, n)
	if (!top.length) return
	const keep = ctx.ask(me, {
		key,
		prompt: surveil ? `Surveil ${n}: choose cards to keep on top (the rest go to your graveyard)` : `Scry ${n}: choose cards to keep on top, in order (the rest go to the bottom)`,
		options: top.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes('land') ? 0 : 1 })),
		min: 0,
		max: top.length,
		cards: true,
		ordered: true,
	})
	const kept = keep.map((id) => top.find((o) => o.iid === Number(id))!).filter(Boolean)
	const rest = top.filter((o) => !kept.includes(o))
	lib.splice(0, top.length, ...kept)
	if (surveil) for (const o of rest) H().move(s, o.iid, 'graveyard')
	else lib.push(...rest)
	log(s, `${s.players[me].name} ${surveil ? 'surveils' : 'scries'} ${n}${rest.length ? ` (${rest.length} ${surveil ? 'to the graveyard' : 'to the bottom'})` : ''}.`)
}

export function mill(s: GameState, p: number, n: number) {
	const top = s.players[p].library.slice(0, n)
	for (const o of top) H().move(s, o.iid, 'graveyard')
	if (top.length) log(s, `${s.players[p].name} mills ${top.length}.`)
}

export function discard(ctx: Ctx, p: number, n: number, key: string) {
	const s = ctx.s
	const hand = s.players[p].hand
	if (!hand.length) return
	const k = Math.min(n, hand.length)
	const picks = ctx.ask(p, { key, prompt: `Discard ${k} card${k > 1 ? 's' : ''}`, options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: k, max: k, cards: true })
	for (const id of picks) H().move(s, Number(id), 'graveyard')
	log(s, `${s.players[p].name} discards ${picks.length}.`)
}

export { hasKw }
