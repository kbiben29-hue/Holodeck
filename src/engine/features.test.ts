import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newGame, apply, tryApply } from './engine'
import { FIX, FIX_DECKS, mk } from './fixture'
import { parse, rulesFor } from './rules'
import './named'
import { findPerm, pt } from './state'
import { ST } from './startrek.fixture'
import type { CardDef, GameState, Intent, Obj } from './types'

const C = (c: CardDef) => parse({ name: c.name, oracle: c.oracle, typeLine: c.typeLine })
const P = (name: string, oracle: string, typeLine = 'Instant') => parse({ name, oracle, typeLine })

test('reads "up to", modes, sagas, kicker, extra costs, flashback, cycling', () => {
	const r = P('X', 'Destroy up to one target artifact or enchantment.')
	assert.equal(r.spell?.targets[0].min, 0)
	assert.equal(P('X', 'Put a +1/+1 counter on each of up to three target creatures.').spell?.targets[0].max, 3)
	assert.equal(P('Vic', 'One or two target creatures each get +2/+0 and gain lifelink until end of turn.').spell?.targets[0].max, 2)
	const abrade = P('Abrade', 'Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.')
	assert.equal(abrade.modal?.modes.length, 2)
	assert.ok(abrade.modal?.modes.every((m) => m.compiled))
	const saga = P('Sins', '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each opponent sacrifices a nontoken creature of their choice.\nII — For each opponent, you create a 2/1 red Klingon Warrior creature token with haste.\nIII — Exile target player’s graveyard.', 'Enchantment — Saga')
	assert.equal(saga.chapters?.length, 3)
	assert.ok(saga.chapters![0].compiled && saga.chapters![1].compiled)
	const k = P('Champ', 'Kicker {2}\nDeathtouch\nWhen this creature enters, if it was kicked, other creatures you control gain deathtouch until end of turn.', 'Creature — Klingon Warrior')
	assert.equal(k.kicker, '{2}')
	assert.equal(k.triggers[0].compiled?.ifKicked, true)
	assert.deepEqual(P('Thrill', 'As an additional cost to cast this spell, discard a card.\nDraw two cards.').extraCost, { discard: 1 })
	assert.equal(P('FM', 'You gain 2 life, draw two cards, then discard two cards.\nFlashback {1}{W}{U}').flashback, '{1}{W}{U}')
	assert.equal(P('Peak', '({T}: Add {U} or {R}.)\nThis land enters tapped.\nCycling {2}', 'Land').cycling?.cost, '{2}')
	assert.equal(P('Pongify', "Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.").spell?.effects[1].e, 'tokenForController')
})

test('reads new triggers and statics', () => {
	const jan = P('Captain Janeway, Endgame', 'Whenever one or more Officers you control deal combat damage to a player, you draw a card and create a 1/1 red Officer creature token.', 'Legendary Creature — Human Officer')
	assert.equal(jan.triggers[0].event, 'teamDamage')
	assert.equal(jan.triggers[0].compiled?.effects.length, 2)
	const loc = P('Locutus of Borg', 'Lifelink\nArtifact creatures you control have "Whenever this creature deals combat damage to a player, create a 1/1 colorless Borg artifact creature token."', 'Legendary Artifact Creature — Borg')
	assert.ok(loc.triggers[0].granted)
	assert.equal(loc.triggers[0].event, 'combatDamagePlayer')
	const sam = P('Sam Kirk', 'Whenever an opponent casts a creature spell, investigate.', 'Legendary Creature — Human')
	assert.equal(sam.triggers[0].event, 'castSpell')
	assert.equal(sam.triggers[0].who, 'opp')
	const cur = P('Curzon Dax, Bound by Blood', 'Whenever another Klingon or Warrior you control dies, Curzon Dax deals 1 damage to each opponent.', 'Legendary Creature — Trill Warrior')
	assert.equal(cur.triggers[0].event, 'otherDies')
	assert.ok(cur.triggers[0].compiled)
	assert.equal(P('Gagh', 'Klingon spells and Warrior spells you cast cost {1} less to cast.', 'Creature — Klingon Warrior').costReduction?.n, 1)
	assert.equal(P('T', 'This token can’t block.'.replace('’', "'"), 'Creature — Tribble').cantBlock, true)
	assert.equal(P('McCoy', 'Whenever McCoy or another Doctor you control enters, put a +1/+1 counter on each creature you control.', 'Legendary Creature — Human Doctor').triggers.length, 2)
	assert.equal(rulesFor(ST['jean-luc-picard-luminary']).triggers[0].compiled?.effects[0].e, 'named')
})

