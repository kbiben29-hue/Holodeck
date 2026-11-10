// Holodeck rules engine: turn structure, priority and the stack, casting and paying, combat,
// state-based actions, the Commander rules, and the table tools. Pure: `apply` clones its input.
// Rules references are to the Magic: The Gathering Comprehensive Rules.

import { chooseTargets, targetOptions, search as searchFx, discard as discardFx, H, Illegal, makeCtx, NeedChoice, runCompiled, setHooks, stillLegal, type Ctx } from './effects'
import { addCost, costText, parseCost, solvePayment, type Cost, type Source } from './mana'
import { NAMED, setCastFree } from './named'
import './scripts'
import type { Activated, Compiled, Effect, ManaAbility, Rules, Trigger, TriggerEvent } from './rules'
import { Rng } from './rng'
import {
	cardName,
	clone,
	cloneState,
	def,
	detach,
	emptyPool,
	findPerm,
	hasKw,
	isCreature,
	isType,
	keywords,
	locate,
	log,
	matches,
	newPerm,
	reached,
	opp,
	permName,
	pt,
	rulesOf,
	COST_MODS,
} from './state'
import type { CardDef, Color, Format, GameState, Intent, Mana, ManualOp, Obj, Perm, Step, Target, Task, Zone } from './types'

export { Illegal }

export const FORMATS: Record<Format['id'], Format> = {
	duel: { id: 'duel', name: 'Duel Commander', life: 20, commanderDamage: false, freeMulligan: false },
	oneVsOne: { id: 'oneVsOne', name: '1v1 Commander', life: 30, commanderDamage: true, freeMulligan: false },
	classic: { id: 'classic', name: 'Classic Commander (40 life)', life: 40, commanderDamage: true, freeMulligan: true },
}

export interface Setup {
	players: { name: string; commanders: string[]; deck: string[]; bot?: boolean }[]
	cards: Record<string, CardDef>
	seed: number
	format: Format['id']
	/** Who goes first (default: random). */
	first?: number
}

// ───────── new game ─────────

export function newGame(setup: Setup): GameState {
	const rng = new Rng(setup.seed)
	let nextId = 1
	const s: GameState = {
		v: 1,
		seed: setup.seed,
		rng: 0,
		format: FORMATS[setup.format],
		players: [],
		battlefield: [],
		stack: [],
		turn: 0,
		active: 0,
		step: 'mulligan',
		passes: 0,
		pending: { kind: 'mulligan', player: 0 },
		combat: null,
		tasks: [],
		nextId: 0,
		log: [],
		cards: setup.cards,
		notice: null,
		firstPlayer: 0,
		ticks: 0,
	}
	setup.players.forEach((p, i) => {
		const identity = new Set<Color>()
		for (const c of p.commanders) for (const col of setup.cards[c]?.identity ?? []) identity.add(col)
		const library: Obj[] = rng.shuffle(p.deck.map((card) => ({ iid: nextId++, card, owner: i })))
		const command: Obj[] = p.commanders.map((card) => ({ iid: nextId++, card, owner: i, commander: true }))
		s.players.push({
			name: p.name,
			life: FORMATS[setup.format].life,
			poison: 0,
			library,
			hand: [],
			graveyard: [],
			exile: [],
			command,
			pool: emptyPool(),
			landsPlayed: 0,
			commanderCasts: {},
			commanderDamage: {},
			mulligans: 0,
			kept: false,
			commanders: p.commanders,
			identity: [...identity],
			bot: p.bot,
		})
	})
	s.nextId = nextId
	const first = setup.first ?? rng.int(2)
	s.firstPlayer = first
	s.active = first
	s.rng = rng.seed
	for (let i = 0; i < 2; i++) drawCards(s, i, 7, true)
	s.pending = { kind: 'mulligan', player: first }
	log(s, `${s.format.name}: ${s.players[0].name} vs ${s.players[1].name}. ${s.players[first].name} goes first.`)
	return s
}

// ───────── small helpers ─────────

function rng(s: GameState): Rng {
	return new Rng(s.rng)
}
function saveRng(s: GameState, r: Rng) {
	s.rng = r.seed
}

export function shuffle(s: GameState, p: number) {
	const r = rng(s)
	s.players[p].library = r.shuffle(s.players[p].library)
	saveRng(s, r)
}

function drawCards(s: GameState, p: number, n: number, quiet = false) {
	const pl = s.players[p]
	const archives = s.battlefield.filter((q) => q.controller === p && cardName(s, q.card) === "Alhammarret's Archive").length
	let total = n
	if (archives && s.turn > 0) {
		// Alhammarret's Archive: every draw but the first one in your draw step is doubled
		const first = s.step === 'draw' && s.active === p && (pl as { drawStepTurn?: number }).drawStepTurn !== s.turn
		total = (first ? 1 : 0) + (n - (first ? 1 : 0)) * 2 ** archives
	}
	if (s.step === 'draw' && s.active === p) (pl as { drawStepTurn?: number }).drawStepTurn = s.turn
	n = total
	for (let i = 0; i < n; i++) {
		const c = pl.library.shift()
		if (!c) {
			;(pl as { drewFromEmpty?: boolean }).drewFromEmpty = true
			break
		}
		pl.hand.push(c)
		if (s.turn > 0) {
			pl.drawsThisTurn = (pl.drawsThisTurn ?? 0) + 1
			if (pl.drawsThisTurn === 2) for (const q of s.battlefield) if (q.controller === p) fire(s, q, 'secondDraw')
		}
	}
	if (!quiet && n > 0) log(s, `${pl.name} draws ${n === 1 ? 'a card' : `${n} cards`}.`)
}

function gainLife(s: GameState, p: number, n: number) {
	if (n <= 0) return
	n *= 2 ** s.battlefield.filter((q) => q.controller === p && cardName(s, q.card) === "Alhammarret's Archive").length
	s.players[p].life += n
	log(s, `${s.players[p].name} gains ${n} life.`)
	for (const q of s.battlefield) if (q.controller === p) fire(s, q, 'gainLife')
}

function setTapped(s: GameState, p: Perm, tapped: boolean) {
	if (tapped && !p.tapped) {
		p.tapped = true
		fire(s, p, 'tapped')
	} else p.tapped = tapped
}

/** Saga: the chapter ability for its current lore count. */
function chapter(s: GameState, p: Perm) {
	const r = rulesOf(s, p)
	const n = p.counters.lore ?? 0
	const ch = r.chapters?.findIndex((c) => c.nums.includes(n)) ?? -1
	if (ch >= 0) queue(s).push({ iid: p.iid, card: p.card, controller: p.controller, index: -100 - ch })
}

/** Discover N: exile from the top until a nonland card with mana value N or less; cast it free or put it in hand. */
function discover(ctx: Ctx, p: number, n: number, key: string) {
	const s = ctx.s
	const lib = s.players[p].library
	const seen: Obj[] = []
	let hit: Obj | undefined
	for (const o of lib) {
		seen.push(o)
		if (!rulesOf(s, o).types.includes('land') && def(s, o.card).cmc <= n) {
			hit = o
			break
		}
	}
	if (!hit) return
	const [c] = ctx.ask(p, { key, prompt: `Discover ${n}: ${cardName(s, hit.card)}`, options: [{ id: 'cast', label: 'Cast it for free', card: hit.card, score: 2 }, { id: 'hand', label: 'Put it into your hand', score: 1 }], min: 1, max: 1 })
	for (const o of seen) if (o !== hit) moveCard(s, o.iid, 'libraryBottom', { manual: true })
	log(s, `${s.players[p].name} discovers ${cardName(s, hit.card)}.`)
	if (c === 'hand') moveCard(s, hit.iid, 'hand', { manual: true })
	else castFree(s, p, hit.iid)
}

/** Cast a card without paying its mana cost (from wherever it is). */
export function castFree(s: GameState, p: number, iid: number) {
	const l = locate(s, iid)
	if (!l) return
	if (rulesOf(s, l.obj).types.includes('land')) {
		moveCard(s, iid, 'battlefield', { controller: p, manual: true })
		return
	}
	s.tasks.unshift({ tid: s.nextId++, kind: 'cast', player: p, answers: {}, data: { iid, free: true } })
}

function later(s: GameState, d: NonNullable<GameState['delayed']>[number]) {
	;(s.delayed ??= []).push(d)
}

function runDelayed(s: GameState, at: 'end' | 'cleanup' | 'endCombat' | 'upkeep') {
	const mine = (d: NonNullable<GameState['delayed']>[number]) => d.at === at && (at !== 'upkeep' || d.owner === s.active)
	const due = (s.delayed ?? []).filter(mine)
	s.delayed = (s.delayed ?? []).filter((d) => !mine(d))
	for (const d of due) {
		if (d.kind === 'rebound') {
			const l = locate(s, d.iid)
			if (l && l.zone === 'exile') {
				log(s, `${cardName(s, l.obj.card)} is cast again from rebound.`)
				castFree(s, d.owner!, d.iid)
			}
		} else if (d.kind === 'return') {
			const l = locate(s, d.iid)
			if (l && (l.zone === 'exile' || l.zone === 'graveyard')) {
				moveCard(s, d.iid, 'battlefield', { controller: d.owner, manual: true })
				log(s, `${cardName(s, l.obj.card)} returns to the battlefield.`)
			}
		} else if (d.kind === 'exile') {
			if (findPerm(s, d.iid)) moveCard(s, d.iid, 'exile')
		} else if (d.kind === 'bottom') {
			if (findPerm(s, d.iid)) {
				moveCard(s, d.iid, 'libraryBottom')
				if (d.draw && d.owner !== undefined) drawCards(s, d.owner, 1)
			}
		} else if (d.kind === 'control') {
			const q = findPerm(s, d.iid)
			if (q && d.owner !== undefined) q.controller = d.owner
		}
	}
}

const isPermanentCard = (s: GameState, card: string, back = false) => {
	const r = rulesOf(s, { card, flipped: back })
	return !r.types.includes('instant') && !r.types.includes('sorcery')
}

// ───────── moving cards ─────────

interface QueuedTrigger {
	iid: number
	card: string
	flipped?: boolean
	controller: number
	index: number
	/** For otherEtb/landfall: the permanent that entered. */
	about?: number
}

function queue(s: GameState): QueuedTrigger[] {
	const anyS = s as GameState & { queued?: QueuedTrigger[] }
	anyS.queued ??= []
	return anyS.queued
}

function triggersOf(s: GameState, p: { card: string; flipped?: boolean }, ev: TriggerEvent): { t: Trigger; index: number }[] {
	return rulesOf(s, p)
		.triggers.map((t, index) => ({ t, index }))
		.filter((x) => x.t.event === ev)
}

function fire(s: GameState, src: { iid: number; card: string; flipped?: boolean; controller: number; counters?: Record<string, number> }, ev: TriggerEvent, about?: number) {
	// abilities granted by other permanents ("Artifact creatures you control have 'Whenever this creature …'")
	const perm = findPerm(s, src.iid) ?? (src as Perm)
	for (const q of s.battlefield)
		for (const { t, index } of triggersOf(s, q, ev))
			if (t.granted && q.controller === src.controller && reached(q, t.threshold) && 'counters' in perm && matches(s, t.granted, perm as Perm, q.controller, src.controller, undefined, perm as Perm))
				queue(s).push({ iid: src.iid, card: q.card, flipped: q.flipped, controller: src.controller, index, about })
	// "Whenever equipped creature …": the Equipment's own ability
	for (const q of s.battlefield)
		if (q.attachedTo === src.iid) for (const { t, index } of triggersOf(s, q, ev)) if (t.equipped) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about })
	for (const { index } of triggersOf(s, src, ev).filter((x) => reached(src, x.t.threshold) && !x.t.granted && !x.t.equipped)) queue(s).push({ iid: src.iid, card: src.card, flipped: src.flipped, controller: src.controller, index, about })
}

