// Bot-vs-bot games with the test stand-in decks: `npm run sim -- 100`. Prints how games end.
import { botStep } from '../src/bot/bot'
import { newGame } from '../src/engine/engine'
import { FIX, FIX_DECKS } from '../src/engine/fixture'

const n = Number(process.argv[2] ?? 50)
const reasons: Record<string, number> = {}
let turns = 0
let wins = [0, 0]
for (let seed = 1; seed <= n; seed++) {
	const format = (['duel', 'oneVsOne', 'classic', 'sixty'] as const)[seed % 4]
	// Classic 60-card: the commander shuffled in with 59 other cards, no command zone
	const sixty = (d: { commanders: string[]; deck: string[] }) => (format === 'sixty' ? { commanders: [], deck: [...d.commanders, ...d.deck.filter((_, i) => i % 5 !== 4)].slice(0, 60) } : d)
	let s = newGame({ players: [{ name: 'UW', ...sixty(FIX_DECKS.uw), bot: true }, { name: 'RG', ...sixty(FIX_DECKS.rg), bot: true }], cards: { ...FIX }, seed, format })
	let steps = 0
	while (s.pending.kind !== 'over' && s.turn <= 80 && steps < 20000) {
		const next = botStep(s, s.pending.player)
		if (!next) throw new Error(`stuck at ${JSON.stringify(s.pending)}`)
		s = next
		steps++
	}
	const why = s.pending.kind === 'over' ? (s.players.find((p) => p.lost)?.lost ?? 'draw') : 'turn limit'
	reasons[why] = (reasons[why] ?? 0) + 1
	if (s.pending.kind === 'over' && s.pending.winner !== null) wins[s.pending.winner]++
	turns += s.turn
}
console.log({ games: n, avgTurns: (turns / n).toFixed(1), wins, reasons })
