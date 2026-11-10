// Arena-style arrows over the table: spells and abilities on the stack point at their targets,
// attackers point at the player they attack, blockers at the attacker they block, and while you
// choose blocks a line follows the pointer from the creature you picked up.

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import type { GameState } from '../engine/types'

interface Line {
	key: string
	from: string
	to: string
	kind: 'mine' | 'theirs' | 'attack' | 'block' | 'plan'
}
interface Drawn extends Line {
	d: string
	x2: number
	y2: number
}

export function Arrows({ host, s, me, attackSel, blocks, blockFrom }: { host: RefObject<HTMLElement | null>; s: GameState; me: number; attackSel: number[]; blocks: { blocker: number; attacker: number }[]; blockFrom: number | null }) {
	const [drawn, setDrawn] = useState<Drawn[]>([])
	const [size, setSize] = useState({ w: 0, h: 0 })
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
	const [tick, setTick] = useState(0)

	const lines: Line[] = []
	const life = (p: number) => `[data-life="${p}"]`
	const perm = (iid: number) => `[data-iid="${iid}"]`
	for (const it of s.stack)
		for (const t of it.targets) {
			const to = t.kind === 'player' ? life(t.id) : t.kind === 'perm' ? perm(t.id) : t.kind === 'stack' ? `[data-sid="${t.id}"]` : ''
			if (to) lines.push({ key: `s${it.sid}-${t.kind}${t.id}`, from: `[data-sid="${it.sid}"]`, to, kind: it.controller === me ? 'mine' : 'theirs' })
		}
	if (s.combat?.declared) {
		for (const a of s.combat.attackers) lines.push({ key: `a${a.iid}`, from: perm(a.iid), to: life(a.defender), kind: 'attack' })
		for (const b of s.combat.blocks) lines.push({ key: `b${b.blocker}`, from: perm(b.blocker), to: perm(b.attacker), kind: 'block' })
	}
	for (const iid of attackSel) lines.push({ key: `pa${iid}`, from: perm(iid), to: life(1 - me), kind: 'plan' })
	for (const b of blocks) lines.push({ key: `pb${b.blocker}`, from: perm(b.blocker), to: perm(b.attacker), kind: 'plan' })
	const sig = lines.map((l) => l.key).join('|')

	useLayoutEffect(() => {
		const el = host.current
		if (!el) return
		const measure = () => {
			const hr = el.getBoundingClientRect()
			const k = el.offsetWidth ? hr.width / el.offsetWidth : 1
			const box = (sel: string) => {
				const n = el.querySelector(sel)
				if (!n) return null
				const face = n.matches('.cardface, [data-life], .stack-item') ? n : (n.querySelector('.cardface') ?? n)
				const r = face.getBoundingClientRect()
				return { x: (r.left + r.width / 2 - hr.left) / k, y: (r.top + r.height / 2 - hr.top) / k, w: r.width / k, h: r.height / k }
			}
			const out: Drawn[] = []
			for (const l of lines) {
				const a = box(l.from)
				const b = box(l.to)
				if (!a || !b) continue
				out.push({ ...l, ...path(a, b) })
			}
			setDrawn(out)
			setSize({ w: el.offsetWidth, h: el.offsetHeight })
		}
		measure()
		// once cards have finished moving into place
		const t = window.setTimeout(measure, 520)
		return () => window.clearTimeout(t)
	}, [sig, s, tick])

	useEffect(() => {
		const on = () => setTick((n) => n + 1)
		window.addEventListener('resize', on)
		return () => window.removeEventListener('resize', on)
	}, [])

	// the line that follows the pointer while you pick a creature's block
	useEffect(() => {
		const el = host.current
		if (!el || blockFrom === null) return setPointer(null)
		const move = (e: PointerEvent) => {
			const hr = el.getBoundingClientRect()
			const k = el.offsetWidth ? hr.width / el.offsetWidth : 1
			setPointer({ x: (e.clientX - hr.left) / k, y: (e.clientY - hr.top) / k })
		}
		el.addEventListener('pointermove', move)
		return () => el.removeEventListener('pointermove', move)
	}, [blockFrom, host])

	let live: Drawn | null = null
	if (blockFrom !== null && pointer && host.current) {
		const el = host.current
		const n = el.querySelector(`[data-iid="${blockFrom}"] .cardface`) ?? el.querySelector(`[data-iid="${blockFrom}"]`)
		if (n) {
			const hr = el.getBoundingClientRect()
			const k = el.offsetWidth ? hr.width / el.offsetWidth : 1
			const r = n.getBoundingClientRect()
			const a = { x: (r.left + r.width / 2 - hr.left) / k, y: (r.top + r.height / 2 - hr.top) / k, w: 0, h: 0 }
			live = { key: 'live', from: '', to: '', kind: 'plan', ...path(a, { ...pointer, w: 0, h: 0 }) }
		}
	}

	const all = live ? [...drawn, live] : drawn
	if (!all.length || !size.w) return null
	return (
		<svg className="arrows" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
			<defs>
				{(['mine', 'theirs', 'attack', 'block', 'plan'] as const).map((k) => (
					<marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" className={`ah ${k}`} />
					</marker>
				))}
			</defs>
			{all.map((l) => (
				<g key={l.key} className={`arrow ${l.kind}`}>
					<path d={l.d} className="arrow-glow" />
					<path d={l.d} className="arrow-line" markerEnd={`url(#ah-${l.kind})`} />
				</g>
			))}
		</svg>
	)
}

/** A gentle curve from the middle of `a` to the edge of `b`. */
function path(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len = Math.hypot(dx, dy) || 1
	// stop short of the target's centre so the head sits on its edge
	const stop = Math.min(len * 0.4, Math.max(14, Math.min(b.w, b.h) * 0.42))
	const x2 = b.x - (dx / len) * stop
	const y2 = b.y - (dy / len) * stop
	const bend = Math.min(80, len * 0.18)
	const cx = (a.x + x2) / 2 - (dy / len) * bend
	const cy = (a.y + y2) / 2 + (dx / len) * bend
	return { d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`, x2, y2 }
}
