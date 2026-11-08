// Deck lessons for the four Star Trek Commander decks: a game-plan guide per deck, combo alerts during a
// coached game, and combo drills (set positions with a goal and step-by-step coaching).
// All text is our own wording.

import { DECKS, deckCards } from '../data/decks'
import { missingDef, slug } from '../data/scryfall'
import { scenario, type SideSpec } from '../engine/scenario'
import { findPerm, isCreature } from '../engine/state'
import type { CardDef, Format, GameState } from '../engine/types'
import type { CoachStep, Hint } from './coach'

export type DeckId = 'federation' | 'landing' | 'klingon' | 'borg'
export const deckName = (id: string) => DECKS.find((d) => d.id === id)?.name ?? id
/** The opponent deck used in a deck's coached game and drills. */
export const rivalDeck = (id: DeckId): DeckId => ({ federation: 'klingon', klingon: 'federation', borg: 'landing', landing: 'borg' })[id] as DeckId

// ───────── game plans ─────────

export const PLANS: Record<DeckId, { title: string; body: string }[]> = {
	federation: [
		{
			title: 'Federation Fleet — the game plan',
			body: 'Blue-Red-White, led by Jean-Luc Picard. This deck wins by out-drawing the opponent and turning card draw into value. Many of its crew have Seek out: an ability that happens whenever you draw your second card in a turn — on your turn and on the opponent’s.',
		},
		{
			title: 'Seek out: draw two',
			body: 'Your draw step is your first card each turn, so any extra draw sets off every Seek out you have. Riker ({1}, tap: you and the opponent each draw two), Howling Mine, Alhammarret’s Archive, Thrill of Possibility and Frantic Search all do it. Ro Laren pings the opponent for 2, Rom and Leeta make two Treasures, Dr. Pulaski gains you 4, Worf, Son of Mogh makes an Officer, Tom Paris gives your whole team flying, double strike, vigilance and haste.',
		},
		{
			title: 'Picard and the fleet',
			body: 'Picard draws you a card whenever another historic permanent (artifact, legendary or Saga) with mana value 3 or more enters under your control — and this deck is full of legendary crew and Spacecraft. His Seek out also adds +1/+1 counters and charge counters, which helps your Spacecraft station faster. Captain Janeway, the other leader, rewards attacking with Officers instead.',
		},
		{
			title: 'Spacecraft and Station',
			body: 'A Spacecraft is an artifact that becomes a creature once it has enough charge counters. To station it (only in your main phase), tap another creature you control: the Spacecraft gets charge counters equal to that creature’s power. Tap your small crew after they’ve done their job to power up the Enterprise-E, the Defiant or the Stargazer.',
		},
		{
			title: 'Careful with Riker',
			body: 'Riker’s ability gives the opponent two cards too. Use it when it sets off several Seek outs at once, or late in the game when your draw engines matter more than theirs. Supreme Verdict and Swords to Plowshares are your answers when the opponent gets ahead on the board.',
		},
	],
	landing: [
		{
			title: 'Landing Party — the game plan',
			body: 'Green-White-Blue, led by Commander Spock. This deck explores strange new worlds: it plays lots of different lands, gets value every time a land enters (Landfall), and finishes with Spacecraft like the Starship Enterprise.',
		},
		{
			title: 'Strange new worlds',
			body: 'Several cards count how many differently named lands you control: Spock, Lt. Arex, Christine Chapel, Chief Scott, Uhura and the Colossal Clone Master. That’s why the deck has so many one-of lands and few basics. Ramp spells (Cultivate, Rampant Growth, Farseek, Nature’s Lore) and Exploration help you hit a new land every turn.',
		},
		{
			title: 'Landfall',
			body: 'Whenever a land enters under your control: M’Ress makes two 1/1 Officers, Amanda Grayson puts two +1/+1 counters on a creature, the Shuttlecraft Galileo makes an Officer, Lotus Cobra adds mana, and the Starship Enterprise gets four charge counters. Evolving Wilds and the other fetch lands give you two landfalls for one land drop.',
		},
		{
			title: 'Kirk and the Enterprise',
			body: 'Captain Kirk finds you a basic land — or the Starship Enterprise — whenever he enters or attacks, and gives your Spacecraft creatures +3/+3. The Enterprise becomes a 4/6 flier at 16 charge counters: four landfalls, or stationing with big creatures. With Kirk out it hits for 7 in the air and draws you a card for each point of damage.',
		},
		{
			title: 'Spock',
			body: 'Whenever Spock enters or attacks, look at the top card of your library: if it’s cheap enough (mana value no more than your number of differently named lands) you cast it for free; a land goes onto the battlefield. Either way you draw a card if it’s still there. The more different lands you have, the better he gets.',
		},
	],
	klingon: [
		{
			title: 'Klingon Fury — the game plan',
			body: 'Red-White-Black, led by Worf, Defiant Commander. Today is a good day to die: this deck attacks every turn with a wide army of Klingon Warriors and gets paid for it. Most of its cards trigger whenever you attack (Battlefront), not when a single creature does.',
		},
		{
			title: 'Battlefront in a duel',
			body: 'Battlefront cards count the opponents you attacked this turn. In a two-player game that’s simply 1 whenever you attack. Worf exiles the top card of your library and lets you play it until the end of your next turn, Martok puts a +1/+1 counter on a creature, Kurn draws you a card for 1 life, and Rite of Ascension adds a 2/1 Warrior attacking alongside.',
		},
		{
			title: 'Go wide, hit hard',
			body: 'Worf makes a 2/1 hasty Warrior when he enters. Gnarling Targ gives every Klingon and Warrior +2/+0 and trample whenever you attack, so even a crowd of 2/1 tokens becomes lethal. Kor lets you sacrifice a spare creature when you attack to draw a card and give your Klingons +2/+2. Glory to the Empire! and Rite of Ascension keep the tokens coming.',
		},
		{
			title: 'Honour in death',
			body: 'Your creatures will die in combat, and that’s fine: Curzon Dax pings the opponent whenever another Klingon or Warrior dies, Chancellor Gorkon exiles two creatures on his way out, and The Promise of Kahless brings every fallen Klingon back at once. Path to Exile, Terminate and Vindicate clear blockers out of the way.',
		},
	],
	borg: [
		{
			title: 'We Are the Borg — the game plan',
			body: 'White-Blue-Black, led by The Borg Queen. Resistance is futile: build a swarm of artifact creatures, make them all bigger at once, and assimilate the opponent’s best creatures to fight for you.',
		},
		{
			title: 'The Queen and her drones',
			body: 'The Borg Queen gives all your artifact creatures +2/+2 — including the 1/1 Borg tokens this deck makes everywhere (Borg Incursion, Class-4 Tactical Cube, Locutus, Join the Collective, Maturation Chamber, Deliver from Chaos). Two tokens and the Queen already hit for 12. Tempered Steel and One, Borg Evolved make the swarm even scarier.',
		},
		{
			title: 'Assimilate',
			body: 'To assimilate a creature card, you put it onto the battlefield under your control with a +1/+1 counter, and it becomes a Borg artifact creature — so your anthems pump it too. The Borg Queen assimilates the first creature from the top of the opponent’s library whenever she enters or attacks; Assimilation Assessor and Gift of Perfection steal from their graveyard and library.',
		},
		{
			title: 'Artifacts matter',
			body: 'Almost everything here is an artifact, which turns on Metalcraft (three or more artifacts): Dispatch exiles a creature instead of just tapping it. Thoughtcast gets cheaper, Skullclamp turns dying tokens into cards, and Emergency Regeneration saves the whole collective from a board wipe.',
		},
	],
}