function onEnter(s: GameState, p: Perm) {
	p.enteredTurn = s.turn
	const r = rulesOf(s, p)
	if (r.chapters?.length) {
		p.counters.lore = (p.counters.lore ?? 0) + 1
		chapter(s, p)
	}
	fire(s, p, 'etb')
	if (p.commander) for (const q of s.battlefield) if (q.controller === p.controller) fire(s, q, 'commanderEtb', p.iid)
	for (const q of s.battlefield) {
		if (q.iid === p.iid) {
			continue
		}
		for (const { t, index } of triggersOf(s, q, 'otherEtb')) {
			if (t.filter && matches(s, t.filter, p, q.controller, p.controller, q.iid, p)) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: p.iid })
		}
		if (isType(s, p, 'land') && p.controller === q.controller) fire(s, q, 'landfall', p.iid)
	}
	if (isType(s, p, 'land')) fire(s, p, 'landfall', p.iid)
}

export type MoveTo = 'graveyard' | 'exile' | 'hand' | 'library' | 'libraryBottom' | 'battlefield' | 'command'

/**
 * Move a card to a zone. Handles tokens ceasing to exist, the commander going to the command
 * zone (rule 903.9: we always choose to), leaves-the-battlefield and enters triggers.
 */
export function moveCard(s: GameState, iid: number, to: MoveTo, opts: { controller?: number; tapped?: boolean; cause?: string; manual?: boolean; flipped?: boolean; kicked?: number; x?: number } = {}) {
	const before = findPerm(s, iid)
	const snap = before ? clone(before) : null
	const gear = before ? s.battlefield.filter((q) => q.attachedTo === iid).map((q) => clone(q)) : []
	const d = detach(s, iid)
	if (!d) return
	const { obj, from } = d
	let dest: MoveTo = to
	if (obj.commander && !opts.manual && from !== 'command' && ['graveyard', 'exile', 'hand', 'library', 'libraryBottom'].includes(to)) dest = 'command'
	if (snap) {
		// "for as long as you control ~"
		for (const q of s.battlefield) if (q.mods.some((m) => m.note === `while:${snap.iid}`)) q.mods = q.mods.filter((m) => m.note !== `while:${snap.iid}`)
		if (isCreatureSnap(s, snap)) ((s as { lastPower?: Record<number, number> }).lastPower ??= {})[snap.iid] = pt(s, { ...snap, controller: snap.controller })[0]
		// "until this leaves the battlefield" (Malfunctioning Holodeck)
		for (const k of Object.keys(snap.counters)) if (k.startsWith('holding:')) {
			const held = Number(k.slice(8))
			const l = locate(s, held)
			if (l && l.zone === 'exile') moveCard(s, held, 'battlefield', { controller: l.obj.owner, manual: true })
		}
		if (to === 'graveyard' && isCreatureSnap(s, snap)) {
			;((s as { diedThisTurn?: Record<number, number> }).diedThisTurn ??= {})[snap.iid] = s.turn
			// T'Pring: "whenever a creature that fought this way dies this turn, you draw a card"
			for (const m of snap.mods) if (m.note?.startsWith('fought:')) drawCards(s, Number(m.note.slice(7)), 1)
			fire(s, snap, 'dies')
			for (const q of gear) for (const { t, index } of triggersOf(s, q, 'dies')) if (t.equipped) queue(s).push({ iid: q.iid, card: q.card, controller: q.controller, index })
			for (const q of s.battlefield)
				for (const { t, index } of triggersOf(s, q, 'otherDies'))
					if (t.filter && matches(s, t.filter, snap, q.controller, snap.controller, q.iid, snap)) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: snap.iid })
		}
		fire(s, snap, 'ltb')
		// equipment/auras attached to it
		for (const q of s.battlefield) if (q.attachedTo === iid) q.attachedTo = undefined
	}
	if (obj.token && dest !== 'battlefield') {
		if (snap) log(s, `${cardName(s, obj.card)} token ${to === 'graveyard' ? 'dies' : 'leaves the battlefield'}.`)
		return
	}
	const owner = s.players[obj.owner]
	const plain: Obj = { iid: obj.iid, card: obj.card, owner: obj.owner, token: obj.token, commander: obj.commander }
	switch (dest) {
		case 'battlefield': {
			const controller = opts.controller ?? (from === 'battlefield' && snap ? snap.controller : obj.owner)
			let tapped = !!opts.tapped
			const r = rulesOf(s, { card: obj.card, flipped: opts.flipped })
			if (r.types.includes('land') && !tapped) tapped = entersTapped(s, obj.card, controller, opts.flipped)
			const p = newPerm(s, plain, controller, { tapped, flipped: opts.flipped })
			const face = opts.flipped && def(s, obj.card).back ? def(s, obj.card).back! : def(s, obj.card)
			if (face.loyalty && /^\d+$/.test(face.loyalty)) p.counters.loyalty = Number(face.loyalty)
			if (opts.kicked) p.kicked = opts.kicked
			const ew = r.entersWith
			if (ew) {
				const n = ew.n === 'x' ? (opts.x ?? 0) : ew.n === 'kicked' ? (opts.kicked ?? 0) : ew.n
				if (n > 0) p.counters[ew.kind] = (p.counters[ew.kind] ?? 0) + n
			}
			s.battlefield.push(p)
			onEnter(s, p)
			break
		}
		case 'libraryBottom':
			owner.library.push(plain)
			break
		case 'library':
			owner.library.unshift(plain)
			break
		case 'command':
			owner.command.push(plain)
			if (to !== 'command' && !opts.manual) log(s, `${cardName(s, obj.card)} returns to the command zone.`)
			break
		default:
			owner[dest].push(plain)
	}
	if (snap && dest !== 'battlefield' && !opts.manual) {
		const verb = to === 'graveyard' ? (opts.cause === 'sacrifice' ? 'is sacrificed' : isCreatureSnap(s, snap) ? 'dies' : 'is put into the graveyard') : to === 'exile' ? 'is exiled' : to === 'hand' ? "returns to its owner's hand" : 'leaves the battlefield'
		log(s, `${cardName(s, obj.card)} ${verb}.`)
	}
}

function isCreatureSnap(s: GameState, p: Perm) {
	return isType(s, p, 'creature')
}

function entersTapped(s: GameState, card: string, controller: number, flipped?: boolean): boolean {
	const et = rulesOf(s, { card, flipped }).entersTapped
	if (et === 'no') return false
	if (et === 'yes') return true
	const mine = s.battlefield.filter((p) => p.controller === controller && isType(s, p, 'land'))
	if (et.unlessControl) return !mine.some((p) => et.unlessControl!.some((t) => rulesOf(s, p).subtypes.includes(t)))
	if (et.unlessOtherLands) {
		const n = mine.length
		return et.unlessOtherLands[1] === 'ge' ? n < et.unlessOtherLands[0] : n > et.unlessOtherLands[0]
	}
	if (et.unlessBasics) return mine.filter((p) => rulesOf(s, p).supertypes.includes('basic')).length < et.unlessBasics
	if (et.unlessLegendary) return !s.battlefield.some((p) => p.controller === controller && isCreature(s, p) && rulesOf(s, p).supertypes.includes('legendary'))
	if (et.revealFromHand) return !s.players[controller].hand.some((o) => et.revealFromHand!.some((t) => rulesOf(s, o).subtypes.includes(t)))
	return true
}

function destroy(s: GameState, iid: number): boolean {
	const p = findPerm(s, iid)
	if (!p) return false
	if (hasKw(s, p, 'indestructible')) {
		log(s, `${permName(s, p)} is indestructible.`)
		return false
	}
	moveCard(s, iid, 'graveyard')
	return true
}

function dealDamage(s: GameState, src: { card: string; controller: number; iid?: number }, t: Target, n: number, combat = false) {
	if (n <= 0) return
	const srcPerm = src.iid !== undefined ? findPerm(s, src.iid) : undefined
	const kws = srcPerm ? keywords(s, srcPerm) : (rulesOf(s, { card: src.card }).keywords ?? [])
	if (t.kind === 'player') {
		const pl = s.players[t.id]
		pl.life -= n
		if (combat && srcPerm?.commander && s.format.commanderDamage) pl.commanderDamage[srcPerm.card] = (pl.commanderDamage[srcPerm.card] ?? 0) + n
		if (kws.includes('infect')) {
			pl.life += n
			pl.poison += n
		}
		log(s, `${cardName(s, src.card)} deals ${n} damage to ${pl.name}.`)
	} else if (t.kind === 'perm') {
		const p = findPerm(s, t.id)
		if (!p) return
		if (isType(s, p, 'planeswalker') && !isCreature(s, p)) p.counters.loyalty = Math.max(0, (p.counters.loyalty ?? 0) - n)
		else {
			if (kws.includes('infect') || kws.includes('wither')) p.counters['-1/-1'] = (p.counters['-1/-1'] ?? 0) + n
			else p.damage += n
			if (kws.includes('deathtouch')) p.deathtouched = true
		}
		log(s, `${cardName(s, src.card)} deals ${n} damage to ${permName(s, p)}.`)
	}
	if (kws.includes('lifelink')) gainLife(s, src.controller, n)
}

let tokenSeq = 0
function makeTokenDef(s: GameState, e: Extract<Effect, { e: 'token' }>, x: number): string {
	// Prefer a real token card listed for the source card with the same name.
	const name = e.name
	const real = Object.values(s.cards).find((c) => c.isToken && c.name.toLowerCase() === name.toLowerCase() && (e.power === undefined || c.power === String(e.power === -1 ? '*' : e.power)))
	if (real) return real.id
	const pw = e.power === -1 ? x : e.power
	const tg = e.toughness === -1 ? x : e.toughness
	const id = `token:${name}:${pw ?? ''}/${tg ?? ''}:${e.colors.join('')}:${e.keywords.join(',')}`
	if (!s.cards[id]) {
		void tokenSeq
		s.cards = { ...s.cards }
		s.cards[id] = {
			id,
			name,
			manaCost: '',
			cmc: 0,
			typeLine: `Token ${e.types}`,
			oracle: e.keywords.map((k) => k[0].toUpperCase() + k.slice(1)).join(', ') + (e.name === 'Treasure' ? '\n{T}, Sacrifice this artifact: Add one mana of any color.' : e.name === 'Clue' ? '\n{2}, Sacrifice this artifact: Draw a card.' : e.name === 'Food' ? '\n{2}, {T}, Sacrifice this artifact: You gain 3 life.' : ''),
			power: pw === undefined ? undefined : String(pw),
			toughness: tg === undefined ? undefined : String(tg),
			colors: e.colors,
			identity: e.colors,
			keywords: e.keywords,
			isToken: true,
		}
		s.cards[id].oracle = s.cards[id].oracle.trim()
	}
	return id
}

function createToken(s: GameState, p: number, card: string, n: number, tapped = false): number[] {
	const out: number[] = []
	for (let i = 0; i < n; i++) {
		const o: Obj = { iid: s.nextId++, card, owner: p, token: true }
		const perm = newPerm(s, o, p, { tapped })
		s.battlefield.push(perm)
		onEnter(s, perm)
		out.push(o.iid)
	}
	if (n > 0) log(s, `${s.players[p].name} creates ${n === 1 ? 'a' : n} ${cardName(s, card)} token${n > 1 ? 's' : ''}.`)
	return out
}

setCastFree((s, p, iid) => castFree(s, p, iid))
setHooks({
	setTapped,
	later,
	discover,
	move: (s, iid, to, opts) => moveCard(s, iid, to, opts),
	destroy,
	damage: dealDamage,
	draw: (s, p, n) => drawCards(s, p, n),
	createToken,
	makeTokenDef,
	gainLife,
	shuffle,
})

// ───────── mana ─────────

