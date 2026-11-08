// Computer-vs-computer games with the real card pool (run in a browser page that has the card cache).
import { botStep } from '../src/bot/bot'
import { buildGame } from '../src/data/build'
import { DECKS } from '../src/data/decks'
import { coverage } from './coverage'
import type { CardDef } from '../src/engine/types'

export function realSim(cards: Record<string, CardDef>, n: number) {
	const out: { game: number; decks: string; turns: number; result: string; error?: string }[] = []
	for (let g = 0; g < n; g++) {
		const a = DECKS[g % 4].id
		const b = DECKS[(g + 1 + Math.floor(g / 4)) % 4].id
		let s = buildGame(cards, [{ name: 'A', deck: a, leader: 'commander', bot: true }, { name: 'B', deck: b, leader: g % 2 ? 'alt' : 'commander', bot: true }], 'duel', 1000 + g)
		let error: string | undefined
		try {
			for (let i = 0; i < 6000 && s.pending.kind !== 'over' && s.turn <= 40; i++) {
				const next = botStep(s, s.pending.player)
				if (!next) {
					error = `stuck: ${JSON.stringify(s.pending).slice(0, 300)}`
					break
				}
				s = next
			}
		} catch (e) {
			error = `${(e as Error).message} @ ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')} :: ${s.log.slice(-4).join(' | ')}`
		}
		out.push({ game: g, decks: `${a} vs ${b}`, turns: s.turn, result: s.pending.kind === 'over' ? (s.players.find((p) => p.lost)?.lost ?? 'draw') : 'unfinished', error })
	}
	return out
}
;(globalThis as unknown as { HoloSim: unknown }).HoloSim = { realSim, coverage }

export function trace(cards: Record<string, CardDef>, g: number, steps: number) {
	const a = DECKS[g % 4].id
	const b = DECKS[(g + 1 + Math.floor(g / 4)) % 4].id
	let s = buildGame(cards, [{ name: 'A', deck: a, leader: 'commander', bot: true }, { name: 'B', deck: b, leader: g % 2 ? 'alt' : 'commander', bot: true }], 'duel', 1000 + g)
	const pend: string[] = []
	for (let i = 0; i < steps && s.pending.kind !== 'over'; i++) {
		const next = botStep(s, s.pending.player)
		if (!next) break
		s = next
		if (i > steps - 12) pend.push(`${s.turn}/${s.step} ${JSON.stringify(s.pending).slice(0, 160)} stack=${s.stack.map((x) => x.text.slice(0, 40)).join(';')}`)
	}
	return { log: s.log.slice(-15), pend }
}
;(globalThis as unknown as { HoloSim: unknown }).HoloSim = { realSim, coverage, trace }
