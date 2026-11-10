// Arena-style motion for the table: cards fly between zones (draws, casts, resolving onto the
// battlefield, dying into the graveyard), tokens materialise, attackers lunge, and damage and life
// changes float up as numbers. Pure DOM (Web Animations API) layered over React: every render we
// measure the elements tagged with data-iid, compare with the previous render and animate the
// difference. Anchors (data-anchor="library-0", "graveyard-1", "hand-1", …) stand in for zones
// whose cards aren't drawn one by one.

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { locate, permName } from '../engine/state'
import type { GameState } from '../engine/types'

type Zone = 'battlefield' | 'hand' | 'graveyard' | 'exile' | 'library' | 'command' | 'stack' | 'gone'
interface Seen {
	rect: DOMRect
	el: Element
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
let enabled = true
export function setMotion(on: boolean) {
	enabled = on
}

function zoneOf(s: GameState, iid: number): { zone: Zone; owner: number } {
	if (s.stack.some((it) => it.obj?.iid === iid)) return { zone: 'stack', owner: s.stack.find((it) => it.obj?.iid === iid)!.controller }
	const l = locate(s, iid)
	if (!l) return { zone: 'gone', owner: -1 }
	return { zone: l.zone as Zone, owner: l.player }
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

export function useMotion(root: RefObject<HTMLElement | null>, s: GameState) {
	const prev = useRef<{ s: GameState; seen: Map<number, Seen>; life: number[]; dmg: Map<number, number>; plus: Map<number, number> } | null>(null)
	useLayoutEffect(() => {
		const host = root.current
		if (!host) return
		const hr = host.getBoundingClientRect()
		const k = host.offsetWidth ? hr.width / host.offsetWidth : 1
		const seen = new Map<number, Seen>()
		host.querySelectorAll<HTMLElement>('[data-iid]').forEach((el) => {
			const iid = Number(el.dataset.iid)
			// measure the card itself (a stack entry also holds text; a permanent its attachments)
			const face = el.matches('.cardface') ? el : (el.querySelector('.cardface') ?? el)
			if (!seen.has(iid)) seen.set(iid, { rect: face.getBoundingClientRect(), el })
		})
		const life = s.players.map((p) => p.life)
		const dmg = new Map(s.battlefield.map((p) => [p.iid, p.damage]))
		const plus = new Map(s.battlefield.map((p) => [p.iid, p.counters['+1/+1'] ?? 0]))
		const before = prev.current
		prev.current = { s, seen, life, dmg, plus }
		if (!before || before.s === s || !enabled || reduced()) return
		// a new game or a big jump (undo, load): don't animate
		if (Math.abs(before.s.log.length - s.log.length) > 60 || s.log.length < before.s.log.length) return

		let layer = host.querySelector<HTMLElement>(':scope > .fx-layer')
		if (!layer) {
			layer = document.createElement('div')
			layer.className = 'fx-layer'
			host.appendChild(layer)
		}
		const fx = layer
		const local = (x: number, y: number) => ({ x: (x - hr.left) / k, y: (y - hr.top) / k })
		const anchor = (name: string): DOMRect | null => host.querySelector(`[data-anchor="${name}"]`)?.getBoundingClientRect() ?? null
		const anchorFor = (z: { zone: Zone; owner: number }) => (z.zone === 'battlefield' || z.zone === 'stack' || z.zone === 'gone' ? null : anchor(`${z.zone}-${z.owner}`))

		// attackers lunge toward the defender when combat damage is dealt
		const fresh = s.log.slice(before.s.log.length)
		const lungers = new Set<number>()
		if (before.s.combat?.attackers.length) {
			const names = new Map(before.s.combat.attackers.map((a) => [a.iid, before.s.battlefield.find((p) => p.iid === a.iid)]))
			for (const line of fresh) {
				const m = line.match(/^(.+) deals \d+ damage to (.+)\.$/)
				if (!m) continue
				for (const [iid, p] of names) if (p && permName(before.s, p) === m[1]) lungers.add(iid)
			}
		}
		const lungeDelay = lungers.size ? 260 : 0
		for (const iid of lungers) {
			const el = seen.get(iid)?.el ?? before.seen.get(iid)?.el
			if (!el || !el.isConnected) continue
			const r = el.getBoundingClientRect()
			const towards = r.top + r.height / 2 > hr.top + hr.height / 2 ? -1 : 1
			el.animate([{ translate: '0 0' }, { translate: `0 ${towards * 46}px`, offset: 0.45 }, { translate: '0 0' }], { duration: 300, easing: 'cubic-bezier(.3,.7,.4,1)' })
		}

		// cards that moved (same element kind, new place) or appeared
		for (const [iid, now] of seen) {
			const was = before.seen.get(iid)
			const z0 = zoneOf(before.s, iid)
			const z1 = zoneOf(s, iid)
			if (was) {
				const a = center(was.rect)
				const b = center(now.rect)
				const dx = (a.x - b.x) / k
				const dy = (a.y - b.y) / k
				if (Math.abs(dx) + Math.abs(dy) < 3 || lungers.has(iid)) continue
				const sc = was.rect.width && now.rect.width ? was.rect.width / now.rect.width : 1
				now.el.animate([{ translate: `${dx}px ${dy}px`, scale: String(sc) }, { translate: '0 0', scale: '1' }], { duration: z0.zone === z1.zone ? 260 : 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
				continue
			}
			if (z0.zone === z1.zone && z0.zone !== 'gone') continue // e.g. a land group showing a different land
			const from = anchorFor(z0)
			if (from) {
				const a = center(from)
				const b = center(now.rect)
				const sc = from.width && now.rect.width ? Math.min(1.4, from.width / now.rect.width) : 0.6
				now.el.animate([{ translate: `${(a.x - b.x) / k}px ${(a.y - b.y) / k}px`, scale: String(sc), opacity: 0.4 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)', delay: z1.zone === 'battlefield' ? lungeDelay : 0, fill: 'backwards' })
			} else if (z1.zone === 'battlefield') {
				// a token (or something with no visible origin) materialises
				now.el.animate([{ scale: '0.3', opacity: 0, filter: 'brightness(2.4) drop-shadow(0 0 12px #9cf)' }, { scale: '1.08', opacity: 1, offset: 0.7 }, { scale: '1', opacity: 1, filter: 'none' }], { duration: 520, easing: 'ease-out', delay: lungeDelay, fill: 'backwards' })
			}
		}

		// cards that left: a ghost flies to the pile they went to (or fades where it was)
		for (const [iid, was] of before.seen) {
			if (seen.has(iid)) continue
			const z0 = zoneOf(before.s, iid)
			const z1 = zoneOf(s, iid)
			if (z0.zone === z1.zone && z1.zone !== 'gone') continue
			if (z1.zone === 'hand' && !anchorFor(z1) && z1.owner !== z0.owner) continue
			const src = (was.el.querySelector('.cardface') as Element | null) ?? was.el
			const ghost = src.cloneNode(true) as HTMLElement
			const r = was.rect
			const p = local(r.left, r.top)
			ghost.classList.add('fx-ghost')
			Object.assign(ghost.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${r.width / k}px`, height: `${r.height / k}px` })
			if (was.el.classList.contains('tapped')) ghost.style.rotate = '90deg'
			fx.appendChild(ghost)
			const to = anchorFor(z1)
			const died = z0.zone === 'battlefield' && (z1.zone === 'graveyard' || z1.zone === 'gone')
			const delay = z0.zone === 'battlefield' ? lungeDelay + (died ? 220 : 0) : 0
			let anim: Animation
			if (to) {
				const a = center(r)
				const b = center(to)
				const sc = r.width ? to.width / r.width : 0.5
				anim = ghost.animate(
					[
						{ translate: '0 0', scale: '1', opacity: 1, filter: died ? 'grayscale(0)' : 'none' },
						...(died ? [{ translate: '0 0', scale: '1.04', opacity: 1, filter: 'grayscale(1) brightness(.6) sepia(.4)', offset: 0.3 }] : []),
						{ translate: `${(b.x - a.x) / k}px ${(b.y - a.y) / k}px`, scale: String(sc), opacity: 0.25, filter: died ? 'grayscale(1) brightness(.6)' : 'none' },
					],
					{ duration: died ? 700 : 480, easing: 'cubic-bezier(.5,0,.3,1)', delay, fill: 'both' },
				)
			} else {
				anim = ghost.animate([{ opacity: 1, scale: '1', filter: 'none' }, { opacity: 0, scale: '0.85', filter: 'blur(3px) brightness(1.8)' }], { duration: 420, delay, fill: 'both' })
			}
			anim.onfinish = () => ghost.remove()
			window.setTimeout(() => ghost.remove(), 2000)
		}

		// floating numbers: life and damage
		const float = (x: number, y: number, text: string, cls: string, delay = 0) => {
			const p = local(x, y)
			const d = document.createElement('div')
			d.className = `fx-num ${cls}`
			d.textContent = text
			Object.assign(d.style, { left: `${p.x}px`, top: `${p.y}px` })
			fx.appendChild(d)
			const anim = d.animate([{ translate: '-50% -50%', scale: '0.6', opacity: 0 }, { translate: '-50% -90%', scale: '1.25', opacity: 1, offset: 0.2 }, { translate: '-50% -210%', scale: '1', opacity: 0 }], { duration: 1300, delay, easing: 'ease-out', fill: 'both' })
			anim.onfinish = () => d.remove()
			window.setTimeout(() => d.remove(), 3000)
		}
		s.players.forEach((_, i) => {
			const d = life[i] - before.life[i]
			if (!d) return
			const el = host.querySelector(`[data-life="${i}"]`)
			if (!el) return
			const c = center(el.getBoundingClientRect())
			float(c.x, c.y, d > 0 ? `+${d}` : String(d), d > 0 ? 'heal' : 'hurt', lungeDelay)
			el.animate([{ scale: '1', color: '' }, { scale: '1.5', color: d > 0 ? '#7dffa0' : '#ff5a4e', offset: 0.3 }, { scale: '1', color: '' }], { duration: 700, delay: lungeDelay })
		})
		for (const [iid, n] of dmg) {
			const d = n - (before.dmg.get(iid) ?? 0)
			const el = seen.get(iid)?.el
			if (d > 0 && el) {
				const c = center(el.getBoundingClientRect())
				float(c.x, c.y, `-${d}`, 'hurt', lungeDelay)
				el.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320, delay: lungeDelay })
			}
		}
		// lethal damage: the creature is gone but its damage still deserves a number
		for (const [iid, was] of before.seen) {
			if (seen.has(iid) || !before.dmg.has(iid) || !lungers.size) continue
			const z1 = zoneOf(s, iid)
			if (z1.zone !== 'graveyard' && z1.zone !== 'gone') continue
			const c = center(was.rect)
			float(c.x, c.y, '✖', 'hurt', lungeDelay)
		}
		for (const [iid, n] of plus) {
			const d = n - (before.plus.get(iid) ?? n)
			const el = seen.get(iid)?.el
			if (d > 0 && el) {
				const c = center(el.getBoundingClientRect())
				float(c.x, c.y, `+${d}/+${d}`, 'buff')
			}
		}
	})
}