// ───────── combo alerts ─────────

interface Combo {
	key: string
	deck: DeckId
	cards: string[]
	title: string
	body: string
}

export const COMBOS: Combo[] = [
	{ key: 'riker-seek', deck: 'federation', cards: ['Commander William Riker', 'Ro Laren, Double Agent'], title: 'Combo: Riker + Ro Laren', body: 'Riker’s ability draws you two cards — your second card this turn — so Ro Laren’s Seek out deals 2 damage to the opponent. Use it after your draw step for an extra 2 damage every turn.' },
	{ key: 'riker-rom', deck: 'federation', cards: ['Commander William Riker', 'Rom and Leeta, Unlikely Pair'], title: 'Combo: Riker + Rom and Leeta', body: 'Riker draws you two, which sets off Rom and Leeta: two Treasures. The Treasures pay for Riker’s next activation and more.' },
	{ key: 'paris-seek', deck: 'federation', cards: ['Tom Paris, Risk-Taker', 'Howling Mine'], title: 'Combo: Tom Paris + extra draws', body: 'Howling Mine gives you a second card in your draw step, so Tom Paris’s Seek out gives your whole team flying, double strike, vigilance and haste every turn. Attack with everything.' },
	{ key: 'picard-fleet', deck: 'federation', cards: ['Jean-Luc Picard, Luminary', 'U.S.S. Enterprise-E, Sovereign'], title: 'Combo: Picard + Spacecraft', body: 'Picard draws you a card whenever a historic permanent with mana value 3+ enters — like the Enterprise-E, which also destroys every tapped creature when it arrives. Cast it after the opponent attacked with everything.' },
	{ key: 'kirk-enterprise', deck: 'landing', cards: ['Captain Kirk, Boldly Going', 'Starship Enterprise'], title: 'Combo: Kirk + the Enterprise', body: 'Kirk gives Spacecraft creatures +3/+3 and can fetch the Enterprise to your hand. Each land you play gives the Enterprise 4 charge counters; at 16 it’s a 7/9 flier with Kirk out.' },
	{ key: 'mress-land', deck: 'landing', cards: ['M’Ress, Crew Coordinator'], title: 'Combo: M’Ress + land drops', body: 'Every land you play makes two 1/1 Officers. Fetch lands like Evolving Wilds make four: one landfall for the fetch land, one for the land it finds.' },
	{ key: 'spock-lands', deck: 'landing', cards: ['Commander Spock', 'Exploration'], title: 'Combo: Spock + Exploration', body: 'Exploration lets you play two lands a turn, so your count of differently named lands grows fast — and Spock casts bigger free spells from the top of your library when he enters or attacks.' },
	{ key: 'targ-wide', deck: 'klingon', cards: ['Worf, Defiant Commander', 'Gnarling Targ'], title: 'Combo: Worf + Gnarling Targ', body: 'Whenever you attack, every Klingon and Warrior gets +2/+0 and trample. Worf and his 2/1 Warrior token become a 5/4 and a 4/1 trampler — attack with everything you have.' },
	{ key: 'promise', deck: 'klingon', cards: ['The Promise of Kahless', 'Curzon Dax, Bound by Blood'], title: 'Combo: The Promise of Kahless', body: 'After a big trade in combat, The Promise of Kahless brings back all your other Klingons and Warriors from the graveyard. Curzon Dax made the opponent pay for every one that died.' },
	{ key: 'kor-tokens', deck: 'klingon', cards: ['Kor, Cause of Vengeance', 'Rite of Ascension'], title: 'Combo: Kor + Rite of Ascension', body: 'Rite of Ascension makes a Warrior token each time you attack; Kor lets you sacrifice a spare creature when you attack to draw a card and give your Klingons +2/+2.' },
	{ key: 'queen-cube', deck: 'borg', cards: ['The Borg Queen', 'Class-4 Tactical Cube'], title: 'Combo: Borg Queen + Tactical Cube', body: 'The Cube makes two Borg tokens, and with the Queen out each is a 3/3. That’s 6 extra power for 4 mana, and the tokens can station the Cube itself.' },
	{ key: 'queen-incursion', deck: 'borg', cards: ['The Borg Queen', 'Borg Incursion'], title: 'Combo: Borg Queen + Borg Incursion', body: 'Borg Incursion is an instant: two 3/3 Borg with the Queen out, ready to block — and your artifact creatures get protection from a colour of your choice that turn.' },
	{ key: 'one-swarm', deck: 'borg', cards: ['One, Borg Evolved', 'The Borg Queen'], title: 'Combo: One + the Queen', body: 'One gives every artifact creature flying, double strike, vigilance, menace, lifelink and ward. With the Queen’s +2/+2, each 1/1 token deals 6 damage in the air.' },
]

