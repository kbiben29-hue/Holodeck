// Starship-console sound effects, synthesized live with the Web Audio API (no audio files).
// Browsers only allow sound after the player has clicked something, so the context starts lazily.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => {
	try {
		return localStorage.getItem('holodeck.muted') === '1'
	} catch {
		return false
	}
})()

export const isMuted = () => muted
export function setMuted(m: boolean) {
	muted = m
	try {
		localStorage.setItem('holodeck.muted', m ? '1' : '0')
	} catch {
		/* ignore */
	}
}

function ac(): AudioContext | null {
	if (muted || typeof window === 'undefined') return null
	try {
		if (!ctx) {
			const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
			if (!C) return null
			ctx = new C()
			master = ctx.createGain()
			master.gain.value = 0.35
			master.connect(ctx.destination)
		}
		if (ctx.state === 'suspended') void ctx.resume()
		return ctx
	} catch {
		return null
	}
}

/** Call from any click so the audio context is allowed to start. */
export function unlockAudio() {
	ac()
}

type Wave = OscillatorType

function tone(freq: number, dur: number, opts: { type?: Wave; at?: number; vol?: number; to?: number; filter?: number; q?: number } = {}) {
	const a = ac()
	if (!a || !master) return
	const t0 = a.currentTime + (opts.at ?? 0)
	const o = a.createOscillator()
	const g = a.createGain()
	const f = a.createBiquadFilter()
	o.type = opts.type ?? 'square'
	o.frequency.setValueAtTime(freq, t0)
	if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur)
	f.type = 'lowpass'
	f.frequency.value = opts.filter ?? 4000
	f.Q.value = opts.q ?? 1
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t0 + 0.008)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	o.connect(f).connect(g).connect(master)
	o.start(t0)
	o.stop(t0 + dur + 0.02)
}

function noise(dur: number, opts: { at?: number; vol?: number; band?: number; q?: number; sweepTo?: number } = {}) {
	const a = ac()
	if (!a || !master) return
	const t0 = a.currentTime + (opts.at ?? 0)
	const len = Math.max(1, Math.floor(a.sampleRate * dur))
	const buf = a.createBuffer(1, len, a.sampleRate)
	const d = buf.getChannelData(0)
	for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
	const src = a.createBufferSource()
	src.buffer = buf
	const f = a.createBiquadFilter()
	f.type = 'bandpass'
	f.frequency.setValueAtTime(opts.band ?? 2000, t0)
	if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur)
	f.Q.value = opts.q ?? 1.2
	const g = a.createGain()
	g.gain.setValueAtTime(opts.vol ?? 0.3, t0)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	src.connect(f).connect(g).connect(master)
	src.start(t0)
}