function manaOptions(s: GameState, p: Perm, a: ManaAbility): { options: Mana[]; amount: number } {
	switch (a.kind) {
		case 'fixed':
			return { options: a.mana, amount: a.amount }
		case 'oneOf':
			return { options: a.mana, amount: a.amount }
		case 'any':
			return { options: ['W', 'U', 'B', 'R', 'G'], amount: a.amount }
		case 'identity': {
			const id = s.players[p.controller].identity
			return { options: id.length ? id : ['C'], amount: 1 }
		}
		case 'oppLands': {
			const set = new Set<Mana>()
			for (const q of s.battlefield)
				if (q.controller !== p.controller && isType(s, q, 'land'))
					for (const ma of rulesOf(s, q).manaAbilities) for (const m of ma.kind === 'fixed' || ma.kind === 'oneOf' ? ma.mana : ma.kind === 'any' ? (['W', 'U', 'B', 'R', 'G'] as Mana[]) : []) if (m !== 'C') set.add(m)
			return { options: [...set], amount: set.size ? 1 : 0 }
		}
		case 'charge':
			return { options: a.mana, amount: p.counters.charge ?? 0 }
	}
}

function canTapForMana(s: GameState, p: Perm, a: ManaAbility): boolean {
	if (a.cost.tap && p.tapped) return false
	if (a.cost.needLands && s.battlefield.filter((q) => q.controller === p.controller && isType(s, q, 'land')).length < a.cost.needLands) return false
	if (a.cost.needArtifact && !s.battlefield.some((q) => q.controller === p.controller && isType(s, q, 'artifact'))) return false
	if (a.cost.tap && isCreature(s, p) && p.sick && !hasKw(s, p, 'haste')) return false
	return true
}

/** Untapped sources for automatic payment (no sacrifice or life costs; skipped: the given iids). */
export function manaSources(s: GameState, player: number, skip: number[] = []): Source[] {
	const out: Source[] = []
	for (const p of s.battlefield) {
		if (p.controller !== player || skip.includes(p.iid)) continue
		const r = rulesOf(s, p)
		const usable = r.manaAbilities.filter((a) => canTapForMana(s, p, a) && !a.cost.sacrificeSelf && !a.cost.life && a.cost.tap && !a.cost.mana)
		if (!usable.length) continue
		// one source per permanent: merge its abilities (e.g. Talisman: {C} or {W}/{U} with pain)
		const opts = new Set<Mana>()
		let amount = 0
		const pain: Mana[] = []
		let same = false
		for (const a of usable) {
			const { options, amount: n } = manaOptions(s, p, a)
			options.forEach((m) => opts.add(m))
			if (a.pain) options.filter((m) => m !== 'C').forEach((m) => pain.push(m))
			amount = Math.max(amount, n)
			same ||= !!a.sameColor
		}
		if (!amount || !opts.size) continue
		const weight = (isCreature(s, p) ? 5 : 0) + (pain.length ? 2 : 0) + (isType(s, p, 'land') ? 0 : 1) + opts.size * 0.1
		out.push({ key: String(p.iid), options: [...opts], amount, sameColor: same, painColors: pain, weight })
	}
	return out
}

export function spellCost(s: GameState, player: number, card: string, fromCommand: boolean, back = false, fromGraveyard = false): Cost {
	const d = def(s, card)
	const r = rulesOf(s, { card, flipped: back })
	let c = parseCost(fromGraveyard && r.flashback ? r.flashback : back && d.back ? d.back.manaCost : d.manaCost)
	if (fromCommand) c = addCost(c, 2 * (s.players[player].commanderCasts[card] ?? 0))
	if (r.affinity) c = addCost(c, -s.battlefield.filter((p) => p.controller === player && isType(s, p, 'artifact')).length)
	if (r.selfReduce) c = addCost(c, -s.battlefield.filter((p) => (!r.selfReduce!.mine || p.controller === player) && matches(s, r.selfReduce!.filter, p, player, p.controller, undefined, p)).length)
	for (const q of s.battlefield) {
		if (q.controller !== player) continue
		const cr = rulesOf(s, q).costReduction
		if (cr && matches(s, cr.filter, { card, flipped: back }, player, player)) c = addCost(c, -cr.n)
		const cm = COST_MODS[def(s, q.card).name]
		if (cm) c = addCost(c, -cm(s, q, card))
	}
	return c
}

function availableMana(s: GameState, player: number): number {
	const pool = Object.values(s.players[player].pool).reduce((a, b) => a + b, 0)
	return pool + manaSources(s, player).reduce((n, x) => n + x.amount, 0)
}

export function canPay(s: GameState, player: number, cost: Cost, x = 0, skip: number[] = []): boolean {
	return !!solvePayment(cost, x, s.players[player].pool, manaSources(s, player, skip))
}

/** Pay a mana cost: tap the chosen sources, add their mana to the pool, then spend it. */
function pay(s: GameState, player: number, cost: Cost, x: number, skip: number[] = []) {
	const pl = s.players[player]
	const plan = solvePayment(cost, x, pl.pool, manaSources(s, player, skip))
	if (!plan) throw new Illegal(`Not enough mana (needs ${costText(cost, x)}).`)
	for (const u of plan.used) {
		const p = findPerm(s, Number(u.key))!
		p.tapped = true
		for (const m of u.mana) pl.pool[m]++
		const src = manaSources(s, player).length // no-op to keep types simple
		void src
		const painful = rulesOf(s, p).manaAbilities.some((a) => a.pain && u.mana.some((m) => m !== 'C' && (a.kind === 'oneOf' ? a.mana.includes(m) : true)))
		if (painful && !rulesOf(s, p).manaAbilities.some((a) => !a.pain && u.mana.every((m) => manaOptions(s, p, a).options.includes(m)))) {
			const n = rulesOf(s, p).manaAbilities.find((a) => a.pain)!.pain!
			pl.life -= n
			log(s, `${permName(s, p)} deals ${n} damage to ${pl.name}.`)
		}
	}
	spendPool(s, player, cost, x)
}

function spendPool(s: GameState, player: number, cost: Cost, x: number) {
	const pool = s.players[player].pool
	const take = (m: Mana) => {
		if (pool[m] <= 0) throw new Illegal('Not enough mana in pool.')
		pool[m]--
	}
	for (const m of ['W', 'U', 'B', 'R', 'G', 'C'] as Mana[]) for (let i = 0; i < (cost.sym[m] ?? 0); i++) take(m)
	for (const m of cost.phyrexian) take(m)
	for (const h of cost.hybrid) {
		const m = (h.find((c) => ['W', 'U', 'B', 'R', 'G'].includes(c) && pool[c as Mana] > 0) as Mana) ?? null
		if (m) take(m)
		else takeAny()
	}
	for (let i = 0; i < cost.generic + cost.x * x; i++) takeAny()
	function takeAny() {
		const m = (['C', 'W', 'U', 'B', 'R', 'G'] as Mana[]).filter((c) => pool[c] > 0).sort((a, b) => pool[b] - pool[a])[0]
		if (!m) throw new Illegal('Not enough mana in pool.')
		pool[m]--
	}
}

// ───────── timing ─────────

const isMain = (s: GameState) => s.step === 'main1' || s.step === 'main2'
const sorceryTime = (s: GameState, p: number) => s.active === p && isMain(s) && s.stack.length === 0
const hasPriority = (s: GameState, p: number) => s.pending.kind === 'priority' && s.pending.player === p

function extraLands(s: GameState, p: number): number {
	return s.battlefield.filter((q) => q.controller === p && rulesOf(s, q).extraLand).length
}

export function canPlayLand(s: GameState, p: number, iid: number, back = false): string | null {
	if (!hasPriority(s, p)) return 'Wait for your turn to act.'
	if (!sorceryTime(s, p)) return 'Lands can be played in your main phase when the stack is empty.'
	const pl = s.players[p]
	const o = pl.hand.find((x) => x.iid === iid) ?? pl.exile.find((x) => x.iid === iid && pl.playable?.some((q) => q.iid === iid && q.until >= s.turn))
	if (!o) return 'That card is not in your hand.'
	if (!rulesOf(s, { card: o.card, flipped: back }).types.includes('land')) return 'That is not a land.'
	if (s.players[p].landsPlayed >= 1 + extraLands(s, p)) return 'You already played a land this turn.'
	return null
}

function castableFrom(s: GameState, p: number, iid: number, free = false): { obj: Obj; zone: 'hand' | 'command' | 'graveyard' | 'exile' | 'library' } | null {
	const pl = s.players[p]
	const h = pl.hand.find((x) => x.iid === iid)
	if (h) return { obj: h, zone: 'hand' }
	const c = pl.command.find((x) => x.iid === iid)
	if (c) return { obj: c, zone: 'command' }
	const g = pl.graveyard.find((x) => x.iid === iid)
	if (g && (free || rulesOf(s, g).flashback)) return { obj: g, zone: 'graveyard' }
	const e = pl.exile.find((x) => x.iid === iid)
	if (e && (free || pl.playable?.some((x) => x.iid === iid && x.until >= s.turn))) return { obj: e, zone: 'exile' }
	if (free) {
		const l = pl.library.find((x) => x.iid === iid)
		if (l) return { obj: l, zone: 'library' }
	}
	return null
}

export function canCast(s: GameState, p: number, iid: number, back = false, checkMana = true): string | null {
	if (!hasPriority(s, p)) return 'Wait until you have priority.'
	const f = castableFrom(s, p, iid)
	if (!f) return 'You can only cast cards from your hand or command zone.'
	const r = rulesOf(s, { card: f.obj.card, flipped: back })
	if (r.types.includes('land')) return 'Play lands with "Play land".'
	const instant = r.types.includes('instant') || r.keywords.includes('flash')
	if (!instant && !sorceryTime(s, p)) return 'This can only be cast in your main phase when the stack is empty.'
	if (checkMana) {
		const cost = spellCost(s, p, f.obj.card, f.zone === 'command', back)
		if (!canPay(s, p, cost, 0)) return `Not enough mana (needs ${costText(cost, r.hasX ? undefined : 0)}).`
	}
	return null
}

export function abilityProblem(s: GameState, p: number, perm: Perm, a: Activated): string | null {
	if (!hasPriority(s, p)) return 'Wait until you have priority.'
	if (perm.controller !== p) return 'You don’t control that.'
	if (!reached(perm, a.threshold)) return `Needs ${a.threshold} charge counters.`
	if (a.station && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && !q.tapped && isCreature(s, q))) return 'You need another untapped creature to station it.'
	if ((a.sorcery || a.equip) && !sorceryTime(s, p)) return 'Only in your main phase when the stack is empty.'
	if (a.cost.tap && perm.tapped) return 'It is tapped.'
	if (a.cost.untap && !perm.tapped) return 'It is untapped.'
	if (a.cost.tap && isCreature(s, perm) && perm.sick && !hasKw(s, perm, 'haste')) return 'It has summoning sickness.'
	if (a.oncePerTurn && (perm.used?.[a.index] ?? 0) >= 1) return 'Already used this turn.'
	if (a.loyalty && Object.entries(perm.used ?? {}).some(([k, v]) => k.startsWith('loyalty') && v > 0)) return 'Only one loyalty ability per turn.'
	if (a.cost.loyalty !== undefined && a.cost.loyalty < 0 && (perm.counters.loyalty ?? 0) < -a.cost.loyalty) return 'Not enough loyalty.'
	if (a.cost.life && s.players[p].life < a.cost.life) return 'Not enough life.'
	if (a.cost.tapOther && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && !q.tapped && isCreature(s, q))) return 'You need another untapped creature.'
	if (a.cost.sacrifice && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && matches(s, a.cost.sacrifice!, q, p, p, undefined, q))) return 'You have nothing to sacrifice for it.'
	if (a.cost.removeCounters) {
		const rc = a.cost.removeCounters
		const have = rc.fromAmong ? s.battlefield.filter((q) => q.controller === p).reduce((n, q) => n + (q.counters[rc.kind ?? ''] ?? 0), 0) : rc.kind ? (perm.counters[rc.kind] ?? 0) : Object.values(perm.counters).reduce((n, v) => n + v, 0)
		if (have < rc.n) return 'Not enough counters.'
	}
	if (a.cost.mana && !canPay(s, p, parseCost(a.cost.mana), 0, a.cost.tap ? [perm.iid] : [])) return `Not enough mana (needs ${a.cost.mana}).`
	return null
}