const has = (s: GameState, p: number, name: string) => {
	const id = slug(name)
	const pl = s.players[p]
	return [...pl.hand, ...pl.command].some((o) => o.card === id) || s.battlefield.some((q) => q.controller === p && q.card === id)
}

/** A combo alert when all of a combo's cards are in hand / command zone / play and it hasn't been shown. */
export function comboNote(deck: DeckId, s: GameState, me: number, seen: Set<string>): CoachStep | null {
	for (const c of COMBOS) {
		if (c.deck !== deck || seen.has('combo-' + c.key)) continue
		if (c.cards.every((n) => has(s, me, n))) {
			const ids = c.cards.map(slug)
			const hand = [...s.players[me].hand, ...s.players[me].command].filter((o) => ids.includes(o.card)).map((o) => o.iid)
			const perms = s.battlefield.filter((q) => q.controller === me && ids.includes(q.card)).map((q) => q.iid)
			return { key: 'combo-' + c.key, title: c.title, body: c.body, hint: { hand, perms } }
		}
	}
	return null
}

// ───────── combo drills ─────────

export interface DrillStep {
	text: string
	hint: Hint
	done: (s: GameState, start: GameState) => boolean
}
export interface Drill {
	id: string
	deck: DeckId
	title: string
	goal: string
	lesson: string
	build: (cards: Record<string, CardDef>, seed: number) => GameState
	steps: (s: GameState) => DrillStep[]
	success: (s: GameState, start: GameState) => boolean
}

