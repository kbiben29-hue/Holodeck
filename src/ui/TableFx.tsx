// A living backdrop behind the table, one per world: drifting stars and the odd warp streak for Star Trek,
// rising embers and slow mist for Middle-earth, fireflies and falling leaves for Bloomburrow. One small canvas,
// about 30 frames a second, paused when the tab is hidden; off with Animation: Off or reduced motion.

import { useEffect, useRef } from 'react'
import type { World } from './world'

interface Mote {
	x: number
	y: number
	vx: number
	vy: number
	r: number
	p: number
	k: number
}

export function TableFx({ world, on }: { world: World; on: boolean }) {
	const ref = useRef<HTMLCanvasElement>(null)
	useEffect(() => {
		const cv = ref.current
		if (!cv || !on || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return
		const g = cv.getContext('2d')
		if (!g) return
		let W = 0
		let H = 0
		const size = () => {
			W = cv.width = cv.offsetWidth || 1600
			H = cv.height = cv.offsetHeight || 1000
		}
		size()
		const ro = new ResizeObserver(size)
		ro.observe(cv)
		const rnd = (a: number, b: number) => a + Math.random() * (b - a)
		const count = world === 'trek' ? 110 : world === 'me' ? 46 : 54
		const motes: Mote[] = Array.from({ length: count }, (_, i) => spawn(i, true))
		function spawn(i: number, anywhere = false): Mote {
			if (world === 'trek') {
				const depth = rnd(0.2, 1)
				return { x: rnd(0, W), y: rnd(0, H), vx: -depth * 0.25, vy: 0, r: depth * 1.4, p: rnd(0, 6.28), k: depth }
			}
			if (world === 'me') return { x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 10, vx: rnd(-0.15, 0.15), vy: -rnd(0.25, 0.7), r: rnd(0.8, 2.2), p: rnd(0, 6.28), k: i % 9 === 0 ? 1 : 0 }
			// Bloomburrow: most are fireflies; every fourth a falling leaf
			const leaf = i % 4 === 0
			return leaf
				? { x: rnd(0, W), y: anywhere ? rnd(0, H) : -20, vx: rnd(0.1, 0.4), vy: rnd(0.3, 0.6), r: rnd(5, 8), p: rnd(0, 6.28), k: 1 }
				: { x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), r: rnd(1.5, 2.8), p: rnd(0, 6.28), k: 0 }
		}
		let streak: { x: number; y: number; t: number } | null = null
		let raf = 0
		let last = 0
		const draw = (now: number) => {
			raf = requestAnimationFrame(draw)
			if (document.hidden || now - last < 33) return
			const dt = Math.min(3, (now - last) / 16.7)
			last = now
			const t = now / 1000
			g.clearRect(0, 0, W, H)
			motes.forEach((m, i) => {
				m.p += 0.03 * dt
				m.x += m.vx * dt
				m.y += m.vy * dt
				if (world === 'trek') {
					if (m.x < -4) Object.assign(m, spawn(i), { x: W + 4 })
					const tw = 0.45 + 0.4 * Math.sin(m.p * (1 + m.k))
					g.fillStyle = `rgba(${200 + 55 * m.k},${215 + 40 * m.k},255,${tw * m.k})`
					g.fillRect(m.x, m.y, m.r, m.r)
				} else if (world === 'me') {
					m.x += Math.sin(m.p) * 0.3 * dt
					if (m.y < -10) Object.assign(m, spawn(i))
					const life = Math.max(0, Math.min(1, m.y / H))
					g.fillStyle = m.k ? `rgba(255,236,190,${0.5 * life})` : `rgba(255,${110 + 60 * Math.sin(m.p * 3) ** 2},40,${0.75 * life})`
					g.beginPath()
					g.arc(m.x, m.y, m.r, 0, 6.29)
					g.fill()
				} else if (m.k) {
					// a leaf, see-sawing down
					m.x += Math.sin(m.p) * 0.6 * dt
					if (m.y > H + 20) Object.assign(m, spawn(i))
					g.save()
					g.translate(m.x, m.y)
					g.rotate(Math.sin(m.p) * 0.9 + i)
					g.fillStyle = ['#c9a646cc', '#8fbf5acc', '#d9874acc', '#b5c96acc'][i % 4]
					g.beginPath()
					g.ellipse(0, 0, m.r, m.r * 0.45, 0, 0, 6.29)
					g.fill()
					g.strokeStyle = '#00000033'
					g.beginPath()
					g.moveTo(-m.r, 0)
					g.lineTo(m.r, 0)
					g.stroke()
					g.restore()
				} else {
					// a firefly: wanders, and glows on and off
					m.vx += rnd(-0.03, 0.03)
					m.vy += rnd(-0.03, 0.03)
					m.vx = Math.max(-0.4, Math.min(0.4, m.vx))
					m.vy = Math.max(-0.4, Math.min(0.4, m.vy))
					if (m.x < 0 || m.x > W) m.vx = -m.vx
					if (m.y < 0 || m.y > H) m.vy = -m.vy
					const glow = Math.max(0, Math.sin(m.p * 1.7)) ** 2
					if (glow < 0.02) return
					const grd = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 6)
					grd.addColorStop(0, `rgba(255,248,170,${0.9 * glow})`)
					grd.addColorStop(0.25, `rgba(220,255,120,${0.35 * glow})`)
					grd.addColorStop(1, 'rgba(200,255,100,0)')
					g.fillStyle = grd
					g.fillRect(m.x - m.r * 6, m.y - m.r * 6, m.r * 12, m.r * 12)
				}
			})
			if (world === 'trek') {
				// now and then a ship goes to warp across the background
				if (!streak && Math.random() < 0.002 * dt) streak = { x: W * rnd(0.1, 0.6), y: H * rnd(0.1, 0.9), t: 0 }
				if (streak) {
					streak.t += 0.04 * dt
					const len = 260 * Math.sin(Math.min(1, streak.t) * Math.PI)
					const grd = g.createLinearGradient(streak.x, streak.y, streak.x + len, streak.y)
					grd.addColorStop(0, 'rgba(140,190,255,0)')
					grd.addColorStop(1, 'rgba(220,235,255,0.8)')
					g.strokeStyle = grd
					g.lineWidth = 1.5
					g.beginPath()
					g.moveTo(streak.x + streak.t * 300, streak.y)
					g.lineTo(streak.x + streak.t * 300 + len, streak.y)
					g.stroke()
					if (streak.t >= 1) streak = null
				}
			} else if (world === 'me') {
				// slow bands of mist
				for (let i = 0; i < 3; i++) {
					const y = H * (0.3 + i * 0.25) + Math.sin(t * 0.1 + i) * 30
					const grd = g.createLinearGradient(0, y - 60, 0, y + 60)
					grd.addColorStop(0, 'rgba(200,200,190,0)')
					grd.addColorStop(0.5, `rgba(200,200,190,${0.025 + 0.015 * Math.sin(t * 0.2 + i)})`)
					grd.addColorStop(1, 'rgba(200,200,190,0)')
					g.fillStyle = grd
					g.fillRect(0, y - 60, W, 120)
				}
			}
		}
		raf = requestAnimationFrame(draw)
		return () => {
			cancelAnimationFrame(raf)
			ro.disconnect()
		}
	}, [world, on])
	return <canvas ref={ref} className="table-fx" aria-hidden />
}
