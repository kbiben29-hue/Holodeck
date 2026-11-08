// Build a game position directly (combo drills and tests): skips the mulligans and puts chosen cards
// into hands and onto the battlefield. Pure and deterministic, like the rest of the engine.

import { apply, newGame, type Setup } from './engine'
import type { GameState, Obj } from './types'

export interface PermSpec {
	id: string
	tapped?: boolean
	/** Summoning sick (default false: it has been here since your last turn). */
	sick?: boolean
	counters?: Record<string, number>
	/** A token made up for the drill: name, P/T and type line. */
	token?: { name: string; power: number; toughness: number; types: string; keywords?: string[] }
}

export interface SideSpec {
	/** Card ids in hand (the rest of the opening hand goes back into the library). */
	hand?: string[]
	battlefield?: PermSpec[]
	life?: number
	libraryTop?: string[]
	/** Cards drawn so far this turn. */
	drawn?: number
}

export function scenario(setup: Setup, sides: [SideSpec, SideSpec]): GameState {
	let s = newGame({ ...setup, first: 0 })
	s = apply(s, { type: 'keep', player: 0 })
	s = apply(s, { type: 'keep', player: 1 })
	s.turn = 3
	s.log = [`Drill: ${s.players[0].name} vs ${s.players[1].name}.`]
	const take = (p: number, id: string): Obj => {
		const pl = s.players[p]
		for (const zone of [pl.library, pl.hand]) {
			const i = zone.findIndex((o) => o.card === id)
			if (i >= 0) return zone.splice(i, 1)[0]
		}
		return { iid: s.nextId++, card: id, owner: p }
	}
	sides.forEach((spec, p) => {
		const pl = s.players[p]
		if (spec.hand) {
			pl.library.push(...pl.hand)
			pl.hand = []
			for (const id of spec.hand) pl.hand.push(take(p, id))
		}
		for (const b of spec.battlefield ?? []) {
			if (b.token) continue
			const o = take(p, b.id)
			s.battlefield.push({ ...o, controller: p, tapped: !!b.tapped, sick: !!b.sick, counters: { ...(b.counters ?? {}) }, damage: 0, mods: [] })
		}
		if (spec.life !== undefined) pl.life = spec.life
		for (const id of (spec.libraryTop ?? []).slice().reverse()) pl.library.unshift(take(p, id))
		pl.drawsThisTurn = spec.drawn ?? 1
	})
	sides.forEach((spec, p) => {
		for (const b of spec.battlefield ?? []) {
			if (!b.token) continue
			s = apply(s, { type: 'manual', player: p, m: { op: 'customToken', player: p, name: b.token.name, power: b.token.power, toughness: b.token.toughness, types: b.token.types, count: 1, keywords: b.token.keywords } })
			const perm = s.battlefield[s.battlefield.length - 1]
			perm.sick = !!b.sick
			perm.tapped = !!b.tapped
		}
	})
	s.log.push('— Your main phase —')
	return s
}
