// Scripts for a few common cards whose text doesn't fit the templates in rules.ts.
// Keyed by card name; `spell` replaces the parsed spell effect.

import type { Ctx } from './effects'
import { H, search } from './effects'
import type { Compiled } from './rules'
import { cardName, def, findPerm, isType, log, pt, rulesOf } from './state'
import type { StackItem } from './types'

export interface Named {
	spell: Compiled
	run(ctx: Ctx, item: StackItem, legal: boolean[]): void
}

const creature = { kind: 'perm' as const, filter: { types: ['creature'], not: [] } }
const permanent = { kind: 'perm' as const, filter: { types: [], not: [] } }

export const NAMED: Record<string, Named> = {
	'Swords to Plowshares': {
		spell: { targets: [creature], effects: [{ e: 'named', name: 'Swords to Plowshares' }] },
		run(ctx, item, legal) {
			const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : undefined
			if (!p) return
			const [power] = pt(ctx.s, p)
			const who = p.controller
			H().move(ctx.s, p.iid, 'exile')
			H().gainLife(ctx.s, who, Math.max(0, power))
		},
	},
	'Path to Exile': {
		spell: { targets: [creature], effects: [{ e: 'named', name: 'Path to Exile' }] },
		run(ctx, item, legal) {
			const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : undefined
			if (!p) return
			const who = p.controller
			H().move(ctx.s, p.iid, 'exile')
			search(ctx, who, { e: 'search', filter: { types: ['land'], not: [], basic: true }, count: 1, dest: 'battlefield', tapped: true }, 'path')
		},
	},
	'Beast Within': {
		spell: { targets: [permanent], effects: [{ e: 'named', name: 'Beast Within' }] },
		run(ctx, item, legal) {
			const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : undefined
			if (!p) return
			const who = p.controller
			H().destroy(ctx.s, p.iid)
			const card = H().makeTokenDef(ctx.s, { e: 'token', n: 1, name: 'Beast', power: 3, toughness: 3, types: 'Creature — Beast', colors: ['G'], keywords: [] }, 0)
			H().createToken(ctx.s, who, card, 1)
		},
	},
	Cultivate: {
		spell: { targets: [], effects: [{ e: 'named', name: 'Cultivate' }] },
		run(ctx, item) {
			const s = ctx.s
			const me = item.controller
			const lib = s.players[me].library
			const basics = lib.filter((o) => rulesOf(s, o).supertypes.includes('basic') && rulesOf(s, o).types.includes('land'))
			const seen = new Map<string, number>()
			const opts = basics
				.filter((o) => {
					const n = seen.get(o.card) ?? 0
					seen.set(o.card, n + 1)
					return n < 2
				})
				.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 }))
			const picks = ctx.ask(me, { key: 'cult', prompt: 'Cultivate: choose up to two basic lands', options: opts, min: 0, max: Math.min(2, opts.length), cards: true })
			if (picks.length) {
				const [bf] = ctx.ask(me, { key: 'cult2', prompt: 'Which one goes onto the battlefield tapped? (the other goes to your hand)', options: picks.map((id) => opts.find((o) => o.id === id)!), min: 1, max: 1, cards: true })
				H().move(s, Number(bf), 'battlefield', { tapped: true })
				for (const id of picks) if (id !== bf) H().move(s, Number(id), 'hand')
			}
			H().shuffle(s, me)
		},
	},
	Dispatch: {
		spell: { targets: [creature], effects: [{ e: 'named', name: 'Dispatch' }] },
		run(ctx, item, legal) {
			const s = ctx.s
			const p = legal[0] ? findPerm(s, item.targets[0].id) : undefined
			if (!p) return
			const artifacts = s.battlefield.filter((q) => q.controller === item.controller && isType(s, q, 'artifact')).length
			if (artifacts >= 3) {
				log(s, 'Metalcraft: three or more artifacts, so it is exiled.')
				H().move(s, p.iid, 'exile')
			} else p.tapped = true
		},
	},
	'Deliver from Chaos': {
		spell: { targets: [{ kind: 'perm', filter: { types: ['artifact', 'creature'], not: [] } }], effects: [{ e: 'named', name: 'Deliver from Chaos' }] },
		run(ctx, item, legal) {
			const s = ctx.s
			const p = legal[0] ? findPerm(s, item.targets[0].id) : undefined
			if (!p) return
			const n = def(s, p.card).cmc
			H().move(s, p.iid, 'exile')
			const card = H().makeTokenDef(s, { e: 'token', n, name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg', colors: [], keywords: [], artifact: true }, 0)
			H().createToken(s, item.controller, card, n)
		},
	},
	Brainstorm: {
		spell: { targets: [], effects: [{ e: 'named', name: 'Brainstorm' }] },
		run(ctx, item) {
			const s = ctx.s
			const me = item.controller
			H().draw(s, me, 3)
			const hand = s.players[me].hand
			if (hand.length === 0) return
			const k = Math.min(2, hand.length)
			const picks = ctx.ask(me, {
				key: 'bs',
				prompt: `Brainstorm: put ${k} cards from your hand on top of your library (the last one chosen ends on top)`,
				options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes('land') ? 2 : 0 })),
				min: k,
				max: k,
				cards: true,
				ordered: true,
			})
			for (const id of picks) H().move(s, Number(id), 'library')
			log(s, `${s.players[me].name} puts ${k} cards back on top.`)
		},
	},
}