const ID = slug
const perm = (s: GameState, p: number, name: string) => s.battlefield.find((q) => q.controller === p && q.card === ID(name))?.iid ?? -1
const inHand = (s: GameState, p: number, name: string) => s.players[p].hand.find((o) => o.card === ID(name))?.iid ?? -1
const oppLife = (n: number) => (s: GameState) => s.players[1].life <= n
const attacked = (s: GameState) => !!s.combat?.declared || s.step === 'main2' || s.players[1].life <= 0
const tokens = (s: GameState, name: string) => s.battlefield.filter((q) => q.controller === 0 && q.token && s.cards[q.card]?.name === name).length

export function buildDrill(deck: DeckId, me: SideSpec, rival: SideSpec, cards: Record<string, CardDef>, seed: number, format: Format['id'] = 'duel'): GameState {
	const pool = { ...cards }
	const ids = (names: string[]) =>
		names.map((n) => {
			const id = ID(n)
			if (!pool[id]) pool[id] = missingDef(n)
			return id
		})
	const side = (d: DeckId, name: string) => {
		const dd = DECKS.find((x) => x.id === d)!
		const { commanders, cards: rest } = deckCards(dd)
		return { name, commanders: ids(commanders), deck: ids(rest) }
	}
	const fix = (x: SideSpec): SideSpec => ({ ...x, hand: x.hand?.map(ID), libraryTop: x.libraryTop?.map(ID) })
	return scenario({ players: [side(deck, 'Captain'), { ...side(rivalDeck(deck), 'Ensign'), bot: true }], cards: pool, seed, format }, [fix(me), fix(rival)])
}

const L = (name: string, n = 1) => Array.from({ length: n }, () => ({ id: ID(name) }))

