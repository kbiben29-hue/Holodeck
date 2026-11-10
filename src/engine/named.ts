// Scripts for a few common cards whose text doesn't fit the templates in rules.ts.
// Keyed by card name; `spell` replaces the parsed spell effect.

import type { Ctx } from './effects'
import { H, search } from './effects'
import { overrideTrigger, type Compiled, type TriggerEvent } from './rules'
import { cardName, def, findPerm, isCreature, isType, log, opp, permName, pt, rulesOf } from './state'
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

// ───────── more spells ─────────

const sweep = (name: string, run: Named['run']): Named => ({ spell: { targets: [], effects: [{ e: 'named', name }] }, run })

/** All creatures get -X/-X until end of turn. */
function shrinkAll(s: Parameters<Named['run']>[0]['s'], x: number, only?: (p: import('./types').Perm) => boolean) {
	for (const p of s.battlefield) if (isCreature(s, p) && (!only || only(p))) p.mods.push({ power: -x, toughness: -x, until: 'eot' })
	log(s, `Creatures get -${x}/-${x} until end of turn.`)
}

Object.assign(NAMED, {
	'Join the Collective': sweep('Join the Collective', (ctx, item) => {
		const s = ctx.s
		const victims = s.battlefield.filter((p) => isCreature(s, p))
		let n = 0
		for (const p of victims) {
			const nonArtifact = !isType(s, p, 'artifact')
			if (H().destroy(s, p.iid) && nonArtifact) n++
		}
		const card = H().makeTokenDef(s, { e: 'token', n, name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg', colors: [], keywords: [], artifact: true }, 0)
		H().createToken(s, item.controller, card, n)
	}),
	'Battle of Wolf 359': sweep('Battle of Wolf 359', (ctx, item) => {
		const s = ctx.s
		const x = s.battlefield.filter((p) => p.controller === item.controller && isCreature(s, p) && isType(s, p, 'artifact')).length
		shrinkAll(s, x, (p) => !isType(s, p, 'artifact'))
	}),
	'Toxic Deluge': sweep('Toxic Deluge', (ctx, item) => shrinkAll(ctx.s, item.x ?? 0)),
	'Chain Reaction': sweep('Chain Reaction', (ctx, item) => {
		const s = ctx.s
		const all = s.battlefield.filter((p) => isCreature(s, p))
		for (const p of all) H().damage(s, { card: item.card, controller: item.controller }, { kind: 'perm', id: p.iid }, all.length)
	}),
	'Echo of Eons': sweep('Echo of Eons', (ctx) => {
		const s = ctx.s
		s.players.forEach((pl, i) => {
			for (const o of [...pl.hand, ...pl.graveyard]) H().move(s, o.iid, 'library')
			H().shuffle(s, i)
			H().draw(s, i, 7)
		})
	}),
	Ponder: sweep('Ponder', (ctx, item) => {
		scryLike(ctx, item.controller, 3, 'pond')
		H().draw(ctx.s, item.controller, 1)
	}),
	'Thirst for Knowledge': sweep('Thirst for Knowledge', (ctx, item) => {
		const s = ctx.s
		const me = item.controller
		H().draw(s, me, 3)
		const hand = s.players[me].hand
		const picks = ctx.ask(me, { key: 'tfk', prompt: 'Discard two cards, or one artifact card', options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card) + (isType(s, o, 'artifact') ? ' (artifact)' : ''), card: o.card, iid: o.iid, score: isType(s, o, 'artifact') ? 3 : -def(s, o.card).cmc })), min: Math.min(1, hand.length), max: Math.min(2, hand.length), cards: true })
		const ok = picks.length === 2 || (picks.length === 1 && isType(s, hand.find((o) => o.iid === Number(picks[0]))!, 'artifact')) || hand.length < 2
		const all = ok ? picks : [...picks, ...hand.filter((o) => !picks.includes(String(o.iid))).slice(0, 2 - picks.length).map((o) => String(o.iid))]
		for (const id of all) H().move(s, Number(id), 'graveyard')
	}),
	'Frantic Search': sweep('Frantic Search', (ctx, item) => {
		const s = ctx.s
		const me = item.controller
		H().draw(s, me, 2)
		const hand = s.players[me].hand
		const picks = ctx.ask(me, { key: 'fs', prompt: 'Discard two cards', options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: Math.min(2, hand.length), max: Math.min(2, hand.length), cards: true })
		for (const id of picks) H().move(s, Number(id), 'graveyard')
		let n = 3
		for (const p of s.battlefield) if (n > 0 && p.controller === me && p.tapped && isType(s, p, 'land')) (p.tapped = false), n--
	}),
	'Painful Truths': sweep('Painful Truths', (ctx, item) => {
		// converge: one card per colour of mana spent — the decks pay with their colours, so count those
		const n = Math.min(3, ctx.s.players[item.controller].identity.length)
		H().draw(ctx.s, item.controller, n)
		ctx.s.players[item.controller].life -= n
		log(ctx.s, `${ctx.s.players[item.controller].name} loses ${n} life.`)
	}),
	'The Promise of Kahless': sweep('The Promise of Kahless', (ctx, item) => {
		const s = ctx.s
		const me = item.controller
		const kw = (o: { card: string }) => rulesOf(s, o).subtypes.some((t) => t === 'Klingon' || t === 'Warrior')
		const sac = s.battlefield.filter((p) => p.controller === me && isCreature(s, p) && kw(p))
		const pick = sac.length ? ctx.ask(me, { key: 'pk', prompt: 'You may sacrifice a Klingon or Warrior', options: sac.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: -def(s, p.card).cmc })), min: 0, max: 1, cards: true }) : []
		if (!pick.length) return
		H().move(s, Number(pick[0]), 'graveyard', { cause: 'sacrifice' })
		const back = s.players[me].graveyard.filter((o) => o.iid !== Number(pick[0]) && rulesOf(s, o).types.includes('creature') && kw(o))
		for (const o of back) H().move(s, o.iid, 'battlefield', { controller: me })
	}),
	'Gift of Perfection': sweep('Gift of Perfection', (ctx, item) => assimilateTop(ctx, item.controller, opp(item.controller))),
	'Fractured Identity': {
		spell: { targets: [{ kind: 'perm', filter: { types: [], not: ['land'] } }], effects: [{ e: 'named', name: 'Fractured Identity' }] },
		run(ctx, item, legal) {
			const s = ctx.s
			const p = legal[0] ? findPerm(s, item.targets[0].id) : undefined
			if (!p) return
			const card = p.card
			const ctl = p.controller
			H().move(s, p.iid, 'exile')
			if (ctl !== item.controller) H().createToken(s, item.controller, card, 1)
		},
	},
} as Record<string, Named>)

