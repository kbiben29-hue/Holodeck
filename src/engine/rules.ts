// Reads a card's rules text (Oracle text) into things the engine can do by itself:
// keywords, mana abilities, simple activated and triggered abilities, and effects written in
// common templates ("Draw two cards.", "Destroy target creature."…). Anything it can't read is
// left to the players (the item still goes on the stack and they do it with the table tools).

import type { CardDef, Color, Mana } from './types'

// ───────── effects ─────────

export interface Filter {
	/** Card types, any of (lower case). Empty = any permanent. */
	types: string[]
	/** Types it must not have. */
	not: string[]
	controller?: 'you' | 'opp'
	tapped?: boolean
	attacking?: boolean
	/** Subtypes, any of (as printed). */
	subtypes?: string[]
	/** Other than the source. */
	other?: boolean
	/** Mana value at most. */
	maxMv?: number
	colors?: Color[]
	nonColors?: Color[]
	nonToken?: boolean
	basic?: boolean
}

export type TargetSpec =
	| { kind: 'perm'; filter: Filter }
	| { kind: 'player'; opponent?: boolean }
	| { kind: 'any' }
	| { kind: 'spell'; filter: Filter }
	| { kind: 'creatureOrPlayer' }

export type Effect =
	| { e: 'draw'; n: number | 'x'; who: 'you' | 'target' | 'each' }
	| { e: 'life'; n: number | 'x'; who: 'you' | 'eachOpp' | 'target' | 'each' | 'targetController' }
	| { e: 'loseLife'; n: number | 'x'; who: 'you' | 'eachOpp' | 'target' | 'each' }
	| { e: 'destroy'; t: number }
	| { e: 'exile'; t: number }
	| { e: 'bounce'; t: number }
	| { e: 'tap'; t: number; untap?: boolean }
	| { e: 'destroyAll'; filter: Filter }
	| { e: 'exileAll'; filter: Filter }
	| { e: 'bounceAll'; filter: Filter }
	| { e: 'damage'; n: number | 'x'; t: number }
	| { e: 'damageEach'; n: number | 'x'; filter?: Filter; players?: 'opp' | 'each' }
	| { e: 'counter'; t: number }
	| { e: 'token'; n: number | 'x'; name: string; power?: number; toughness?: number; types: string; colors: Color[]; keywords: string[]; tapped?: boolean; artifact?: boolean }
	| { e: 'counters'; n: number | 'x'; kind: string; t: number | 'self' | 'each'; filter?: Filter }
	| { e: 'pump'; p: number; tough: number; keywords: string[]; t: number | 'self' }
	| { e: 'pumpAll'; p: number; tough: number; keywords: string[]; filter: Filter }
	| { e: 'search'; filter: Filter; names?: string[]; count: number; dest: 'battlefield' | 'hand' | 'top'; tapped: boolean; reveal?: boolean }
	| { e: 'scry'; n: number }
	| { e: 'surveil'; n: number }
	| { e: 'mill'; n: number; who: 'you' | 'target' | 'eachOpp' }
	| { e: 'discard'; n: number; who: 'you' | 'target' | 'eachOpp' }
	| { e: 'sacrifice'; who: 'you' | 'eachOpp' | 'target'; filter: Filter }
	| { e: 'returnFromGy'; filter: Filter; dest: 'hand' | 'battlefield'; t: number }
	| { e: 'shuffle' }
	| { e: 'mana'; mana: Mana[]; any?: number }
	| { e: 'putLand' }
	| { e: 'named'; name: string }

export interface Compiled {
	targets: TargetSpec[]
	effects: Effect[]
	/** A "you may" ability: the controller can decline. */
	optional?: boolean
}

// ───────── abilities ─────────

export interface AbilityCost {
	mana: string
	tap: boolean
	untap?: boolean
	sacrificeSelf: boolean
	life: number
	loyalty?: number
	/** Any other cost part we don't pay automatically (shown to the player). */
	other?: string
	discard?: number
	exileSelfFromGy?: boolean
}

export interface ManaAbility {
	index: number
	cost: AbilityCost
	/** fixed: makes exactly these. oneOf: one mana of a choice. any: any colour (identity = commander's colours). */
	kind: 'fixed' | 'oneOf' | 'any' | 'identity' | 'charge' | 'oppLands'
	mana: Mana[]
	amount: number
	/** All units the same colour (e.g. "two mana of any one color"). */
	sameColor?: boolean
	pain?: number
}

export interface Activated {
	index: number
	text: string
	cost: AbilityCost
	effectText: string
	compiled: Compiled | null
	sorcery: boolean
	oncePerTurn: boolean
	equip?: boolean
	/** Can be activated from the graveyard. */
	fromGraveyard?: boolean
	loyalty?: boolean
}

export type TriggerEvent = 'etb' | 'attacks' | 'dies' | 'upkeep' | 'endStep' | 'beginCombat' | 'combatDamagePlayer' | 'landfall' | 'otherEtb' | 'ltb' | 'cast' | 'blocks'