export const sfx = {
	click() {
		tone(1800, 0.03, { type: 'square', vol: 0.08, filter: 6000 })
	},
	draw() {
		noise(0.16, { band: 3500, sweepTo: 900, q: 0.8, vol: 0.18 })
		tone(880, 0.06, { type: 'triangle', at: 0.05, vol: 0.08, to: 1320 })
	},
	play() {
		tone(220, 0.12, { type: 'sawtooth', vol: 0.18, filter: 1400, to: 110 })
		noise(0.08, { band: 600, vol: 0.2 })
		tone(660, 0.1, { type: 'square', at: 0.04, vol: 0.06, filter: 3000 })
	},
	sell() {
		tone(1318, 0.07, { type: 'square', vol: 0.1, filter: 5000 })
		tone(1975, 0.14, { type: 'square', at: 0.06, vol: 0.1, filter: 5000 })
	},
	program() {
		tone(1600, 0.25, { type: 'sawtooth', vol: 0.12, to: 200, filter: 3000, q: 6 })
		noise(0.2, { band: 5000, sweepTo: 300, vol: 0.08, q: 4 })
	},
	attack() {
		noise(0.28, { band: 400, sweepTo: 3000, vol: 0.28, q: 0.7 })
		tone(90, 0.25, { type: 'sawtooth', vol: 0.2, to: 45, filter: 800 })
	},
	defeat() {
		noise(0.45, { band: 1200, sweepTo: 80, vol: 0.4, q: 0.6 })
		tone(160, 0.4, { type: 'square', vol: 0.18, to: 30, filter: 900 })
		for (let i = 0; i < 4; i++) tone(2000 + i * 700, 0.025, { type: 'square', at: 0.05 + i * 0.045, vol: 0.06 })
	},
	steal() {
		// alarm + glitch: somebody just jacked your Gig
		for (let i = 0; i < 3; i++) {
			tone(1046, 0.09, { type: 'square', at: i * 0.16, vol: 0.13, filter: 3500 })
			tone(784, 0.09, { type: 'square', at: i * 0.16 + 0.08, vol: 0.13, filter: 3500 })
		}
		noise(0.12, { band: 6000, vol: 0.12, q: 8, at: 0.45 })
	},
	dice() {
		for (let i = 0; i < 7; i++) noise(0.03, { band: 2500 + Math.random() * 2500, q: 3, vol: 0.22 - i * 0.025, at: i * 0.07 + Math.random() * 0.03 })
		tone(1244, 0.12, { type: 'triangle', at: 0.55, vol: 0.12 })
	},
	legend() {
		;[262, 330, 392, 523].forEach((f, i) => tone(f, 0.9 - i * 0.1, { type: 'sawtooth', at: i * 0.06, vol: 0.07, filter: 1800, q: 4 }))
		tone(1046, 0.5, { type: 'sine', at: 0.25, vol: 0.06, to: 2093 })
	},
	turn() {
		tone(523, 0.08, { type: 'square', vol: 0.06, filter: 2500 })
		tone(784, 0.12, { type: 'square', at: 0.08, vol: 0.06, filter: 2500 })
	},
	win() {
		;[392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: 'square', at: i * 0.11, vol: 0.09, filter: 3000 }))
		tone(1046, 0.9, { type: 'sawtooth', at: 0.55, vol: 0.07, filter: 2200 })
	},
	lose() {
		;[392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: 'sawtooth', at: i * 0.16, vol: 0.09, filter: 1200 }))
		noise(0.6, { band: 300, vol: 0.1, at: 0.6 })
	},
	/** Going to warp: a rising engine hum and a rush, then the victory fanfare. */
	warp() {
		tone(55, 1.9, { type: 'sawtooth', vol: 0.12, to: 880, filter: 900, q: 3 })
		tone(110, 1.9, { type: 'sine', vol: 0.1, to: 1760 })
		noise(1.6, { band: 200, sweepTo: 6000, vol: 0.16, q: 0.7, at: 0.3 })
		noise(0.5, { band: 5000, sweepTo: 400, vol: 0.3, q: 0.5, at: 1.85 })
		;[523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: 'square', at: 2.1 + i * 0.13, vol: 0.08, filter: 3200 }))
		tone(1046, 1.4, { type: 'sawtooth', at: 2.62, vol: 0.06, filter: 2400 })
	},
	/** Red alert klaxon: three rising whoops. */
	redAlert() {
		for (let i = 0; i < 3; i++) {
			tone(380, 0.5, { type: 'sawtooth', at: i * 0.62, vol: 0.13, to: 840, filter: 1800, q: 2 })
			tone(382, 0.5, { type: 'square', at: i * 0.62, vol: 0.05, to: 846, filter: 1200 })
		}
	},
	/** Warp-core breach: a deep boom and a long rumble. */
	breach() {
		noise(0.25, { band: 3000, sweepTo: 200, vol: 0.4, q: 0.4 })
		noise(1.8, { band: 160, sweepTo: 40, vol: 0.45, q: 0.5, at: 0.05 })
		tone(70, 1.4, { type: 'sine', vol: 0.3, to: 22 })
		tone(140, 0.8, { type: 'sawtooth', vol: 0.12, to: 40, filter: 500 })
		;[330, 262, 196, 147].forEach((f, i) => tone(f, 0.6, { type: 'sawtooth', at: 1.6 + i * 0.22, vol: 0.07, filter: 1100 }))
	},
	/** Being assimilated: a mechanical drone with digital stutters. */
	assimilated() {
		tone(48, 2.6, { type: 'sawtooth', vol: 0.16, filter: 400, q: 6 })
		tone(96, 2.6, { type: 'square', vol: 0.05, filter: 300 })
		for (let i = 0; i < 9; i++) noise(0.05, { band: 2000 + (i % 3) * 1800, q: 10, vol: 0.14, at: 0.3 + i * 0.21 })
		tone(220, 1.2, { type: 'sine', at: 1.4, vol: 0.07, to: 110 })
	},
	error() {
		tone(140, 0.15, { type: 'square', vol: 0.1, filter: 900 })
	},
}

/** Pick a sound for a new log line. */
export function soundFor(line: string, myName: string): (() => void) | null {
	// the end of the game has its own sounds (Finale.tsx)
	if (/ loses \(/.test(line)) return null
	if (/ dies\.| is destroyed| is exiled| is countered/.test(line)) return sfx.defeat
	if (/ attacks with /.test(line)) return sfx.attack
	if (/ deals \d+ damage to /.test(line)) return sfx.steal
	if (/ casts .+ from|returns to the command zone/.test(line)) return sfx.legend
	if (/ casts /.test(line)) return sfx.program
	if (/ plays |enters the battlefield/.test(line)) return sfx.play
	if (/ draws /.test(line)) return sfx.draw
	if (/charge counters|creates /.test(line)) return sfx.sell
	if (/^— Turn/.test(line)) return sfx.turn
	return null
}