function scryLike(ctx: Ctx, me: number, n: number, key: string) {
	const s = ctx.s
	const top = s.players[me].library.slice(0, n)
	if (!top.length) return
	const order = ctx.ask(me, { key, prompt: `Look at the top ${top.length}: put them back in any order (first = top). Pick none to shuffle instead.`, options: top.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes('land') ? 0 : 1 })), min: 0, max: top.length, cards: true, ordered: true })
	if (!order.length) return H().shuffle(s, me)
	const kept = order.map((id) => top.find((o) => o.iid === Number(id))!)
	const rest = top.filter((o) => !kept.includes(o))
	s.players[me].library.splice(0, top.length, ...kept, ...rest)
}

/** Assimilate a card: onto the battlefield under `me`'s control with a +1/+1 counter, as a Borg artifact creature. */
export function assimilate(s: Parameters<Named['run']>[0]['s'], me: number, iid: number) {
	H().move(s, iid, 'battlefield', { controller: me })
	const p = findPerm(s, iid)
	if (!p) return
	p.counters['+1/+1'] = (p.counters['+1/+1'] ?? 0) + 1
	p.addTypes = ['artifact', 'creature']
	log(s, `${s.players[me].name} assimilates ${permName(s, p)}.`)
}

/** The opponent exiles from the top until a creature card; assimilate it, the rest go to the bottom. */
function assimilateTop(ctx: Ctx, me: number, who: number) {
	const s = ctx.s
	const lib = s.players[who].library
	const i = lib.findIndex((o) => rulesOf(s, o).types.includes('creature'))
	if (i < 0) return
	const passed = lib.slice(0, i)
	const hit = lib[i]
	for (const o of passed) H().move(s, o.iid, 'libraryBottom')
	assimilate(s, me, hit.iid)
}

// ───────── triggered abilities of the commanders and key cards ─────────

const N1 = (name: string): Compiled => ({ targets: [], effects: [{ e: 'named', name }] })
export const T = (card: string, events: TriggerEvent[], name: string, run: Named['run'], targets: Compiled['targets'] = []) => {
	NAMED[name] = { spell: { targets, effects: [{ e: 'named', name }] }, run }
	overrideTrigger(card, { events, compiled: { targets, effects: [{ e: 'named', name }] } })
}

