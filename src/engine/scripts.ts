// More card scripts: the Star Trek deck cards whose text doesn't fit the templates in rules.ts.
// Triggers use T() from named.ts (replaces a parsed trigger by event); trig() adds a trigger the
// parser didn't find; act() scripts an activated ability (matched by its text); spell() scripts
// an instant/sorcery; done() marks a card as fully automated once every line is handled.

import type { Ctx } from './effects'
import { discard, H, scry, search } from './effects'
import { assimilate, castFreeNow as castFreeHook, NAMED, T } from './named'
import { Rng } from './rng'
import { allCompiled, overrideTrigger, patchRules, type Compiled, type Filter, type Trigger, type TriggerEvent } from './rules'
import { BUFFS, CDA, cardName, COST_MODS, def, findPerm, GRANTS, isCreature, isType, locate, log, matches, opp, permName, pt, rulesOf } from './state'
import type { GameState, Perm, StackItem } from './types'

type Run = (ctx: Ctx, item: StackItem) => void
const named = (name: string, targets: Compiled['targets'] = []): Compiled => ({ targets, effects: [{ e: 'named', name }] })
const reg = (name: string, run: Run, targets: Compiled['targets'] = []) => (NAMED[name] = { spell: named(name, targets), run })

/** Add a triggered ability the parser didn't find. */
function trig(card: string, event: TriggerEvent, name: string, run: Run, extra: Partial<Trigger> = {}) {
	reg(name, run)
	patchRules(card, (r) => r.triggers.push({ index: r.triggers.length, event, text: extra.text ?? name.replace(/#.*/, ''), effectText: '', compiled: named(name), ...extra }))
}
/** Script the activated ability whose text matches `re`. */
function act(card: string, re: RegExp, name: string, run: Run) {
	reg(name, run)
	patchRules(card, (r) => {
		for (const a of r.activated) if (re.test(a.text)) a.compiled = named(name)
	})
}
function spell(card: string, run: Run) {
	reg(card, run)
}
/** Every line of the card is handled now. */
function done(card: string) {
	patchRules(card, (r) => {
		if (allCompiled(r)) r.fullyAutomated = true
	})
}

const rand = (s: GameState, n: number) => {
	const r = new Rng(s.rng)
	const v = r.int(n)
	s.rng = r.seed
	return v
}
const mine = (s: GameState, me: number, f: (p: Perm) => boolean = () => true) => s.battlefield.filter((p) => p.controller === me && f(p))
const landNames = (s: GameState, me: number) => new Set(mine(s, me, (p) => isType(s, p, 'land')).map((p) => cardName(s, p.card))).size
const isKW = (s: GameState, o: { card: string }) => rulesOf(s, o).subtypes.some((t) => t === 'Klingon' || t === 'Warrior')
const addCounters = (p: Perm, kind: string, n: number) => (p.counters[kind] = (p.counters[kind] ?? 0) + n)
const pickPerm = (ctx: Ctx, me: number, key: string, prompt: string, ps: Perm[], min = 1, max = 1, score: (p: Perm) => number = () => 1) =>
	ps.length ? ctx.ask(me, { key, prompt, options: ps.map((p) => ({ id: String(p.iid), label: permName(ctx.s, p), card: p.card, iid: p.iid, score: score(p) })), min: Math.min(min, ps.length), max: Math.min(max, ps.length), cards: true }).map((id) => findPerm(ctx.s, Number(id))!) : []
const pickCard = (ctx: Ctx, me: number, key: string, prompt: string, cs: { iid: number; card: string }[], min = 1, max = 1) =>
	cs.length ? ctx.ask(me, { key, prompt, options: cs.map((o) => ({ id: String(o.iid), label: cardName(ctx.s, o.card), card: o.card, iid: o.iid, score: def(ctx.s, o.card).cmc })), min: Math.min(min, cs.length), max: Math.min(max, cs.length), cards: true }).map(Number) : []
const yes = (ctx: Ctx, me: number, key: string, prompt: string, card?: string, score = 1) => ctx.ask(me, { key, prompt, options: [{ id: 'yes', label: 'Yes', card, score }, { id: 'no', label: 'No', score: 0 }], min: 1, max: 1 })[0] === 'yes'
const bottomRandom = (s: GameState, ids: number[]) => {
	const r = new Rng(s.rng)
	for (const id of r.shuffle(ids)) H().move(s, id, 'libraryBottom')
	s.rng = r.seed
}
const borgToken = (s: GameState) => H().makeTokenDef(s, { e: 'token', n: 1, name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg', colors: [], keywords: [], artifact: true }, 0)
const landsFromHand = (ctx: Ctx, me: number, key: string, n: number) => {
	const s = ctx.s
	const ls = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('land'))
	for (const id of pickCard(ctx, me, key, `You may put up to ${n} land card${n > 1 ? 's' : ''} from your hand onto the battlefield tapped`, ls, 0, n)) H().move(s, id, 'battlefield', { controller: me, tapped: true })
}

// ───────── Federation / Picard ─────────

T('U.S.S. Stargazer, Here and There', ['attacks'], 'Stargazer#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const card = H().makeTokenDef(s, { e: 'token', n: 1, name: 'Spacecraft Illusion', power: 4, toughness: 3, types: 'Artifact Creature — Spacecraft Illusion', colors: [], keywords: ['flying'], artifact: true }, 0)
	for (const iid of H().createToken(s, me, card, 1, true)) {
		if (s.combat) s.combat.attackers.push({ iid, defender: opp(me) })
		const p = findPerm(s, iid)
		if (p) p.attackedTurn = s.turn
		H().later(s, { at: 'endCombat', kind: 'exile', iid })
	}
})
done('U.S.S. Stargazer, Here and There')

T('Ensign Harry Kim, Operations', ['otherEtb'], 'Harry Kim#t', (ctx, item) => {
	const s = ctx.s
	const kim = findPerm(s, item.iid)
	const other = item.about !== undefined ? findPerm(s, item.about) : undefined
	if (kim && other && pt(s, other)[0] > pt(s, kim)[0]) addCounters(kim, '+1/+1', 1)
})

act('Guinan, Ancient Advisor', /entered this turn/, 'Guinan#a', (ctx, item) => {
	const s = ctx.s
	const ps = mine(s, item.controller, (p) => isCreature(s, p) && p.enteredTurn === s.turn)
	for (const p of ps) addCounters(p, '+1/+1', 1)
	if (ps.length >= 2) H().draw(s, item.controller, 1)
})
done('Guinan, Ancient Advisor')

T("Chief Miles O'Brien", ['secondDraw'], "O'Brien#t", (ctx, item) => {
	const s = ctx.s
	const ps = mine(s, item.controller, (p) => (isCreature(s, p) || isType(s, p, 'artifact')) && Object.values(p.counters).some((n) => n > 0))
	const [p] = pickPerm(ctx, item.controller, 'ob', "O'Brien: double the counters on an artifact or creature you control", ps, 1, 1, (p) => Object.values(p.counters).reduce((a, b) => a + b, 0))
	if (!p) return
	for (const k of Object.keys(p.counters)) if (!k.includes(':')) p.counters[k] *= 2
	log(s, `O'Brien doubles the counters on ${permName(s, p)}.`)
})
done("Chief Miles O'Brien")

act('Seven of Nine, Tertiary Adjunct', /Draw a card, then discard/, 'Seven#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const before = new Set(s.players[me].graveyard.map((o) => o.iid))
	H().draw(s, me, 1)
	discard(ctx, me, 1, 'sd')
	const dropped = s.players[me].graveyard.find((o) => !before.has(o.iid))
	if (!dropped || rulesOf(s, dropped).types.includes('land')) return
	const [a] = pickPerm(ctx, me, 'sc', 'Put two charge counters on up to one artifact', s.battlefield.filter((p) => isType(s, p, 'artifact')), 0, 1, (p) => (p.controller === me ? 1 : -1))
	if (a) addCounters(a, 'charge', 2)
})
done('Seven of Nine, Tertiary Adjunct')

act("B'Elanna Torres, Scrapper", /Surveil 2/, "B'Elanna#a", (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	scry(ctx, me, 2, true, 'bs')
	const top = s.players[me].library[0]
	if (top && isType(s, top, 'artifact')) {
		log(s, `B'Elanna reveals ${cardName(s, top.card)}.`)
		H().draw(s, me, 1)
	} else {
		const b = findPerm(s, item.iid)
		if (b) addCounters(b, '+1/+1', 2)
	}
})
done("B'Elanna Torres, Scrapper")

trig('U.S.S. Enterprise-C, Time-Tossed', 'etb', 'Enterprise-C#etb', (ctx, item) => wheel(ctx, item.controller), { text: 'When U.S.S. Enterprise-C enters, you may discard your hand and draw that many.' })
trig('U.S.S. Enterprise-C, Time-Tossed', 'dies', 'Enterprise-C#dies', (ctx, item) => wheel(ctx, item.controller), { text: 'When U.S.S. Enterprise-C dies, you may discard your hand and draw that many.' })
function wheel(ctx: Ctx, me: number) {
	const s = ctx.s
	const hand = s.players[me].hand
	if (!hand.length) return
	const lands = hand.filter((o) => rulesOf(s, o).types.includes('land')).length
	if (!yes(ctx, me, 'ec', `Discard your hand (${hand.length}) and draw that many?`, undefined, lands * 2 >= hand.length ? 1 : -1)) return
	const n = hand.length
	for (const o of [...hand]) H().move(s, o.iid, 'graveyard')
	H().draw(s, me, n)
}
done('U.S.S. Enterprise-C, Time-Tossed')

// 2 players: there is no "other opponent".
done('U.S.S. Prometheus, Prototype')

act('Command Beacon', /commander into your hand/, 'Command Beacon#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const cs = s.players[me].command
	const [id] = pickCard(ctx, me, 'cb', 'Put your commander into your hand', cs)
	if (id !== undefined) H().move(s, id, 'hand')
})
done('Command Beacon')

act('Fabled Passage', /basic land card/, 'Fabled Passage#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const before = new Set(s.battlefield.map((p) => p.iid))
	search(ctx, me, { e: 'search', filter: { types: ['land'], not: [], basic: true }, count: 1, dest: 'battlefield', tapped: true }, 'fp')
	if (mine(s, me, (p) => isType(s, p, 'land')).length >= 4) for (const p of s.battlefield) if (!before.has(p.iid) && p.controller === me) p.tapped = false
})
done('Fabled Passage')

act('Stonespeaker Crystal', /Exile any number/, 'Stonespeaker#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	for (const o of [...s.players[opp(me)].graveyard]) H().move(s, o.iid, 'exile')
	log(s, `${s.players[opp(me)].name}'s graveyard is exiled.`)
	H().draw(s, me, 1)
})
done('Stonespeaker Crystal')