/** Can this player do anything right now besides passing? (Used to skip needless stops.) */
export function canAct(s: GameState, p: number): boolean {
	const pl = s.players[p]
	if (availableMana(s, p) === 0 && !s.battlefield.some((q) => q.controller === p && rulesOf(s, q).activated.some((a) => !a.cost.mana && !abilityProblem(s, p, q, a)))) {
		// zero-cost spells are rare; ignore
		return false
	}
	for (const o of [...pl.hand, ...pl.command]) {
		const r = rulesOf(s, o)
		if (r.types.includes('land')) continue
		if (!(r.types.includes('instant') || r.keywords.includes('flash')) && !sorceryTime(s, p)) continue
		if (!canCast(s, p, o.iid)) return true
	}
	for (const q of s.battlefield) {
		if (q.controller !== p) continue
		for (const a of rulesOf(s, q).activated) if (!a.equip && !a.sorcery && !abilityProblem(s, p, q, a)) return true
	}
	return false
}

// ───────── tasks (things that may need choices) ─────────

function addTask(s: GameState, kind: Task['kind'], player: number, data: Record<string, unknown>) {
	s.tasks.push({ tid: s.nextId++, kind, player, answers: {}, data })
}

function spellCompiled(s: GameState, card: string, back = false): Compiled | null {
	const d = def(s, card)
	const name = back && d.back ? d.back.name : d.name
	if (NAMED[name]) return NAMED[name].spell
	return rulesOf(s, { card, flipped: back }).spell
}

function runTask(s: GameState, task: Task): GameState {
	const draft = cloneState(s)
	draft.tasks = draft.tasks.filter((t) => t.tid !== task.tid)
	const ctx = makeCtx(draft, task)
	try {
		switch (task.kind) {
			case 'cast':
				doCast(ctx)
				break
			case 'activate':
				doActivate(ctx)
				break
			case 'trigger':
				doTrigger(ctx)
				break
			case 'resolve':
				doResolve(ctx)
				break
			case 'script':
				doScript(ctx)
				break
		}
	} catch (e) {
		if (e instanceof NeedChoice) {
			s.pending = { kind: 'choose', player: e.player, question: e.question, task: task.tid }
			return s
		}
		if (e instanceof Illegal && (task.kind === 'cast' || task.kind === 'activate')) {
			// undo the attempt: drop the task, keep priority (and remember it, so the computer doesn't retry it this turn)
			s.tasks = s.tasks.filter((t) => t.tid !== task.tid)
			const pl = s.players[task.player]
			pl.failed = [...(pl.failed ?? []).filter((f) => f.turn === s.turn), { iid: (task.data as { iid: number }).iid, turn: s.turn }]
			s.notice = { player: task.player, text: e.message }
			s.pending = { kind: 'priority', player: task.player }
			return s
		}
		throw e
	}
	return draft
}

function doCast(ctx: Ctx) {
	const s = ctx.s
	const { iid, back, free } = ctx.task.data as { iid: number; back?: boolean; free?: boolean }
	const p = ctx.task.player
	const f = castableFrom(s, p, iid, free)
	if (!f) throw new Illegal('That card is no longer available.')
	const card = f.obj.card
	const r = rulesOf(s, { card, flipped: back })
	const flashback = f.zone === 'graveyard' && !free
	let cost = free ? parseCost('') : spellCost(s, p, card, f.zone === 'command', back, flashback)
	// kicker / multikicker / squad
	let kicked = 0
	const extra = r.kicker ?? r.multikicker ?? r.squad
	if (extra && !free) {
		const many = !r.kicker
		const opts: { id: string; label: string; score: number }[] = []
		for (let k = 0; k <= (many ? 6 : 1); k++) {
			let c2 = cost
			for (let j = 0; j < k; j++) c2 = joinCost(c2, parseCost(extra))
			if (canPay(s, p, c2, 0)) opts.push({ id: String(k), label: k === 0 ? `Don\u2019t pay ${r.kicker ? 'kicker' : r.squad ? 'squad' : 'multikicker'}` : `Pay ${extra}${many ? ` ×${k}` : ''}`, score: k })
		}
		if (opts.length > 1) kicked = Number(ctx.ask(p, { key: 'kick', prompt: `${cardName(s, card)}: pay ${r.kicker ? 'kicker' : r.squad ? 'squad (one copy each)' : 'multikicker'} ${extra}?`, options: opts, min: 1, max: 1 })[0])
		for (let j = 0; j < kicked; j++) cost = joinCost(cost, parseCost(extra))
	}
	let x = 0
	if (cost.x > 0) {
		const opts = []
		for (let i = 0; i <= 20; i++) if (canPay(s, p, cost, i)) opts.push({ id: String(i), label: `X = ${i}`, score: i })
		if (!opts.length) throw new Illegal('Not enough mana.')
		x = Number(ctx.ask(p, { key: 'x', prompt: `${cardName(s, card)}: choose X`, options: opts, min: 1, max: 1 })[0])
	}
	// targets: spell effect targets, or an Aura's enchant target
	let targets: Target[] = []
	let manual = false
	let modes: number[] | undefined
	if (r.modal) {
		const m = r.modal
		// only modes that can find their targets
		const usable = (md: (typeof m.modes)[number]) => !md.compiled || md.compiled.targets.every((t) => (t.min ?? 1) === 0 || targetOptions(s, t, p, { card }).length >= (t.min ?? 1))
		const opts = m.modes.map((md, i) => ({ id: String(i), label: md.text + (md.compiled ? '' : ' (by hand)'), score: md.compiled ? 1 : 0, ok: usable(md) })).filter((o) => o.ok).map(({ ok, ...o }) => (void ok, o))
		if (opts.length < (m.upTo ? 1 : Math.min(m.n, m.modes.length))) throw new Illegal('Not enough of its modes can be chosen right now.')
		modes = ctx.ask(p, { key: 'modes', prompt: `${cardName(s, card)}: choose ${m.n === 1 ? 'one' : m.upTo ? 'one or both' : 'two'}`, options: opts, min: m.upTo ? 1 : Math.min(m.n, opts.length), max: Math.min(m.n, opts.length) }).map(Number).sort((a, b) => a - b)
		const comp = modalCompiled(r, modes)
		if (comp) {
			const t = chooseTargets(ctx, comp, p, { card }, 'c')
			if (!t) throw new Illegal('There are no legal targets for those modes.')
			targets = t
		} else manual = true
	} else if (r.types.includes('instant') || r.types.includes('sorcery')) {
		const comp = spellCompiled(s, card, back)
		if (comp) {
			const t = chooseTargets(ctx, comp, p, { card }, 'c')
			if (!t) throw new Illegal('There are no legal targets.')
			targets = t
		} else manual = true
	} else if (r.subtypes.includes('Aura') && r.enchant) {
		const t = chooseTargets(ctx, { targets: [{ kind: 'perm', filter: r.enchant }], effects: [] }, p, { card }, 'c')
		if (!t) throw new Illegal('There is nothing it can enchant.')
		targets = t
	}
	// additional costs
	const ec = r.extraCost
	if (ec && !free) {
		if (ec.lifeX) {
			const opts = []
			for (let i = 0; i <= Math.max(0, s.players[p].life - 1); i++) opts.push({ id: String(i), label: `Pay ${i} life`, score: i })
			x = Number(ctx.ask(p, { key: 'lifex', prompt: `${cardName(s, card)}: pay X life`, options: opts.slice(0, 21), min: 1, max: 1 })[0])
		}
		if (ec.discard) {
			const others = s.players[p].hand.filter((o) => o.iid !== iid)
			let payLife = false
			if (ec.orLife) {
				const opts = [{ id: 'life', label: `Pay ${ec.orLife} life`, score: s.players[p].life > 10 ? 2 : 0 }]
				if (others.length) opts.push({ id: 'discard', label: 'Discard a card', score: 1 })
				payLife = ctx.ask(p, { key: 'orlife', prompt: `${cardName(s, card)}: additional cost`, options: opts, min: 1, max: 1 })[0] === 'life'
			}
			if (!payLife) {
				if (others.length < ec.discard) throw new Illegal('You need a card to discard.')
				const picks = ctx.ask(p, { key: 'ecd', prompt: `${cardName(s, card)}: discard ${ec.discard} as an additional cost`, options: others.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: ec.discard, max: ec.discard, cards: true })
				for (const id of picks) moveCard(s, Number(id), 'graveyard')
			} else s.players[p].life -= ec.orLife!
		}
		if (ec.sacrifice) {
			const opts = s.battlefield.filter((q) => q.controller === p && matches(s, ec.sacrifice!, q, p, p, undefined, q))
			if (!opts.length) throw new Illegal('You have nothing to sacrifice for it.')
			const [pick] = ctx.ask(p, { key: 'ecs', prompt: `${cardName(s, card)}: sacrifice as an additional cost`, options: opts.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -def(s, q.card).cmc })), min: 1, max: 1, cards: true })
			moveCard(s, Number(pick), 'graveyard', { cause: 'sacrifice' })
		}
		if (ec.lifeX) s.players[p].life -= x
	}
	if (!free) pay(s, p, cost, x)
	const it = detach(s, iid)!
	if (f.zone === 'command') s.players[p].commanderCasts[card] = (s.players[p].commanderCasts[card] ?? 0) + 1
	s.players[p].playable = s.players[p].playable?.filter((q) => q.iid !== iid)
	s.stack.push({ sid: s.nextId++, kind: 'spell', controller: p, card, iid, obj: it.obj, text: back && def(s, card).back ? def(s, card).back!.name : cardName(s, card), targets, x, fromCommand: f.zone === 'command', manual, modes, kicked: kicked || undefined, flashback: flashback || undefined, rebound: (f.zone === 'hand' && /^Rebound\b/m.test(def(s, card).oracle)) || undefined, ...(back ? { ability: -1 } : {}) })
	log(s, `${s.players[p].name} casts ${cardName(s, card)}${f.zone === 'command' ? ' from the command zone' : flashback ? ' with flashback' : free ? ' without paying its mana cost' : ''}${x ? ` (X=${x})` : ''}${kicked ? ' (kicked)' : ''}${targets.length ? ` targeting ${targets.map((t) => targetName(s, t)).join(', ')}` : ''}.`)
	for (const { index } of triggersOf(s, { card }, 'cast')) queue(s).push({ iid, card, controller: p, index })
	// "whenever you cast …" / "whenever an opponent casts …"
	for (const q of s.battlefield)
		for (const { t, index } of triggersOf(s, q, 'castSpell'))
			if (reached(q, t.threshold) && (t.who === 'any' || (t.who === 'you') === (q.controller === p)) && (!t.filter || matches(s, t.filter, { card }, q.controller, p)))
				queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: iid })
	afterStackAdd(s, p)
}

function joinCost(a: Cost, b: Cost): Cost {
	const sym = { ...a.sym }
	for (const [k, v] of Object.entries(b.sym)) sym[k as Mana] = (sym[k as Mana] ?? 0) + (v ?? 0)
	return { generic: a.generic + b.generic, sym, hybrid: [...a.hybrid, ...b.hybrid], x: a.x + b.x, phyrexian: [...a.phyrexian, ...b.phyrexian] }
}