const lands = (s: Parameters<Named['run']>[0]['s'], me: number) => new Set(s.battlefield.filter((p) => p.controller === me && isType(s, p, 'land')).map((p) => cardName(s, p.card))).size

T('Commander Spock', ['etb', 'attacks'], 'Commander Spock#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const top = s.players[me].library[0]
	if (!top) return
	log(s, `Spock reveals ${cardName(s, top.card)}.`)
	const L = lands(s, me)
	if (rulesOf(s, top).types.includes('land')) {
		const [c] = ctx.ask(me, { key: 'sp', prompt: `Spock: put ${cardName(s, top.card)} onto the battlefield tapped?`, options: [{ id: 'yes', label: 'Yes', card: top.card, score: 1 }, { id: 'no', label: 'No' }], min: 1, max: 1 })
		if (c === 'yes') H().move(s, top.iid, 'battlefield', { controller: me, tapped: true })
	} else if (def(s, top.card).cmc <= L) {
		const [c] = ctx.ask(me, { key: 'sp', prompt: `Spock: cast ${cardName(s, top.card)} without paying its mana cost? (mana value ${def(s, top.card).cmc} ≤ ${L} differently named lands)`, options: [{ id: 'yes', label: 'Cast it free', card: top.card, score: 1 }, { id: 'no', label: 'No' }], min: 1, max: 1 })
		if (c === 'yes') castFreeHook(s, me, top.iid)
	}
	if (s.players[me].library[0]?.iid === top.iid) H().draw(s, me, 1)
})

T('Captain Kirk, Boldly Going', ['etb', 'attacks'], 'Captain Kirk#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const pl = s.players[me]
	const ok = (o: { card: string }) => (rulesOf(s, o).supertypes.includes('basic') && rulesOf(s, o).types.includes('land')) || cardName(s, o.card) === 'Starship Enterprise'
	const seen = new Set<string>()
	const opts = [...pl.graveyard, ...pl.library].filter((o) => ok(o) && !seen.has(o.card + (pl.graveyard.includes(o) ? 'g' : 'l')) && seen.add(o.card + (pl.graveyard.includes(o) ? 'g' : 'l')))
	if (!opts.length) return
	const [pick] = ctx.ask(me, { key: 'kirk', prompt: 'Kirk: put a basic land or Starship Enterprise into your hand', options: opts.map((o) => ({ id: String(o.iid), label: `${cardName(s, o.card)}${pl.graveyard.includes(o) ? ' (graveyard)' : ''}`, card: o.card, iid: o.iid, score: cardName(s, o.card) === 'Starship Enterprise' ? 5 : 1 })), min: 1, max: 1, cards: true })
	const fromLib = pl.library.some((o) => o.iid === Number(pick))
	H().move(s, Number(pick), 'hand')
	if (fromLib) H().shuffle(s, me)
})

T('The Borg Queen', ['etb', 'attacks'], 'The Borg Queen#t', (ctx, item) => assimilateTop(ctx, item.controller, opp(item.controller)))
T('Borg Queen, Perfection Manifest', ['etb'], 'Borg Queen PM#t', (ctx, item) => {
	const s = ctx.s
	const gy = s.players[opp(item.controller)].graveyard.filter((o) => rulesOf(s, o).types.includes('creature'))
	if (!gy.length) return
	const [pick] = ctx.ask(item.controller, { key: 'bq', prompt: 'Assimilate a creature card from the opponent’s graveyard', options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true })
	assimilate(s, item.controller, Number(pick))
})

T('Worf, Defiant Commander', ['youAttack'], 'Worf Defiant#t', (ctx, item) => {
	const s = ctx.s
	const pl = s.players[item.controller]
	const top = pl.library[0]
	if (!top) return
	H().move(s, top.iid, 'exile')
	;(pl.playable ??= []).push({ iid: top.iid, until: s.turn + 2 })
	log(s, `Worf exiles ${cardName(s, top.card)} — it can be played until the end of your next turn.`)
})