act('Jefferies Tube', /Draw a card\. You may put a land/, 'Jefferies#a', (ctx, item) => {
	H().draw(ctx.s, item.controller, 1)
	landsFromHand(ctx, item.controller, 'jt', 1)
})
done('Jefferies Tube')

// ───────── Landing Party / Spock & Kirk ─────────

CDA['Lt. Arex, Ever-Adapting'] = (s, p) => [landNames(s, p.controller), landNames(s, p.controller)]
T('Lt. Arex, Ever-Adapting', ['etb'], 'Arex#t', (ctx, item) => {
	H().draw(ctx.s, item.controller, 3)
	landsFromHand(ctx, item.controller, 'ax', 3)
})
patchRules('Lt. Arex, Ever-Adapting', (r) => {
	if (allCompiled(r)) r.fullyAutomated = true
})

T('Guardian Project', ['otherEtb'], 'Guardian Project#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const p = item.about !== undefined ? (findPerm(s, item.about) ?? undefined) : undefined
	const name = p ? cardName(s, p.card) : item.about !== undefined ? cardName(s, locate(s, item.about)?.obj.card ?? '') : ''
	if (!name) return
	const dup = mine(s, me, (q) => q.iid !== item.about && isCreature(s, q) && cardName(s, q.card) === name).length || s.players[me].graveyard.some((o) => rulesOf(s, o).types.includes('creature') && cardName(s, o.card) === name)
	if (!dup) H().draw(s, me, 1)
})
done('Guardian Project')

