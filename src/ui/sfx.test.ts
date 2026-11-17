// Which kind of sound each moment gets (the sounds themselves need a browser).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { soundFor } from './sfx'

const cards: Record<string, { name: string; typeLine: string; oracle: string }> = {
	'U.S.S. Stargazer': { name: 'U.S.S. Stargazer', typeLine: 'Legendary Artifact — Spacecraft', oracle: '' },
	Kurn: { name: 'Kurn', typeLine: 'Legendary Creature — Klingon Warrior', oracle: '' },
	Shock: { name: 'Shock', typeLine: 'Instant', oracle: '' },
}
const find = (n: string) => cards[n]

test('sounds follow the cards: weapons, explosions, beams, engines', () => {
	assert.equal(soundFor('U.S.S. Stargazer deals 4 damage to Ensign.', find)?.key, 'dmg:U.S.S. Stargazer')
	assert.equal(soundFor('Kurn deals 2 damage to Kurn.', find)?.key, 'dmg:Kurn')
	assert.equal(soundFor('Shock deals 2 damage to Captain.', find)?.key, 'dmg:Shock')
	assert.equal(soundFor('Kurn dies.', find)?.key, 'boom')
	assert.equal(soundFor('Kurn is exiled.', find)?.key, 'beam')
	assert.equal(soundFor('Captain attacks with U.S.S. Stargazer, Kurn.', find)?.key, 'attack')
	assert.equal(soundFor('U.S.S. Stargazer enters the battlefield.', find)?.key, 'enter')
	assert.equal(soundFor('Captain casts Shock targeting Kurn.', find)?.key, 'cast')
	assert.equal(soundFor('Ensign assimilates Kurn.', find)?.key, 'borg')
	assert.equal(soundFor('Captain loses (life total 0).', find), null, 'the finale has its own sounds')
})

test('Bloomburrow critters sound like themselves', () => {
	const cards: Record<string, { name: string; typeLine: string }> = {
		a: { name: 'Bramble Bird', typeLine: 'Creature — Bird Bard' },
		b: { name: 'Pond Frog', typeLine: 'Creature — Frog Wizard' },
	}
	const find = (n: string) => Object.values(cards).find((c) => c.name === n) as never
	const w = () => 'bb' as const
	assert.equal(soundFor('A attacks with Bramble Bird.', find, w)?.key, 'attack')
	assert.equal(soundFor('B gets a gift: a card.', find, w)?.key, 'gift')
})