export interface Trigger {
	index: number
	event: TriggerEvent
	text: string
	effectText: string
	compiled: Compiled | null
	/** For otherEtb: which permanents trigger it. */
	filter?: Filter
	/** "When ~ enters, if …" style conditions we can't check — always shown as manual. */
	conditional?: boolean
}

export interface Static {
	kind: 'anthem' | 'equip' | 'aura'
	power: number
	toughness: number
	keywords: string[]
	filter?: Filter
}

export interface Rules {
	types: string[]
	subtypes: string[]
	supertypes: string[]
	keywords: string[]
	manaAbilities: ManaAbility[]
	activated: Activated[]
	triggers: Trigger[]
	statics: Static[]
	/** The spell's own effect (instants and sorceries). */
	spell: Compiled | null
	spellText: string
	/** Aura target. */
	enchant?: Filter
	entersTapped: 'no' | 'yes' | { unlessControl?: string[]; unlessOtherLands?: [number, 'ge' | 'le']; unlessBasics?: number; revealFromHand?: string[]; unlessLegendary?: boolean }
	/** Affinity for artifacts. */
	affinity?: boolean
	/** Cost reduction/convoke etc. we don't know about. */
	hasX: boolean
	canBeCountered: boolean
	/** Every line of text was understood. */
	fullyAutomated: boolean
}

const KEYWORDS = [
	'flying', 'reach', 'trample', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'vigilance', 'haste', 'menace',
	'defender', 'hexproof', 'shroud', 'indestructible', 'flash', 'prowess', 'changeling', 'fear', 'intimidate', 'skulk',
	'horsemanship', 'infect', 'wither', 'unblockable', 'devoid', 'partner', 'banding', 'flanking', 'convoke', 'improvise',
	'delve', 'storm', 'cascade', 'exalted', 'undying', 'persist', 'myriad', 'melee', 'toxic',
]

export const SELF = '~'

function normalise(def: { name: string; oracle: string }): string {
	let t = def.oracle
	const names = [def.name]
	if (def.name.includes(',')) names.push(def.name.split(',')[0].trim())
	if (def.name.includes(' // ')) names.push(...def.name.split(' // '))
	names.sort((a, b) => b.length - a.length)
	for (const n of names) if (n.length > 1) t = t.split(n).join(SELF)
	t = t.replace(/\b[Tt]his (creature|artifact|land|enchantment|spell|card|equipment|Equipment|Vehicle|vehicle|permanent|Spacecraft|token|Aura|aura|planeswalker|Planet|planet|battle)\b/g, SELF)
	t = t.replace(/−/g, '-')
	return t
}

const stripReminder = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim()

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: -1 }
function num(s: string): number | 'x' {
	const k = s.toLowerCase()
	if (k === 'x') return 'x'
	if (k in NUM) return NUM[k]
	const n = Number(k)
	return Number.isFinite(n) ? n : 1
}

const TYPE_WORDS = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'permanent', 'battle', 'instant', 'sorcery', 'spell', 'card']