T('Scute Swarm', ['landfall'], 'Scute Swarm#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const self = findPerm(s, item.iid)
	if (mine(s, me, (p) => isType(s, p, 'land')).length >= 6 && self) H().createToken(s, me, self.card, 1)
	else H().createToken(s, me, H().makeTokenDef(s, { e: 'token', n: 1, name: 'Insect', power: 1, toughness: 1, types: 'Creature — Insect', colors: ['G'], keywords: [] }, 0), 1)
})
done('Scute Swarm')

for (const ev of ['commanderEtb', 'commanderAttacks'] as const)
	trig('Janice Rand, Essential Aide', ev, `Janice#${ev}`, (ctx, item) => {
		const s = ctx.s
		const me = item.controller
		const c = item.about !== undefined ? findPerm(s, item.about) : undefined
		if (c) addCounters(c, '+1/+1', 1)
		const lib = s.players[me].library
		const i = lib.findIndex((o) => rulesOf(s, o).types.includes('land'))
		const passed = (i < 0 ? lib : lib.slice(0, i)).map((o) => o.iid)
		if (i >= 0) H().move(s, lib[i].iid, 'battlefield', { controller: me, tapped: true })
		bottomRandom(s, passed)
	}, { text: `Whenever a commander you control ${ev === 'commanderEtb' ? 'enters' : 'attacks'}, put a +1/+1 counter on it and reveal until a land; put it onto the battlefield tapped.` })
done('Janice Rand, Essential Aide')

act('Mutavault', /becomes a 2\/2/, 'Mutavault#a', (ctx, item) => {
	const p = findPerm(ctx.s, item.iid)
	if (p) p.mods.push({ power: 2, toughness: 2, until: 'eot', note: 'creature' })
})
done('Mutavault')

T('Planet Killer', ['combatDamagePlayer'], 'Planet Killer#t', (ctx, item) => {
	const s = ctx.s
	const p = findPerm(s, item.iid)
	if (p) addCounters(p, '+1/+1', mine(s, opp(item.controller), (q) => isType(s, q, 'land')).length)
})
done('Planet Killer')

T("T'Pring, Never Parted", ['etb'], "T'Pring#t", (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const [a] = pickPerm(ctx, me, 'tp1', "T'Pring: choose another creature you control", mine(s, me, (p) => p.iid !== item.iid && isCreature(s, p)), 1, 1, (p) => pt(s, p)[0])
	const [b] = pickPerm(ctx, me, 'tp2', "T'Pring: choose a creature an opponent controls", mine(s, opp(me), (p) => isCreature(s, p) && !rulesOf(s, p).keywords.includes('hexproof')), 1, 1, (p) => (a && pt(s, a)[0] >= pt(s, p)[1] ? 5 : 0) - pt(s, p)[0])
	if (!a || !b) return
	if (!yes(ctx, me, 'tp3', `Have ${permName(s, a)} fight ${permName(s, b)}?`, b.card, pt(s, a)[0] >= pt(s, b)[1] && pt(s, b)[0] < pt(s, a)[1] ? 1 : -1)) return
	const [pa] = pt(s, a)
	const [pb] = pt(s, b)
	H().damage(s, { card: a.card, controller: me, iid: a.iid }, { kind: 'perm', id: b.iid }, pa)
	H().damage(s, { card: b.card, controller: b.controller, iid: b.iid }, { kind: 'perm', id: a.iid }, pb)
	a.mods.push({ power: 0, toughness: 0, until: 'eot', note: `fought:${me}` })
	b.mods.push({ power: 0, toughness: 0, until: 'eot', note: `fought:${me}` })
})