/** Merge the chosen modes of a modal spell into one compiled effect (targets renumbered). */
export function modalCompiled(r: Rules, modes: number[]): Compiled | null {
	const out: Compiled = { targets: [], effects: [] }
	for (const i of modes) {
		const c = r.modal?.modes[i]?.compiled
		if (!c) return null
		const base = out.targets.length
		out.targets.push(...c.targets)
		for (const e of c.effects) out.effects.push(renumber(e, base))
	}
	return out
}

function renumber(e: Effect, base: number): Effect {
	const x = { ...e } as Record<string, unknown>
	for (const k of ['t', 'a', 'b']) if (typeof x[k] === 'number') x[k] = (x[k] as number) + base
	return x as Effect
}

function targetName(s: GameState, t: Target): string {
	if (t.kind === 'player') return s.players[t.id].name
	if (t.kind === 'stack') {
		const it = s.stack.find((x) => x.sid === t.id)
		return it ? cardName(s, it.card) : 'a spell'
	}
	const p = findPerm(s, t.id)
	return p ? permName(s, p) : 'a permanent'
}

function afterStackAdd(s: GameState, p: number) {
	// The player who added to the stack is treated as passing; the other player gets priority.
	s.passes = 1
	s.pending = { kind: 'priority', player: opp(p) }
}

function doActivate(ctx: Ctx) {
	const s = ctx.s
	const { iid, ability } = ctx.task.data as { iid: number; ability: number }
	const p = ctx.task.player
	const perm = findPerm(s, iid)
	if (!perm) throw new Illegal('That permanent is gone.')
	const a = rulesOf(s, perm).activated.find((x) => x.index === ability)
	if (!a) throw new Illegal('No such ability.')
	const problem = abilityProblem(s, p, perm, a)
	if (problem) throw new Illegal(problem)
	let targets: Target[] = []
	if (a.compiled && a.compiled.targets.length) {
		const t = chooseTargets(ctx, a.compiled, p, { card: perm.card, iid: perm.iid }, 'a')
		if (!t) throw new Illegal('There are no legal targets.')
		targets = t
	}
	let x: number | undefined
	if (a.station) {
		const crew = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && !q.tapped && isCreature(s, q))
		const [pick] = ctx.ask(p, { key: 'st', prompt: `Station ${permName(s, perm)}: tap which creature? (its power becomes charge counters)`, options: crew.map((q) => ({ id: String(q.iid), label: `${permName(s, q)} (${pt(s, q)[0]})`, card: q.card, iid: q.iid, score: pt(s, q)[0] })), min: 1, max: 1, cards: true })
		const c = findPerm(s, Number(pick))!
		c.tapped = true
		x = Math.max(0, pt(s, c)[0])
	}
	if (a.cost.discard) {
		if (s.players[p].hand.length < a.cost.discard) throw new Illegal('You have no card to discard.')
		discardFx(ctx, p, a.cost.discard, 'cd')
	}
	if (a.cost.mana) pay(s, p, parseCost(a.cost.mana), 0, a.cost.tap ? [perm.iid] : [])
	if (a.cost.tapOther) {
		const crew = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && !q.tapped && isCreature(s, q))
		const [pick] = ctx.ask(p, { key: 'tapo', prompt: `${permName(s, perm)}: tap an untapped creature you control`, options: crew.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -pt(s, q)[0] })), min: 1, max: 1, cards: true })
		setTapped(s, findPerm(s, Number(pick))!, true)
	}
	if (a.cost.removeCounters) {
		const rc = a.cost.removeCounters
		let left = rc.n
		const pool = rc.fromAmong ? s.battlefield.filter((q) => q.controller === p) : [perm]
		for (const q of pool)
			for (const k of rc.kind ? [rc.kind] : Object.keys(q.counters)) {
				while (left > 0 && (q.counters[k] ?? 0) > 0) {
					q.counters[k]--
					left--
				}
			}
	}
	if (a.cost.tap) setTapped(s, perm, true)
	if (a.cost.untap) perm.tapped = false
	if (a.cost.life) s.players[p].life -= a.cost.life
	if (a.cost.loyalty !== undefined) {
		perm.counters.loyalty = (perm.counters.loyalty ?? 0) + a.cost.loyalty
		perm.used = { ...(perm.used ?? {}), loyalty: 1 }
	}
	perm.used = { ...(perm.used ?? {}), [a.index]: (perm.used?.[a.index] ?? 0) + 1 }
	const card = perm.card
	let sacrificed: number | undefined
	if (a.cost.sacrifice) {
		const opts = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && matches(s, a.cost.sacrifice!, q, p, p, undefined, q))
		const [pick] = ctx.ask(p, { key: 'sacc', prompt: `${permName(s, perm)}: sacrifice ${a.cost.sacrifice.subtypes?.join(' or ') || a.cost.sacrifice.types.join(' or ') || 'a permanent'}`, options: opts.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -def(s, q.card).cmc })), min: 1, max: 1, cards: true })
		moveCard(s, Number(pick), 'graveyard', { cause: 'sacrifice' })
		sacrificed = Number(pick)
	}
	if (a.cost.sacrificeSelf) moveCard(s, iid, 'graveyard', { cause: 'sacrifice' })
	s.stack.push({ sid: s.nextId++, kind: 'ability', controller: p, card, iid, text: a.station ? `Station: +${x} charge` : a.text, ability: a.index, targets, x, manual: !a.compiled || !!a.cost.other, about: sacrificed })
	log(s, `${s.players[p].name} activates ${cardName(s, card)}${a.equip ? ' (equip)' : ''}${targets.length ? ` targeting ${targets.map((t) => targetName(s, t)).join(', ')}` : ''}.${a.cost.other ? ` (Pay by hand: ${a.cost.other}.)` : ''}`)
	afterStackAdd(s, p)
}

function doTrigger(ctx: Ctx) {
	const s = ctx.s
	const q = ctx.task.data as unknown as QueuedTrigger
	const r0 = rulesOf(s, { card: q.card, flipped: q.flipped })
	const chapterIdx = q.index <= -100 ? -100 - q.index : -1
	const ch = chapterIdx >= 0 ? r0.chapters?.[chapterIdx] : undefined
	const t = ch ? ({ index: q.index, event: 'etb', text: `Chapter: ${ch.text}`, effectText: ch.text, compiled: ch.compiled } as Trigger) : r0.triggers[q.index]
	if (!t) return
	let targets: Target[] = []
	if (t.compiled && t.compiled.targets.length) {
		const tt = chooseTargets(ctx, t.compiled, q.controller, { card: q.card, iid: q.iid }, 'g')
		if (!tt) {
			log(s, `${cardName(s, q.card)}'s ability has no legal targets.`)
			return
		}
		targets = tt
	}
	s.stack.push({ sid: s.nextId++, kind: 'trigger', controller: q.controller, card: q.card, iid: q.iid, text: t.text, ability: q.index, targets, manual: !t.compiled, flipped: q.flipped, chapter: ch ? chapterIdx : undefined, x: t.event === 'combatDamagePlayer' && typeof q.about === 'number' ? q.about : undefined, about: t.event === 'combatDamagePlayer' ? undefined : q.about })
	s.passes = 0
	s.pending = { kind: 'priority', player: s.active }
}

function doResolve(ctx: Ctx) {
	const s = ctx.s
	const it = s.stack[s.stack.length - 1]
	if (!it) return
	const me = it.controller
	if (it.manual) {
		const text = it.kind === 'spell' ? def(s, it.card).oracle : it.text
		ctx.ask(me, { key: 'manual', prompt: `${cardName(s, it.card)} — do this by hand with the table tools, then press Done:\n${text}`, options: [{ id: 'done', label: 'Done', card: it.card, score: 1 }, { id: 'skip', label: 'Skip it' }], min: 1, max: 1 })
	}
	s.stack.pop()
	if (it.kind === 'spell') {
		const back = it.ability === -1
		const r = rulesOf(s, { card: it.card, flipped: back })
		if (!isPermanentCard(s, it.card, back)) {
			const comp = it.modes ? modalCompiled(r, it.modes) : spellCompiled(s, it.card, back)
			if (comp && !it.manual) {
				// rule 608.2b: if it had targets and all of them are now illegal, it does nothing
				const legal = it.targets.map((t, j) => {
					const spec = comp.targets[t.spec ?? j]
					return !!spec && stillLegal(s, spec, t, me, { card: it.card })
				})
				if (it.targets.length && legal.every((l) => !l)) log(s, `${cardName(s, it.card)} has no legal targets and does nothing.`)
				else runCompiled(ctx, it, comp)
			}
			if (it.obj && !it.copy) {
				const o = it.obj
				s.players[o.owner][it.flashback || it.rebound ? 'exile' : 'graveyard'].push(o)
				if (it.rebound) {
					later(s, { at: 'upkeep', kind: 'rebound', iid: o.iid, owner: o.owner })
					log(s, `${cardName(s, it.card)} is exiled with rebound.`)
				}
				if (o.commander) moveCard(s, o.iid, 'command')
			}
			log(s, `${cardName(s, it.card)} resolves.`)
		} else {
			if (it.copy) return
			const o = it.obj!
			// put the object back in a zone so moveCard can take it
			s.players[o.owner].exile.push(o)
			if (r.subtypes.includes('Aura')) {
				const tgt = it.targets[0]
				const host = tgt && tgt.kind === 'perm' ? findPerm(s, tgt.id) : undefined
				if (!host) {
					moveCard(s, o.iid, 'graveyard', { manual: true })
					log(s, `${cardName(s, it.card)} has nothing to enchant and goes to the graveyard.`)
					return
				}
				moveCard(s, o.iid, 'battlefield', { controller: me, flipped: back })
				const perm = findPerm(s, o.iid)
				if (perm) perm.attachedTo = host.iid
			} else moveCard(s, o.iid, 'battlefield', { controller: me, flipped: back, kicked: it.kicked, x: it.x })
			// squad: token copies
			if (r.squad && it.kicked) createToken(s, me, it.card, it.kicked)
			log(s, `${cardName(s, it.card)} enters the battlefield.`)
		}
		return
	}
	// abilities and triggers
	const flipped = it.flipped
	const r = rulesOf(s, { card: it.card, flipped })
	if (it.kind === 'ability') {
		const a = r.activated.find((x) => x.index === it.ability)
		if (a?.equip) {
			const eq = findPerm(s, it.iid)
			const host = it.targets[0] ? findPerm(s, it.targets[0].id) : undefined
			if (eq && host && host.controller === me && isCreature(s, host)) {
				eq.attachedTo = host.iid
				log(s, `${permName(s, eq)} is attached to ${permName(s, host)}.`)
			}
			return
		}
		if (a?.station) {
			const sc = findPerm(s, it.iid)
			if (sc) {
				sc.counters.charge = (sc.counters.charge ?? 0) + (it.x ?? 0)
				log(s, `${permName(s, sc)} now has ${sc.counters.charge} charge counters.`)
			}
			return
		}
		if (a?.compiled && !it.manual) runCompiled(ctx, it, a.compiled)
		return
	}
	if (it.chapter !== undefined) {
		const c = r.chapters?.[it.chapter]?.compiled
		if (c && !it.manual) runCompiled(ctx, it, c)
		return
	}
	const t = r.triggers[it.ability ?? -1]
	if (t?.compiled && !it.manual) runCompiled(ctx, it, t.compiled)
}

function doScript(ctx: Ctx) {
	const s = ctx.s
	const d = ctx.task.data as { kind: string; count?: number }
	if (d.kind === 'cycleSearch') {
		searchFx(ctx, ctx.task.player, { e: 'search', filter: { types: ['land'], not: [], basic: true }, count: 1, dest: 'hand', tapped: false, reveal: true }, 'cs')
		return
	}
	if (d.kind === 'cleanupDiscard') {
		const p = s.active
		const n = s.players[p].hand.length - 7
		if (n > 0) discardFx(ctx, p, n, 'cl')
	}
}