// ───────── in play ─────────

function start(): GameState {
	let s = newGame({ players: [{ name: 'A', ...FIX_DECKS.uw }, { name: 'B', ...FIX_DECKS.rg }], cards: { ...FIX, ...ST }, seed: 5, format: 'duel', first: 0 })
	s = apply(s, { type: 'keep', player: 0 })
	s = apply(s, { type: 'keep', player: 1 })
	s.players[0].hand = []
	s.players[1].hand = []
	return s
}
function add(s: GameState, c: CardDef) {
	s.cards = { ...s.cards, [c.id]: c }
}
function give(s: GameState, p: number, card: string, zone: 'hand' | 'battlefield' | 'graveyard' | 'library'): number {
	const iid = s.nextId++
	const o: Obj = { iid, card, owner: p }
	if (zone === 'battlefield') s.battlefield.push({ ...o, controller: p, tapped: false, sick: false, counters: {}, damage: 0, mods: [] })
	else if (zone === 'library') s.players[p].library.unshift(o)
	else s.players[p][zone].push(o)
	return iid
}
const ok = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(r.error)
	return r.state!
}
const choose = (s: GameState, picks: string[]) => ok(s, { type: 'choose', player: s.pending.kind === 'choose' ? s.pending.player : 0, picks })
const lands = (s: GameState, p: number, n: number, card = 'island') => {
	for (let i = 0; i < n; i++) give(s, p, card, 'battlefield')
}

test('modal spell: choose a mode, then its target', () => {
	let s = start()
	const abrade = mk('Abrade', '{1}{R}', 'Instant', 'Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.')
	add(s, abrade)
	lands(s, 0, 2, 'mountain')
	const bears = give(s, 1, 'grizzly-bears', 'battlefield')
	const iid = give(s, 0, abrade.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid })
	// "destroy target artifact" has no target here, so only the damage mode is offered
	if (s.pending.kind === 'choose') s = choose(s, ['0'])
	assert.ok(!findPerm(s, bears), 'bears took 3')
})

test('up to one target may choose nothing; extra discard cost; flashback from the graveyard', () => {
	let s = start()
	const fm = mk('Faithful Mending', '{W}{U}', 'Instant', 'You gain 2 life, draw two cards, then discard two cards.\nFlashback {1}{W}{U}')
	const thrill = mk('Thrill of Possibility', '{1}{R}', 'Instant', 'As an additional cost to cast this spell, discard a card.\nDraw two cards.')
	add(s, fm)
	add(s, thrill)
	lands(s, 0, 3, 'plains')
	lands(s, 0, 3, 'island')
	lands(s, 0, 2, 'mountain')
	const t = give(s, 0, thrill.id, 'hand')
	const junk = give(s, 0, 'forest', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: t })
	assert.ok(s.players[0].graveyard.some((o) => o.iid === junk), 'discarded as a cost')
	assert.equal(s.players[0].hand.length, 2)
	const g = give(s, 0, fm.id, 'graveyard')
	s = ok(s, { type: 'cast', player: 0, iid: g })
	if (s.pending.kind === 'choose') s = choose(s, s.pending.question.options.slice(0, 2).map((o) => o.id))
	assert.ok(s.players[0].exile.some((o) => o.iid === g), 'flashback exiles it')
	assert.equal(s.players[0].life, 22)
})

test('saga chapters trigger and it is sacrificed after the last', () => {
	let s = start()
	const saga = mk('Test Saga', '{1}{W}', 'Enchantment — Saga', '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI — You gain 3 life.\nII — Draw a card.')
	add(s, saga)
	lands(s, 0, 2, 'plains')
	const iid = give(s, 0, saga.id, 'hand')
	s = ok(s, { type: 'cast', player: 0, iid })
	assert.equal(s.players[0].life, 23)
	assert.equal(findPerm(s, iid)?.counters.lore, 1)
	// next turn of player 0: chapter II then sacrificed
	for (let i = 0; i < 60 && !(s.turn === 3 && s.step === 'main1' && !s.stack.length); i++) {
		const p = s.pending
		if (p.kind === 'attackers') s = ok(s, { type: 'attack', player: p.player, attackers: [] })
		else if (p.kind === 'blockers') s = ok(s, { type: 'block', player: p.player, blocks: [] })
		else if (p.kind === 'choose') s = choose(s, p.question.options.slice(0, p.question.min).map((o) => o.id))
		else if (p.kind === 'priority') s = ok(s, { type: 'pass', player: p.player })
	}
	assert.ok(!findPerm(s, iid), 'sacrificed after chapter II')
	assert.ok(s.players[0].graveyard.some((o) => o.iid === iid))
})