act('S.S. Botany Bay', /exiles a card from their graveyard/, 'Botany Bay#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const them = opp(me)
	const [x] = pickCard(ctx, them, 'bb1', 'S.S. Botany Bay: exile a card from your graveyard', s.players[them].graveyard)
	if (x !== undefined) H().move(s, x, 'exile')
	const [y] = pickCard(ctx, me, 'bb2', 'You may exile a card from your graveyard (creature cards come back when the Botany Bay connects)', s.players[me].graveyard, 0, 1)
	if (y !== undefined) H().move(s, y, 'exile')
	const bay = findPerm(s, item.iid)
	if (bay) for (const id of [x, y]) if (id !== undefined) bay.counters[`exiled:${id}`] = 1
})
T('S.S. Botany Bay', ['combatDamagePlayer'], 'Botany Bay#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const bay = findPerm(s, item.iid)
	if (!bay) return
	for (const k of Object.keys(bay.counters))
		if (k.startsWith('exiled:')) {
			const l = locate(s, Number(k.slice(7)))
			if (l && l.zone === 'exile' && l.obj.owner === me && rulesOf(s, l.obj).types.includes('creature')) {
				H().move(s, l.obj.iid, 'battlefield', { controller: me })
				delete bay.counters[k]
			}
		}
})
done('S.S. Botany Bay')

// ───────── Klingons / Worf & Kor ─────────

overrideTrigger("Qo'noS Quartermaster", { events: ['attacks'], compiled: { targets: [], effects: [{ e: 'addMana', n: 1 }] } })
done("Qo'noS Quartermaster")

T('Curzon Dax, Bound by Blood', ['dies'], 'Curzon#dies', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('creature') && def(s, o.card).cmc <= 3)
	for (const id of pickCard(ctx, me, 'cd', 'Curzon Dax: you may put a creature card with mana value 3 or less onto the battlefield', cs, 0, 1)) H().move(s, id, 'battlefield', { controller: me })
})
done('Curzon Dax, Bound by Blood')

T("K't'inga-Class Battle Cruiser", ['etb', 'attacks'], "K't'inga#t", (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	for (const p of pickPerm(ctx, me, 'kt', 'One or two Klingons and/or Warriors you control gain flying until end of turn', mine(s, me, (p) => isCreature(s, p) && isKW(s, p)), 1, 2, (p) => pt(s, p)[0]))
		p.mods.push({ power: 0, toughness: 0, keywords: ['flying'], until: 'eot' })
})
done("K't'inga-Class Battle Cruiser")

GRANTS["K'Vort-Class Raider"] = (s, src, p) => (s.active === src.controller && p.controller === src.controller && (p.iid === src.iid || isCreature(s, p)) ? ['hexproof'] : [])
patchRules("K'Vort-Class Raider", (r) => {
	r.fullyAutomated = allCompiled(r)
})

T('Kang, Suspicious Captain', ['etb'], 'Kang#etb', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const [t] = pickPerm(ctx, me, 'kg', 'Kang: goad a creature an opponent controls (while you control Kang)', mine(s, opp(me), (p) => isCreature(s, p)), 1, 1, (p) => pt(s, p)[0])
	const kang = findPerm(s, item.iid)
	for (const p of [t, kang]) if (p) p.mods.push({ power: 0, toughness: 0, keywords: ['goaded'], until: 'perm', note: `while:${item.iid}` })
	if (t) log(s, `${permName(s, t)} and Kang are goaded.`)
})
trig('Kang, Suspicious Captain', 'goadedAttack', 'Kang#atk', (ctx, item) => {
	const s = ctx.s
	const [p] = pickPerm(ctx, item.controller, 'kg2', 'Kang: put a +1/+1 counter on a creature you control', mine(s, item.controller, (p) => isCreature(s, p)), 1, 1, (p) => pt(s, p)[0])
	if (p) addCounters(p, '+1/+1', 1)
})
patchRules('Kang, Suspicious Captain', (r) => {
	// the parser reads the second sentence as an "attacks" trigger; the goadedAttack one replaces it
	r.triggers = r.triggers.filter((t) => t.compiled || t.event !== 'attacks').map((t, i) => ({ ...t, index: i }))
	for (const t of r.triggers) t.conditional = false
	r.triggers.forEach((t) => {
		if (t.event === 'goadedAttack') t.compiled = named('Kang#atk')
	})
	if (allCompiled(r)) r.fullyAutomated = true
})

spell('Own the Day', (ctx, item) => {
	const s = ctx.s
	for (const p of mine(s, item.controller)) if (p.attackedTurn === s.turn) p.tapped = false
	s.extraCombats = (s.extraCombats ?? 0) + 1
	log(s, 'There will be an additional combat phase after this main phase.')
})
spell('World at War', (ctx) => {
	const s = ctx.s
	s.extraCombats = (s.extraCombats ?? 0) + 1
	s.untapAtExtra = (s.untapAtExtra ?? 0) + 1
	log(s, 'There will be an additional combat phase after the second main phase.')
})

T('Combat Celebrant', ['attacks'], 'Combat Celebrant#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const c = findPerm(s, item.iid)
	if (!c || c.used?.exert === s.turn) return
	if (!yes(ctx, me, 'cc', 'Exert Combat Celebrant? (untap your other creatures and take an additional combat phase; it won’t untap next turn)', c.card)) return
	c.used = { ...c.used, exert: s.turn }
	c.skipUntap = true
	for (const p of mine(s, me)) if (p.iid !== c.iid && isCreature(s, p)) p.tapped = false
	s.extraCombats = (s.extraCombats ?? 0) + 1
})
done('Combat Celebrant')

