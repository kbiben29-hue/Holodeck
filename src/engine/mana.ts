// Mana costs and paying them.

import type { Color, Mana } from './types'

export interface Cost {
	generic: number
	/** Coloured (and colourless {C}) symbols. */
	sym: Partial<Record<Mana, number>>
	/** Hybrid symbols: each entry lists the colours that can pay it ("2" = two generic). */
	hybrid: string[][]
	x: number
	/** Phyrexian symbols (pay the colour or 2 life — we always pay the colour). */
	phyrexian: Color[]
}

export const emptyCost = (): Cost => ({ generic: 0, sym: {}, hybrid: [], x: 0, phyrexian: [] })

export function parseCost(s: string | undefined): Cost {
	const c = emptyCost()
	if (!s) return c
	for (const m of s.matchAll(/\{([^}]+)\}/g)) {
		const t = m[1].toUpperCase()
		if (/^\d+$/.test(t)) c.generic += Number(t)
		else if (t === 'X') c.x++
		else if (['W', 'U', 'B', 'R', 'G', 'C'].includes(t)) c.sym[t as Mana] = (c.sym[t as Mana] ?? 0) + 1
		else if (t.includes('/P')) {
			const col = t.replace('/P', '').split('/')[0] as Color
			c.phyrexian.push(col)
		} else if (t.includes('/')) c.hybrid.push(t.split('/'))
		else if (t === 'S') c.generic++ // snow: treat as generic
	}
	return c
}

export function costTotal(c: Cost, x = 0): number {
	let n = c.generic + c.x * x + c.hybrid.length + c.phyrexian.length
	for (const v of Object.values(c.sym)) n += v ?? 0
	return n
}

export function addCost(a: Cost, generic: number): Cost {
	return { ...a, sym: { ...a.sym }, hybrid: a.hybrid.slice(), phyrexian: a.phyrexian.slice(), generic: Math.max(0, a.generic + generic) }
}

export function costText(c: Cost, x?: number): string {
	let s = ''
	for (let i = 0; i < c.x; i++) s += x === undefined ? '{X}' : ''
	const g = c.generic + (x ?? 0) * c.x
	if (g > 0 || (s === '' && Object.keys(c.sym).length === 0 && c.hybrid.length === 0 && c.phyrexian.length === 0)) s += `{${g}}`
	for (const h of c.hybrid) s += `{${h.join('/')}}`
	for (const p of c.phyrexian) s += `{${p}}`
	for (const m of ['W', 'U', 'B', 'R', 'G', 'C'] as Mana[]) for (let i = 0; i < (c.sym[m] ?? 0); i++) s += `{${m}}`
	return s
}

/** A mana source available for paying: produces `amount` mana, each one of `options`. */
export interface Source {
	key: string
	/** Colours one unit can be. */
	options: Mana[]
	amount: number
	/** All `amount` units must be the same colour. */
	sameColor?: boolean
	/** Life paid when this source makes coloured mana (pain lands, talismans). */
	painColors?: Mana[]
	/** Prefer using this source last (e.g. creatures, sources that cost life). */
	weight: number
}

export interface Payment {
	/** Sources used, with the mana each made. */
	used: { key: string; mana: Mana[] }[]
	/** Mana taken from the pool. */
	fromPool: Partial<Record<Mana, number>>
}

/** Units of mana required: each unit lists colours that can pay it ('*' = any). */
function units(c: Cost, x: number): string[][] {
	const u: string[][] = []
	for (const m of ['W', 'U', 'B', 'R', 'G', 'C'] as Mana[]) for (let i = 0; i < (c.sym[m] ?? 0); i++) u.push([m])
	for (const p of c.phyrexian) u.push([p])
	for (const h of c.hybrid) u.push(h.some((t) => /^\d+$/.test(t)) ? ['*'] : h)
	for (let i = 0; i < c.generic + c.x * x; i++) u.push(['*'])
	return u
}

/**
 * Work out how to pay `cost` from the mana pool and the given untapped sources.
 * Returns null when it can't be paid. Pool mana is used first; specific colours before generic.
 */
export function solvePayment(cost: Cost, x: number, pool: Record<Mana, number>, sources: Source[]): Payment | null {
	const need = units(cost, x)
	need.sort((a, b) => (a[0] === '*' ? 1 : 0) - (b[0] === '*' ? 1 : 0) || a.length - b.length)
	const left = { ...pool }
	const fromPool: Partial<Record<Mana, number>> = {}
	const rest: string[][] = []
	// pool first
	for (const u of need) {
		let paid = false
		const order: Mana[] = u[0] === '*' ? (['C', 'W', 'U', 'B', 'R', 'G'] as Mana[]) : (u as Mana[])
		for (const m of order) {
			if ((left[m] ?? 0) > 0) {
				left[m]--
				fromPool[m] = (fromPool[m] ?? 0) + 1
				paid = true
				break
			}
		}
		if (!paid) rest.push(u)
	}
	if (rest.length === 0) return { used: [], fromPool }
	const srcs = sources.slice().sort((a, b) => a.weight - b.weight || a.options.length - b.options.length)
	const total = srcs.reduce((n, s) => n + s.amount, 0)
	if (total < rest.length) return null
	// depth-first search over sources, coloured units first
	const coloured = rest.filter((u) => u[0] !== '*')
	const generic = rest.length - coloured.length
	const chosen: { key: string; mana: Mana[] }[] = []
	const usedKeys = new Set<string>()
	let steps = 0
	const tryColoured = (i: number, spare: Mana[]): boolean => {
		if (++steps > 20000) return false
		if (i === coloured.length) {
			// generic from spare units first, then from the cheapest remaining sources
			let g = generic - Math.min(generic, spare.length)
			const extra: { key: string; mana: Mana[] }[] = []
			for (const s of srcs) {
				if (g <= 0) break
				if (usedKeys.has(s.key)) continue
				const pick = s.options.includes('C') ? 'C' : s.options[0]
				extra.push({ key: s.key, mana: Array(s.amount).fill(pick) })
				g -= s.amount
			}
			if (g > 0) return false
			chosen.push(...extra)
			return true
		}
		const u = coloured[i] as Mana[]
		// use a spare unit from a multi-mana source already tapped
		const si = spare.findIndex((m) => u.includes(m))
		if (si >= 0) {
			const sp = spare.slice()
			sp.splice(si, 1)
			if (tryColoured(i + 1, sp)) return true
		}
		for (const s of srcs) {
			if (usedKeys.has(s.key)) continue
			const col = u.find((m) => s.options.includes(m))
			if (!col) continue
			usedKeys.add(s.key)
			const made: Mana[] = s.sameColor || s.amount === 1 ? Array(s.amount).fill(col) : [col, ...Array(s.amount - 1).fill(s.options.includes('C') ? 'C' : s.options[0])]
			chosen.push({ key: s.key, mana: made })
			if (tryColoured(i + 1, [...spare, ...made.slice(1)])) return true
			chosen.pop()
			usedKeys.delete(s.key)
		}
		return false
	}
	if (!tryColoured(0, [])) return null
	return { used: chosen, fromPool }
}

export const colorName: Record<Mana, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colourless' }