// ───────── state-based actions (rule 704) ─────────

function checkSBA(s: GameState): boolean {
	let changed = false
	for (const pl of s.players) {
		if (pl.lost) continue
		if (pl.life <= 0) pl.lost = 'life total 0'
		else if (pl.poison >= 10) pl.lost = '10 poison counters'
		else if ((pl as { drewFromEmpty?: boolean }).drewFromEmpty) pl.lost = 'drew from an empty library'
		else if (s.format.commanderDamage && Object.values(pl.commanderDamage).some((v) => v >= 21)) pl.lost = '21 commander damage'
		if (pl.lost) {
			log(s, `${pl.name} loses (${pl.lost}).`)
			changed = true
		}
	}
	const losers = s.players.filter((p) => p.lost).length
	if (losers > 0) {
		const alive = s.players.findIndex((p) => !p.lost)
		s.pending = { kind: 'over', winner: losers === 2 ? null : alive }
		return true
	}
	// counters cancel
	for (const p of s.battlefield) {
		const a = p.counters['+1/+1'] ?? 0
		const b = p.counters['-1/-1'] ?? 0
		if (a && b) {
			const m = Math.min(a, b)
			p.counters['+1/+1'] = a - m
			p.counters['-1/-1'] = b - m
		}
	}
	for (const p of s.battlefield.slice()) {
		if (!findPerm(s, p.iid)) continue
		if (isCreature(s, p)) {
			const [, t] = pt(s, p)
			if (t <= 0) {
				moveCard(s, p.iid, 'graveyard')
				changed = true
				continue
			}
			if ((p.damage >= t || (p.deathtouched && p.damage > 0)) && !hasKw(s, p, 'indestructible')) {
				moveCard(s, p.iid, 'graveyard')
				changed = true
				continue
			}
		}
		if (isType(s, p, 'planeswalker') && !isCreature(s, p) && (p.counters.loyalty ?? 0) <= 0) {
			moveCard(s, p.iid, 'graveyard')
			changed = true
			continue
		}
		const r = rulesOf(s, p)
		if (r.chapters?.length && (p.counters.lore ?? 0) >= Math.max(...r.chapters.flatMap((c) => c.nums)) && !s.stack.some((it) => it.iid === p.iid && it.chapter !== undefined) && !queue(s).some((q) => q.iid === p.iid) && !s.tasks.some((t) => (t.data as { iid?: number }).iid === p.iid)) {
			moveCard(s, p.iid, 'graveyard', { cause: 'sacrifice' })
			changed = true
			continue
		}
		if (r.subtypes.includes('Aura') && (p.attachedTo === undefined || !findPerm(s, p.attachedTo))) {
			moveCard(s, p.iid, 'graveyard')
			changed = true
			continue
		}
		if (r.subtypes.includes('Equipment') && p.attachedTo !== undefined) {
			const h = findPerm(s, p.attachedTo)
			if (!h || !isCreature(s, h)) p.attachedTo = undefined
		}
	}
	// legend rule: keep the newest
	const seen = new Map<string, Perm>()
	for (const p of s.battlefield.slice().sort((a, b) => b.iid - a.iid)) {
		if (!rulesOf(s, p).supertypes.includes('legendary') || p.faceDown) continue
		const k = `${p.controller}:${permName(s, p)}`
		if (seen.has(k)) {
			moveCard(s, p.iid, 'graveyard')
			log(s, `Legend rule: the older ${permName(s, p)} goes to the graveyard.`)
			changed = true
		} else seen.set(k, p)
	}
	return changed
}

// ───────── steps ─────────

const ORDER: Step[] = ['untap', 'upkeep', 'draw', 'main1', 'beginCombat', 'attackers', 'blockers', 'firstDamage', 'damage', 'endCombat', 'main2', 'end', 'cleanup']

export function canAttack(s: GameState, p: Perm): boolean {
	return p.controller === s.active && isCreature(s, p) && !p.tapped && !(p.sick && !hasKw(s, p, 'haste')) && !hasKw(s, p, 'defender')
}

export function canBlock(s: GameState, blocker: Perm, attacker: Perm): boolean {
	if (blocker.tapped || !isCreature(s, blocker) || blocker.controller === attacker.controller) return false
	const ak = keywords(s, attacker)
	const bk = keywords(s, blocker)
	const ar = rulesOf(s, attacker)
	if (bk.includes('cantblock') || rulesOf(s, blocker).cantBlock) return false
	if (ar.unblockable === true || (ar.unblockable === 'ifSpacecraft' && s.battlefield.some((q) => q.controller === attacker.controller && rulesOf(s, q).subtypes.includes('Spacecraft')))) return false
	if (ar.evasionPower !== undefined && pt(s, blocker)[0] <= ar.evasionPower) return false
	if ((ak.includes('flying') || ak.includes('horsemanship')) && !bk.includes('flying') && !bk.includes('reach')) return false
	if (ak.includes('unblockable')) return false
	if (ak.includes('fear') && !def(s, blocker.card).colors.includes('B') && !isType(s, blocker, 'artifact')) return false
	if (ak.includes('intimidate') && !isType(s, blocker, 'artifact') && !def(s, blocker.card).colors.some((c) => def(s, attacker.card).colors.includes(c))) return false
	if (ak.includes('skulk') && pt(s, blocker)[0] > pt(s, attacker)[0]) return false
	const names: Record<string, Color> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }
	for (const k of ak) {
		const m = k.match(/^protection from (.+)$/)
		if (m) for (const [w, c] of Object.entries(names)) if (m[1].includes(w) && def(s, blocker.card).colors.includes(c)) return false
	}
	for (const k of ak) {
		const m = k.match(/^(plains|island|swamp|mountain|forest)walk$/)
		if (m && s.battlefield.some((q) => q.controller === blocker.controller && rulesOf(s, q).subtypes.some((st) => st.toLowerCase() === m[1]))) return false
	}
	return true
}

function enterStep(s: GameState, step: Step) {
	s.step = step
	s.passes = 0
	for (const pl of s.players) if (!pl.floating) pl.pool = emptyPool()
	const a = s.active
	switch (step) {
		case 'main1':
			for (const p of s.battlefield)
				if (p.controller === a && rulesOf(s, p).chapters?.length) {
					p.counters.lore = (p.counters.lore ?? 0) + 1
					chapter(s, p)
				}
			break
		case 'untap': {
			s.turn++
			const pl = s.players[a]
			pl.landsPlayed = 0
			for (const x of s.players) x.drawsThisTurn = 0
			;(s as { diedThisTurn?: Record<number, number> }).diedThisTurn = {}
			for (const p of s.battlefield) {
				if (p.controller === a) {
					if (p.skipUntap) p.skipUntap = false
					else p.tapped = false
					p.sick = false
				}
				else if (p.tapped && isType(s, p, 'artifact') && s.battlefield.some((q) => q.controller === p.controller && cardName(s, q.card) === 'Unwinding Clock')) p.tapped = false
				p.used = undefined
				p.mods = p.mods.filter((m) => !(m.until === 'turn' && (m.expires ?? 0) <= s.turn))
			}
			log(s, `— Turn ${s.turn}: ${pl.name} —`)
			return enterStep(s, 'upkeep')
		}
		case 'upkeep':
			runDelayed(s, 'upkeep')
			for (const p of s.battlefield) {
				if (p.controller === a) fire(s, p, 'upkeep')
				fire(s, p, 'eachUpkeep')
			}
			break
		case 'draw':
			if (!(s.turn === 1 && a === s.firstPlayer)) drawCards(s, a, 1, true)
			for (const p of s.battlefield) {
				if (p.controller === a) fire(s, p, 'yourDraw')
				fire(s, p, 'eachDraw')
			}
			break
		case 'beginCombat': {
			s.combat = { attackers: [], blocks: [], declared: false, blocksDeclared: false, firstStrikeDone: false }
			for (const p of s.battlefield) if (p.controller === a) fire(s, p, 'beginCombat')
			if (!queue(s).length && !s.battlefield.some((p) => canAttack(s, p))) {
				s.combat = null
				return enterStep(s, 'main2')
			}
			break
		}
		case 'attackers':
			if (!s.battlefield.some((p) => canAttack(s, p))) {
				s.combat = null
				return enterStep(s, 'main2')
			}
			s.pending = { kind: 'attackers', player: a }
			return
		case 'blockers': {
			const c = s.combat
			if (!c || !c.attackers.length) {
				s.combat = null
				return enterStep(s, 'main2')
			}
			const d = opp(a)
			const any = s.battlefield.some((b) => b.controller === d && c.attackers.some((x) => canBlock(s, b, findPerm(s, x.iid)!)))
			if (any) {
				s.pending = { kind: 'blockers', player: d }
				return
			}
			c.blocksDeclared = true
			break
		}
		case 'firstDamage': {
			const c = s.combat
			if (!c) return enterStep(s, 'main2')
			const fs = [...c.attackers.map((x) => x.iid), ...c.blocks.map((b) => b.blocker)].some((iid) => {
				const p = findPerm(s, iid)
				return p && (hasKw(s, p, 'first strike') || hasKw(s, p, 'double strike'))
			})
			if (!fs) return enterStep(s, 'damage')
			combatDamage(s, true)
			break
		}
		case 'damage':
			if (!s.combat) return enterStep(s, 'main2')
			combatDamage(s, false)
			break
		case 'endCombat':
			runDelayed(s, 'endCombat')
			break
		case 'main2':
			s.combat = null
			break
		case 'end':
			runDelayed(s, 'end')
			for (const p of s.battlefield) {
				if (p.controller === a) fire(s, p, 'endStep')
				fire(s, p, 'eachEndStep')
			}
			break
		case 'cleanup': {
			runDelayed(s, 'cleanup')
			for (const x of s.players) x.floating = 0
			const pl = s.players[a]
			const noMax = s.battlefield.some((p) => p.controller === a && rulesOf(s, p).noMaxHandSize)
			if (pl.hand.length > 7 && !noMax) addTask(s, 'script', a, { kind: 'cleanupDiscard' })
			for (const p of s.battlefield) {
				p.damage = 0
				p.deathtouched = false
				p.mods = p.mods.filter((m) => m.until !== 'eot')
			}
			s.pending = { kind: 'priority', player: a }
			return
		}
	}
	s.pending = { kind: 'priority', player: a }
}

function nextStep(s: GameState) {
	if (s.step === 'main2' && (s.extraCombats ?? 0) > 0) {
		s.extraCombats!--
		log(s, `${s.players[s.active].name} gets an additional combat phase.`)
		if ((s.untapAtExtra ?? 0) > 0) {
			s.untapAtExtra!--
			for (const q of s.battlefield) if (q.attackedTurn === s.turn) q.tapped = false
		}
		return enterStep(s, 'beginCombat')
	}
	if (s.step === 'cleanup') {
		s.extraCombats = 0
		s.untapAtExtra = 0
		s.active = opp(s.active)
		return enterStep(s, 'untap')
	}
	if (s.step === 'endCombat') {
		s.combat = null
		return enterStep(s, 'main2')
	}
	const i = ORDER.indexOf(s.step)
	enterStep(s, ORDER[i + 1])
}