act('Professional Face-Breaker', /Exile the top card/, 'Face-Breaker#a', (ctx, item) => {
	const s = ctx.s
	const pl = s.players[item.controller]
	const top = pl.library[0]
	if (!top) return
	H().move(s, top.iid, 'exile')
	;(pl.playable ??= []).push({ iid: top.iid, until: s.turn })
	log(s, `${cardName(s, top.card)} is exiled — it can be played this turn.`)
})

act("Alexander, Ship's Fool", /Each player reveals/, 'Alexander#a', (ctx, item) => {
	const s = ctx.s
	let x = 0
	s.players.forEach((pl, i) => {
		const top = pl.library[0]
		if (top) {
			x = Math.max(x, def(s, top.card).cmc)
			log(s, `${pl.name} reveals ${cardName(s, top.card)}.`)
		}
		H().draw(s, i, 1)
	})
	if (x > 0) H().damage(s, { card: item.card, controller: item.controller, iid: item.iid }, { kind: 'player', id: opp(item.controller) }, x)
})
done("Alexander, Ship's Fool")

T("Ambassador K'Ehleyr", ['beginCombat'], "K'Ehleyr#t", (ctx, item) => {
	const s = ctx.s
	let n = 0
	s.players.forEach((pl, i) => {
		const top = pl.library[0]
		if (top) {
			log(s, `${pl.name} reveals ${cardName(s, top.card)}.`)
			if (!rulesOf(s, top).types.includes('land')) n++
		}
		H().draw(s, i, 1)
	})
	const k = findPerm(s, item.iid)
	if (k && n) addCounters(k, '+1/+1', n)
})
done("Ambassador K'Ehleyr")

T('Concerted Effort', ['eachUpkeep'], 'Concerted Effort#t', (ctx, item) => {
	const s = ctx.s
	const cr = mine(s, item.controller, (p) => isCreature(s, p))
	const kws = ['flying', 'fear', 'first strike', 'double strike', 'trample', 'vigilance']
	const have = new Set<string>()
	for (const p of cr) for (const k of rulesOf(s, p).keywords.concat(p.mods.flatMap((m) => m.keywords ?? []))) if (kws.includes(k) || /walk$|^protection/.test(k)) have.add(k)
	if (!have.size) return
	for (const p of cr) p.mods.push({ power: 0, toughness: 0, keywords: [...have], until: 'eot' })
	log(s, `Concerted Effort: your creatures gain ${[...have].join(', ')}.`)
})
done('Concerted Effort')

T('Sword of Light and Shadow', ['combatDamagePlayer'], 'Sword of L&S#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	H().gainLife(s, me, 3)
	for (const id of pickCard(ctx, me, 'sls', 'You may return a creature card from your graveyard to your hand', s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes('creature')), 0, 1)) H().move(s, id, 'hand')
})

spell('Right of Vengeance', (ctx, item) => {
	const s = ctx.s
	;((s as { vengeance?: { player: number; turn: number }[] }).vengeance ??= []).push({ player: item.controller, turn: s.turn })
	log(s, 'Until end of turn, creatures that deal combat damage to you are destroyed.')
})

patchRules('Sins of the Father', (r) => {
	const c = r.chapters?.[2]
	if (c) c.compiled = named('Sins III')
	if (allCompiled(r)) r.fullyAutomated = true
})
reg('Sins III', (ctx, item) => {
	const s = ctx.s
	const them = opp(item.controller)
	const gy = [...s.players[them].graveyard]
	const n = gy.filter((o) => rulesOf(s, o).types.includes('creature')).length
	for (const o of gy) H().move(s, o.iid, 'exile')
	s.players[them].life -= n
	log(s, `Sins of the Father exiles ${gy.length} card${gy.length === 1 ? '' : 's'}; ${s.players[them].name} loses ${n} life.`)
})

// ───────── Borg ─────────

trig('Maturation Chamber', 'castSpell', 'Maturation#t', (ctx, item) => {
	const p = findPerm(ctx.s, item.iid)
	if (p) addCounters(p, 'charge', 1 + annex(ctx.s, item.controller))
}, { who: 'you', filter: { types: ['artifact'], not: [] } as Filter, text: 'Whenever you cast an artifact spell, put a charge counter on this artifact.' })
act('Maturation Chamber', /for each charge counter/, 'Maturation#a', (ctx, item) => {
	const p = findPerm(ctx.s, item.iid)
	const n = p?.counters.charge ?? 0
	if (n) H().createToken(ctx.s, item.controller, borgToken(ctx.s), n)
})
done('Maturation Chamber')

/** Optimization Annex: extra charge counters. */
const annex = (s: GameState, me: number) => mine(s, me, (p) => cardName(s, p.card) === 'Optimization Annex').length

trig('Conquest Mission', 'otherEtb', 'Conquest#t', (ctx, item) => {
	const s = ctx.s
	const m = findPerm(s, item.iid)
	if (!m) return
	addCounters(m, 'quest', 1)
	H().createToken(s, item.controller, borgToken(s), m.counters.quest >= 6 ? 2 : 1)
}, { filter: { types: ['artifact'], not: [], controller: 'you', nonToken: true } as Filter })
patchRules('Conquest Mission', (r) => {
	r.triggers = r.triggers.filter((t) => t.compiled)
	r.triggers.forEach((t, i) => (t.index = i))
	r.fullyAutomated = allCompiled(r)
})

