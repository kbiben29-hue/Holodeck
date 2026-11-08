// Tutorial coach: looks at the position, explains the step the player is on, and points at the move
// the computer opponent would make in their place (bot.ts), so it works with every deck and card.

import { botIntents } from '../bot/bot'
import { canAttack, tryApply } from '../engine/engine'
import { cardName, def, findPerm, isCreature, permName, pt, rulesOf } from '../engine/state'
import type { GameState, Intent } from '../engine/types'

export interface Hint {
	hand?: number[]
	perms?: number[]
	/** Prompt / panel buttons by label (prefix match). */
	buttons?: string[]
	/** Choice options by id. */
	options?: string[]
}

export interface CoachStep {
	/** concept id: the long explanation is shown the first time, the short one afterwards */
	key: string
	title: string
	body: string
	hint: Hint
}

export const INTRO: { title: string; body: string }[] = [
	{
		title: 'Welcome aboard',
		body: 'This practice game walks you through a real game of Commander against the Ensign, the computer opponent. This panel explains each step, and whatever glows yellow on the table is a good next move. You can still do anything you like: the coach only suggests.',
	},
	{
		title: 'How you win',
		body: 'You play Duel Commander: both players start at 20 life, and you win by bringing your opponent to 0. Your deck is 100 cards, one copy of each card except basic lands, led by a legendary creature: your commander. It starts in the command zone, not in your deck, and you can cast it from there whenever you could cast it from your hand.',
	},
	{
		title: 'Mana and lands',
		body: 'You may play one land each turn. Lands (and mana rocks like Sol Ring) tap for mana, and mana pays for spells; the cost is in the card’s top-right corner. Coloured symbols need that colour; the number can be paid with any mana. When you cast a spell the game taps the right lands for you. If your commander dies it goes back to the command zone, and it costs 2 more each time you cast it again.',
	},
	{
		title: 'The table',
		body: 'Your side is at the bottom, the opponent’s at the top. Each side has a creatures row and a row of lands and other permanents, plus piles on the right: library, graveyard, exile, and the command zone with your commander. Hover over a card to enlarge it, or click it to see it in the viewer on the right with everything you can do with it. The log on the right lists everything that happens.',
	},
	{
		title: 'The stack, and doing it by hand',
		body: 'Spells and abilities go on the stack before they happen, so the other player can answer with an instant. The game does most rules by itself. Some newer cards have text it can’t do yet: when one resolves, the game asks you to do it by hand with the table tools (counters, tokens, moving cards, life…) and press Done, just like at a real table.',
	},
]

const step = (key: string, title: string, long: string, short: string, hint: Hint, seen: Set<string>): CoachStep => ({ key, title, body: seen.has(key) ? short : long, hint })

/** The first move the computer would make for `me` that the engine accepts. */
export function suggestion(s: GameState, me: number): Intent | null {
	for (const i of botIntents(s, me)) if (!tryApply(s, i).error) return i
	return null
}