function combatDamage(s: GameState, first: boolean) {
	const c = s.combat!
	const strikes = (p: Perm) => {
		const fs = hasKw(s, p, 'first strike')
		const ds = hasKw(s, p, 'double strike')
		return first ? fs || ds : !fs || ds || !c.firstStrikeDone
	}
	const dealt: { src: Perm; t: Target; n: number }[] = []
	for (const a of c.attackers) {
		const att = findPerm(s, a.iid)
		if (!att || !strikes(att)) continue
		if (!first && c.firstStrikeDone && hasKw(s, att, 'first strike') && !hasKw(s, att, 'double strike')) continue
		let [power] = pt(s, att)
		if (power <= 0) continue
		const blockers = c.blocks.filter((b) => b.attacker === a.iid).map((b) => findPerm(s, b.blocker)).filter(Boolean) as Perm[]
		const wasBlocked = c.blocks.some((b) => b.attacker === a.iid)
		if (!wasBlocked) {
			dealt.push({ src: att, t: { kind: 'player', id: a.defender }, n: power })
			continue
		}
		const dt = hasKw(s, att, 'deathtouch')
		for (const b of blockers) {
			if (power <= 0) break
			const [, bt] = pt(s, b)
			const lethal = dt ? 1 : Math.max(0, bt - b.damage)
			const n = blockers.indexOf(b) === blockers.length - 1 && !hasKw(s, att, 'trample') ? power : Math.min(power, lethal)
			dealt.push({ src: att, t: { kind: 'perm', id: b.iid }, n })
			power -= n
		}
		if (power > 0 && hasKw(s, att, 'trample')) dealt.push({ src: att, t: { kind: 'player', id: a.defender }, n: power })
	}
	for (const b of c.blocks) {
		const bl = findPerm(s, b.blocker)
		const att = findPerm(s, b.attacker)
		if (!bl || !att || !strikes(bl)) continue
		if (!first && c.firstStrikeDone && hasKw(s, bl, 'first strike') && !hasKw(s, bl, 'double strike')) continue
		const [power] = pt(s, bl)
		if (power > 0) dealt.push({ src: bl, t: { kind: 'perm', id: att.iid }, n: power })
	}
	for (const d of dealt) {
		dealDamage(s, { card: d.src.card, controller: d.src.controller, iid: d.src.iid }, d.t, d.n, true)
		if (d.t.kind === 'player') fire(s, d.src, 'combatDamagePlayer', d.n)
	}
	// Right of Vengeance: "until end of turn, whenever a creature deals combat damage to you, destroy it and create a 2/1 Klingon Warrior"
	const veng = (s as { vengeance?: { player: number; turn: number }[] }).vengeance?.filter((v) => v.turn === s.turn) ?? []
	for (const v of veng)
		for (const d of dealt)
			if (d.t.kind === 'player' && d.t.id === v.player && findPerm(s, d.src.iid)) {
				destroy(s, d.src.iid)
				createToken(s, v.player, makeTokenDef(s, { e: 'token', n: 1, name: 'Klingon Warrior', power: 2, toughness: 1, types: 'Creature — Klingon Warrior', colors: ['R'], keywords: ['haste'] }, 0), 1)
			}
	// "whenever one or more Officers you control deal combat damage to a player" — once per damage step
	for (const q of s.battlefield)
		for (const { t, index } of triggersOf(s, q, 'teamDamage'))
			if (dealt.some((d) => d.t.kind === 'player' && d.src.controller === q.controller && (!t.filter || matches(s, t.filter, d.src, q.controller, d.src.controller, undefined, d.src))))
				queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index })
	if (first) c.firstStrikeDone = true
}

// ───────── the main loop ─────────

function flushTriggers(s: GameState) {
	const q = queue(s)
	if (!q.length) return
	// APNAP (rule 101.4): active player's triggers go on the stack first
	const ordered = [...q.filter((t) => t.controller === s.active), ...q.filter((t) => t.controller !== s.active)]
	q.length = 0
	for (const t of ordered) addTask(s, 'trigger', t.controller, t as unknown as Record<string, unknown>)
}

/** Would the player with priority want to stop here? If not, they pass automatically. */
function wantsStop(s: GameState, p: number): boolean {
	if (s.stack.length) return canAct(s, p)
	if (p === s.active && isMain(s)) return true
	if (p === s.active && s.step === 'cleanup') return false
	if (p !== s.active && (s.step === 'end' || s.step === 'blockers' || s.step === 'beginCombat')) return canAct(s, p)
	if (p === s.active && s.step === 'blockers' && s.combat?.blocks.length) return canAct(s, p)
	return false
}

function passPriority(s: GameState, p: number) {
	s.passes++
	if (s.passes >= 2) {
		s.passes = 0
		if (s.stack.length) {
			addTask(s, 'resolve', s.stack[s.stack.length - 1].controller, {})
			s.pending = { kind: 'priority', player: s.active }
		} else nextStep(s)
	} else s.pending = { kind: 'priority', player: opp(p) }
}

// ───────── frames: the in-between moments of one move, for the UI to play back ─────────

let collecting: GameState[] | null = null
let frameBase = 0
const FRAME_CAP = 12

/** Run `f` and return the in-between states (attacks declared, a spell on the stack, damage dealt, …) that
 * one apply() skipped through with automatic passes. Only successful applies contribute. */
export function withFrames<T>(f: () => T): { result: T; frames: GameState[] } {
	const outer = collecting
	collecting = []
	try {
		const result = f()
		const frames = collecting
		return { result, frames: frames.length > FRAME_CAP ? frames.slice(-FRAME_CAP) : frames }
	} finally {
		collecting = outer
	}
}

function snap(s: GameState) {
	if (!collecting) return
	const last = collecting[collecting.length - 1]
	if (last ? last.log.length === s.log.length && last.stack.length === s.stack.length : s.log.length === frameBase) return
	collecting.push(cloneState(s))
}

function settle(s: GameState): GameState {
	for (let guard = 0; guard < 2000; guard++) {
		if (s.pending.kind === 'over') return s
		if (s.tasks.length && s.pending.kind !== 'choose') {
			const t = s.tasks[0]
			const before = s
			s = runTask(s, t)
			if (s === before && s.pending.kind === 'choose') return s
			// a cast/activate that failed leaves `s` with a notice; otherwise the draft
			continue
		}
		if (s.pending.kind === 'choose') return s
		const isOver = (x: GameState) => x.pending.kind === 'over'
		while (checkSBA(s)) if (isOver(s)) return s
		if (isOver(s)) return s
		if (queue(s).length) {
			flushTriggers(s)
			continue
		}
		if (s.pending.kind === 'priority') {
			const p = s.pending.player
			if (!wantsStop(s, p)) {
				snap(s)
				passPriority(s, p)
				continue
			}
		}
		return s
	}
	return s
}

// ───────── apply ─────────

export function tryApply(s: GameState, intent: Intent): { state: GameState; error?: undefined } | { state?: undefined; error: string } {
	const mark = collecting?.length ?? 0
	try {
		return { state: apply(s, intent) }
	} catch (e) {
		if (collecting) collecting.length = mark
		if (e instanceof Illegal) return { error: e.message }
		throw e
	}
}