T('Assimilation Assessor', ['etb'], 'Assessor#etb', (ctx, item) => {
	const s = ctx.s
	const them = opp(item.controller)
	const a = findPerm(s, item.iid)
	for (const o of [...s.players[them].graveyard]) {
		H().move(s, o.iid, 'exile')
		if (a) a.counters[`exiled:${o.iid}`] = 1
	}
	log(s, `${s.players[them].name}'s graveyard is exiled.`)
})
T('Assimilation Assessor', ['attacks'], 'Assessor#atk', (ctx, item) => {
	const s = ctx.s
	const a = findPerm(s, item.iid)
	if (!a) return
	const cs = Object.keys(a.counters).filter((k) => k.startsWith('exiled:')).map((k) => locate(s, Number(k.slice(7)))).filter((l) => l && l.zone === 'exile' && rulesOf(s, l.obj).types.includes('creature')).map((l) => l!.obj)
	const [id] = pickCard(ctx, item.controller, 'aa', 'Assimilate a creature card exiled with Assimilation Assessor', cs)
	if (id === undefined) return
	delete a.counters[`exiled:${id}`]
	assimilate(s, item.controller, id)
})
done('Assimilation Assessor')

T('Hive Mind Coprocessor', ['combatDamagePlayer'], 'Hive Mind#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	if (s.players[me].life > 1 && yes(ctx, me, 'hm', 'Pay 1 life to draw a card?', item.card, s.players[me].life > 5 ? 1 : -1)) {
		s.players[me].life -= 1
		H().draw(s, me, 1)
	}
})
done('Hive Mind Coprocessor')

T('The Immortal Sun', ['yourDraw'], 'Immortal Sun#t', (ctx, item) => H().draw(ctx.s, item.controller, 1))
patchRules('The Immortal Sun', (r) => {
	r.costReduction = { filter: { types: [], not: [] }, n: 1 }
	if (!r.statics.some((x) => x.kind === 'anthem')) r.statics.push({ kind: 'anthem', power: 1, toughness: 1, keywords: [], filter: { types: ['creature'], not: [], controller: 'you' } })
	if (allCompiled(r)) r.fullyAutomated = true
})

act('Reconnaissance Partition', /Choose one/, 'Recon#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const [c] = ctx.ask(me, { key: 'rp', prompt: 'Reconnaissance Partition: choose one', options: [{ id: 'land', label: 'Search for a basic land (enters tapped)', score: mine(s, me, (p) => isType(s, p, 'land')).length < 6 ? 2 : 0 }, { id: 'draw', label: 'Draw a card', score: 1 }], min: 1, max: 1 })
	if (c === 'land') search(ctx, me, { e: 'search', filter: { types: ['land'], not: [], basic: true }, count: 1, dest: 'battlefield', tapped: true }, 'rps')
	else H().draw(s, me, 1)
})
done('Reconnaissance Partition')

act('Academy Ruins', /artifact card from your graveyard on top/, 'Academy Ruins#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const [id] = pickCard(ctx, me, 'ar', 'Put an artifact card from your graveyard on top of your library', s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes('artifact')))
	if (id !== undefined) H().move(s, id, 'library')
})
done('Academy Ruins')

GRANTS['Extraction Integrant'] = (s, src, p) => (p.controller === src.controller && isCreature(s, p) && isType(s, p, 'artifact') ? ['menace'] : [])

spell('Borg Incursion', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	H().createToken(s, me, borgToken(s), 2)
	const cols = ['W', 'U', 'B', 'R', 'G'] as const
	const theirs = new Map<string, number>()
	for (const p of mine(s, opp(me))) for (const c of def(s, p.card).colors) theirs.set(c, (theirs.get(c) ?? 0) + 1)
	const names: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }
	const [c] = ctx.ask(me, { key: 'bi', prompt: 'Artifact creatures you control gain protection from which colour?', options: cols.map((x) => ({ id: x, label: names[x], score: theirs.get(x) ?? 0 })), min: 1, max: 1 })
	for (const p of mine(s, me, (p) => isCreature(s, p) && isType(s, p, 'artifact'))) p.mods.push({ power: 0, toughness: 0, keywords: [`protection from ${names[c]}`], until: 'eot' })
})

spell('Assimilate the Wounded', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const them = opp(me)
	const died = (s as { diedThisTurn?: Record<number, number> }).diedThisTurn ?? {}
	const cs = s.players[them].graveyard.filter((o) => rulesOf(s, o).types.includes('creature') && died[o.iid] === s.turn)
	for (const id of pickCard(ctx, me, 'aw', 'Assimilate up to one creature card that died this turn', cs, 0, 1)) assimilate(s, me, id)
})

