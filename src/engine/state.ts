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
		if (s.combat) {
			s.combat.attackers = s.combat.attackers.filter((x) => x.iid !== iid)
			s.combat.blocks = s.combat.blocks.filter((x) => x.blocker !== iid && x.attacker !== iid)
		}
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

/** Card types, counting a stationed Spacecraft as an artifact creature. */
export function typesOf(s: GameState, p: { card: string; flipped?: boolean; counters?: Record<string, number> }): string[] {
	const r = rulesOf(s, p)
	const extra = (p as { addTypes?: string[] }).addTypes
	if (extra?.length) return [...new Set([...r.types, ...extra])]
	if (r.stationCreatureAt !== undefined && (p.counters?.charge ?? 0) >= r.stationCreatureAt && !r.types.includes('creature')) return [...r.types, 'creature']
	return r.types
}

export function isType(s: GameState, p: { card: string; flipped?: boolean; counters?: Record<string, number> }, t: string): boolean {
	return typesOf(s, p).includes(t)
}

/** Is a threshold ("N+ |" on a Spacecraft) met? */
export const reached = (p: { counters?: Record<string, number> }, n: number | undefined) => n === undefined || (p.counters?.charge ?? 0) >= n

export function colorsOf(s: GameState, card: string): Color[] {
	return def(s, card).colors
}

export function mv(s: GameState, card: string): number {
	return def(s, card).cmc
}

/** Does this permanent (or card) match a filter, from `viewer`'s point of view? */
export function matches(s: GameState, f: Filter, o: { card: string; flipped?: boolean; iid?: number; token?: boolean }, viewer: number, controller: number, sourceIid?: number, perm?: Perm): boolean {
	const r = rulesOf(s, o)
	const types = perm ? typesOf(s, perm) : r.types
	if (f.types.length && !f.types.some((t) => types.includes(t))) return false
	if (f.and?.length && !f.and.every((t) => types.includes(t))) return false
	if (f.not.some((t) => types.includes(t))) return false
	if (f.controller === 'you' && controller !== viewer) return false
	if (f.controller === 'opp' && controller === viewer) return false
	if (f.other && o.iid !== undefined && o.iid === sourceIid) return false
	if (f.subtypes?.length && !f.subtypes.some((st) => r.subtypes.some((x) => x.toLowerCase() === st || x.toLowerCase() + 's' === st) || r.types.includes(st) || r.supertypes.includes(st))) return false
	if (f.maxMv !== undefined && def(s, o.card).cmc > f.maxMv) return false
	if (f.minMv !== undefined && def(s, o.card).cmc < f.minMv) return false
	if (f.token && !o.token) return false
	if (f.minToughness !== undefined && !(perm && pt(s, perm)[1] >= f.minToughness)) return false
	if (f.historic && !(types.includes('artifact') || r.supertypes.includes('legendary') || r.subtypes.includes('Saga'))) return false
	if (f.withCounters && !(perm && Object.values(perm.counters).some((v) => v > 0))) return false
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

/** Characteristic-defining power/toughness ("~'s power and toughness are each equal to …"), by card name. */
export const CDA: Record<string, (s: GameState, p: Perm) => [number, number]> = {}

export function basePT(s: GameState, p: Perm): [number, number] {
	const d = def(s, p.card)
	if (p.faceDown) return [2, 2]
	const cda = CDA[d.name]
	if (cda && !p.flipped) return cda(s, p)
	const face = p.flipped && d.back ? d.back : d
	return [num(face.power), num(face.toughness)]
}

/** Keyword-granting statics the parser can't read, by source card name: (state, source, creature) → keywords. */
export const GRANTS: Record<string, (s: GameState, src: Perm, p: Perm) => string[]> = {}

export function keywords(s: GameState, p: Perm): string[] {
	const own = rulesOf(s, p)
	const out = new Set(own.keywords)
	for (const q of s.battlefield) {
		const g = GRANTS[def(s, q.card).name]
		if (g) for (const k of g(s, q, p)) out.add(k)
	}
	for (const t of own.thresholdKeywords ?? []) if (reached(p, t.n)) t.keywords.forEach((k) => out.add(k))
	for (const m of p.mods) for (const k of m.keywords ?? []) out.add(k)
	for (const q of s.battlefield) {
		const r = rulesOf(s, q)
		for (const st of r.statics) {
			if (!reached(q, st.threshold)) continue
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
			if (!reached(q, st.threshold)) continue
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
