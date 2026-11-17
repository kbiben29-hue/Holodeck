// The end of a game, Star Trek style. Winning jumps to warp (the starfield streaks past and flashes);
// losing sounds red alert and ends in a warp-core breach — or, against the Borg, assimilation.
// Then a starship-console panel reports the mission. Our own art and wording, drawn live on a canvas.

import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import { sfx } from './sfx'
import { playerDeck, playerWorld } from './world'

type Faction = 'federation' | 'landing' | 'klingon' | 'borg'
type Outcome = 'win' | 'lose' | 'draw'

/** Which crew a player commands (by commander, or by the most common creature types in a 60-card game). */
export function factionOf(s: GameState, p: number): Faction {
	const names = s.players[p].commanders.map((c) => s.cards[c]?.name ?? '').join(' ')
	if (/Borg|Locutus/.test(names)) return 'borg'
	if (/Worf|Kor\b|Klingon/.test(names)) return 'klingon'
	if (/Spock|Kirk/.test(names)) return 'landing'
	if (names) return 'federation'
	const pl = s.players[p]
	const all = [...pl.library, ...pl.hand, ...pl.graveyard, ...pl.exile, ...s.battlefield.filter((q) => q.owner === p)]
	const count = (re: RegExp) => all.filter((o) => re.test(s.cards[o.card]?.typeLine ?? '')).length
	const borg = count(/Borg/)
	const kli = count(/Klingon|Warrior/)
	if (borg > 6 && borg >= kli) return 'borg'
	if (kli > 6) return 'klingon'
	return all.some((o) => /Commander Spock|Captain Kirk/.test(s.cards[o.card]?.name ?? '')) ? 'landing' : 'federation'
}

const WIN_LINE: Record<Faction, string> = {
	federation: 'Mission accomplished. The fleet goes to warp, victorious.',
	landing: 'Away team beamed up — this world is charted, and it is yours.',
	klingon: 'A glorious battle! Songs will be sung of this day.',
	borg: 'Another vessel has joined the Collective.',
}
const ME_WIN: Record<string, string> = {
	rohan: 'Horns ring across the plain — the riders hold the field.',
	fellowship: 'The hobbits are safe home, and there is food enough for everyone.',
	elven: 'The council has spoken, and the woods are at peace once more.',
	mordor: 'Every land bows before the Dark Lord.',
}
const ME_LOSE: Record<string, string> = {
	rohan: 'The riders charged at first light and swept your host from the field.',
	fellowship: 'Never underestimate a hobbit with a full larder.',
	elven: 'Elven arrows and old magic turned the battle against you.',
	mordor: 'The Shadow spreads across your lands.',
}
const BB_WIN: Record<string, string> = {
	animated: 'The bard strikes up a song, and every pot and kettle in the valley dances along.',
	family: 'The whole family made it home — and they brought friends.',
	peace: 'Gifts were given, friends were made, and somehow you won anyway.',
	squirrel: 'The larder is full, and the squirrels rule the woods.',
}
const BB_LOSE: Record<string, string> = {
	animated: 'A forge-fire army rolled over your burrow.',
	family: 'Too many cousins to count — and all of them fighting.',
	peace: 'You took the gifts. Then the hydras came.',
	squirrel: 'The squirrels came back. They always come back.',
}
const LOSE_LINE: Record<Faction, string> = {
	federation: 'Your ship was outmanoeuvred by a Starfleet crew.',
	landing: 'The landing party out-thought you, one world at a time.',
	klingon: 'Klingon warriors boarded your ship. They fought with honour.',
	borg: 'Your crew now serves the Collective.',
}