patchRules('The Best of Both Worlds', (r) => {
	const c1 = r.chapters?.[0]
	const c3 = r.chapters?.[2]
	if (c1) c1.compiled = named('BoBW I', [{ kind: 'perm', filter: { types: ['creature'], not: ['artifact'], controller: 'opp' } }])
	if (c3) c3.compiled = named('BoBW III')
	if (allCompiled(r)) r.fullyAutomated = true
})
reg('BoBW I', (ctx, item) => {
	const s = ctx.s
	const t = item.targets[0] ? findPerm(s, item.targets[0].id) : undefined
	if (!t) return
	assimilate(s, item.controller, t.iid)
	const saga = findPerm(s, item.iid)
	if (saga) saga.counters[`exiled:${t.iid}`] = 1
}, [{ kind: 'perm', filter: { types: ['creature'], not: ['artifact'], controller: 'opp' } }])
reg('BoBW III', (ctx, item) => {
	const s = ctx.s
	const saga = findPerm(s, item.iid)
	if (!saga) return
	for (const k of Object.keys(saga.counters))
		if (k.startsWith('exiled:')) {
			const p = findPerm(s, Number(k.slice(7)))
			if (!p) continue
			H().move(s, p.iid, 'exile')
			H().move(s, p.iid, 'battlefield', { controller: p.owner })
		}
})

// Unwinding Clock and Alhammarret's Archive are handled in engine.ts (untap step, draws and life gain).
done('Unwinding Clock')
done("Alhammarret's Archive")

// ───────── batch 2: equipment that grants triggers, chosen creature types, sagas ─────────

/** "Equipped creature gets +P/+T and has 'Whenever this creature attacks, …'" */
function equipAttack(card: string, name: string, power: number, toughness: number) {
	patchRules(card, (r) => {
		if (power || toughness) r.statics.push({ kind: 'equip', power, toughness, keywords: [] })
		r.triggers.push({ index: r.triggers.length, event: 'attacks', text: 'Equipped creature: whenever it attacks …', effectText: '', compiled: named(name), equipped: true })
		if (allCompiled(r)) r.fullyAutomated = true
	})
}
equipAttack('The Sword of Kahless', 'Sword of Kahless#t', 2, 2)

reg('Communicator#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const eq = findPerm(s, item.iid)
	const host = eq?.attachedTo
	const x = mine(s, me, (p) => p.iid !== host && isCreature(s, p) && s.battlefield.some((q) => q.attachedTo === p.iid && rulesOf(s, q).subtypes.includes('Communicator'))).length
	if (!x) return
	H().draw(s, me, x)
	landsFromHand(ctx, me, 'sfc', x)
})
equipAttack('Starfleet Communicator', 'Communicator#t', 0, 0)
trig('Starfleet Communicator', 'cast', 'Communicator#cast', (ctx, item) => {
	H().createToken(ctx.s, item.controller, item.card, 1)
	log(ctx.s, 'Starfleet Communicator is copied (the copy is a token).')
}, { text: 'When you cast this spell, copy it.' })
patchRules('Starfleet Communicator', (r) => {
	if (allCompiled(r)) r.fullyAutomated = true
})

T('U.S.S. Farragut, Bold Explorer', ['landfall'], 'Farragut#t', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('creature'))
	const [id] = pickCard(ctx, me, 'fg', 'Farragut: you may put a creature card from your hand onto the battlefield (it has haste; at the next end step it goes to the bottom of your library and you draw a card)', cs, 0, 1)
	if (id === undefined) return
	H().move(s, id, 'battlefield', { controller: me })
	findPerm(s, id)?.mods.push({ power: 0, toughness: 0, keywords: ['haste'], until: 'perm' })
	H().later(s, { at: 'end', kind: 'bottom', iid: id, owner: me, draw: true })
})
done('U.S.S. Farragut, Bold Explorer')

act('Lieutenant Nyota Uhura', /exiles the top X cards/, 'Uhura#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const them = opp(me)
	const x = landNames(s, me)
	const top = s.players[them].library.slice(0, x)
	for (const o of top) H().move(s, o.iid, 'exile')
	log(s, `${s.players[them].name} exiles the top ${top.length} cards of their library.`)
	const spells = top.filter((o) => rulesOf(s, o).types.some((t) => t === 'instant' || t === 'sorcery'))
	const [pick] = pickCard(ctx, me, 'uh', 'Uhura: you may cast an instant or sorcery from among them for free', spells, 0, 1)
	bottomRandom(s, top.filter((o) => o.iid !== pick).map((o) => o.iid))
	if (pick !== undefined) castFreeHook(s, me, pick)
})
done('Lieutenant Nyota Uhura')

act('Chief Montgomery Scott', /creature or Spacecraft card from your hand/, 'Scotty#a', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const x = landNames(s, me)
	const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes('creature') || rulesOf(s, o).subtypes.includes('Spacecraft'))
	const [id] = pickCard(ctx, me, 'sc', `Scotty: you may put a creature or Spacecraft card onto the battlefield with ${x} extra counters`, cs, 0, 1)
	if (id === undefined) return
	const ship = rulesOf(s, s.players[me].hand.find((o) => o.iid === id)!).subtypes.includes('Spacecraft')
	H().move(s, id, 'battlefield', { controller: me })
	const p = findPerm(s, id)
	if (p) addCounters(p, ship ? 'charge' : '+1/+1', x)
})
done('Chief Montgomery Scott')

act('The Guardian of Forever', /Return that card/, 'Guardian of Forever#a', (ctx, item) => {
	const s = ctx.s
	if (item.about === undefined) return
	const l = locate(s, item.about)
	if (l) H().later(s, { at: 'end', kind: 'return', iid: item.about, owner: l.obj.owner })
	log(s, 'It will return at the beginning of the next end step.')
})
done('The Guardian of Forever')