T('Kor, Cause of Vengeance', ['youAttack'], 'Kor#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const others = s.battlefield.filter((p) => p.controller === me && p.iid !== item.iid && isCreature(s, p))
	if (!others.length) return
	const pick = ctx.ask(me, { key: 'kor', prompt: 'Kor: you may sacrifice another creature to draw a card and give Klingons and Warriors +2/+2', options: others.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: p.token ? 1 : -def(s, p.card).cmc })), min: 0, max: 1, cards: true })
	if (!pick.length) return
	H().move(s, Number(pick[0]), 'graveyard', { cause: 'sacrifice' })
	H().draw(s, me, 1)
	for (const p of s.battlefield) if (p.controller === me && isCreature(s, p) && rulesOf(s, p).subtypes.some((t) => t === 'Klingon' || t === 'Warrior')) p.mods.push({ power: 2, toughness: 2, until: 'eot' })
})

T('Jean-Luc Picard, Luminary', ['secondDraw'], 'Picard#seek', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const cr = s.battlefield.filter((p) => p.controller === me && p.iid !== item.iid && isCreature(s, p))
	const a = cr.length ? ctx.ask(me, { key: 'pc1', prompt: 'Picard: put a +1/+1 counter on up to one other creature', options: cr.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: 1 })), min: 0, max: 1 }) : []
	for (const id of a) {
		const p = findPerm(s, Number(id))
		if (p) p.counters['+1/+1'] = (p.counters['+1/+1'] ?? 0) + 1
	}
	const sc = s.battlefield.filter((p) => p.controller === me && rulesOf(s, p).subtypes.includes('Spacecraft'))
	const b = sc.length ? ctx.ask(me, { key: 'pc2', prompt: 'Picard: put two charge counters on up to one Spacecraft', options: sc.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: 1 })), min: 0, max: 1 }) : []
	for (const id of b) {
		const p = findPerm(s, Number(id))
		if (p) p.counters.charge = (p.counters.charge ?? 0) + 2
	}
})

T('Data, Exploring Humanity', ['secondDraw'], 'Data#seek', (ctx, item) => H().discover(ctx, item.controller, 4, 'disc'))

T('Kes, Evolving Telepath', ['endStep'], 'Kes#t', (ctx, item) => {
	const s = ctx.s
	const p = findPerm(s, item.iid)
	if (!p) return
	p.counters.time = (p.counters.time ?? 0) + 1
	H().draw(s, item.controller, p.counters.time)
	if (p.counters.time >= 9) H().move(s, p.iid, 'graveyard', { cause: 'sacrifice' })
})

T('Tribble Cluster', ['dies'], 'Tribble Cluster#t', (ctx, item) => {
	const s = ctx.s
	const n = Math.max(1, lastPower(s, item.iid))
	const card = H().makeTokenDef(s, { e: 'token', n, name: 'Tribble', power: 1, toughness: 1, types: 'Creature — Tribble', colors: ['W'], keywords: [] }, 0)
	for (const iid of H().createToken(s, item.controller, card, n)) findPerm(s, iid)?.mods.push({ power: 0, toughness: 0, keywords: ['cantblock'], until: 'perm' })
})

T('Stratagem Emulator', ['dies'], 'Stratagem Emulator#t', (ctx, item) => {
	const s = ctx.s
	const n = Math.max(0, lastPower(s, item.iid))
	const card = H().makeTokenDef(s, { e: 'token', n, name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg', colors: [], keywords: [], artifact: true }, 0)
	H().createToken(s, item.controller, card, n)
})

T('Satyr Wayfinder', ['etb'], 'Satyr Wayfinder#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const top = s.players[me].library.slice(0, 4)
	const ls = top.filter((o) => rulesOf(s, o).types.includes('land'))
	const pick = ls.length ? ctx.ask(me, { key: 'sw', prompt: 'Satyr Wayfinder: you may put a land into your hand (the rest go to your graveyard)', options: ls.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 })), min: 0, max: 1, cards: true }) : []
	for (const o of top) H().move(s, o.iid, pick.includes(String(o.iid)) ? 'hand' : 'graveyard')
})

T('Malfunctioning Holodeck', ['etb'], 'Holodeck#t', (ctx, item) => {
	const s = ctx.s
	const opts = s.battlefield.filter((p) => p.controller !== item.controller && !isType(s, p, 'land'))
	if (!opts.length) return
	const [pick] = ctx.ask(item.controller, { key: 'mh', prompt: 'Exile a nonland permanent an opponent controls until the Holodeck leaves', options: opts.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: def(s, p.card).cmc })), min: 1, max: 1, cards: true })
	H().move(s, Number(pick), 'exile')
	const h = findPerm(s, item.iid)
	if (h) h.counters['holding:' + pick] = 1
})