export const DRILLS: Drill[] = [
	{
		id: 'fed-seek',
		deck: 'federation',
		title: 'Seek out, all at once',
		goal: 'Set off three Seek out abilities with one activation: deal 2 damage, make two Treasures and gain 4 life.',
		lesson: 'You already drew this turn, so Riker’s two cards included your second card of the turn — and every Seek out went off together. That’s the heart of this deck: any extra draw is worth much more than a card.',
		build: (cards, seed) =>
			buildDrill(
				'federation',
				{
					hand: ['Swords to Plowshares'],
					battlefield: [{ id: ID('Commander William Riker') }, { id: ID('Ro Laren, Double Agent') }, { id: ID('Rom and Leeta, Unlikely Pair') }, { id: ID('Dr. Pulaski, Cynical Clinician') }, ...L('Island', 2), ...L('Plains', 2), ...L('Mountain', 2)],
					life: 12,
					drawn: 1,
				},
				{ battlefield: [{ id: ID('Kurn, Son of Mogh') }], life: 15 },
				cards,
				seed,
			),
		steps: (s) => [
			{ text: 'You drew your first card this turn in your draw step. Click Commander William Riker and use his ability ({1}, tap: you and target opponent each draw two cards). Choose the Ensign as the opponent.', hint: { perms: [perm(s, 0, 'Commander William Riker')], buttons: ['{1}'] }, done: (x) => x.players[0].drawsThisTurn! >= 3 || x.stack.some((i) => i.card === ID('Commander William Riker')) },
			{ text: 'Riker’s ability is on the stack. Let it resolve: you draw two cards — and the first one is your second card this turn. All three Seek outs trigger.', hint: { buttons: ['Resolve'] }, done: (x) => x.players[0].drawsThisTurn! >= 2 && !x.stack.some((i) => i.card === ID('Commander William Riker')) },
			{ text: 'Resolve the Seek out triggers: Ro Laren deals 2 to the Ensign, Rom and Leeta make two Treasures, Dr. Pulaski gains you 4 life.', hint: { buttons: ['Resolve'] }, done: (x) => x.stack.length === 0 },
		],
		success: (s, start) => s.players[1].life <= start.players[1].life - 2 && tokens(s, 'Treasure') >= 2 && s.players[0].life >= start.players[0].life + 4,
	},
	{
		id: 'kli-battlefront',
		deck: 'klingon',
		title: 'Today is a good day to die',
		goal: 'Win this turn: the Ensign is at 14 life with one blocker.',
		lesson: 'Gnarling Targ triggers whenever you attack: every Klingon and Warrior got +2/+0 and trample, so whatever the Ensign blocked, the damage went through. Kurn’s Battlefront drew you a card on the way.',
		build: (cards, seed) =>
			buildDrill(
				'klingon',
				{
					battlefield: [{ id: ID('Worf, Defiant Commander') }, { id: ID('Gnarling Targ') }, { id: ID('Kurn, Son of Mogh') }, { id: '', token: { name: 'Klingon Warrior', power: 2, toughness: 1, types: 'Creature — Klingon Warrior', keywords: ['haste'] } }, ...L('Mountain', 2), ...L('Plains', 2), ...L('Swamp', 2)],
					hand: [],
				},
				{ battlefield: [{ id: ID('Worf, Son of Mogh') }], life: 14 },
				cards,
				seed,
			),
		steps: (s) => [
			{ text: 'Count it up: Worf 3, Targ 4, Kurn 2 and your Warrior token 2 — 11 power, not enough. But whenever you attack, the Targ gives Klingons and Warriors +2/+0 and trample. Press Go to combat.', hint: { buttons: ['Go to combat'] }, done: (x) => x.step !== 'main1' },
			{ text: 'Attack with everything: click all four creatures (or press All), then Attack.', hint: { perms: s.battlefield.filter((q) => q.controller === 0 && isCreature(s, q)).map((q) => q.iid), buttons: ['All', 'Attack'] }, done: attacked },
			{ text: 'Resolve the attack triggers. Worf’s Battlefront exiles your top card (you could play it — do it by hand, or skip it). Then the Ensign blocks; trample carries the damage through.', hint: { buttons: ['Resolve', 'Done'] }, done: oppLife(0) },
		],
		success: oppLife(0),
	},
	{
		id: 'borg-swarm',
		deck: 'borg',
		title: 'Resistance is futile',
		goal: 'Win this turn: the Ensign is at 12 life and has a big blocker.',
		lesson: 'With the Queen and two drones you control three artifacts, so Dispatch had Metalcraft and exiled the blocker instead of just tapping it. Then the Queen’s +2/+2 made each 1/1 drone a 3/3: 6 + 3 + 3 = 12.',
		build: (cards, seed) =>
			buildDrill(
				'borg',
				{
					hand: ['Dispatch'],
					battlefield: [{ id: ID('The Borg Queen') }, { id: '', token: { name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg' } }, { id: '', token: { name: 'Borg', power: 1, toughness: 1, types: 'Artifact Creature — Borg' } }, ...L('Plains', 2), ...L('Island', 1)],
				},
				{ battlefield: [{ id: ID('Captain Kirk, Boldly Going') }], life: 12 },
				cards,
				seed,
			),
		steps: (s) => [
			{ text: 'The Queen makes your artifact creatures +2/+2: she’s 6/6 and each drone is 3/3 — exactly 12. But Kirk would block one. Cast Dispatch on Kirk: you control three artifacts, so Metalcraft exiles him.', hint: { hand: [inHand(s, 0, 'Dispatch')], buttons: ['Cast'] }, done: (x) => perm(x, 1, 'Captain Kirk, Boldly Going') === -1 },
			{ text: 'The way is clear. Press Go to combat.', hint: { buttons: ['Go to combat'] }, done: (x) => x.step !== 'main1' },
			{ text: 'Attack with the Queen and both drones.', hint: { perms: s.battlefield.filter((q) => q.controller === 0 && isCreature(s, q)).map((q) => q.iid), buttons: ['All', 'Attack'] }, done: attacked },
			{ text: 'The Queen’s attack trigger assimilates a creature from the top of the Ensign’s library — do it by hand or skip it. The damage does the rest.', hint: { buttons: ['Resolve', 'Done'] }, done: oppLife(0) },
		],
		success: oppLife(0),
	},
	{
		id: 'land-enterprise',
		deck: 'landing',
		title: 'Warp speed',
		goal: 'Win this turn: the Ensign is at 7 life. The Enterprise has 12 charge counters.',
		lesson: 'The land drop gave the Enterprise its last 4 charge counters: at 16 it became a 4/6 flier, and Kirk’s +3/+3 for Spacecraft made it 7/9. One landfall turned an artifact into a finisher.',
		build: (cards, seed) =>
			buildDrill(
				'landing',
				{
					hand: ['Forest'],
					battlefield: [{ id: ID('Captain Kirk, Boldly Going') }, { id: ID('Starship Enterprise'), counters: { charge: 12 } }, ...L('Forest', 2), ...L('Plains', 1), ...L('Island', 2)],
				},
				{ battlefield: [{ id: ID('Worf, Son of Mogh') }], life: 7 },
				cards,
				seed,
			),
		steps: (s) => [
			{ text: 'The Starship Enterprise becomes a creature at 16 charge counters, and its Landfall adds 4 whenever a land enters. Play the Forest.', hint: { hand: [inHand(s, 0, 'Forest')], buttons: ['Play land'] }, done: (x) => x.players[0].landsPlayed > 0 },
			{ text: 'Resolve the Landfall trigger: 12 + 4 = 16 charge counters. With Kirk out the Enterprise is a 7/9 flier.', hint: { buttons: ['Resolve'] }, done: (x) => (findPerm(x, perm(x, 0, 'Starship Enterprise'))?.counters.charge ?? 0) >= 16 },
			{ text: 'Go to combat and attack with the Enterprise. Worf can’t block a flier.', hint: { perms: [perm(s, 0, 'Starship Enterprise')], buttons: ['Go to combat', 'Attack'] }, done: attacked },
			{ text: 'Let the damage through.', hint: { buttons: ['Resolve', 'Done'] }, done: oppLife(0) },
		],
		success: oppLife(0),
	},
]

export const drillsFor = (deck: string) => DRILLS.filter((d) => d.deck === deck)

/** The coach step for a drill: the first step that isn't done yet. */
export function drillCoach(d: Drill, s: GameState, start: GameState): CoachStep | null {
	const steps = d.steps(s)
	const i = steps.findIndex((x) => !x.done(s, start))
	if (i < 0) return null
	return { key: `${d.id}-${i}`, title: `${d.title} · step ${i + 1}/${steps.length}`, body: steps[i].text, hint: steps[i].hint }
}