/** "As this artifact enters, choose a creature type" — remembered as a counter key on the permanent. */
const chosenType = (p: Perm) => Object.keys(p.counters).find((k) => k.startsWith('type:'))?.slice(5)
function chooseType(card: string) {
	trig(card, 'etb', `${card}#type`, (ctx, item) => {
		const s = ctx.s
		const me = item.controller
		const count = new Map<string, number>()
		for (const o of [...s.players[me].library, ...s.players[me].hand, ...s.battlefield.filter((p) => p.controller === me)])
			if (rulesOf(s, o).types.includes('creature')) for (const t of rulesOf(s, o).subtypes) count.set(t, (count.get(t) ?? 0) + 1)
		const opts = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
		if (!opts.length) opts.push(['Human', 0])
		const [t] = ctx.ask(me, { key: 'ct', prompt: `${card}: choose a creature type`, options: opts.map(([t, n]) => ({ id: t, label: `${t} (${n})`, score: n })), min: 1, max: 1 })
		const p = findPerm(s, item.iid)
		if (p) p.counters[`type:${t}`] = 1
		log(s, `${card}: ${t} chosen.`)
	}, { text: 'As this enters, choose a creature type.' })
}
const ofType = (s: GameState, o: { card: string }, t?: string) => !!t && rulesOf(s, o).subtypes.includes(t)

chooseType("Herald's Horn")
COST_MODS["Herald's Horn"] = (s, src, card) => (rulesOf(s, { card }).types.includes('creature') && ofType(s, { card }, chosenType(src)) ? 1 : 0)
T("Herald's Horn", ['upkeep'], "Herald's Horn#t", (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const h = findPerm(s, item.iid)
	const top = s.players[me].library[0]
	if (!h || !top) return
	if (rulesOf(s, top).types.includes('creature') && ofType(s, top, chosenType(h)) && yes(ctx, me, 'hh', `Herald's Horn: reveal ${cardName(s, top.card)} and put it into your hand?`, top.card)) H().move(s, top.iid, 'hand')
})
done("Herald's Horn")

chooseType('Door of Destinies')
trig('Door of Destinies', 'castSpell', 'Door#cast', (ctx, item) => {
	const s = ctx.s
	const d = findPerm(s, item.iid)
	const spell = item.about !== undefined ? locate(s, item.about) : null
	const card = spell?.obj.card ?? s.stack.find((it) => it.obj?.iid === item.about)?.card
	if (d && card && ofType(s, { card }, chosenType(d))) addCounters(d, 'charge', 1 + annex(s, item.controller))
}, { who: 'you', text: 'Whenever you cast a spell of the chosen type, put a charge counter on this artifact.' })
BUFFS['Door of Destinies'] = (s, src, p) => {
	const n = src.counters.charge ?? 0
	return n && p.controller === src.controller && isCreature(s, p) && ofType(s, p, chosenType(src)) ? [n, n] : [0, 0]
}
done('Door of Destinies')

patchRules('Unification', (r) => {
	if (r.chapters?.[0]) r.chapters[0].compiled = named('Unification I', [{ kind: 'perm', filter: { types: ['creature'], not: [] }, min: 0, max: 1 }])
	if (r.chapters?.[1]) r.chapters[1].compiled = named('Unification II')
	if (allCompiled(r)) r.fullyAutomated = true
})
reg('Unification I', (ctx, item) => {
	const s = ctx.s
	const t = item.targets[0] ? findPerm(s, item.targets[0].id) : undefined
	if (!t) return
	const owner = t.owner
	H().draw(s, owner, 2)
	H().move(s, t.iid, 'library')
	H().shuffle(s, owner)
	log(s, `${cardName(s, t.card)} is shuffled into its owner's library.`)
}, [{ kind: 'perm', filter: { types: ['creature'], not: [] }, min: 0, max: 1 }])
reg('Unification II', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	const pl = s.players[me]
	const cs = [...pl.hand, ...pl.graveyard].filter((o) => rulesOf(s, o).subtypes.includes('Spacecraft'))
	for (const id of pickCard(ctx, me, 'un', 'You may put a Spacecraft card from your hand or graveyard onto the battlefield', cs, 0, 1)) H().move(s, id, 'battlefield', { controller: me })
})

spell('Promise of Loyalty', (ctx, item) => {
	const s = ctx.s
	const me = item.controller
	s.players.forEach((_, i) => {
		const cs = mine(s, i, (p) => isCreature(s, p))
		const [keep] = pickPerm(ctx, i, `pl${i}`, 'Promise of Loyalty: choose a creature to keep (it gets a vow counter); sacrifice the rest', cs, 1, 1, (p) => pt(s, p)[0] + pt(s, p)[1])
		for (const p of cs) if (p !== keep) H().move(s, p.iid, 'graveyard', { cause: 'sacrifice' })
		if (keep) {
			addCounters(keep, 'vow', 1)
			// in a duel, "can't attack you" means the opponent's creature can't attack at all
			if (i !== me) keep.mods.push({ power: 0, toughness: 0, keywords: ['defender'], until: 'perm', note: 'vow' })
		}
	})
})

// 2 players: there's only one player to attack, so reselecting doesn't change anything.
patchRules('Tuvok, Chief Tactical Officer', (r) => {
	for (const t of r.triggers) t.compiled ??= { targets: [], effects: [] }
	for (const t of r.triggers) t.conditional = false
	if (allCompiled(r)) r.fullyAutomated = true
})