test('granted combat-damage triggers, team damage, cast triggers', () => {
	let s = start()
	const loc = mk('Locutus of Borg', '{1}{W}{U}{B}', 'Legendary Artifact Creature — Borg', 'Artifact creatures you control have "Whenever this creature deals combat damage to a player, create a 1/1 colorless Borg artifact creature token."', '3/3')
	const drone = mk('Drone', '{2}', 'Artifact Creature — Borg', '', '2/2')
	const sam = mk('Sam Kirk, Xenoanthropologist', '{3}{U}', 'Legendary Creature — Human Scientist', 'Whenever an opponent casts a creature spell, investigate.', '3/3')
	for (const c of [loc, drone, sam]) add(s, c)
	give(s, 0, loc.id, 'battlefield')
	give(s, 0, drone.id, 'battlefield')
	give(s, 1, sam.id, 'battlefield')
	s = ok(s, { type: 'pass', player: 0 })
	s = ok(s, { type: 'attack', player: 0, attackers: s.battlefield.filter((p) => p.controller === 0 && (p.card === loc.id || p.card === drone.id)).map((p) => p.iid) })
	if (s.pending.kind === 'blockers') s = ok(s, { type: 'block', player: 1, blocks: [] })
	for (let i = 0; i < 6 && s.step !== 'main2'; i++) if (s.pending.kind === 'priority') s = ok(s, { type: 'pass', player: s.pending.player })
	const borg = s.battlefield.filter((p) => p.controller === 0 && s.cards[p.card]?.name === 'Borg').length
	assert.equal(borg, 2, 'both artifact creatures made a Borg')
	// opponent casts a creature: Sam Kirk investigates
	lands(s, 0, 2, 'island')
	const wd = give(s, 0, 'wind-drake', 'hand')
	lands(s, 0, 1, 'island')
	s = ok(s, { type: 'cast', player: 0, iid: wd })
	for (let i = 0; i < 6 && s.stack.length; i++) if (s.pending.kind === 'priority') s = ok(s, { type: 'pass', player: s.pending.player })
	assert.ok(s.battlefield.some((p) => p.controller === 1 && s.cards[p.card]?.name === 'Clue'))
})

test('Kirk finds the Enterprise; the Borg Queen assimilates', () => {
	let s = start()
	lands(s, 0, 7, 'forest')
	lands(s, 0, 1, 'plains')
	lands(s, 0, 1, 'island')
	give(s, 0, 'starship-enterprise', 'library')
	const kirk = give(s, 0, 'captain-kirk-boldly-going', 'hand')
	s = ok(s, { type: 'cast', player: 0, iid: kirk })
	for (let i = 0; i < 6 && (s.stack.length || s.pending.kind === 'choose'); i++) {
		if (s.pending.kind === 'choose') s = choose(s, [s.pending.question.options.find((o) => o.label.includes('Enterprise'))?.id ?? s.pending.question.options[0].id])
		else if (s.pending.kind === 'priority') s = ok(s, { type: 'pass', player: s.pending.player })
	}
	assert.ok(s.players[0].hand.some((o) => o.card === 'starship-enterprise'))
	let t = start()
	lands(t, 0, 3, 'plains')
	lands(t, 0, 2, 'island')
	lands(t, 0, 2, 'swamp')
	give(t, 1, 'hill-giant', 'library')
	const q = give(t, 0, 'the-borg-queen', 'hand')
	t = ok(t, { type: 'cast', player: 0, iid: q })
	for (let i = 0; i < 6 && t.stack.length; i++) if (t.pending.kind === 'priority') t = ok(t, { type: 'pass', player: t.pending.player })
	const giant = t.battlefield.find((p) => p.card === 'hill-giant')
	assert.ok(giant && giant.controller === 0, 'assimilated')
	assert.deepEqual(pt(t, giant!), [3 + 1 + 2, 3 + 1 + 2], '+1/+1 counter and the Queen’s +2/+2 as an artifact creature')
})
