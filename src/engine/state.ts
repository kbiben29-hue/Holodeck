// Shared helpers over GameState: finding objects, moving cards between zones, characteristics.

import { rulesFor, type Filter, type Rules } from './rules'
import type { CardDef, Color, GameState, Mana, Obj, Perm, PlayerState, StackItem, Zone } from './types'

export const clone = <T>(x: T): T => structuredClone(x)

/** Copy a game state. Card definitions are shared (they never change; new tokens replace the map). */
export function cloneState(s: GameState): GameState {
	const { cards, ...rest } = s
	return { ...structuredClone(rest), cards } as GameState
}

export const opp = (p: number) => 1 - p

export function def(s: GameState, id: string): CardDef {
	return (
		s.cards[id] ?? {
			id,
			name: id,
			manaCost: '',
			cmc: 0,
			typeLine: 'Card',
			oracle: '',
			colors: [],
			identity: [],
			keywords: [],
			missing: true,
		}
	)
}

export const cardName = (s: GameState, id: string) => def(s, id).name

export function permName(s: GameState, p: Perm): string {
	const d = def(s, p.card)
	if (p.faceDown) return 'Face-down card'
	return p.flipped && d.back ? d.back.name : d.name
}

export function rulesOf(s: GameState, p: { card: string; flipped?: boolean }): Rules {
	return rulesFor(def(s, p.card), !!p.flipped)
}

export function findPerm(s: GameState, iid: number): Perm | undefined {
	return s.battlefield.find((p) => p.iid === iid)
}

export function log(s: GameState, msg: string) {
	s.log.push(msg)
	if (s.log.length > 400) s.log.splice(0, s.log.length - 400)
}

export const ZONES: Exclude<Zone, 'battlefield' | 'stack'>[] = ['library', 'hand', 'graveyard', 'exile', 'command']

/** Locate an object by iid anywhere. */
export function locate(s: GameState, iid: number): { zone: Zone; player: number; obj: Obj } | null {
	const perm = findPerm(s, iid)
	if (perm) return { zone: 'battlefield', player: perm.controller, obj: perm }
	for (let p = 0; p < s.players.length; p++) {
		for (const z of ZONES) {
			const o = s.players[p][z].find((x) => x.iid === iid)
			if (o) return { zone: z, player: p, obj: o }
		}
	}
	for (const it of s.stack) if (it.kind === 'spell' && it.obj?.iid === iid) return { zone: 'stack', player: it.controller, obj: it.obj }
	return null
}

/** Remove an object from wherever it is (not the stack). Returns it. */
export function detach(s: GameState, iid: number): { obj: Obj; from: Zone } | null {
	const i = s.battlefield.findIndex((p) => p.iid === iid)
	if (i >= 0) {
		const p = s.battlefield[i]
		s.battlefield.splice(i, 1)
		// unattach things attached to it
		for (const q of s.battlefield) if (q.attachedTo === iid) q.attachedTo = undefined
		return { obj: { iid: p.iid, card: p.card, owner: p.owner, token: p.token, commander: p.commander }, from: 'battlefield' }
	}
	for (const pl of s.players)
		for (const z of ZONES) {
			const j = pl[z].findIndex((x) => x.iid === iid)
			if (j >= 0) {
				const [o] = pl[z].splice(j, 1)
				return { obj: o, from: z }
			}
		}
	const k = s.stack.findIndex((it) => it.kind === 'spell' && it.obj?.iid === iid)
	if (k >= 0) {
		const it = s.stack.splice(k, 1)[0]
		return { obj: it.obj!, from: 'stack' }
	}
	return null
}

export function newPerm(s: GameState, o: Obj, controller: number, opts: { tapped?: boolean; flipped?: boolean } = {}): Perm {
	return {
		iid: o.iid,
		card: o.card,
		owner: o.owner,
		token: o.token,
		commander: o.commander,
		controller,
		tapped: !!opts.tapped,
		sick: true,
		counters: {},
		damage: 0,
		mods: [],
		flipped: opts.flipped,
	}
}

export function player(s: GameState, i: number): PlayerState {
	return s.players[i]
}

export function isType(s: GameState, p: { card: string; flipped?: boolean }, t: string): boolean {
	return rulesOf(s, p).types.includes(t)
}

