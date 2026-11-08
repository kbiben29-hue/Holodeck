// Which lines of card text does the engine not automate? Used during development (in a browser
// page that has the card cache, or with a local card dump) to decide what to script next.
import { NAMED } from '../src/engine/named'
import { parse, rulesFor } from '../src/engine/rules'
import type { CardDef } from '../src/engine/types'

export function coverage(cards: CardDef[]): { name: string; lines: string[] }[] {
	const out: { name: string; lines: string[] }[] = []
	for (const c of cards) {
		if (c.isToken) continue
		const full = rulesFor(c)
		if (full.fullyAutomated || NAMED[c.name] || (full.triggers.length && full.triggers.every((t) => t.compiled) && full.activated.every((a) => a.compiled || a.station) && !full.chapters?.some((x) => !x.compiled))) continue
		const isSpell = /Instant|Sorcery/.test(c.typeLine)
		const bad: string[] = []
		if (isSpell) bad.push(c.oracle.replace(/\n/g, ' / '))
		else
			for (const line of c.oracle.split('\n')) {
				const r = parse({ name: c.name, oracle: line, typeLine: c.typeLine })
				const manualTrig = r.triggers.some((t) => !t.compiled)
				const manualAct = r.activated.some((a) => !a.compiled && !a.station)
				if (!r.fullyAutomated || manualTrig || manualAct) bad.push(line)
			}
		if (bad.length) out.push({ name: c.name, lines: bad })
	}
	return out
}
;(globalThis as unknown as { HoloCov: unknown }).HoloCov = { coverage }