export function apply(s0: GameState, intent: Intent): GameState {
	if (collecting && !collecting.length) frameBase = s0.log.length
	let s = cloneState(s0)
	s.notice = null
	const p = intent.player
	const pend = s.pending
	const need = (ok: boolean, msg: string) => {
		if (!ok) throw new Illegal(msg)
	}
	switch (intent.type) {
		case 'keep':
		case 'mulligan': {
			need(pend.kind === 'mulligan' && pend.player === p, 'Not your mulligan decision.')
			const pl = s.players[p]
			if (intent.type === 'mulligan') {
				pl.library.push(...pl.hand)
				pl.hand = []
				shuffle(s, p)
				drawCards(s, p, 7, true)
				pl.mulligans++
				log(s, `${pl.name} mulligans.`)
				return s
			}
			pl.kept = true
			const bottom = pl.mulligans - (s.format.freeMulligan ? 1 : 0)
			log(s, `${pl.name} keeps ${pl.hand.length - Math.max(0, bottom)} cards.`)
			if (bottom > 0) {
				s.pending = { kind: 'bottom', player: p, count: Math.min(bottom, pl.hand.length) }
				return s
			}
			return afterKeep(s, p)
		}
		case 'bottom': {
			need(pend.kind === 'bottom' && pend.player === p, 'Not now.')
			if (pend.kind !== 'bottom') return s
			need(intent.iids.length === pend.count, `Choose ${pend.count} card(s).`)
			const pl = s.players[p]
			for (const iid of intent.iids) {
				const i = pl.hand.findIndex((o) => o.iid === iid)
				need(i >= 0, 'That card is not in your hand.')
				pl.library.push(pl.hand.splice(i, 1)[0])
			}
			return afterKeep(s, p)
		}
		case 'playLand': {
			const why = canPlayLand(s, p, intent.iid, intent.back)
			need(!why, why ?? '')
			s.players[p].landsPlayed++
			const o = (s.players[p].hand.find((x) => x.iid === intent.iid) ?? s.players[p].exile.find((x) => x.iid === intent.iid))!
			moveCard(s, intent.iid, 'battlefield', { controller: p, flipped: intent.back })
			log(s, `${s.players[p].name} plays ${cardName(s, o.card)}.`)
			break
		}
		case 'cast': {
			const why = canCast(s, p, intent.iid, intent.back, true)
			need(!why, why ?? '')
			addTask(s, 'cast', p, { iid: intent.iid, back: intent.back })
			break
		}
		case 'activate': {
			const perm = findPerm(s, intent.iid)
			need(!!perm, 'That permanent is gone.')
			const a = rulesOf(s, perm!).activated.find((x) => x.index === intent.ability)
			need(!!a, 'No such ability.')
			const why = abilityProblem(s, p, perm!, a!)
			need(!why, why ?? '')
			addTask(s, 'activate', p, { iid: intent.iid, ability: intent.ability })
			break
		}
		case 'tapForMana': {
			const perm = findPerm(s, intent.iid)
			need(!!perm && perm.controller === p, 'You don’t control that.')
			const a = rulesOf(s, perm!).manaAbilities.find((x) => x.index === intent.ability)
			need(!!a, 'That has no mana ability.')
			need(canTapForMana(s, perm!, a!), perm!.tapped ? 'It is already tapped.' : 'It has summoning sickness.')
			const { options, amount } = manaOptions(s, perm!, a!)
			need(amount > 0 && options.length > 0, 'It makes no mana right now.')
			const col = intent.color && options.includes(intent.color) ? intent.color : options[0]
			if (a!.cost.mana) pay(s, p, parseCost(a!.cost.mana), 0, [perm!.iid])
			if (a!.cost.life) s.players[p].life -= a!.cost.life
			if (a!.cost.tap) perm!.tapped = true
			const pool = s.players[p].pool
			if (a!.kind === 'fixed') for (const m of a!.mana) pool[m]++
			else pool[col] += amount
			if (a!.pain && col !== 'C') {
				s.players[p].life -= a!.pain
				log(s, `${permName(s, perm!)} deals ${a!.pain} damage to ${s.players[p].name}.`)
			}
			if (a!.cost.sacrificeSelf) moveCard(s, perm!.iid, 'graveyard', { cause: 'sacrifice' })
			break
		}
		case 'pass': {
			need(pend.kind === 'priority' && pend.player === p, 'You don’t have priority.')
			passPriority(s, p)
			break
		}
		case 'attack': {
			need(pend.kind === 'attackers' && pend.player === p, 'Not time to declare attackers.')
			const c = s.combat!
			for (const iid of intent.attackers) {
				const a = findPerm(s, iid)
				need(!!a && canAttack(s, a), `${a ? permName(s, a) : 'That'} can't attack.`)
			}
			for (const q of s.battlefield)
				if (canAttack(s, q) && (rulesOf(s, q).mustAttack || hasKw(s, q, 'goaded')) && !intent.attackers.includes(q.iid)) throw new Illegal(`${permName(s, q)} attacks each combat if able.`)
			c.attackers = intent.attackers.map((iid) => ({ iid, defender: opp(p) }))
			c.declared = true
			for (const iid of intent.attackers) {
				const a = findPerm(s, iid)!
				if (!hasKw(s, a, 'vigilance')) setTapped(s, a, true)
				a.attackedTurn = s.turn
				fire(s, a, 'attacks')
			}
			if (intent.attackers.length) {
				const atk = intent.attackers.map((iid) => findPerm(s, iid)!).filter(Boolean)
				for (const a of atk) {
					if (hasKw(s, a, 'melee')) a.mods.push({ power: 1, toughness: 1, until: 'eot' })
					if (hasKw(s, a, 'battle cry')) for (const b of atk) if (b !== a) b.mods.push({ power: 1, toughness: 0, until: 'eot' })
				}
				for (const sa of s.battlefield.filter((q) => q.controller === p && rulesOf(s, q).sharedAnimosity))
					for (const a of atk) {
						const mine = rulesOf(s, a).subtypes
						const n = atk.filter((b) => b !== a && rulesOf(s, b).subtypes.some((t) => mine.includes(t))).length
						if (n) a.mods.push({ power: n, toughness: 0, until: 'eot', note: permName(s, sa) })
					}
				for (const q of s.battlefield) if (q.controller === p) fire(s, q, 'youAttack')
				for (const a of atk) if (a.commander) for (const q of s.battlefield) if (q.controller === p) fire(s, q, 'commanderAttacks', a.iid)
				if (atk.some((a) => hasKw(s, a, 'goaded'))) for (const q of s.battlefield) fire(s, q, 'goadedAttack')
			}
			if (intent.attackers.length) log(s, `${s.players[p].name} attacks with ${intent.attackers.map((iid) => permName(s, findPerm(s, iid)!)).join(', ')}.`)
			else {
				s.combat = null
				enterStep(s, 'main2')
				break
			}
			s.passes = 0
			s.pending = { kind: 'priority', player: s.active }
			break
		}
		case 'block': {
			need(pend.kind === 'blockers' && pend.player === p, 'Not time to declare blockers.')
			const c = s.combat!
			const used = new Set<number>()
			for (const b of intent.blocks) {
				const bl = findPerm(s, b.blocker)
				const at = findPerm(s, b.attacker)
				need(!!bl && !!at && c.attackers.some((x) => x.iid === b.attacker), 'Invalid block.')
				need(!used.has(b.blocker), `${permName(s, bl!)} can only block one attacker.`)
				need(canBlock(s, bl!, at!), `${permName(s, bl!)} can't block ${permName(s, at!)}.`)
				used.add(b.blocker)
			}
			for (const a of c.attackers) {
				const at = findPerm(s, a.iid)!
				const n = intent.blocks.filter((b) => b.attacker === a.iid).length
				need(!(n === 1 && hasKw(s, at, 'menace')), `${permName(s, at)} has menace: block it with two or more creatures.`)
			}
			c.blocks = intent.blocks
			c.blocksDeclared = true
			for (const b of intent.blocks) fire(s, findPerm(s, b.blocker)!, 'blocks')
			if (intent.blocks.length) log(s, `${s.players[p].name} blocks: ${intent.blocks.map((b) => `${permName(s, findPerm(s, b.blocker)!)} blocks ${permName(s, findPerm(s, b.attacker)!)}`).join('; ')}.`)
			else log(s, `${s.players[p].name} doesn't block.`)
			s.passes = 0
			s.pending = { kind: 'priority', player: s.active }
			break
		}
		case 'choose': {
			need(pend.kind === 'choose' && pend.player === p, 'Nothing to choose.')
			if (pend.kind !== 'choose') return s
			const q = pend.question
			need(intent.picks.length >= q.min && intent.picks.length <= q.max, q.min === q.max ? `Choose ${q.min}.` : `Choose ${q.min}–${q.max}.`)
			need(intent.picks.every((id) => q.options.some((o) => o.id === id)), 'Invalid choice.')
			need(new Set(intent.picks).size === intent.picks.length, 'Choose each option once.')
			const task = s.tasks.find((t) => t.tid === pend.task)
			if (task) {
				task.answers[q.key] = intent.picks
			}
			s.pending = { kind: 'priority', player: s.active }
			break
		}
		case 'discard':
			throw new Illegal('Not now.')
		case 'concede':
			s.players[p].lost = 'conceded'
			log(s, `${s.players[p].name} concedes.`)
			break
		case 'manual':
			manual(s, p, intent.m)
			return s.pending.kind === 'choose' ? s : settle(s)
		case 'resolveManual':
			break
		case 'cycle': {
			need(pend.kind === 'priority' && pend.player === p, 'Wait until you have priority.')
			const o = s.players[p].hand.find((x) => x.iid === intent.iid)
			need(!!o, 'That card is not in your hand.')
			const cy = rulesOf(s, o!).cycling
			need(!!cy, 'That card has no cycling.')
			pay(s, p, parseCost(cy!.cost), 0)
			moveCard(s, o!.iid, 'graveyard')
			log(s, `${s.players[p].name} cycles ${cardName(s, o!.card)}.`)
			if (cy!.basic) addTask(s, 'script', p, { kind: 'cycleSearch' })
			else drawCards(s, p, 1)
			break
		}
	}
	s = settle(s)
	if ((intent.type === 'cast' || intent.type === 'activate') && s.notice && s.notice.player === p && !s0.notice) throw new Illegal(s.notice.text)
	return s
}

function afterKeep(s: GameState, p: number): GameState {
	const o = opp(p)
	if (!s.players[o].kept) {
		s.pending = { kind: 'mulligan', player: o }
		return s
	}
	s.active = s.firstPlayer
	s.turn = 0
	enterStep(s, 'untap')
	return settle(s)
}

// ───────── table tools ─────────

function manual(s: GameState, p: number, m: ManualOp) {
	const who = s.players[p].name
	const nameOf = (iid: number) => {
		const l = locate(s, iid)
		return l ? cardName(s, l.obj.card) : 'card'
	}
	switch (m.op) {
		case 'move': {
			const l = locate(s, m.iid)
			if (!l) throw new Illegal('Card not found.')
			const n = nameOf(m.iid)
			if (l.zone === 'stack') {
				const it = s.stack.find((x) => x.obj?.iid === m.iid)!
				s.stack = s.stack.filter((x) => x !== it)
				s.players[it.obj!.owner].exile.push(it.obj!)
			}
			const to = m.to === 'stack' ? 'graveyard' : m.to
			moveCard(s, m.iid, to as MoveTo, { manual: true, controller: m.player ?? p })
			log(s, `${who} moves ${n} to ${to === 'libraryBottom' ? 'the bottom of the library' : to === 'library' ? 'the top of the library' : to === 'command' ? 'the command zone' : to}.`)
			break
		}
		case 'tap': {
			const x = findPerm(s, m.iid)
			if (x) x.tapped = m.tapped
			break
		}
		case 'counter': {
			const x = findPerm(s, m.iid)
			if (!x) break
			x.counters[m.kind] = Math.max(0, (x.counters[m.kind] ?? 0) + m.delta)
			if (!x.counters[m.kind]) delete x.counters[m.kind]
			log(s, `${who} ${m.delta > 0 ? 'adds' : 'removes'} ${Math.abs(m.delta)} ${m.kind} counter${Math.abs(m.delta) > 1 ? 's' : ''} ${m.delta > 0 ? 'to' : 'from'} ${permName(s, x)}.`)
			break
		}
		case 'life':
			s.players[m.player].life += m.delta
			log(s, `${s.players[m.player].name}: life ${m.delta > 0 ? '+' : ''}${m.delta} (${s.players[m.player].life}).`)
			break
		case 'poison':
			s.players[m.player].poison = Math.max(0, s.players[m.player].poison + m.delta)
			break
		case 'commanderDamage': {
			const cd = s.players[m.player].commanderDamage
			cd[m.card] = Math.max(0, (cd[m.card] ?? 0) + m.delta)
			break
		}
		case 'token':
			createToken(s, m.player, m.card, m.count, m.tapped)
			break
		case 'customToken': {
			const card = makeTokenDef(s, { e: 'token', n: m.count, name: m.name, power: m.power, toughness: m.toughness, types: m.types, colors: [], keywords: m.keywords ?? [] }, 0)
			createToken(s, m.player, card, m.count)
			break
		}
		case 'draw':
			drawCards(s, m.player, m.count)
			break
		case 'mill': {
			const top = s.players[m.player].library.slice(0, m.count)
			for (const o of top) moveCard(s, o.iid, 'graveyard', { manual: true })
			log(s, `${s.players[m.player].name} mills ${top.length}.`)
			break
		}
		case 'shuffle':
			shuffle(s, m.player)
			log(s, `${s.players[m.player].name} shuffles their library.`)
			break
		case 'control': {
			const x = findPerm(s, m.iid)
			if (x) {
				x.controller = m.player
				x.sick = true
				log(s, `${s.players[m.player].name} gains control of ${permName(s, x)}.`)
			}
			break
		}
		case 'flip': {
			const x = findPerm(s, m.iid)
			if (x && def(s, x.card).back) x.flipped = !x.flipped
			else if (x) x.faceDown = !x.faceDown
			break
		}
		case 'attach': {
			const x = findPerm(s, m.iid)
			if (x) x.attachedTo = m.to ?? undefined
			break
		}
		case 'pt': {
			const x = findPerm(s, m.iid)
			if (x) x.mods.push({ power: m.power, toughness: m.toughness, until: m.until })
			break
		}
		case 'clearMods': {
			const x = findPerm(s, m.iid)
			if (x) x.mods = []
			break
		}
		case 'mana': {
			const pool = s.players[m.player].pool
			pool[m.mana] = Math.max(0, pool[m.mana] + m.delta)
			break
		}
		case 'untapAll':
			for (const x of s.battlefield) if (x.controller === m.player) x.tapped = false
			break
		case 'peek':
			s.players[m.player].peek = m.count
			break
		case 'damage': {
			const x = findPerm(s, m.iid)
			if (x) x.damage = Math.max(0, x.damage + m.delta)
			break
		}
		case 'copySpell': {
			const it = s.stack.find((x) => x.sid === m.sid)
			if (it) {
				s.stack.push({ ...clone(it), sid: s.nextId++, copy: true, controller: p, manual: it.manual })
				log(s, `${who} copies ${cardName(s, it.card)}.`)
				s.passes = 0
			}
			break
		}
		case 'counterSpell': {
			const it = s.stack.find((x) => x.sid === m.sid)
			if (!it) break
			if (it.obj && !it.copy) moveCard(s, it.obj.iid, 'graveyard')
			else s.stack = s.stack.filter((x) => x.sid !== m.sid)
			log(s, `${who} counters ${cardName(s, it.card)}.`)
			s.passes = 0
			break
		}
		case 'sick': {
			const x = findPerm(s, m.iid)
			if (x) x.sick = m.sick
			break
		}
	}
}

// ───────── queries for the UI and the bot ─────────

export function manaAbilitiesOf(s: GameState, perm: Perm): { a: ManaAbility; options: Mana[]; amount: number; ok: boolean }[] {
	return rulesOf(s, perm).manaAbilities.map((a) => ({ a, ...manaOptions(s, perm, a), ok: canTapForMana(s, perm, a) }))
}

export function commanderTax(s: GameState, p: number, card: string): number {
	return 2 * (s.players[p].commanderCasts[card] ?? 0)
}

export const STEP_NAMES: Record<Step, string> = {
	mulligan: 'Mulligans',
	untap: 'Untap',
	upkeep: 'Upkeep',
	draw: 'Draw',
	main1: 'Main 1',
	beginCombat: 'Combat',
	attackers: 'Attack',
	blockers: 'Block',
	firstDamage: 'First strike',
	damage: 'Damage',
	endCombat: 'End combat',
	main2: 'Main 2',
	end: 'End',
	cleanup: 'Cleanup',
}

export { availableMana, isPermanentCard }
export type { Zone }