/** Last known power of a permanent that just left (from the log of its snapshot, or 1). */
function lastPower(s: Parameters<Named['run']>[0]['s'], iid: number): number {
	return (s as { lastPower?: Record<number, number> }).lastPower?.[iid] ?? 1
}

let castFreeHook: (s: Parameters<Named['run']>[0]['s'], p: number, iid: number) => void = () => {}
export function setCastFree(f: typeof castFreeHook) {
	castFreeHook = f
}
void N1

T('Howling Mine', ['eachDraw'], 'Howling Mine#t', (ctx, item) => {
	const p = findPerm(ctx.s, item.iid)
	if (p && !p.tapped) H().draw(ctx.s, ctx.s.active, 1)
})

T('Fevered Visions', ['eachEndStep'], 'Fevered Visions#t', (ctx, item) => {
	const s = ctx.s
	const who = s.active
	H().draw(s, who, 1)
	if (who !== item.controller && s.players[who].hand.length >= 4) H().damage(s, { card: item.card, controller: item.controller, iid: item.iid }, { kind: 'player', id: who }, 2)
})

T('Transwarp Hub', ['etb'], 'Transwarp Hub#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const top = s.players[me].library.slice(0, 5)
	for (const o of top) H().move(s, o.iid, 'graveyard')
	const arts = top.filter((o) => isType(s, o, 'artifact'))
	if (!arts.length) return
	const picks = ctx.ask(me, { key: 'th', prompt: 'Transwarp Hub: put up to two artifact cards into your hand', options: arts.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 0, max: Math.min(2, arts.length), cards: true })
	for (const id of picks) H().move(s, Number(id), 'hand')
})

T('The Sword of Kahless', ['attacks'], 'Sword of Kahless#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const top = s.players[me].library.slice(0, 5)
	const ok = top.filter((o) => rulesOf(s, o).types.includes('creature') && rulesOf(s, o).subtypes.some((t) => t === 'Klingon' || t === 'Warrior'))
	const pick = ok.length ? ctx.ask(me, { key: 'sk', prompt: 'Sword of Kahless: you may put a Klingon or Warrior creature onto the battlefield', options: ok.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 0, max: 1, cards: true }) : []
	for (const id of pick) H().move(s, Number(id), 'battlefield', { controller: me })
	for (const o of top) if (!pick.includes(String(o.iid))) H().move(s, o.iid, 'libraryBottom')
})

T('Koloth, Tribble Hunter', ['endStep'], 'Koloth#t', (ctx) => {
	const s = ctx.s
	const card = H().makeTokenDef(s, { e: 'token', n: 2, name: 'Tribble', power: 1, toughness: 1, types: 'Creature — Tribble', colors: ['W'], keywords: [] }, 0)
	s.players.forEach((_, i) => {
		for (const iid of H().createToken(s, i, card, 2)) findPerm(s, iid)?.mods.push({ power: 0, toughness: 0, keywords: ['cantblock'], until: 'perm' })
	})
})

T('Julian Bashir, Frontier Doctor', ['attacks'], 'Bashir#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const p = findPerm(s, item.iid)
	const x = p ? pt(s, p)[0] : 0
	const gy = s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes('creature') && def(s, o.card).cmc <= x)
	if (!gy.length) return
	const [pick] = ctx.ask(me, { key: 'jb', prompt: `Bashir: return a creature card with mana value ${x} or less to the battlefield`, options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true })
	H().move(s, Number(pick), 'battlefield', { controller: me })
})

T('Grilka, Widowed Warrior', ['etb'], 'Grilka#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const opts = s.battlefield.filter((p) => p.controller !== me && isCreature(s, p))
	if (!opts.length) return
	const [pick] = ctx.ask(me, { key: 'gk', prompt: 'Grilka: gain control of a creature until end of turn (it gets haste and trample)', options: opts.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: pt(s, p)[0] })), min: 1, max: 1, cards: true })
	const p = findPerm(s, Number(pick))!
	const was = p.controller
	p.controller = me
	p.tapped = false
	p.mods.push({ power: 0, toughness: 0, keywords: ['haste', 'trample'], until: 'eot' })
	H().later(s, { at: 'cleanup', kind: 'control', iid: p.iid, owner: was })
	log(s, `${s.players[me].name} gains control of ${permName(s, p)} until end of turn.`)
})

/** Cast a card without paying its mana cost (for scripts in other files). */
export const castFreeNow = (s: Parameters<Named['run']>[0]['s'], p: number, iid: number) => castFreeHook(s, p, iid)