export function colorsOf(s: GameState, card: string): Color[] {
	return def(s, card).colors
}

export function mv(s: GameState, card: string): number {
	return def(s, card).cmc
}

/** Does this permanent (or card) match a filter, from `viewer`'s point of view? */
export function matches(s: GameState, f: Filter, o: { card: string; flipped?: boolean; iid?: number; token?: boolean }, viewer: number, controller: number, sourceIid?: number, perm?: Perm): boolean {
	const r = rulesOf(s, o)
	if (f.types.length && !f.types.some((t) => r.types.includes(t))) return false
	if (f.not.some((t) => r.types.includes(t))) return false
	if (f.controller === 'you' && controller !== viewer) return false
	if (f.controller === 'opp' && controller === viewer) return false
	if (f.other && o.iid !== undefined && o.iid === sourceIid) return false
	if (f.subtypes?.length && !f.subtypes.some((st) => r.subtypes.some((x) => x.toLowerCase() === st || x.toLowerCase() + 's' === st) || r.types.includes(st) || r.supertypes.includes(st))) return false
	if (f.maxMv !== undefined && def(s, o.card).cmc > f.maxMv) return false
	if (f.colors?.length && !f.colors.some((c) => def(s, o.card).colors.includes(c))) return false
	if (f.nonColors?.length && f.nonColors.some((c) => def(s, o.card).colors.includes(c))) return false
	if (f.nonToken && o.token) return false
	if (f.basic && !r.supertypes.includes('basic')) return false
	if (perm) {
		if (f.tapped === true && !perm.tapped) return false
		if (f.tapped === false && perm.tapped) return false
		if (f.attacking && !s.combat?.attackers.some((a) => a.iid === perm.iid)) return false
	}
	return true
}

// ───────── characteristics ─────────

const num = (x: string | undefined) => {
	const n = parseInt(x ?? '0', 10)
	return Number.isFinite(n) ? n : 0
}

export function basePT(s: GameState, p: Perm): [number, number] {
	const d = def(s, p.card)
	if (p.faceDown) return [2, 2]
	const face = p.flipped && d.back ? d.back : d
	return [num(face.power), num(face.toughness)]
}

export function keywords(s: GameState, p: Perm): string[] {
	const out = new Set(rulesOf(s, p).keywords)
	for (const m of p.mods) for (const k of m.keywords ?? []) out.add(k)
	for (const q of s.battlefield) {
		const r = rulesOf(s, q)
		for (const st of r.statics) {
			if (st.kind === 'anthem') {
				if (q.controller === p.controller && isType(s, p, 'creature') && matches(s, st.filter!, p, q.controller, p.controller, q.iid, p)) for (const k of st.keywords) out.add(k)
			} else if (q.attachedTo === p.iid) for (const k of st.keywords) out.add(k)
		}
	}
	return [...out]
}

export const hasKw = (s: GameState, p: Perm, k: string) => keywords(s, p).includes(k)

export function pt(s: GameState, p: Perm): [number, number] {
	let [pw, t] = basePT(s, p)
	pw += (p.counters['+1/+1'] ?? 0) - (p.counters['-1/-1'] ?? 0)
	t += (p.counters['+1/+1'] ?? 0) - (p.counters['-1/-1'] ?? 0)
	for (const m of p.mods) {
		pw += m.power
		t += m.toughness
	}
	for (const q of s.battlefield) {
		const r = rulesOf(s, q)
		for (const st of r.statics) {
			if (st.kind === 'anthem') {
				if (q.controller === p.controller && matches(s, st.filter!, p, q.controller, p.controller, q.iid, p)) {
					pw += st.power
					t += st.toughness
				}
			} else if (q.attachedTo === p.iid) {
				pw += st.power
				t += st.toughness
			}
		}
	}
	return [pw, t]
}

export function isCreature(s: GameState, p: Perm): boolean {
	return isType(s, p, 'creature') || !!p.mods.some((m) => m.note === 'creature')
}

export function emptyPool(): Record<Mana, number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
}

export function stackLabel(s: GameState, it: StackItem): string {
	return it.kind === 'spell' ? cardName(s, it.card) : `${cardName(s, it.card)} ability`
}
