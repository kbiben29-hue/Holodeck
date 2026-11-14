// The end of a game, Star Trek style. Winning jumps to warp (the starfield streaks past and flashes);
// losing sounds red alert and ends in a warp-core breach — or, against the Borg, assimilation.
// Then a starship-console panel reports the mission. Our own art and wording, drawn live on a canvas.

import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import { sfx } from './sfx'

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
	const assimilated = outcome === 'lose' && foeFaction === 'borg'
	const scene = outcome === 'win' ? 'warp' : outcome === 'lose' ? (assimilated ? 'borg' : 'breach') : 'draw'
	// the panel arrives once the show is over
	const delay = !animate ? 0 : scene === 'warp' ? 2300 : scene === 'breach' ? 3300 : scene === 'borg' ? 2900 : 600
	const [panel, setPanel] = useState(delay === 0)
	const [hidden, setHidden] = useState(false)
	const [warp, setWarp] = useState(1)
	const canvas = useRef<HTMLCanvasElement>(null)
	const root = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (outcome === 'win') (animate ? sfx.warp : sfx.win)()
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
	const line = outcome === 'win' ? WIN_LINE[factionOf(s, hero)] : outcome === 'lose' ? LOSE_LINE[foeFaction] : 'Both ships are disabled. Neither side can claim the sector.'
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
			{animate && scene === 'borg' && !panel && <div className="borg-text">Assimilating…</div>}
			{panel && (
				<div className={`finale-panel ${outcome} ${assimilated ? 'borg' : ''}`}>
					<div className="fp-elbow" />
					<div className="fp-body">
						<div className="fp-top">
							<span>Captain’s log, stardate {stardate}</span>
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
