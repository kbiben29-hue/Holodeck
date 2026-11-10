// Small device-local preferences (localStorage).
import { setMotion } from './motion'

export type Pace = 'full' | 'fast' | 'off'
const PACE_KEY = 'holodeck.pace.v1'

export function readPace(): Pace {
	try {
		const v = localStorage.getItem(PACE_KEY)
		if (v === 'full' || v === 'fast' || v === 'off') return v
	} catch {
		/* ignore */
	}
	return 'full'
}
export function writePace(p: Pace) {
	try {
		localStorage.setItem(PACE_KEY, p)
	} catch {
		/* ignore */
	}
	setMotion(p !== 'off')
}
/** Milliseconds each in-between moment stays on screen (0 = don't play them back). */
export const beatFor = (p: Pace) => (p === 'full' ? 520 : p === 'fast' ? 260 : 0)

setMotion(readPace() !== 'off')
