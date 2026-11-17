// Star Trek or Middle-earth: which world a player's deck (and so the sounds and the ending) belongs to.
import { deckOfPlayer, worldOfName, type StarterDeck } from '../data/decks'
import type { GameState } from '../engine/types'

export type World = 'trek' | 'me'

export function playerDeck(s: GameState, p: number): StarterDeck | undefined {
	const pl = s.players[p]
	const name = (id: string) => s.cards[id]?.name ?? ''
	const cards = [...pl.library, ...pl.hand, ...pl.graveyard, ...s.battlefield.filter((q) => q.owner === p)].map((o) => name(o.card))
	return deckOfPlayer(pl.commanders.map(name), cards)
}

export const playerWorld = (s: GameState, p: number): World => playerDeck(s, p)?.world ?? 'trek'

/** A card name's world, falling back to the given world for cards both worlds share (and tokens). */
export const worldOf = (fallback: World) => (n: string): World => worldOfName(n.replace(/ token$/, '')) ?? fallback