export function Finale({ s, me, perspective, animate, onMenu }: { s: GameState; me: number; perspective: 'viewer' | 'winner'; animate: boolean; onMenu: () => void }) {
	const p = s.pending
	const winner = p.kind === 'over' ? p.winner : null
	const hero = perspective === 'winner' && winner !== null ? winner : me
	const outcome: Outcome = winner === null ? 'draw' : winner === hero ? 'win' : 'lose'
	const foe = 1 - hero
	const foeFaction = factionOf(s, foe)
	// Middle-earth decks get a Middle-earth ending: the sun rises on a victory, the shadow falls on a defeat
	// Bloomburrow decks get a meadow at dusk with fireflies for a win and a thunderstorm for a loss
	const world = playerWorld(s, hero)
	const middle = world === 'me' || world === 'bb'
	const valley = world === 'bb'
	const meHero = playerDeck(s, hero)?.id ?? ''
	const meFoe = playerDeck(s, foe)?.id ?? ''
	const assimilated = !middle && outcome === 'lose' && foeFaction === 'borg'
	const scene = valley ? (outcome === 'win' ? 'meadow' : outcome === 'lose' ? 'storm' : 'draw') : middle ? (outcome === 'win' ? 'dawn' : outcome === 'lose' ? 'shadow' : 'draw') : outcome === 'win' ? 'warp' : outcome === 'lose' ? (assimilated ? 'borg' : 'breach') : 'draw'
	// the panel arrives once the show is over
	const delay = !animate ? 0 : scene === 'warp' ? 2300 : scene === 'breach' ? 3300 : scene === 'borg' ? 2900 : scene === 'dawn' ? 2600 : scene === 'shadow' ? 3000 : scene === 'meadow' ? 2800 : scene === 'storm' ? 3000 : 600
	const [panel, setPanel] = useState(delay === 0)
	const [hidden, setHidden] = useState(false)
	const [warp, setWarp] = useState(1)
	const canvas = useRef<HTMLCanvasElement>(null)
	const root = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (valley) {
			if (outcome === 'win') (animate ? sfx.meadow : sfx.win)()
			else if (outcome === 'lose') (animate ? sfx.storm : sfx.lose)()
		} else if (middle) {
			if (outcome === 'win') (animate ? sfx.dawn : sfx.win)()
			else if (outcome === 'lose') (animate ? sfx.shadow : sfx.lose)()
		} else if (outcome === 'win') (animate ? sfx.warp : sfx.win)()
		else if (outcome === 'lose') {
			if (!animate) sfx.lose()
			else if (assimilated) sfx.assimilated()
			else {
				sfx.redAlert()
				window.setTimeout(() => {
					sfx.breach()
					// the whole table shakes with the blast
					const table = root.current?.closest('.board, .pocket')
					table?.classList.add('quake')
					window.setTimeout(() => table?.classList.remove('quake'), 700)
				}, 1850)
			}
		}
		const t = window.setTimeout(() => setPanel(true), delay)
		// the helm readout climbs through the warp factors
		const t0 = performance.now()
		const iv = scene === 'warp' && animate ? window.setInterval(() => setWarp(Math.min(9.9, 1 + Math.pow((performance.now() - t0) / 1800, 2) * 8.9)), 60) : 0
		return () => {
			window.clearTimeout(t)
			window.clearInterval(iv)
		}
	}, [])

	useEffect(() => {
		if (!animate) return
		const c = canvas.current
		const host = root.current
		if (!c || !host) return
		const g = c.getContext('2d')
		if (!g) return
		const dpr = Math.min(2, window.devicePixelRatio || 1)
		let W = 0
		let H = 0
		const size = () => {
			W = host.clientWidth
			H = host.clientHeight
			c.width = W * dpr
			c.height = H * dpr
			g.setTransform(dpr, 0, 0, dpr, 0, 0)
		}
		size()
		let seed = 1234567
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
		const t0 = performance.now()
		let raf = 0
		// ── warp: stars rush past, faster and faster, then a flash ──
		const stars = Array.from({ length: 420 }, () => ({ x: (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 2, z: rnd() * 1 + 0.05, pz: 0 }))
		stars.forEach((st) => (st.pz = st.z))
		// ── breach: debris and a shockwave ──
		const debris = Array.from({ length: 160 }, () => {
			const a = rnd() * Math.PI * 2
			const v = 120 + rnd() * 620
			return { a, v, r: 1 + rnd() * 3.5, hue: rnd() < 0.5 ? 28 : 8 + rnd() * 40, spin: rnd() * 6 }
		})
		const draw = (now: number) => {
			const t = (now - t0) / 1000
			const cx = W / 2
			const cy = H / 2
			if (scene === 'warp') {
				const speed = t < 0.4 ? 0.002 : Math.min(0.09, 0.002 + Math.pow(t - 0.4, 2.4) * 0.05)
				const after = t > 2.05
				g.fillStyle = after ? 'rgba(2,4,14,0.35)' : 'rgba(2,4,14,0.55)'
				g.fillRect(0, 0, W, H)
				const k = Math.max(W, H) * 0.6
				for (const st of stars) {
					st.pz = st.z
					st.z -= after ? 0.004 : speed
					if (st.z <= 0.02) {
						st.x = (rnd() - 0.5) * 2
						st.y = (rnd() - 0.5) * 2
						st.z = 1
						st.pz = 1
					}
					const sx = cx + (st.x / st.z) * k
					const sy = cy + (st.y / st.z) * k
					const px = cx + (st.x / st.pz) * k
					const py = cy + (st.y / st.pz) * k
					const b = Math.min(1, (1 - st.z) * 1.4)
					g.strokeStyle = `rgba(${170 + 85 * b},${200 + 55 * b},255,${b})`
					g.lineWidth = Math.max(0.6, (1 - st.z) * 2.6)
					g.beginPath()
					g.moveTo(px, py)
					g.lineTo(sx + 0.1, sy + 0.1)
					g.stroke()
				}
				// the jump: a blue-white flash and a ring
				if (t > 1.75 && t < 2.6) {
					const f = (t - 1.75) / 0.85
					const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * (0.1 + f))
					grd.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - f)})`)
					grd.addColorStop(0.4, `rgba(140,190,255,${0.6 * (1 - f)})`)
					grd.addColorStop(1, 'rgba(40,80,200,0)')
					g.fillStyle = grd
					g.fillRect(0, 0, W, H)
					g.strokeStyle = `rgba(170,215,255,${1 - f})`
					g.lineWidth = 6 * (1 - f) + 1
					g.beginPath()
					g.ellipse(cx, cy, f * W * 0.7, f * H * 0.22, 0, 0, Math.PI * 2)
					g.stroke()
				}
			} else if (scene === 'dawn') {
				// night lifts and the sun climbs over the hills, rays spreading across the sky
				const f = Math.min(1, t / 2.2)
				const sky = g.createLinearGradient(0, 0, 0, H)
				sky.addColorStop(0, `rgb(${10 + 60 * f},${14 + 70 * f},${40 + 90 * f})`)
				sky.addColorStop(0.65, `rgb(${30 + 200 * f},${20 + 120 * f},${40 + 40 * f})`)
				sky.addColorStop(1, `rgb(${40 + 215 * f},${30 + 170 * f},${30 + 60 * f})`)
				g.fillStyle = sky
				g.fillRect(0, 0, W, H)
				const sunY = H * (0.95 - 0.35 * f)
				g.save()
				g.translate(cx, sunY)
				for (let i = 0; i < 18; i++) {
					g.rotate((Math.PI * 2) / 18)
					g.fillStyle = `rgba(255,230,160,${0.08 + 0.1 * f})`
					g.beginPath()
					g.moveTo(0, 0)
					g.lineTo(Math.max(W, H) * 1.2, -40)
					g.lineTo(Math.max(W, H) * 1.2, 40)
					g.fill()
				}
				g.restore()
				const sun = g.createRadialGradient(cx, sunY, 0, cx, sunY, 120 + 80 * f)
				sun.addColorStop(0, 'rgba(255,250,220,1)')
				sun.addColorStop(0.4, 'rgba(255,214,120,0.9)')
				sun.addColorStop(1, 'rgba(255,160,60,0)')
				g.fillStyle = sun
				g.fillRect(0, 0, W, H)
				// rolling hills in silhouette
				for (let layer = 0; layer < 3; layer++) {
					g.fillStyle = ['#1d2a14', '#14200e', '#0b1408'][layer]
					g.beginPath()
					g.moveTo(0, H)
					for (let x = 0; x <= W; x += 20) g.lineTo(x, H * (0.78 + layer * 0.07) - Math.sin(x / (160 - layer * 30) + layer) * (30 - layer * 6))
					g.lineTo(W, H)
					g.fill()
				}
			} else if (scene === 'meadow') {
				// a summer meadow at dusk: warm sky, swaying grass, fireflies and drifting petals
				const f = Math.min(1, t / 2)
				const sky = g.createLinearGradient(0, 0, 0, H)
				sky.addColorStop(0, `rgba(${40 + 60 * f},${50 + 60 * f},${90 + 40 * f},${f})`)
				sky.addColorStop(0.7, `rgba(${200 + 40 * f},${150 + 40 * f},${110},${f})`)
				sky.addColorStop(1, `rgba(255,214,150,${f})`)
				g.clearRect(0, 0, W, H)
				g.fillStyle = sky
				g.fillRect(0, 0, W, H)
				// the hill and its grass
				for (let layer = 0; layer < 2; layer++) {
					g.fillStyle = ['#3d6a2a', '#2a4d1c'][layer]
					g.beginPath()
					g.moveTo(0, H)
					for (let x = 0; x <= W; x += 16) g.lineTo(x, H * (0.74 + layer * 0.08) - Math.sin(x / (220 - layer * 60) + layer) * 24)
					g.lineTo(W, H)
					g.fill()
				}
				g.strokeStyle = '#4f8a33'
				g.lineWidth = 2
				for (let x = 0; x < W; x += 9) {
					const base = H * 0.86 - Math.sin(x / 160 + 1) * 24
					const sway = Math.sin(t * 2 + x / 40) * 6
					g.beginPath()
					g.moveTo(x, H)
					g.quadraticCurveTo(x + sway / 2, base + 20, x + sway, base - 10 - ((x * 7) % 18))
					g.stroke()
				}
				// fireflies
				for (let i = 0; i < 60; i++) {
					const x = ((i * 613) % 1000) / 1000 * W + Math.sin(t * 0.8 + i) * 30
					const y = H * (0.35 + ((i * 371) % 500) / 1000) + Math.cos(t * 1.1 + i * 2) * 20
					const glow = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 1.7))
					const r = g.createRadialGradient(x, y, 0, x, y, 9)
					r.addColorStop(0, `rgba(255,250,170,${glow * f})`)
					r.addColorStop(1, 'rgba(255,240,120,0)')
					g.fillStyle = r
					g.fillRect(x - 9, y - 9, 18, 18)
				}
				// falling petals
				for (let i = 0; i < 40; i++) {
					const x = (((i * 457) % 1000) / 1000) * W + Math.sin(t * 1.5 + i) * 40 + t * 30
					const y = ((t * (50 + (i % 5) * 15) + i * 71) % (H + 40)) - 20
					g.save()
					g.translate(x % W, y)
					g.rotate(t * 2 + i)
					g.fillStyle = ['#ffc4d6', '#fff0b3', '#ffd9a8'][i % 3]
					g.beginPath()
					g.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2)
					g.fill()
					g.restore()
				}
			} else if (scene === 'storm') {
				// clouds roll in, rain slants down, lightning flashes
				const f = Math.min(1, t / 1.6)
				g.clearRect(0, 0, W, H)
				g.fillStyle = `rgba(20,26,38,${0.85 * f})`
				g.fillRect(0, 0, W, H)
				const flash = [1.2, 1.35, 2.3].some((ft) => t > ft && t < ft + 0.09)
				if (flash) {
					g.fillStyle = 'rgba(230,240,255,0.55)'
					g.fillRect(0, 0, W, H)
					g.strokeStyle = 'rgba(255,255,255,0.9)'
					g.lineWidth = 3
					g.beginPath()
					let x = W * (0.3 + 0.4 * ((Math.floor(t * 10) * 37) % 10) / 10)
					g.moveTo(x, 0)
					for (let y = 0; y < H * 0.7; y += 40) {
						x += ((y * 13) % 60) - 30
						g.lineTo(x, y)
					}
					g.stroke()
				}
				g.strokeStyle = `rgba(170,190,220,${0.45 * f})`
				g.lineWidth = 1.2
				for (let i = 0; i < 220; i++) {
					const x = ((i * 733) % 1000) / 1000 * (W + 200) - 100 + ((t * 300) % 100)
					const y = ((t * (700 + (i % 6) * 80) + i * 97) % (H + 60)) - 30
					g.beginPath()
					g.moveTo(x, y)
					g.lineTo(x - 8, y + 22)
					g.stroke()
				}
				// clouds
				for (let i = 0; i < 9; i++) {
					const cxl = ((i * 211) % W) + Math.sin(t * 0.4 + i) * 30
					const cl = g.createRadialGradient(cxl, 30, 0, cxl, 30, 220)
					cl.addColorStop(0, `rgba(50,56,70,${0.9 * f})`)
					cl.addColorStop(1, 'rgba(50,56,70,0)')
					g.fillStyle = cl
					g.fillRect(cxl - 220, -190, 440, 440)
				}
			} else if (scene === 'shadow') {
				// darkness creeps in from the edges, embers rise, a red glow beneath it all
				const f = Math.min(1, t / 2.6)
				g.clearRect(0, 0, W, H)
				const glow = g.createRadialGradient(cx, H * 1.1, 0, cx, H * 1.1, H * (0.4 + 0.5 * f))
				glow.addColorStop(0, `rgba(255,70,10,${0.55 * f})`)
				glow.addColorStop(1, 'rgba(120,0,0,0)')
				g.fillStyle = glow
				g.fillRect(0, 0, W, H)
				const dark = g.createRadialGradient(cx, cy, Math.max(W, H) * (0.7 - 0.6 * f), cx, cy, Math.max(W, H) * (0.9 - 0.3 * f))
				dark.addColorStop(0, 'rgba(0,0,0,0)')
				dark.addColorStop(1, `rgba(0,0,0,${0.95})`)
				g.fillStyle = dark
				g.fillRect(0, 0, W, H)
				g.fillStyle = `rgba(0,0,0,${0.5 * f})`
				g.fillRect(0, 0, W, H)
				for (let i = 0; i < 90; i++) {
					const x = ((i * 977) % 1000) / 1000 * W + Math.sin(t * 1.3 + i) * 20
					const y = H - (((t * (40 + (i % 7) * 18) + i * 53) % (H + 40)))
					g.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,${0.35 + 0.4 * ((i % 3) / 2)})`
					g.fillRect(x, y, 2 + (i % 2), 2 + (i % 2))
				}
			} else if (scene === 'breach') {
				g.clearRect(0, 0, W, H)
				const tb = t - 1.85 // the moment of the breach
				if (tb > 0) {
					g.fillStyle = `rgba(0,0,0,${Math.min(0.8, tb * 0.9)})`
					g.fillRect(0, 0, W, H)
					// white-hot core
					const core = Math.max(0, 1 - tb / 0.9)
					if (core > 0) {
						const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * (0.15 + tb * 0.9))
						grd.addColorStop(0, `rgba(255,255,240,${core})`)
						grd.addColorStop(0.3, `rgba(255,190,90,${core * 0.8})`)
						grd.addColorStop(1, 'rgba(255,60,0,0)')
						g.fillStyle = grd
						g.fillRect(0, 0, W, H)
					}
					// the flat shockwave ring of a warp-core breach
					for (let i = 0; i < 2; i++) {
						const tr = tb - i * 0.18
						if (tr <= 0) continue
						const rx = tr * W * 0.75
						g.strokeStyle = `rgba(${i ? 255 : 180},${i ? 140 : 220},${i ? 60 : 255},${Math.max(0, 1 - tr / 1.4)})`
						g.lineWidth = Math.max(1, 10 * (1 - tr / 1.4))
						g.beginPath()
						g.ellipse(cx, cy, rx, rx * 0.16, -0.08, 0, Math.PI * 2)
						g.stroke()
					}
					for (const d of debris) {
						const dist = d.v * tb * (1 - Math.min(0.5, tb * 0.08))
						const x = cx + Math.cos(d.a) * dist
						const y = cy + Math.sin(d.a) * dist * 0.75
						const life = Math.max(0, 1 - tb / 2.2)
						g.fillStyle = `hsla(${d.hue},100%,${55 + 30 * life}%,${life})`
						g.save()
						g.translate(x, y)
						g.rotate(d.spin * tb)
						g.fillRect(-d.r, -d.r * 0.4, d.r * 2, d.r * 0.8)
						g.restore()
					}
				}
			} else if (scene === 'borg') {
				g.clearRect(0, 0, W, H)
				// a green grid sweeps down and takes over the screen
				const sweep = Math.min(1, t / 1.8) * H * 1.1
				g.fillStyle = `rgba(0,20,6,${Math.min(0.78, t * 0.45)})`
				g.fillRect(0, 0, W, sweep)
				g.strokeStyle = 'rgba(80,255,120,0.35)'
				g.lineWidth = 1
				const step = 26
				g.beginPath()
				for (let x = (t * 12) % step; x < W; x += step) {
					g.moveTo(x, 0)
					g.lineTo(x, sweep)
				}
				for (let y = 0; y < sweep; y += step) {
					g.moveTo(0, y)
					g.lineTo(W, y)
				}
				g.stroke()
				// the scanning edge
				const grd = g.createLinearGradient(0, sweep - 60, 0, sweep)
				grd.addColorStop(0, 'rgba(60,255,110,0)')
				grd.addColorStop(1, 'rgba(120,255,150,0.75)')
				g.fillStyle = grd
				g.fillRect(0, sweep - 60, W, 60)
				// circuitry lighting up
				for (let i = 0; i < 40; i++) {
					const x = ((i * 977 + Math.floor(t * 6) * 131) % Math.max(1, W)) | 0
					const y = ((i * 613) % Math.max(1, Math.floor(sweep) || 1)) | 0
					g.fillStyle = `rgba(140,255,160,${0.4 + 0.6 * ((i + Math.floor(t * 8)) % 3 === 0 ? 1 : 0)})`
					g.fillRect(x - (x % step), y - (y % step), 3, 3)
				}
			} else {
				g.clearRect(0, 0, W, H)
			}
			if (t < 12) raf = requestAnimationFrame(draw)
		}
		raf = requestAnimationFrame(draw)
		window.addEventListener('resize', size)
		return () => {
			cancelAnimationFrame(raf)
			window.removeEventListener('resize', size)
		}
	}, [animate, scene])

	if (p.kind !== 'over') return null
	if (hidden)
		return (
			<button className="finale-pill" onClick={() => setHidden(false)}>
				{outcome === 'win' ? 'Victory' : outcome === 'lose' ? 'Defeat' : 'Draw'} — show the result
			</button>
		)

	const heroP = s.players[hero]
	const foeP = s.players[foe]
	const casts = (i: number) => s.log.filter((l) => l.startsWith(`${s.players[i].name} casts `)).length
	const title = outcome === 'win' ? 'Victory' : outcome === 'lose' ? (assimilated ? 'Assimilated' : 'Defeat') : 'Stalemate'
	const line = valley
		? outcome === 'win'
			? (BB_WIN[meHero] ?? 'The valley is safe.')
			: outcome === 'lose'
				? (BB_LOSE[meFoe] ?? 'Your burrow is overrun.')
				: 'Both bands head home for supper; nobody wins today.'
		: middle
		? outcome === 'win'
			? (ME_WIN[meHero] ?? 'The battle is won.')
			: outcome === 'lose'
				? (ME_LOSE[meFoe] ?? 'Your host is scattered.')
				: 'Both hosts withdraw; neither can claim the field.'
		: outcome === 'win'
			? WIN_LINE[factionOf(s, hero)]
			: outcome === 'lose'
				? LOSE_LINE[foeFaction]
				: 'Both ships are disabled. Neither side can claim the sector.'
	const why = s.players.filter((x) => x.lost).map((x) => `${x.name}: ${x.lost}`).join(' · ')
	const stardate = `${41000 + ((s.rng >>> 0) % 9000)}.${s.turn % 10}`

	return (
		<div ref={root} className={`finale ${scene} ${animate ? 'animated' : ''} ${panel ? 'show-panel' : ''}`}>
			{animate && <canvas ref={canvas} className="finale-canvas" />}
			{animate && scene === 'warp' && !panel && (
				<div className="warp-readout">
					<span>Helm</span>
					<b>Warp {warp.toFixed(1)}</b>
				</div>
			)}
			{animate && scene === 'breach' && !panel && <div className="red-alert">Red alert</div>}
			{animate && scene === 'dawn' && !panel && <div className="me-banner dawn-text">The day is won</div>}
			{animate && scene === 'shadow' && !panel && <div className="me-banner shadow-text">Darkness falls</div>}
			{animate && scene === 'meadow' && !panel && <div className="me-banner meadow-text">The valley celebrates</div>}
			{animate && scene === 'storm' && !panel && <div className="me-banner storm-text">The storm takes your burrow</div>}
			{animate && scene === 'borg' && !panel && <div className="borg-text">Assimilating…</div>}
			{panel && (
				<div className={`finale-panel ${outcome} ${assimilated ? 'borg' : ''} ${middle ? 'parchment' : ''} ${valley ? 'valley' : ''}`}>
					<div className="fp-elbow" />
					<div className="fp-body">
						<div className="fp-top">
							<span>{valley ? `From the valley’s storybook, season ${1 + (s.turn % 4)}` : middle ? `Chronicle of the war, Third Age, year ${2950 + (s.turn % 70)}` : `Captain’s log, stardate ${stardate}`}</span>
						</div>
						<h1>{title}</h1>
						<p className="fp-line">{line}</p>
						<div className="fp-stats">
							<div>
								<b>{s.turn}</b>
								<span>turns</span>
							</div>
							<div>
								<b>{heroP.life}</b>
								<span>{perspective === 'winner' ? `${heroP.name}’s life` : 'your life'}</span>
							</div>
							<div>
								<b>{foeP.life}</b>
								<span>{foeP.name}’s life</span>
							</div>
							<div>
								<b>{casts(hero)}</b>
								<span>spells cast</span>
							</div>
							<div>
								<b>{s.battlefield.filter((q) => q.controller === hero).length}</b>
								<span>permanents in play</span>
							</div>
						</div>
						{why && <p className="fp-why">{why}</p>}
						<div className="fp-btns">
							<button className="primary" onClick={onMenu}>
								Back to menu
							</button>
							<button onClick={() => setHidden(true)}>View the table</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