/** "creature an opponent controls", "nonland permanent", "artifact or enchantment"… */
export function parseFilter(raw: string): Filter | null {
	let s = raw.trim().toLowerCase()
	const f: Filter = { types: [], not: [] }
	if (s.startsWith('another ')) {
		f.other = true
		s = s.slice(8)
	}
	if (s.startsWith('other ')) {
		f.other = true
		s = s.slice(6)
	}
	const tail: [RegExp, (m: RegExpMatchArray) => void][] = [
		[/ an opponent controls$/, () => (f.controller = 'opp')],
		[/ you don't control$/, () => (f.controller = 'opp')],
		[/ you control$/, () => (f.controller = 'you')],
		[/ with mana value (\d+) or less$/, (m) => (f.maxMv = Number(m[1]))],
	]
	for (let again = true; again; ) {
		again = false
		for (const [re, fn] of tail) {
			const m = s.match(re)
			if (m) {
				fn(m)
				s = s.slice(0, m.index)
				again = true
			}
		}
	}
	const words = s.replace(/,? or /g, ',').replace(/, and /g, ',').split(/\s*,\s*/)
	for (const w0 of words) {
		const parts = w0.trim().split(/\s+/)
		let typeFound = false
		for (const p of parts) {
			if (p === 'tapped') f.tapped = true
			else if (p === 'untapped') f.tapped = false
			else if (p === 'attacking') f.attacking = true
			else if (p === 'nontoken') f.nonToken = true
			else if (p === 'basic') f.basic = true
			else if (p.startsWith('non') && TYPE_WORDS.includes(p.slice(3).replace(/-/g, ''))) f.not.push(p.slice(3).replace(/-/g, ''))
			else if (p.startsWith('non') && ['white', 'blue', 'black', 'red', 'green'].includes(p.slice(3))) (f.nonColors ??= []).push(colorLetter(p.slice(3)))
			else if (['white', 'blue', 'black', 'red', 'green'].includes(p)) (f.colors ??= []).push(colorLetter(p))
			else if (TYPE_WORDS.includes(p) || TYPE_WORDS.includes(p.replace(/s$/, ''))) {
				const t = p.replace(/s$/, '')
				if (t !== 'permanent' && t !== 'card' && t !== 'spell') f.types.push(t)
				typeFound = true
			} else if (/^[a-z][a-z'-]+$/.test(p) && !typeFound) (f.subtypes ??= []).push(p.replace(/s$/, ''))
			else return null
		}
	}
	return f
}

function colorLetter(w: string): Color {
	return ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' } as Record<string, Color>)[w]
}

function parseTarget(raw: string): TargetSpec | null {
	const s = raw.trim().toLowerCase()
	if (s === 'any target') return { kind: 'any' }
	if (s === 'target player' || s === 'target player or planeswalker') return { kind: 'player' }
	if (s === 'target opponent' || s === 'target opponent or planeswalker') return { kind: 'player', opponent: true }
	if (s === 'target creature or player') return { kind: 'creatureOrPlayer' }
	const m = s.match(/^target (.+)$/)
	if (!m) return null
	if (/\bspell$/.test(m[1])) {
		const f = parseFilter(m[1].replace(/spell$/, '').trim() || 'permanent')
		return f ? { kind: 'spell', filter: f } : null
	}
	const f = parseFilter(m[1])
	return f ? { kind: 'perm', filter: f } : null
}

const KW_LIST = '(flying|reach|trample|first strike|double strike|deathtouch|lifelink|vigilance|haste|menace|indestructible|hexproof)'

function keywordList(s: string | undefined): string[] {
	if (!s) return []
	return s
		.toLowerCase()
		.replace(/ and /g, ', ')
		.split(/,\s*/)
		.map((x) => x.trim())
		.filter(Boolean)
}

/** Compile one sentence (or a run of sentences) into effects. Returns null if not understood. */
export function compile(text: string, defName = ''): Compiled | null {
	const out: Compiled = { targets: [], effects: [] }
	let t = stripReminder(text).trim()
	if (!t) return null
	if (/^you may /i.test(t)) {
		out.optional = true
		t = t.replace(/^you may /i, '')
		t = t[0].toUpperCase() + t.slice(1)
	}
	const sentences = t
		.split(/(?<=\.)\s+/)
		.map((x) => x.trim())
		.filter(Boolean)
	for (const s0 of sentences) {
		const s = s0.replace(/\.$/, '')
		if (!compileSentence(s, out, defName)) return null
	}
	return out
}

function addTarget(out: Compiled, spec: TargetSpec): number {
	out.targets.push(spec)
	return out.targets.length - 1
}

function compileSentence(s: string, out: Compiled, defName: string): boolean {
	let m: RegExpMatchArray | null
	const lower = s.toLowerCase()
	if (/^(it|they|that creature) can't be regenerated$/.test(lower)) return true
	if (lower === 'then shuffle' || lower === 'shuffle your library' || lower === 'then shuffle your library') {
		out.effects.push({ e: 'shuffle' })
		return true
	}
	// draw
	if ((m = lower.match(/^(?:you )?draw (a|an|one|two|three|four|five|six|seven|x|\d+) cards?(?: and you lose (\w+) life)?$/))) {
		out.effects.push({ e: 'draw', n: num(m[1]), who: 'you' })
		if (m[2]) out.effects.push({ e: 'loseLife', n: num(m[2]), who: 'you' })
		return true
	}
	if ((m = lower.match(/^target player draws (a|one|two|three|four|x|\d+) cards?$/))) {
		const i = addTarget(out, { kind: 'player' })
		void i
		out.effects.push({ e: 'draw', n: num(m[1]), who: 'target' })
		return true
	}
	if ((m = lower.match(/^each player draws (a|one|two|three|\d+) cards?$/))) {
		out.effects.push({ e: 'draw', n: num(m[1]), who: 'each' })
		return true
	}
	if ((m = lower.match(/^draw (a|one|two|three|\d+) cards?, then discard (a|one|two|three|\d+) cards?$/))) {
		out.effects.push({ e: 'draw', n: num(m[1]), who: 'you' }, { e: 'discard', n: num(m[2]) as number, who: 'you' })
		return true
	}
	// life
	if ((m = lower.match(/^you gain (\w+) life$/))) {
		out.effects.push({ e: 'life', n: num(m[1]), who: 'you' })
		return true
	}
	if ((m = lower.match(/^you lose (\w+) life$/))) {
		out.effects.push({ e: 'loseLife', n: num(m[1]), who: 'you' })
		return true
	}
	if ((m = lower.match(/^each opponent loses (\w+) life$/))) {
		out.effects.push({ e: 'loseLife', n: num(m[1]), who: 'eachOpp' })
		return true
	}
	if ((m = lower.match(/^each opponent loses (\w+) life and you gain (\w+) life$/))) {
		out.effects.push({ e: 'loseLife', n: num(m[1]), who: 'eachOpp' }, { e: 'life', n: num(m[2]), who: 'you' })
		return true
	}
	if ((m = lower.match(/^target (player|opponent) loses (\w+) life$/))) {
		addTarget(out, { kind: 'player', opponent: m[1] === 'opponent' })
		out.effects.push({ e: 'loseLife', n: num(m[2]), who: 'target' })
		return true
	}
	// destroy / exile / bounce / tap one target
	if ((m = s.match(/^(Destroy|Exile) (target .+?)$/))) {
		const spec = parseTarget(m[2])
		if (!spec || spec.kind !== 'perm') return false
		const i = addTarget(out, spec)
		out.effects.push({ e: m[1] === 'Destroy' ? 'destroy' : 'exile', t: i })
		return true
	}
	if ((m = s.match(/^Return (target .+?) to (?:its owner's|their owner's|its owners') hands?$/))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'bounce', t: addTarget(out, spec) })
		return true
	}
	if ((m = s.match(/^(Tap|Untap) (target .+?)$/))) {
		const spec = parseTarget(m[2])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'tap', t: addTarget(out, spec), untap: m[1] === 'Untap' })
		return true
	}
	if ((m = s.match(/^(Destroy|Exile) all (.+?)$/))) {
		const f = parseFilter(m[2])
		if (!f) return false
		out.effects.push({ e: m[1] === 'Destroy' ? 'destroyAll' : 'exileAll', filter: f })
		return true
	}
	if ((m = s.match(/^Return all (.+?) to their owners' hands$/))) {
		const f = parseFilter(m[1])
		if (!f) return false
		out.effects.push({ e: 'bounceAll', filter: f })
		return true
	}
	// damage
	if ((m = s.match(/^~ deals (\w+) damage to (any target|target .+?)$/))) {
		const spec = parseTarget(m[2])
		if (!spec) return false
		out.effects.push({ e: 'damage', n: num(m[1]), t: addTarget(out, spec) })
		return true
	}
	if ((m = s.match(/^~ deals (\w+) damage to each (opponent|player)$/))) {
		out.effects.push({ e: 'damageEach', n: num(m[1]), players: m[2] === 'opponent' ? 'opp' : 'each' })
		return true
	}
	if ((m = s.match(/^~ deals (\w+) damage to each (.+?)$/))) {
		const f = parseFilter(m[2])
		if (!f) return false
		out.effects.push({ e: 'damageEach', n: num(m[1]), filter: f })
		return true
	}
	// counter
	if ((m = s.match(/^Counter (target .*spell)$/))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'spell') return false
		out.effects.push({ e: 'counter', t: addTarget(out, spec) })
		return true
	}
	// tokens
	if ((m = s.match(/^Create (a|an|one|two|three|four|five|x|\d+) (tapped )?(\d+|X)\/(\d+|X) ((?:(?:white|blue|black|red|green|colorless)(?:,? and |, | )?)*)((?:[A-Z][\w'-]* )*?)(artifact )?creature tokens?(?: with ((?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible)(?:(?:,| and|, and) (?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible))*))?$/))) {
		const colors = (m[5].match(/white|blue|black|red|green/g) ?? []).map(colorLetter)
		const sub = m[6].trim()
		out.effects.push({
			e: 'token',
			n: num(m[1]),
			tapped: !!m[2],
			power: m[3] === 'X' ? -1 : Number(m[3]),
			toughness: m[4] === 'X' ? -1 : Number(m[4]),
			colors,
			name: sub || 'Token',
			types: `${m[7] ? 'Artifact ' : ''}Creature${sub ? ' — ' + sub : ''}`,
			keywords: keywordList(m[8]),
			artifact: !!m[7],
		})
		return true
	}
	if ((m = s.match(/^Create (a|an|one|two|three|four|five|x|\d+) (tapped )?(Treasure|Clue|Food|Map|Blood|Gold|Powerstone|Junk|Shard|Lander) tokens?$/))) {
		out.effects.push({ e: 'token', n: num(m[1]), tapped: !!m[2], name: m[3], types: `Artifact — ${m[3]}`, colors: [], keywords: [], artifact: true })
		return true
	}
	// counters
	if ((m = lower.match(/^put (a|an|one|two|three|four|five|x|\d+) ([+-]1\/[+-]1|\w+) counters? on (target .+?|~|each (.+?))$/))) {
		const n = num(m[1])
		const kind = m[2]
		if (m[3] === '~') out.effects.push({ e: 'counters', n, kind, t: 'self' })
		else if (m[4]) {
			const f = parseFilter(m[4])
			if (!f) return false
			out.effects.push({ e: 'counters', n, kind, t: 'each', filter: f })
		} else {
			const spec = parseTarget(m[3])
			if (!spec || spec.kind !== 'perm') return false
			out.effects.push({ e: 'counters', n, kind, t: addTarget(out, spec) })
		}
		return true
	}
	// pump
	if ((m = s.match(new RegExp(`^(Target .+?|~) gets ([+-]\\d+)\\/([+-]\\d+)(?: and gains ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*)? until end of turn$`)))) {
		const kws = (s.match(/gains (.+) until/)?.[1] ?? '').toLowerCase()
		let t: number | 'self' = 'self'
		if (m[1] !== '~') {
			const spec = parseTarget(m[1].toLowerCase())
			if (!spec || spec.kind !== 'perm') return false
			t = addTarget(out, spec)
		}
		out.effects.push({ e: 'pump', p: Number(m[2]), tough: Number(m[3]), keywords: keywordList(kws), t })
		return true
	}
	if ((m = s.match(new RegExp(`^(Target .+?|~) gains ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})* until end of turn$`)))) {
		const kws = (s.match(/gains (.+) until/)?.[1] ?? '').toLowerCase()
		let t: number | 'self' = 'self'
		if (m[1] !== '~') {
			const spec = parseTarget(m[1].toLowerCase())
			if (!spec || spec.kind !== 'perm') return false
			t = addTarget(out, spec)
		}
		out.effects.push({ e: 'pump', p: 0, tough: 0, keywords: keywordList(kws), t })
		return true
	}
	if ((m = s.match(new RegExp(`^(.+?) you control get ([+-]\\d+)\\/([+-]\\d+)(?: and gain ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*)? until end of turn$`)))) {
		const f = parseFilter(m[1])
		if (!f) return false
		f.controller = 'you'
		const kws = (s.match(/gain (.+) until/)?.[1] ?? '').toLowerCase()
		out.effects.push({ e: 'pumpAll', p: Number(m[2]), tough: Number(m[3]), keywords: keywordList(kws), filter: f })
		return true
	}
	if ((m = s.match(new RegExp(`^(.+?) you control gain ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})* until end of turn$`)))) {
		const f = parseFilter(m[1])
		if (!f) return false
		f.controller = 'you'
		const kws = (s.match(/gain (.+) until/)?.[1] ?? '').toLowerCase()
		out.effects.push({ e: 'pumpAll', p: 0, tough: 0, keywords: keywordList(kws), filter: f })
		return true
	}
	// library
	if ((m = lower.match(/^scry (\w+)$/))) {
		out.effects.push({ e: 'scry', n: num(m[1]) as number })
		return true
	}
	if ((m = lower.match(/^surveil (\w+)$/))) {
		out.effects.push({ e: 'surveil', n: num(m[1]) as number })
		return true
	}
	if ((m = lower.match(/^mill (\w+) cards?$/))) {
		out.effects.push({ e: 'mill', n: num(m[1]) as number, who: 'you' })
		return true
	}
	if ((m = lower.match(/^target player mills (\w+) cards?$/))) {
		addTarget(out, { kind: 'player' })
		out.effects.push({ e: 'mill', n: num(m[1]) as number, who: 'target' })
		return true
	}
	if ((m = lower.match(/^search your library for (a|an|up to (?:one|two|three)) (.+?) cards?(?:,| and) (reveal (?:it|them|that card), )?(?:and )?put (?:it|that card|them|those cards) (onto the battlefield( tapped)?|into your hand|on top of your library)(?:,| and)?(?: then)? shuffle(?: your library)?$/))) {
		const count = m[1].startsWith('up to') ? (num(m[1].replace('up to ', '')) as number) : 1
		let what = m[2]
		let names: string[] | undefined
		const basicTypes = what.match(/^((?:plains|island|swamp|mountain|forest)(?:(?:, | or |, or )(?:plains|island|swamp|mountain|forest))*)$/)
		const f: Filter = { types: [], not: [] }
		if (basicTypes) {
			names = basicTypes[1].split(/, or |, | or /)
			f.types = ['land']
		} else {
			const ff = parseFilter(what)
			if (!ff) return false
			Object.assign(f, ff)
		}
		out.effects.push({
			e: 'search',
			filter: f,
			names,
			count,
			dest: m[4].startsWith('onto') ? 'battlefield' : m[4].startsWith('into') ? 'hand' : 'top',
			tapped: !!m[5],
			reveal: !!m[3],
		})
		return true
	}
	if ((m = lower.match(/^return (target .+?) card from your graveyard to (your hand|the battlefield)$/))) {
		const f = parseFilter(m[1].replace(/^target /, ''))
		if (!f) return false
		out.effects.push({ e: 'returnFromGy', filter: f, dest: m[2] === 'your hand' ? 'hand' : 'battlefield', t: 0 })
		return true
	}
	if ((m = lower.match(/^each opponent sacrifices (a|an) (.+?)(?: of their choice)?$/))) {
		const f = parseFilter(m[2])
		if (!f) return false
		out.effects.push({ e: 'sacrifice', who: 'eachOpp', filter: f })
		return true
	}
	if ((m = lower.match(/^target (player|opponent) sacrifices (a|an) (.+?)(?: of their choice)?$/))) {
		const f = parseFilter(m[3])
		if (!f) return false
		addTarget(out, { kind: 'player', opponent: m[1] === 'opponent' })
		out.effects.push({ e: 'sacrifice', who: 'target', filter: f })
		return true
	}
	if ((m = lower.match(/^(?:each opponent|target opponent) discards (a|one|two|\d+) cards?$/))) {
		if (lower.startsWith('target')) addTarget(out, { kind: 'player', opponent: true })
		out.effects.push({ e: 'discard', n: num(m[1]) as number, who: lower.startsWith('target') ? 'target' : 'eachOpp' })
		return true
	}
	if ((m = lower.match(/^you may put a land card from your hand onto the battlefield$/))) {
		out.effects.push({ e: 'putLand' })
		return true
	}
	void defName
	return false
}

// ───────── costs and abilities ─────────

function parseAbilityCost(raw: string): AbilityCost | null {
	const c: AbilityCost = { mana: '', tap: false, sacrificeSelf: false, life: 0 }
	const parts = raw.split(/,\s*/)
	const other: string[] = []
	for (const p0 of parts) {
		const p = p0.trim()
		if (/^(\{[^}]+\})+$/.test(p)) {
			for (const sym of p.match(/\{[^}]+\}/g)!) {
				if (sym === '{T}') c.tap = true
				else if (sym === '{Q}') c.untap = true
				else c.mana += sym
			}
		} else if (/^Sacrifice ~$/.test(p)) c.sacrificeSelf = true
		else if (/^Pay (\d+) life$/.test(p)) c.life += Number(p.match(/\d+/)![0])
		else if (/^Discard a card$/.test(p)) c.discard = 1
		else if (/^Exile ~ from your graveyard$/.test(p)) c.exileSelfFromGy = true
		else if (/^[+-]\d+$/.test(p) || p === '0') c.loyalty = Number(p)
		else other.push(p)
	}
	if (other.length) c.other = other.join(', ')
	return c
}

function parseManaEffect(e: string): Omit<ManaAbility, 'index' | 'cost'> | null {
	let m: RegExpMatchArray | null
	const s = e.replace(/\.$/, '')
	let pain = 0
	let body = s
	const painM = s.match(/^(.*?)\. ~ deals (\d+) damage to you$/)
	if (painM) {
		body = painM[1]
		pain = Number(painM[2])
	}
	if ((m = body.match(/^Add ((?:\{[WUBRGC]\})+)$/))) {
		const mana = m[1].match(/[WUBRGC]/g) as Mana[]
		return { kind: 'fixed', mana, amount: mana.length, pain }
	}
	if ((m = body.match(/^Add (\{[WUBRGC]\})(?:, (\{[WUBRGC]\}))*,? or (\{[WUBRGC]\})$/))) {
		const mana = body.match(/\{([WUBRGC])\}/g)!.map((x) => x[1]) as Mana[]
		return { kind: 'oneOf', mana, amount: 1, pain }
	}
	if ((m = body.match(/^Add ((?:\{[WUBRGC]\}){2,}) or ((?:\{[WUBRGC]\}){2,})$/))) {
		// e.g. "{W}{W} or {U}{U}" — treat as one of, two of the same colour
		const a = m[1].match(/[WUBRGC]/g) as Mana[]
		const b = m[2].match(/[WUBRGC]/g) as Mana[]
		return { kind: 'oneOf', mana: [a[0], b[0]], amount: a.length, sameColor: true, pain }
	}
	if (/^Add one mana of any color$/.test(body)) return { kind: 'any', mana: ['W', 'U', 'B', 'R', 'G'], amount: 1, pain }
	if ((m = body.match(/^Add (two|three) mana of any one color$/))) return { kind: 'any', mana: ['W', 'U', 'B', 'R', 'G'], amount: num(m[1]) as number, sameColor: true, pain }
	if (/^Add one mana of any color in your commander's color identity$/.test(body)) return { kind: 'identity', mana: [], amount: 1, pain }
	if (/^Add one mana of any type that a land an opponent controls could produce$/.test(body) || /^Add one mana of any color that a land an opponent controls could produce$/.test(body))
		return { kind: 'oppLands', mana: [], amount: 1, pain }
	if (/^Add \{C\} for each charge counter on ~$/.test(body)) return { kind: 'charge', mana: ['C'], amount: 0, pain }
	if (/^Add X mana of any one color, where X is the number of charge counters on ~$/.test(body)) return { kind: 'charge', mana: ['W', 'U', 'B', 'R', 'G'], amount: 0, sameColor: true, pain }
	return null
}

function parseEntersTapped(lines: string[]): Rules['entersTapped'] {
	for (const l of lines) {
		const s = stripReminder(l)
		let m: RegExpMatchArray | null
		if (/^~ enters tapped\.$/.test(s) || /^~ enters the battlefield tapped\.$/.test(s)) return 'yes'
		if ((m = s.match(/^~ enters tapped unless you control (?:a|an) (\w+)(?:,? or (?:a|an) (\w+))?\.$/))) return { unlessControl: [m[1], m[2]].filter(Boolean) as string[] }
		if ((m = s.match(/^~ enters tapped unless you control two or (more|fewer) other lands\.$/))) return { unlessOtherLands: [2, m[1] === 'more' ? 'ge' : 'le'] }
		if (/^~ enters tapped unless you control two or more basic lands\.$/.test(s)) return { unlessBasics: 2 }
		if (/^~ enters tapped unless you control a legendary creature\.$/.test(s)) return { unlessLegendary: true }
		if ((m = s.match(/^As ~ enters, you may reveal (?:a|an) (\w+) or (\w+) card from your hand\. If you don't, ~ enters tapped\.$/))) return { revealFromHand: [m[1], m[2]] }
		if (/enters tapped/.test(s)) return 'yes'
	}
	return 'no'
}

function isKeywordLine(s: string): string[] | null {
	const parts = stripReminder(s)
		.replace(/\.$/, '')
		.split(/[,;]\s*/)
		.map((x) => x.trim().toLowerCase())
	if (!parts.length || !parts[0]) return null
	const out: string[] = []
	for (const p of parts) {
		if (KEYWORDS.includes(p)) out.push(p)
		else if (/^protection from (white|blue|black|red|green|everything|creatures|artifacts)( and from (white|blue|black|red|green))*$/.test(p)) out.push(p)
		else if (/^ward (\{.+\}|\d+|—.*)$/.test(p)) out.push('ward')
		else if (/^(equip|crew|cycling|kicker|flashback|ninjutsu|landwalk|plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|toxic \d+|annihilator \d+|afflict \d+|bushido \d+|rampage \d+|bloodthirst \d+|modular \d+)\b/.test(p)) out.push(p.split(' ')[0])
		else if (/^affinity for artifacts$/.test(p)) out.push('affinity for artifacts')
		else return null
	}
	return out
}

const cache = new Map<string, Rules>()

export function rulesFor(def: CardDef, flipped = false): Rules {
	const key = def.id + (flipped ? '#back' : '')
	const hit = cache.get(key)
	if (hit) return hit
	const face = flipped && def.back ? def.back : def
	const r = parse({ name: face.name, oracle: face.oracle, typeLine: face.typeLine })
	cache.set(key, r)
	return r
}

export function parse(def: { name: string; oracle: string; typeLine: string }): Rules {
	const [left, right = ''] = def.typeLine.split(/\s+[—-]\s+/)
	const lw = left.toLowerCase().split(/\s+/)
	const supertypes = lw.filter((w) => ['legendary', 'basic', 'snow', 'world', 'token'].includes(w))
	const types = lw.filter((w) => !supertypes.includes(w) && w !== '')
	const subtypes = right.split(/\s+/).filter(Boolean)
	const text = normalise(def)
	const lines = text.split('\n').map((x) => x.trim()).filter(Boolean)
	const r: Rules = {
		types,
		subtypes,
		supertypes,
		keywords: [],
		manaAbilities: [],
		activated: [],
		triggers: [],
		statics: [],
		spell: null,
		spellText: '',
		entersTapped: types.includes('land') ? parseEntersTapped(lines) : 'no',
		hasX: false,
		canBeCountered: !/can't be countered/.test(text),
		fullyAutomated: true,
	}
	const spellLines: string[] = []
	const isSpell = types.includes('instant') || types.includes('sorcery')
	lines.forEach((line, index) => {
		const plain = stripReminder(line)
		if (!plain) {
			// pure reminder text line e.g. basic land "({T}: Add {G}.)"
			const inner = line.replace(/^\(|\)$/g, '')
			const mm = inner.match(/^\{T\}: (Add .+)$/)
			if (mm) {
				const me = parseManaEffect(mm[1])
				if (me) r.manaAbilities.push({ index, cost: { mana: '', tap: true, sacrificeSelf: false, life: 0 }, ...me })
			}
			return
		}
		const kws = isKeywordLine(plain)
		if (kws) {
			for (const k of kws) if (k !== 'equip') r.keywords.push(k)
			if (kws.includes('affinity for artifacts')) r.affinity = true
			const eq = plain.match(/^Equip (\{[^}]+\}(?:\{[^}]+\})*|\d+)/i)
			if (eq) {
				const cost = /^\d+$/.test(eq[1]) ? `{${eq[1]}}` : eq[1]
				r.activated.push({
					index,
					text: `Equip ${cost}`,
					cost: { mana: cost, tap: false, sacrificeSelf: false, life: 0 },
					effectText: 'Attach to target creature you control.',
					compiled: { targets: [{ kind: 'perm', filter: { types: ['creature'], not: [], controller: 'you' } }], effects: [] },
					sorcery: true,
					oncePerTurn: false,
					equip: true,
				})
			}
			return
		}
		let m: RegExpMatchArray | null
		// Aura
		if ((m = plain.match(/^Enchant (.+)$/))) {
			const f = parseFilter(m[1])
			r.enchant = f ?? { types: ['permanent'], not: [] }
			if (!f) r.fullyAutomated = false
			return
		}
		// equipment / aura statics
		if ((m = plain.match(/^(Equipped|Enchanted) creature gets ([+-]\d+)\/([+-]\d+)(?: and has (.+?))?\.$/))) {
			r.statics.push({ kind: m[1] === 'Equipped' ? 'equip' : 'aura', power: Number(m[2]), toughness: Number(m[3]), keywords: keywordList(m[4]) })
			return
		}
		if ((m = plain.match(/^(Equipped|Enchanted) creature has (.+?)\.$/))) {
			r.statics.push({ kind: m[1] === 'Equipped' ? 'equip' : 'aura', power: 0, toughness: 0, keywords: keywordList(m[2]) })
			return
		}
		// anthems
		if ((m = plain.match(/^(.+?) you control get ([+-]\d+)\/([+-]\d+)(?: and have (.+?))?\.$/))) {
			const f = parseFilter(m[1])
			if (f) {
				f.controller = 'you'
				r.statics.push({ kind: 'anthem', power: Number(m[2]), toughness: Number(m[3]), keywords: keywordList(m[4]), filter: f })
				return
			}
		}
		if ((m = plain.match(new RegExp(`^(.+?) you control have ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*\\.$`)))) {
			const f = parseFilter(m[1])
			if (f) {
				f.controller = 'you'
				r.statics.push({ kind: 'anthem', power: 0, toughness: 0, keywords: keywordList(plain.match(/have (.+)\.$/)![1]), filter: f })
				return
			}
		}
		// enters tapped lines (lands handled above; for other permanents just note)
		if (/enters tapped/.test(plain) || /^As ~ enters, you may reveal/.test(plain)) {
			if (!types.includes('land')) r.fullyAutomated = false
			return
		}
		// triggers
		if ((m = plain.match(/^(When|Whenever|At) ([^,]+), (.+)$/))) {
			const cond = m[2]
			let effectText = m[3]
			let event: TriggerEvent | null = null
			let filter: Filter | undefined
			let fm: RegExpMatchArray | null
			if (/^~ enters$/.test(cond) || /^~ enters the battlefield$/.test(cond)) event = 'etb'
			else if (/^~ attacks$/.test(cond)) event = 'attacks'
			else if (/^~ blocks$/.test(cond)) event = 'blocks'
			else if (/^~ dies$/.test(cond)) event = 'dies'
			else if (/^~ leaves the battlefield$/.test(cond)) event = 'ltb'
			else if (/^the beginning of your upkeep$/.test(cond)) event = 'upkeep'
			else if (/^the beginning of your end step$/.test(cond)) event = 'endStep'
			else if (/^the beginning of combat on your turn$/.test(cond)) event = 'beginCombat'
			else if (/^~ deals combat damage to a player$/.test(cond)) event = 'combatDamagePlayer'
			else if (/^you cast this spell$/.test(cond)) event = 'cast'
			else if (/^a land you control enters$/.test(cond) || /^a land enters the battlefield under your control$/.test(cond)) event = 'landfall'
			else if ((fm = cond.match(/^(another .+?|a .+?|an .+?) (?:you control )?enters(?: the battlefield)?(?: under your control)?$/))) {
				const raw = fm[1].replace(/^(a|an) /, '')
				const ff = parseFilter(raw.replace(/ you control$/, '') + (/ you control$/.test(raw) || /you control/.test(cond) || /under your control/.test(cond) ? ' you control' : ''))
				if (ff) {
					event = 'otherEtb'
					filter = ff
				}
			}
			const conditional = /^if /i.test(effectText)
			if (event) {
				let compiled = conditional ? null : compile(effectText, def.name)
				r.triggers.push({ index, event, text: line, effectText, compiled, filter, conditional })
				if (!compiled) r.fullyAutomated = false
				effectText = ''
				return
			}
			r.fullyAutomated = false
			r.triggers.push({ index, event: 'cast', text: line, effectText: m[3], compiled: null, conditional: true })
			// unknown trigger: keep as a reminder only (event 'cast' never fires for permanents)
			r.triggers.pop()
			return
		}
		// activated abilities and loyalty abilities
		if (!isSpell && (m = plain.match(/^([^:"]+?): (.+)$/)) && /(\{|^[+-]?\d+$|Sacrifice|Pay|Discard|Exile|Tap|Remove)/.test(m[1])) {
			const cost = parseAbilityCost(m[1])
			let eff = m[2]
			const sorcery = /Activate only as a sorcery\.?/.test(eff) || cost?.loyalty !== undefined
			const once = /Activate only once each turn\.?/.test(eff) || cost?.loyalty !== undefined
			eff = eff.replace(/\s*Activate only (as a sorcery|once each turn)( and only (as a sorcery|once each turn))?\.?/g, '').trim()
			if (cost && cost.tap && !cost.other && cost.loyalty === undefined) {
				const me = parseManaEffect(eff)
				if (me) {
					r.manaAbilities.push({ index, cost, ...me })
					return
				}
			}
			if (cost && !cost.tap && !cost.mana && cost.loyalty === undefined && !cost.other && /^Add /.test(eff)) {
				const me = parseManaEffect(eff)
				if (me) {
					r.manaAbilities.push({ index, cost, ...me })
					return
				}
			}
			if (cost) {
				const compiled = cost.other ? null : compile(eff, def.name)
				if (!compiled) r.fullyAutomated = false
				r.activated.push({
					index,
					text: line,
					cost,
					effectText: eff,
					compiled,
					sorcery,
					oncePerTurn: once,
					loyalty: cost.loyalty !== undefined,
					fromGraveyard: /from your graveyard/.test(eff) && cost.exileSelfFromGy,
				})
				return
			}
		}
		if (isSpell) {
			spellLines.push(plain)
			return
		}
		r.fullyAutomated = false
	})
	if (isSpell) {
		r.spellText = spellLines.join(' ').replace(/\s*~ can't be countered\.\s*/, ' ').trim()
		r.spell = r.spellText ? compile(r.spellText, def.name) : null
		if (!r.spell) r.fullyAutomated = false
	}
	r.hasX = /\{X\}/.test(def.oracle)
	return r
}

export function hasType(r: Rules, t: string): boolean {
	return r.types.includes(t)
}
