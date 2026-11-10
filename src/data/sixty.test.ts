import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mk } from '../engine/fixture'
import { ST } from '../engine/startrek.fixture'
import type { CardDef } from '../engine/types'
import { buildGame } from './build'
import { DECKS, needsCommander, SIXTY_LANDS, sixtyCards } from './decks'
import { slug } from './scryfall'

const pool: Record<string, CardDef> = Object.fromEntries(
	[
		...Object.values(ST),
		mk('Command Tower', '', 'Land', "{T}: Add one mana of any color in your commander's color identity."),
		mk('Arcane Signet', '{2}', 'Artifact', "{T}: Add one mana of any color in your commander's color identity."),
		mk('Sol Ring', '{1}', 'Artifact', '{T}: Add {C}{C}.'),
		mk('Glacial Fortress', '', 'Land', 'Glacial Fortress enters tapped unless you control a Plains or an Island.\n{T}: Add {W} or {U}.', undefined, { produces: ['W', 'U'] }),
		mk('Plains', '', 'Basic Land — Plains', '({T}: Add {W}.)'),
		mk('Island', '', 'Basic Land — Island', '({T}: Add {U}.)'),
		mk('Swamp', '', 'Basic Land — Swamp', '({T}: Add {B}.)'),
		mk('Mountain', '', 'Basic Land — Mountain', '({T}: Add {R}.)'),
		mk('Forest', '', 'Basic Land — Forest', '({T}: Add {G}.)'),
	].map((c) => [slug(c.name), { ...c, id: slug(c.name) }]),
)

test('60-card cut: 24 lands, 36 spells, both legends, nothing that needs a commander', () => {
	for (const d of DECKS) {
		const cards = sixtyCards(d, pool, slug)
		assert.equal(cards.length, 60, d.name)
		assert.ok(cards.includes(d.commander) && cards.includes(d.alt), d.name)
		assert.ok(!cards.includes('Command Tower') && !cards.includes('Arcane Signet'), d.name)
		const basics = cards.filter((n) => d.basics.some(([b]) => b === n)).length
		const lands = cards.filter((n) => /Land/.test(pool[slug(n)]?.typeLine ?? '')).length
		assert.ok(basics >= SIXTY_LANDS - 10 && lands <= SIXTY_LANDS, d.name)
		// singleton apart from basics
		const nonbasic = cards.filter((n) => !d.basics.some(([b]) => b === n))
		assert.equal(new Set(nonbasic).size, nonbasic.length, d.name)
		assert.deepEqual(sixtyCards(d, pool, slug), cards, 'deterministic')
	}
	// a card naming itself "Commander …" isn't a commander card
	assert.equal(needsCommander({ name: 'Commander William Riker', cmc: 3, typeLine: 'Creature', oracle: 'Commander William Riker gets +1/+1.' }), false)
})

test('Classic 60-card game: 20 life, no command zone, 53 cards left after the opening hand', () => {
	const s = buildGame(pool, [{ name: 'A', deck: 'federation', leader: 'commander' }, { name: 'B', deck: 'borg', leader: 'alt' }], 'sixty', 7)
	assert.equal(s.format.id, 'sixty')
	for (const pl of s.players) {
		assert.equal(pl.life, 20)
		assert.equal(pl.command.length, 0)
		assert.equal(pl.commanders.length, 0)
		assert.equal(pl.library.length + pl.hand.length, 60)
		assert.equal(pl.hand.length, 7)
		assert.ok(pl.identity.length > 0)
	}
})
