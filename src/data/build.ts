// Turns deck choices into a new game, using whatever card data has been loaded.

import { newGame } from '../engine/engine'
import type { CardDef, Format, GameState } from '../engine/types'
import { DECKS, deckCards } from './decks'
import { missingDef, slug } from './scryfall'

export interface PlayerChoice {
	name: string
	deck: string
	leader: 'commander' | 'alt'
	bot?: boolean
}

export function buildGame(pool: Record<string, CardDef>, players: PlayerChoice[], format: Format['id'], seed: number): GameState {
	const cards: Record<string, CardDef> = { ...pool }
	const ids = (names: string[]) =>
		names.map((n) => {
			const id = slug(n)
			if (!cards[id]) cards[id] = missingDef(n)
			return id
		})
	return newGame({
		players: players.map((p) => {
			const d = DECKS.find((x) => x.id === p.deck) ?? DECKS[0]
			const { commanders, cards: rest } = deckCards(d, p.leader)
			return { name: p.name, commanders: ids(commanders), deck: ids(rest), bot: p.bot }
		}),
		cards,
		seed,
		format,
	})
}
