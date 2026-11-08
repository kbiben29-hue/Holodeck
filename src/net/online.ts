// Online play protocol. The host's browser is the referee: it owns the GameState, applies every
// intent (its own and the guest's) with the normal engine, and sends the new state to the guest.
// The guest checks its intents locally first (same engine, so illegal moves get an instant
// message), then sends them to the host and waits for the host's state.

import { PLAY_URL } from '../config'
import type { CardDef, GameState, Intent } from '../engine/types'

/** What a player brings: one of the Star Trek decks and which legend leads it. */
export interface DeckChoice {
	deck: string
	leader: 'commander' | 'alt'
}

export type GuestMsg = { type: 'hello'; name: string; deck: DeckChoice } | { type: 'intent'; intent: Intent }

export type HostMsg =
	| { type: 'start'; cards: Record<string, CardDef>; state: GameState; hostName: string }
	| { type: 'state'; state: GameState }
	| { type: 'error'; message: string }

/** Card definitions are sent once in 'start'; later states travel without them. */
/** (Tokens made up during the game travel with every state.) */
export const stripCards = (s: GameState): GameState => ({ ...s, cards: Object.fromEntries(Object.entries(s.cards).filter(([k]) => k.startsWith('token:') && !/^token:[0-9a-f-]{36}$/.test(k))) })
export const withCards = (s: GameState, cards: Record<string, CardDef>): GameState => ({ ...s, cards: { ...cards, ...s.cards } })


export function joinLink(code: string): string {
	const inApp = !!(window as unknown as { __TAURI__?: unknown }).__TAURI__ || !/^https?:$/.test(window.location.protocol)
	const u = new URL(inApp ? PLAY_URL : window.location.href)
	u.search = ''
	u.hash = ''
	u.searchParams.set('join', code)
	const net = new URLSearchParams(window.location.search).get('net')
	if (net) u.searchParams.set('net', net)
	return u.toString()
}

export function joinCodeFromUrl(): string | null {
	const c = new URLSearchParams(window.location.search).get('join')
	return c && /^[a-z0-9]{4,16}$/.test(c) ? c : null
}

export function clearJoinFromUrl() {
	const u = new URL(window.location.href)
	u.searchParams.delete('join')
	window.history.replaceState(null, '', u.toString())
}

export const isGuestMsg = (m: unknown): m is GuestMsg => !!m && typeof m === 'object' && ['hello', 'intent'].includes((m as { type?: string }).type ?? '')
export const isHostMsg = (m: unknown): m is HostMsg => !!m && typeof m === 'object' && ['start', 'state', 'error'].includes((m as { type?: string }).type ?? '')
