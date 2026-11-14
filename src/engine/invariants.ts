// Things that must be true of every game state. Used by the fuzz test (bot-vs-bot games, checked after
// every move) and by tools/realsim.ts with the real cards.
import { pt } from './state'
import type { GameState } from './types'

export function invariantErrors(s: GameState): string[] {
	const out: string[] = []
	const seen = new Map<number, string>()
	const note = (iid: number, where: string) => {
		const was = seen.get(iid)
		if (was) out.push(`card ${iid} is in two places: ${was} and ${where}`)
		else seen.set(iid, where)
	}
	s.players.forEach((pl, i) => {
		for (const z of ['library', 'hand', 'graveyard', 'exile', 'command'] as const) for (const o of pl[z]) {
			note(o.iid, `${z}#${i}`)
			if (o.owner !== i) out.push(`${s.cards[o.card]?.name ?? o.card} is in ${pl.name}'s ${z} but belongs to player ${o.owner}`)
			if (o.token) out.push(`a token (${s.cards[o.card]?.name}) is in a ${z}`)
		}
		// each commander is in exactly one place, and the command zone holds only commanders
		for (const o of pl.command) if (!o.commander) out.push(`${s.cards[o.card]?.name} is in the command zone but isn't a commander`)
		for (const c of pl.commanders) {
			const n = [...pl.library, ...pl.hand, ...pl.graveyard, ...pl.exile, ...pl.command, ...s.battlefield, ...s.stack.map((it) => it.obj).filter((o) => !!o)].filter((o) => o!.card === c && o!.commander).length
			if (n !== 1) out.push(`commander ${s.cards[c]?.name} is in ${n} places`)
		}
		if (Object.values(pl.pool).some((v) => v < 0)) out.push(`${pl.name} has negative mana`)
		if (pl.landsPlayed < 0) out.push('negative lands played')
	})
	for (const p of s.battlefield) {
		note(p.iid, 'battlefield')
		if (p.controller !== 0 && p.controller !== 1) out.push(`bad controller ${p.controller}`)
		if (p.attachedTo !== undefined && p.attachedTo === p.iid) out.push('attached to itself')
		for (const [k, v] of Object.entries(p.counters)) if (v < 0) out.push(`${k} counters below zero on ${s.cards[p.card]?.name}`)
	}
	for (const it of s.stack) if (it.obj) note(it.obj.iid, 'stack')
	// state-based actions have been applied whenever someone has priority
	if (s.pending.kind === 'priority' && !s.tasks.length) {
		for (const p of s.battlefield) {
			const d = s.cards[p.card]
			if (!d) {
				out.push(`unknown card ${p.card}`)
				continue
			}
			const creature = /Creature/.test(d.typeLine) || p.mods.some((m) => m.note === 'creature')
			if (creature && !p.faceDown && !/Indestructible/i.test(d.oracle) && !p.mods.some((m) => m.keywords?.includes('indestructible'))) {
				const [, t] = pt(s, p)
				if (t <= 0 && !/Spacecraft/.test(d.typeLine)) out.push(`${d.name} has toughness ${t} but is still on the battlefield`)
			}
		}
		s.players.forEach((pl) => {
			if (pl.life <= 0 && !pl.lost) out.push(`${pl.name} is at ${pl.life} life but hasn't lost`)
		})
	}
	if (s.combat && s.combat.attackers.some((a) => !s.battlefield.some((p) => p.iid === a.iid)) && s.step === 'attackers') out.push('an attacker is gone during declare attackers')
	return out
}