export function coachFor(s: GameState, me: number, seen: Set<string>): CoachStep | null {
	const pend = s.pending
	const P = s.players
	if (pend.kind === 'over') {
		const won = pend.winner === me
		return step(
			'over',
			won ? 'You win!' : 'The Ensign wins this one',
			`${won ? 'Nicely done.' : 'Good practice.'} Next game, try to play a land every turn, cast your commander early, and attack when the opponent can’t block well. Deck lessons & combos on the setup screen teach each deck’s plan and its best combos.`,
			'Back to the menu for a new game.',
			{ buttons: ['Back to menu'] },
			seen,
		)
	}
	if (pend.player !== me) return { key: 'wait', title: 'Opponent’s move', body: 'The Ensign is taking its turn. Watch the log on the right to see what it does.', hint: {} }
	const sugg = suggestion(s, me)
	switch (pend.kind) {
		case 'mulligan': {
			const lands = P[me].hand.filter((o) => rulesOf(s, o).types.includes('land')).length
			const good = lands >= 2 && lands <= 5
			return step(
				'mulligan',
				'Your opening hand',
				`These 7 cards are your opening hand. If it’s bad you can mulligan: shuffle it away and draw 7 new cards, then put one card on the bottom for each mulligan. A good hand has 2 to 5 lands so you can cast things early. You have ${lands} — ${good ? 'keep it.' : 'a mulligan is reasonable.'}`,
				good ? 'Keep this hand.' : 'Consider a mulligan.',
				{ buttons: [good ? 'Keep' : 'Mulligan'] },
				seen,
			)
		}
		case 'bottom':
			return step('bottom', 'Bottom a card', 'You mulliganed, so choose card(s) to put on the bottom of your library. Usually that’s the most expensive card, or a land if you have too many.', 'Pick card(s) to put on the bottom.', {}, seen)
		case 'choose': {
			const q = pend.question
			if (q.key === 'manual')
				return step(
					'manual',
					'Do it by hand',
					`The game can’t do this card’s text by itself yet, so you do it: read the text in the box, use the table tools (click a card for its tools, or ☰ Menu / + Token for life, tokens and your library), then press Done. If it says “you may” and you don’t want to, press Skip it.`,
					'Do the card’s text with the table tools, then press Done.',
					{ buttons: ['Done'] },
					seen,
				)
			const picks = sugg?.type === 'choose' ? sugg.picks : []
			const labels = q.options.filter((o) => picks.includes(o.id)).map((o) => o.label)
			return step(
				'choose',
				'Make a choice',
				`A card needs a decision: ${q.prompt.split('\n')[0]}. The options are in the box — and creatures you can pick also glow on the table, so you can click them there. ${labels.length ? `A good pick: ${labels.join(', ')}.` : ''}`,
				labels.length ? `Suggested: ${labels.join(', ')}.` : 'Make your choice.',
				{ options: picks, perms: q.options.filter((o) => picks.includes(o.id) && o.iid !== undefined && findPerm(s, o.iid)).map((o) => o.iid!) },
				seen,
			)
		}
		case 'attackers': {
			const att = sugg?.type === 'attack' ? sugg.attackers : []
			const any = s.battlefield.some((p) => canAttack(s, p))
			return step(
				'attack',
				'Declare attackers',
				`Combat! Click the creatures you want to attack with (they glow blue), then press Attack. Attacking taps them, unless they have vigilance, so they can’t block on the opponent’s turn. Creatures that arrived this turn can’t attack unless they have haste. ${att.length ? `Suggested: attack with ${att.map((i) => permName(s, findPerm(s, i)!)).join(', ')} — the Ensign can’t block them profitably.` : any ? 'Here attacking would just lose creatures, so press No attack.' : ''}`,
				att.length ? `Attack with ${att.map((i) => permName(s, findPerm(s, i)!)).join(', ')}.` : 'No good attacks this turn — press No attack.',
				{ perms: att, buttons: [att.length ? 'Attack' : 'No attack'] },
				seen,
			)
		}
		case 'blockers': {
			const bl = sugg?.type === 'block' ? sugg.blocks : []
			const incoming = (s.combat?.attackers ?? []).reduce((n, a) => n + (findPerm(s, a.iid) ? pt(s, findPerm(s, a.iid)!)[0] : 0), 0)
			return step(
				'block',
				'You’re being attacked',
				`The Ensign is attacking for ${incoming} damage. To block, click one of your untapped creatures, then the attacker it should block. Blocked damage goes to the blocker instead of you; a creature dies when it takes damage equal to its toughness (the second number). ${bl.length ? `Suggested: ${bl.map((b) => `${permName(s, findPerm(s, b.blocker)!)} blocks ${permName(s, findPerm(s, b.attacker)!)}`).join('; ')}.` : 'No block is worth it here — take the damage.'}`,
				bl.length ? `Suggested: ${bl.map((b) => `${permName(s, findPerm(s, b.blocker)!)} → ${permName(s, findPerm(s, b.attacker)!)}`).join('; ')}.` : 'Press No blocks.',
				{ perms: bl.flatMap((b) => [b.blocker, b.attacker]), buttons: [bl.length ? 'Confirm blocks' : 'No blocks'] },
				seen,
			)
		}
		case 'priority': {
			const top = s.stack[s.stack.length - 1]
			if (top && top.controller !== me)
				return step(
					'respond',
					'Something is on the stack',
					`The Ensign put ${cardName(s, top.card)}${top.kind === 'spell' ? '' : '’s ability'} on the stack. Before it happens you could answer with an instant or an ability — you have one ready, which is why the game stopped. If you don’t want to, let it resolve.`,
					'Respond, or let it resolve.',
					{ buttons: [sugg?.type === 'cast' ? '' : 'Let it resolve'].filter(Boolean), hand: sugg?.type === 'cast' ? [sugg.iid] : [] },
					seen,
				)
			if (top) return step('resolve', 'Your spell is on the stack', 'Your spell or ability is waiting on the stack. Press Resolve to let it happen (the opponent already had their chance to answer).', 'Press Resolve.', { buttons: ['Resolve'] }, seen)
			if (s.active !== me) return step('opppass', 'Opponent’s turn', 'It’s the Ensign’s turn, and you could cast an instant now. If you don’t want to, press Pass.', 'Press Pass.', { buttons: ['Pass'] }, seen)
			if (s.step !== 'main1' && s.step !== 'main2') return step('continue', 'Moving on', 'Press Continue to move to the next step of your turn.', 'Press Continue.', { buttons: ['Continue', 'To damage', 'End turn'] }, seen)
			if (!sugg) return null
			if (sugg.type === 'playLand') {
				const o = P[me].hand.find((x) => x.iid === sugg.iid)!
				return step(
					'land',
					'Play a land',
					`Start your turn with a land: it gives you more mana every turn. Click ${cardName(s, o.card)} in your hand and press Play land. Some lands enter tapped, so they can’t be used until your next turn — play those early, when you don’t need the mana right away.`,
					`Play ${cardName(s, o.card)}.`,
					{ hand: [o.iid], buttons: ['Play land'] },
					seen,
				)
			}
			if (sugg.type === 'cast') {
				const o = [...P[me].hand, ...P[me].command].find((x) => x.iid === sugg.iid)!
				const fromCommand = P[me].command.some((x) => x.iid === o.iid)
				const r = rulesOf(s, o)
				const what = r.types.includes('creature') ? 'a creature' : r.types.includes('artifact') ? 'an artifact' : r.types.includes('enchantment') ? 'an enchantment' : r.types.includes('instant') ? 'an instant' : 'a sorcery'
				if (fromCommand)
					return step(
						'commander',
						'Cast your commander',
						`You have enough mana for your commander, ${cardName(s, o.card)}. Click it in your command zone (bottom right, beside your graveyard) and press Cast commander. The game taps your lands for you.`,
						`Cast ${cardName(s, o.card)} from the command zone.`,
						{ hand: [o.iid], buttons: ['Cast commander'] },
						seen,
					)
				return step(
					'cast',
					'Cast a spell',
					`You can afford ${cardName(s, o.card)} (${what}, mana value ${def(s, o.card).cmc}). Click it in your hand and press Cast — the game taps the right lands. Green-glowing cards in your hand are the ones you can play right now.${r.types.includes('creature') ? ' Creatures can’t attack the turn they arrive.' : ''}`,
					`Cast ${cardName(s, o.card)}.`,
					{ hand: [o.iid], buttons: ['Cast'] },
					seen,
				)
			}
			if (sugg.type === 'activate') {
				const p = findPerm(s, sugg.iid)!
				const a = rulesOf(s, p).activated.find((x) => x.index === sugg.ability)
				return step(
					a?.equip ? 'equip' : 'ability',
					a?.equip ? 'Equip' : 'Use an ability',
					a?.equip ? `${permName(s, p)} is Equipment: pay its equip cost to attach it to a creature you control, which then gets its bonus. Click it and press Equip, then pick the creature.` : `${permName(s, p)} has an ability worth using now. Click it and press the ability’s button.`,
					`Use ${permName(s, p)}.`,
					{ perms: [p.iid], buttons: [a?.equip ? 'Equip' : a?.text.slice(0, 12) ?? ''] },
					seen,
				)
			}
			const attackers = s.battlefield.filter((p) => p.controller === me && isCreature(s, p) && canAttack(s, p)).length
			if (s.step === 'main1')
				return step(
					'combat',
					attackers ? 'Time to attack' : 'Nothing more to do',
					attackers ? 'You’ve done what you can before combat. Press Go to combat to choose attackers.' : 'Nothing else is worth casting now, and you have no creature ready to attack. Press End turn.',
					attackers ? 'Press Go to combat.' : 'Press End turn.',
					{ buttons: [attackers ? 'Go to combat' : 'End turn'] },
					seen,
				)
			return step('endturn', 'End your turn', 'Combat is over and there’s nothing more worth casting. Press End turn. (Keep mana open next time if you hold an instant.)', 'Press End turn.', { buttons: ['End turn'] }, seen)
		}
	}
	return null
}
