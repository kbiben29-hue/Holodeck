// Reads a card's rules text (Oracle text) into things the engine can do by itself:
// keywords, mana abilities, simple activated and triggered abilities, and effects written in
// common templates ("Draw two cards.", "Destroy target creature."…). Anything it can't read is
// left to the players (the item still goes on the stack and they do it with the table tools).

import type { CardDef, Color, Mana } from './types'

// ───────── effects ─────────

export interface Filter {
	/** Card types, any of (lower case). Empty = any permanent. */
	types: string[]
	/** Types it must also have ("artifact creature" = artifact AND creature). */
	and?: string[]
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
	minMv?: number
	/** Artifact, legendary or Saga. */
	historic?: boolean
	minToughness?: number
	token?: boolean
	withCounters?: boolean
	colors?: Color[]
	nonColors?: Color[]
	nonToken?: boolean
	basic?: boolean
}

export type TargetSpec = (
	| { kind: 'perm'; filter: Filter }
	| { kind: 'player'; opponent?: boolean }
	| { kind: 'any' }
	| { kind: 'spell'; filter: Filter }
	| { kind: 'stackAny' }
	| { kind: 'creatureOrPlayer' }
	| { kind: 'gyCard'; filter: Filter; maxMvPower?: boolean }
) & {
	/** "up to two target …": how many (default exactly one). */
	min?: number
	max?: number
}

export type Effect =
	| { e: 'draw'; n: number | 'x'; who: 'you' | 'target' | 'each' }
	| { e: 'life'; n: number | 'x'; who: 'you' | 'eachOpp' | 'target' | 'each' | 'targetController' }
	| { e: 'loseLife'; n: number | 'x'; who: 'you' | 'eachOpp' | 'target' | 'each' }
	| { e: 'destroy'; t: number }
	| { e: 'exile'; t: number }
	| { e: 'bounce'; t: number }
	/** Put a permanent into its owner's library: on top, on the bottom, or the owner chooses. */
	| { e: 'tuck'; t: number; where: 'top' | 'bottom' | 'either' }
	| { e: 'tap'; t: number; untap?: boolean }
	| { e: 'destroyAll'; filter: Filter }
	| { e: 'exileAll'; filter: Filter }
	| { e: 'bounceAll'; filter: Filter }
	| { e: 'damage'; n: number | 'x'; t: number }
	| { e: 'damageEach'; n: number | 'x'; filter?: Filter; players?: 'opp' | 'each' }
	| { e: 'counter'; t: number }
	| { e: 'token'; n: number | 'x'; name: string; power?: number; toughness?: number; types: string; colors: Color[]; keywords: string[]; tapped?: boolean; artifact?: boolean; attacking?: boolean }
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
	| { e: 'tapAll'; filter: Filter; untap?: boolean }
	| { e: 'tokenForController'; t: number; name: string; power: number; toughness: number; types: string; colors: Color[] }
	| { e: 'investigate'; n: number }
	| { e: 'explore'; t: 'self' }
	| { e: 'discover'; n: number }
	| { e: 'copyToken'; t: number | 'self'; haste?: boolean; exileAtEnd?: boolean }
	| { e: 'flicker'; t: number; later: boolean }
	| { e: 'addMana'; n: number }
	| { e: 'gainControl'; t: number; eot: boolean; untap?: boolean; keywords?: string[] }
	| { e: 'cantBlock'; t: number | 'self' }
	| { e: 'fight'; a: number | 'self'; b: number }
	| { e: 'endCombat' }
	| { e: 'protectionChoice'; filter: Filter }
	| { e: 'goad'; t: number | 'allOpp' }
	| { e: 'assimilate'; t: number }

export interface Compiled {
	targets: TargetSpec[]
	effects: Effect[]
	/** A "you may" ability: the controller can decline. */
	optional?: boolean
	/** Only if the permanent was kicked ("When ~ enters, if it was kicked, …"). */
	ifKicked?: boolean
	/** The effect's number is counted on resolution. */
	count?: Count
}

export interface Modal {
	/** How many modes to choose. */
	n: number
	/** May choose up to n (e.g. "choose one or both"). */
	upTo?: boolean
	modes: { text: string; compiled: Compiled | null }[]
}

export interface ExtraCost {
	discard?: number
	sacrifice?: Filter
	lifeX?: boolean
	/** "discard a card or pay 3 life" */
	orLife?: number
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
	/** Sacrifice a permanent matching this (other than itself). */
	sacrifice?: Filter
	/** Tap an untapped creature you control (other than itself). */
	tapOther?: boolean
	/** Remove N counters of a kind from it ("Remove a counter from ~" = any kind). */
	removeCounters?: { n: number; kind?: string; fromAmong?: boolean }
	/** Activate only if you control N or more lands. */
	needLands?: number
	needArtifact?: boolean
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
	threshold?: number
	/** Station: tap another creature you control, put charge counters equal to its power. */
	station?: boolean
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

export type TriggerEvent = 'etb' | 'attacks' | 'dies' | 'upkeep' | 'endStep' | 'beginCombat' | 'combatDamagePlayer' | 'landfall' | 'otherEtb' | 'ltb' | 'cast' | 'blocks' | 'secondDraw' | 'youAttack' | 'castSpell' | 'otherDies' | 'gainLife' | 'tapped' | 'teamDamage' | 'eachUpkeep' | 'eachEndStep' | 'yourDraw' | 'eachDraw' | 'commanderEtb' | 'commanderAttacks' | 'goadedAttack'

export interface Trigger {
	threshold?: number
	index: number
	event: TriggerEvent
	text: string
	effectText: string
	compiled: Compiled | null
	/** For otherEtb: which permanents trigger it. */
	filter?: Filter
	/** "When ~ enters, if …" style conditions we can't check — always shown as manual. */
	conditional?: boolean
	/** castSpell: whose spells. */
	who?: 'you' | 'opp' | 'any'
	/** Triggers on the creature this is attached to ("Whenever equipped creature dies"). */
	equipped?: boolean
	/** Granted to other permanents ("Artifact creatures you control have 'Whenever this creature …'"). */
	granted?: Filter
}

export interface Static {
	/** Only while the permanent has at least this many charge counters (Station). */
	threshold?: number
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
	modal?: Modal
	extraCost?: ExtraCost
	kicker?: string
	multikicker?: string
	squad?: string
	flashback?: string
	cycling?: { cost: string; basic?: boolean }
	entersWith?: { kind: string; n: number | 'x' | 'kicked' }
	/** Saga chapters. */
	chapters?: { nums: number[]; text: string; compiled: Compiled | null }[]
	noMaxHandSize?: boolean
	sharedAnimosity?: boolean
	extraLand?: boolean
	cantBlock?: boolean
	unblockable?: boolean | 'ifSpacecraft'
	evasionPower?: number
	mustAttack?: boolean
	/** "Artifact spells you cast cost {1} less to cast." */
	costReduction?: { filter: Filter; n: number }
	/** "This spell costs {1} less for each …" */
	selfReduce?: { filter: Filter; mine?: boolean }
	/** Spacecraft: becomes an artifact creature at this many charge counters. */
	stationCreatureAt?: number
	/** Keywords that need a number of charge counters. */
	thresholdKeywords?: { n: number; keywords: string[] }[]
}

const KEYWORDS = [
	'flying', 'reach', 'trample', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'vigilance', 'haste', 'menace',
	'defender', 'hexproof', 'shroud', 'indestructible', 'flash', 'prowess', 'changeling', 'fear', 'intimidate', 'skulk',
	'horsemanship', 'infect', 'wither', 'unblockable', 'devoid', 'partner', 'banding', 'flanking', 'convoke', 'improvise',
	'delve', 'storm', 'cascade', 'exalted', 'undying', 'persist', 'myriad', 'melee', 'toxic', 'battle cry',
]

export const SELF = '~'

function normalise(def: { name: string; oracle: string }): string {
	let t = def.oracle
	const names = [def.name]
	if (def.name.includes(',')) names.push(def.name.split(',')[0].trim())
	// legends are often called by a shorter name ("Ensign Kim", "Lieutenant Sulu", "Loran")
	const head = def.name.split(',')[0].trim().split(/\s+/)
	const COMMON = ['The', 'Captain', 'Commander', 'Chief', 'Lieutenant', 'Ensign', 'Dr.', 'U.S.S.', 'I.K.S.', 'S.S.', 'Lt.', 'Fleet', 'Cmdr.']
	if (head.length > 1) {
		if (!COMMON.includes(head[0])) names.push(head[0])
		names.push(`${head[0]} ${head[head.length - 1]}`)
	}
	if (def.name.includes(' // ')) names.push(...def.name.split(' // '))
	names.sort((a, b) => b.length - a.length)
	for (const n of names) if (n.length > 1) t = t.split(n).join(SELF)
	t = t.replace(/\b[Tt]his (creature|artifact|land|enchantment|spell|card|equipment|Equipment|Vehicle|vehicle|permanent|Spacecraft|token|Aura|aura|planeswalker|Planet|planet|battle)\b/g, SELF)
	t = t.replace(/−/g, '-')
	// Two-player game: "the number of opponents you attacked this turn" / "you have" is 1.
	t = t
		.split('\n')
		.map((line) =>
			/where X is the number of opponents you (attacked this turn|have)/.test(line)
				? line
						.replace(/,? where X is the number of opponents you (attacked this turn|have)/, '')
						.replace(/\+X\/\+X/g, '+1/+1')
						.replace(/\bX cards\b/g, 'a card')
						.replace(/\bX life\b/g, '1 life')
						.replace(/\bX\b/g, 'one')
				: line,
		)
		.join('\n')
	t = t.replace(/a number of (.+?) equal to the number of opponents you have/g, 'a $1')
	t = t.replace(/for each opponent you attacked this turn, /g, '')
	t = t.replace(/For each opponent, you create /g, 'Create ')
	t = t.replace(/you may have (target [^,.]+?) gain /g, 'you may $1 gains ')
	t = t.replace(/draw that many cards/g, 'draw X cards')
	t = t.replace(/(^|\. |, )you create /g, '$1create ')
	return t
}

/** "Seek out — Whenever…", "Landfall — Whenever…", "Battlefront — …": the ability word has no rules meaning. */
function stripAbilityWord(line: string): string {
	const m = line.match(/^([A-Z][A-Za-z'’!. -]{1,40}?) — (.+)$/)
	if (!m || /^[IVX]+$/.test(m[1])) return line
	return m[2]
}

const stripReminder = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim()

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: -1 }
/** Counted amounts: "for each attacking creature", "equal to the number of differently named lands you control"… */
export type Count = 'attackers' | 'charge' | 'lands' | 'power'
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
		[/ your opponents control$/, () => (f.controller = 'opp')],
		[/ defending player controls$/, () => (f.controller = 'opp')],
		[/ with toughness (\d+) or greater$/, (m) => (f.minToughness = Number(m[1]))],
		[/ with counters on them$/, () => (f.withCounters = true)],
		[/ with mana value (\d+) or greater$/, (m) => (f.minMv = Number(m[1]))],
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
	const words = s.replace(/,? or /g, ',').replace(/,? and /g, ',').split(/\s*,\s*/)
	for (const w0 of words) {
		const parts = w0.trim().split(/\s+/)
		let typeFound = false
		const before = f.types.length
		for (const p of parts) {
			if (p === 'historic') f.historic = true
			else if (p === 'tapped') f.tapped = true
			else if (p === 'untapped') f.tapped = false
			else if (p === 'attacking') f.attacking = true
			else if (p === 'nontoken') f.nonToken = true
			else if (p === 'token' || p === 'tokens') f.token = true
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
		// several type words in one phrase ("artifact creatures") must all apply
		if (f.types.length - before > 1) {
			const extra = f.types.splice(before + 1)
			f.and = [...(f.and ?? []), ...extra]
		}
	}
	return f
}

function colorLetter(w: string): Color {
	return ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' } as Record<string, Color>)[w]
}

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7 }

function parseTarget(raw: string): TargetSpec | null {
	let s = raw.trim().toLowerCase()
	let min = 1
	let max = 1
	let other = false
	let pm: RegExpMatchArray | null
	if ((pm = s.match(/^(?:each of )?up to (one|two|three|four|five|seven) (.+)$/))) {
		min = 0
		max = COUNT[pm[1]]
		s = pm[2]
	} else if ((pm = s.match(/^one or two (.+)$/))) {
		max = 2
		s = pm[1]
	} else if ((pm = s.match(/^(two|three) (.+)$/))) {
		min = max = COUNT[pm[1]]
		s = pm[2]
	}
	if ((pm = s.match(/^(?:another|other) (target .+)$/))) {
		other = true
		s = pm[1]
	}
	const spec = parseTarget1(s)
	if (!spec) return null
	if (other && 'filter' in spec) spec.filter.other = true
	if (min !== 1 || max !== 1) Object.assign(spec, { min, max })
	return spec
}

function parseTarget1(s: string): TargetSpec | null {
	if (s === 'target spell, activated ability, or triggered ability') return { kind: 'stackAny' }
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

const KW_LIST = '(flying|reach|trample|first strike|double strike|deathtouch|lifelink|vigilance|haste|menace|indestructible|hexproof|melee|ward \\{\\d+\\})'
/** "target creature", "up to two target creatures", "another target creature you control"… */
const TGT = '(?:(?:each of )?up to (?:one|two|three|four|five|seven) |one or two |two |three )?(?:another |other )?target [^.]+?'

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
	t = t[0].toUpperCase() + t.slice(1)
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

function compileSentence(s0: string, out: Compiled, defName: string): boolean {
	let m: RegExpMatchArray | null
	let s = s0
	// counted amounts become X
	const counts: [RegExp, Count][] = [
		[/ for each attacking creature$/, 'attackers'],
		[/ for each charge counter on ~$/, 'charge'],
		[/ equal to the number of differently named lands you control$/, 'lands'],
	]
	for (const [re, c] of counts)
		if (re.test(s)) {
			s = s.replace(re, '').replace(/^(Create|Draw|Put) (a|an|one) /, '$1 X ').replace(/^you gain life$/, 'you gain X life').replace(/^You gain life$/, 'You gain X life')
			const before = out.effects.length
			if (!compileSentence(s, out, defName)) return false
			out.count = c
			void before
			return true
		}
	const lower = s.toLowerCase()
	if (/^(it|they|that creature) can't be regenerated$/.test(lower)) return true
	// ── wording that refines the previous effect ──
	const last = out.effects[out.effects.length - 1]
	if (/^Return (?:that card|those cards|it|them|the exiled card) to the battlefield under (?:its|their) owners?'s? control(?: at the beginning of the next end step)?$/.test(s) && last?.e === 'exile') {
		out.effects[out.effects.length - 1] = { e: 'flicker', t: last.t, later: /next end step/.test(s) }
		return true
	}
	if (/^If it's a combat phase, you may end the combat phase$/.test(s)) {
		out.effects.push({ e: 'endCombat' })
		return true
	}
	if (/^If you cast ~ during your main phase, you may exile up to one other target (.+)$/.test(s) && last?.e === 'exile') {
		const spec = parseTarget('up to one other target ' + s.match(/target (.+)$/)![1])
		if (!spec) return false
		out.effects.push({ e: 'exile', t: addTarget(out, spec) })
		return true
	}
	if ((m = s.match(/^(.+?) you control gain protection from the color of your choice until end of turn$/))) {
		const f = parseFilter(m[1])
		if (!f) return false
		f.controller = 'you'
		out.effects.push({ e: 'protectionChoice', filter: f })
		return true
	}
	if ((m = s.match(new RegExp(`^[Gg]oad (${TGT})$`)))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'goad', t: addTarget(out, spec) })
		return true
	}
	if (/^Goad all creatures you don't control$/.test(s)) {
		out.effects.push({ e: 'goad', t: 'allOpp' })
		return true
	}
	if ((m = s.match(new RegExp(`^Assimilate (${TGT})$`)))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'assimilate', t: addTarget(out, spec) })
		return true
	}
	if (lower === 'then shuffle' || lower === 'shuffle your library' || lower === 'then shuffle your library') {
		out.effects.push({ e: 'shuffle' })
		return true
	}
	// draw
	if ((m = lower.match(/^you and target opponent each draw (a|an|one|two|three|\d+) cards?$/))) {
		addTarget(out, { kind: 'player', opponent: true })
		out.effects.push({ e: 'draw', n: num(m[1]), who: 'you' }, { e: 'draw', n: num(m[1]), who: 'target' })
		return true
	}
	if ((m = lower.match(/^(?:you )?draw (a|an|one|two|three|four|five|six|seven|x|\d+) cards?(?: and (?:you )?lose (\w+) life)?$/))) {
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
	if ((m = s.match(new RegExp(`^(Destroy|Exile) (${TGT})$`, 'i')))) {
		const spec = parseTarget(m[2])
		if (!spec || spec.kind !== 'perm') return false
		const i = addTarget(out, spec)
		out.effects.push({ e: m[1] === 'Destroy' ? 'destroy' : 'exile', t: i })
		return true
	}
	if ((m = s.match(new RegExp(`^Return (${TGT}) to (?:its owner's|their owner's|its owners'|their owners') hands?$`, 'i')))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'bounce', t: addTarget(out, spec) })
		return true
	}
	if ((m = s.match(new RegExp(`^Put (${TGT}) (?:on top|on the bottom|second from the top)? ?(?:of|into) (?:its owner's|their owner's) library(?: (second from the top|third from the top))?$`, 'i'))) || (m = s.match(new RegExp(`^Put (${TGT}) (on top|on the bottom) of (?:its owner's|their owner's) library$`, 'i')))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'tuck', t: addTarget(out, spec), where: /bottom/i.test(s) ? 'bottom' : 'top' })
		return true
	}
	if ((m = s.match(new RegExp(`^(${TGT})'s owner puts it on (?:the )?top or bottom of their library$`, 'i')))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'tuck', t: addTarget(out, spec), where: 'either' })
		return true
	}
	if ((m = s.match(new RegExp(`^(Tap|Untap) (${TGT})$`, 'i')))) {
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
	if ((m = s.match(new RegExp(`^~ deals (\\w+) damage to (any target|${TGT})$`)))) {
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
	if ((m = s.match(/^Create (a|an|one|two|three|four|five|x|X|\d+) (tapped (?:and attacking )?)?(\d+|X)\/(\d+|X) ((?:(?:white|blue|black|red|green|colorless)(?:,? and |, | )?)*)((?:[A-Z][\w'-]* )*?)(artifact )?creature tokens?(?: with ((?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible)(?:(?:,| and|, and) (?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible))*))?$/))) {
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
			attacking: /attacking/.test(m[2] ?? ''),
		})
		return true
	}
	if ((m = s.match(/^Create (a|an|one|two|three|four|five|x|\d+) (tapped )?(Treasure|Clue|Food|Map|Blood|Gold|Powerstone|Junk|Shard|Lander) tokens?$/))) {
		out.effects.push({ e: 'token', n: num(m[1]), tapped: !!m[2], name: m[3], types: `Artifact — ${m[3]}`, colors: [], keywords: [], artifact: true })
		return true
	}
	// counters
	if ((m = lower.match(new RegExp(`^put (a|an|one|two|three|four|five|x|\\d+) ([+-]1\\/[+-]1|\\w+) counters? on (${TGT}|~|it|each (.+?))$`)))) {
		const n = num(m[1])
		const kind = m[2]
		if (m[3] === '~' || m[3] === 'it') out.effects.push({ e: 'counters', n, kind, t: 'self' })
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
	if ((m = s.match(new RegExp(`^(${TGT}|~) (?:each )?gets? ([+-]\\d+)\\/([+-]\\d+)(?: and gains? ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*)? until end of turn$`, 'i')))) {
		const kws = (s.match(/gains? (.+) until/)?.[1] ?? '').toLowerCase()
		let t: number | 'self' = 'self'
		if (m[1] !== '~') {
			const spec = parseTarget(m[1].toLowerCase())
			if (!spec || spec.kind !== 'perm') return false
			t = addTarget(out, spec)
		}
		out.effects.push({ e: 'pump', p: Number(m[2]), tough: Number(m[3]), keywords: keywordList(kws), t })
		return true
	}
	if ((m = s.match(new RegExp(`^(${TGT}|~) (?:each )?gains? ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})* until end of turn$`, 'i')))) {
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
	if ((m = lower.match(/^(?:you may )?return (?:up to one )?(target .+?) card(?: with mana value (\d+) or less)? from your graveyard to (your hand|the battlefield)$/))) {
		const f = parseFilter(m[1].replace(/^target /, ''))
		if (!f) return false
		if (m[2]) f.maxMv = Number(m[2])
		out.effects.push({ e: 'returnFromGy', filter: f, dest: m[3] === 'your hand' ? 'hand' : 'battlefield', t: 0 })
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
	if ((m = s.match(/^(Untap|Tap) all (.+?)$/))) {
		const f = parseFilter(m[2])
		if (!f) return false
		out.effects.push({ e: 'tapAll', filter: f, untap: m[1] === 'Untap' })
		return true
	}
	if ((m = s.match(/^Its controller creates an? (\d+)\/(\d+) ((?:(?:white|blue|black|red|green|colorless)(?: and | )?)*)((?:[A-Z][\w'-]* )*)creature token$/))) {
		const i = out.targets.length - 1
		if (i < 0) return false
		const sub = m[4].trim()
		out.effects.push({ e: 'tokenForController', t: i, name: sub || 'Token', power: Number(m[1]), toughness: Number(m[2]), types: `Creature — ${sub}`, colors: (m[3].match(/white|blue|black|red|green/g) ?? []).map(colorLetter) })
		return true
	}
	if ((m = lower.match(/^investigate(?: (twice|three times))?$/))) {
		out.effects.push({ e: 'investigate', n: m[1] === 'twice' ? 2 : m[1] ? 3 : 1 })
		return true
	}
	if (/^(~|he|she|it) explores?$/.test(lower)) {
		out.effects.push({ e: 'explore', t: 'self' })
		return true
	}
	if ((m = lower.match(/^discover (\d+)$/))) {
		out.effects.push({ e: 'discover', n: Number(m[1]) })
		return true
	}
	if ((m = s.match(new RegExp(`^[Cc]reate a token that's a copy of (${TGT}|~)(, except (.+))?$`)))) {
		let t: number | 'self' = 'self'
		if (m[1] !== '~') {
			const spec = parseTarget(m[1])
			if (!spec || spec.kind !== 'perm') return false
			t = addTarget(out, spec)
		}
		out.effects.push({ e: 'copyToken', t, haste: /has haste/.test(m[3] ?? '') })
		return true
	}
	if (/^Exile that token at the beginning of the next end step$/.test(s)) {
		const last = out.effects[out.effects.length - 1]
		if (last?.e !== 'copyToken') return false
		last.exileAtEnd = true
		return true
	}
	if ((m = s.match(new RegExp(`^Exile (${TGT})\\. Return (?:that card|those cards|it|them) to the battlefield under (?:its|their) owners?'s? control(?: at the beginning of the next end step)?$`)))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'flicker', t: addTarget(out, spec), later: /next end step/.test(s) })
		return true
	}
	if (/^Add one mana of any color$/.test(s)) {
		out.effects.push({ e: 'addMana', n: 1 })
		return true
	}
	if ((m = s.match(new RegExp(`^Gain control of (${TGT})( until end of turn)?$`)))) {
		const spec = parseTarget(m[1])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'gainControl', t: addTarget(out, spec), eot: !!m[2] })
		return true
	}
	if (/^Untap (it|that creature)$/.test(s) && out.effects[out.effects.length - 1]?.e === 'gainControl') {
		;(out.effects[out.effects.length - 1] as { untap?: boolean }).untap = true
		return true
	}
	if ((m = s.match(new RegExp(`^(${TGT}|~) can't (be blocked|block) this turn$`, 'i')))) {
		let t: number | 'self' = 'self'
		if (m[1] !== '~') {
			const spec = parseTarget(m[1])
			if (!spec || spec.kind !== 'perm') return false
			t = addTarget(out, spec)
		}
		if (m[2] === 'block') out.effects.push({ e: 'cantBlock', t })
		else out.effects.push({ e: 'pump', p: 0, tough: 0, keywords: ['unblockable'], t })
		return true
	}
	if ((m = s.match(new RegExp(`^(~) fights (${TGT})$`)))) {
		const spec = parseTarget(m[2])
		if (!spec || spec.kind !== 'perm') return false
		out.effects.push({ e: 'fight', a: 'self', b: addTarget(out, spec) })
		return true
	}
	if ((m = s.match(new RegExp(`^Counter (target spell, activated ability, or triggered ability)$`)))) {
		out.effects.push({ e: 'counter', t: addTarget(out, { kind: 'stackAny' }) })
		return true
	}
	if ((m = lower.match(/^return (target .+?) card from your graveyard to (your hand|the battlefield)$/))) {
		const f = parseFilter(m[1].replace(/^target /, ''))
		if (!f) return false
		out.effects.push({ e: 'returnFromGy', filter: f, dest: m[2] === 'your hand' ? 'hand' : 'battlefield', t: 0 })
		return true
	}
	// "A and B" / "A, then B": both halves on their own
	for (const sep of [', then ', ' and then ', ', and ', ' and ', ', ']) {
		const i = s.indexOf(sep)
		if (i <= 0) continue
		const a = s.slice(0, i)
		let b = s.slice(i + sep.length)
		if (/^(you |each |target )?(draw|create|gain|lose|put|discard|scry|surveil|mill|untap|tap|exile|destroy|return|investigate|explore|shuffle)/i.test(b)) {
			b = /^(draw|create|gain|lose|put|discard|scry|surveil|mill|untap|tap|exile|destroy|return|investigate|shuffle)/i.test(b) ? b : b
			const save = { t: out.targets.length, e: out.effects.length }
			if (compileSentence(a, out, defName) && compileSentence(b[0].toUpperCase() + b.slice(1), out, defName)) return true
			out.targets.length = save.t
			out.effects.length = save.e
		}
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
		else if (/^Tap an untapped creature you control$/.test(p)) c.tapOther = true
		else if (/^Sacrifice (?:a|an|another) (.+)$/.test(p) && parseFilter(p.replace(/^Sacrifice (?:a|an|another) /, ''))) c.sacrifice = parseFilter(p.replace(/^Sacrifice (?:a|an|another) /, ''))!
		else if (/^Remove a counter from ~$/.test(p)) c.removeCounters = { n: 1 }
		else if (/^Remove (a|an|one|two|three) ([+-]1\/[+-]1|\w+) counters? from ~$/.test(p)) {
			const mm = p.match(/^Remove (\w+) ([+-]1\/[+-]1|\w+) counters? from ~$/)!
			c.removeCounters = { n: num(mm[1]) as number, kind: mm[2] }
		} else if (/^Remove (a|an|one|two|three) ([+-]1\/[+-]1|\w+) counters? from among creatures you control$/.test(p)) {
			const mm = p.match(/^Remove (\w+) ([+-]1\/[+-]1|\w+) counters? from among/)!
			c.removeCounters = { n: num(mm[1]) as number, kind: mm[2], fromAmong: true }
		}
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
	if (/^Choose a color\. Add one mana of that color for each charge counter on ~(\. Spend this mana only to cast your commander)?$/.test(body)) return { kind: 'charge', mana: ['W', 'U', 'B', 'R', 'G'], amount: 0, sameColor: true, pain }
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
		else if (/^(basic landcycling|landcycling|multikicker|squad|suspend)\b/.test(p)) out.push(p.split(/ [{\d]/)[0])
		else if (/^affinity for \w+$/.test(p)) out.push(p)
		else if (/^(equip|crew|cycling|kicker|flashback|ninjutsu|landwalk|plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|toxic \d+|annihilator \d+|afflict \d+|bushido \d+|rampage \d+|bloodthirst \d+|modular \d+)\b/.test(p)) out.push(p.split(' ')[0])
		else if (/^affinity for artifacts$/.test(p)) out.push('affinity for artifacts')
		else return null
	}
	return out
}

const cache = new Map<string, Rules>()

/** Card scripts (named.ts) that replace a parsed triggered ability: card name → which trigger → effect. */
export interface TriggerOverride {
	events: TriggerEvent[]
	compiled: Compiled
}
const overrides = new Map<string, TriggerOverride[]>()
export function overrideTrigger(card: string, o: TriggerOverride) {
	overrides.set(card, [...(overrides.get(card) ?? []), o])
	cache.clear()
}

/** Card scripts that adjust the parsed rules directly (add a trigger, script an activated ability, …). */
const patches = new Map<string, ((r: Rules) => void)[]>()
export function patchRules(card: string, f: (r: Rules) => void) {
	patches.set(card, [...(patches.get(card) ?? []), f])
	cache.clear()
}

/** Every triggered and activated ability is scripted or compiled. */
export function allCompiled(r: Rules): boolean {
	return r.triggers.every((t) => t.compiled && !t.conditional) && r.activated.every((a) => a.compiled || a.station) && !r.chapters?.some((c) => !c.compiled)
}

export function rulesFor(def: CardDef, flipped = false): Rules {
	const key = def.id + (flipped ? '#back' : '')
	const hit = cache.get(key)
	if (hit) return hit
	const face = flipped && def.back ? def.back : def
	const r = parse({ name: face.name, oracle: face.oracle, typeLine: face.typeLine })
	for (const o of overrides.get(face.name) ?? []) {
		let hit = false
		for (const t of r.triggers)
			if (o.events.includes(t.event)) {
				t.compiled = o.compiled
				t.conditional = false
				hit = true
			}
		// the script stands for an ability the parser didn't recognise at all: add it
		if (!hit) {
			const word: Partial<Record<TriggerEvent, RegExp>> = { attacks: /attack/i, etb: /enter/i, dies: /dies/i, landfall: /land/i, upkeep: /upkeep/i, endStep: /end step/i }
			for (const event of o.events) {
				const line = face.oracle.split('\n').find((l) => word[event]?.test(l)) ?? face.name
				r.triggers.push({ index: r.triggers.length, event, text: line, effectText: '', compiled: o.compiled })
			}
		}
	}
	if (overrides.has(face.name)) r.fullyAutomated = r.triggers.every((t) => t.compiled) && (r.fullyAutomated || r.triggers.length > 0)
	for (const f of patches.get(face.name) ?? []) f(r)
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
	const handle = (line0: string, index: number): void => {
		const line = stripAbilityWord(line0)
		if (/^Station\b/.test(line)) {
			const cm = line.match(/artifact creature at (\d+)\+/)
			if (cm) r.stationCreatureAt = Number(cm[1])
			r.activated.push({
				index,
				text: 'Station',
				station: true,
				sorcery: true,
				oncePerTurn: false,
				cost: { mana: '', tap: false, sacrificeSelf: false, life: 0 },
				effectText: 'Tap another creature you control: put charge counters equal to its power on this.',
				compiled: { targets: [], effects: [] },
			})
			return
		}
		const plain = stripReminder(line)
		if (!plain) {
			// pure reminder text line, e.g. a basic land "({T}: Add {G}.)"
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
			let km: RegExpMatchArray | null
			const costOf = (re: RegExp) => plain.match(re)?.[1]
			if ((km = plain.match(/^Affinity for (\w+?)s?$/i)) && km[1].toLowerCase() !== 'artifact') r.selfReduce = { filter: { types: [], not: [], subtypes: [km[1].toLowerCase()], controller: 'you' }, mine: true }
			r.kicker = costOf(/^Kicker ((?:\{[^}]+\})+)/) ?? r.kicker
			r.multikicker = costOf(/^Multikicker ((?:\{[^}]+\})+)/) ?? r.multikicker
			r.squad = costOf(/^Squad ((?:\{[^}]+\})+)/) ?? r.squad
			r.flashback = costOf(/^Flashback ((?:\{[^}]+\})+)/) ?? r.flashback
			if ((km = plain.match(/^(Basic landcycling|Cycling) ((?:\{[^}]+\})+)/))) r.cycling = { cost: km[2], basic: km[1] !== 'Cycling' }
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
		if ((m = plain.match(/^Equipped creature gets ([+-]\d+)\/([+-]\d+) and has "(Whenever this creature attacks), (.+)"$/))) {
			r.statics.push({ kind: 'equip', power: Number(m[1]), toughness: Number(m[2]), keywords: [] })
			const compiled = compile(m[4], def.name)
			r.triggers.push({ index, event: 'attacks', text: line, effectText: m[4], compiled, equipped: true })
			if (!compiled) r.fullyAutomated = false
			return
		}
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
		if ((m = plain.match(new RegExp(`^(.+?) you control( with counters on them)? have ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*\\.$`)))) {
			const f = parseFilter(m[1] + (m[2] ?? ''))
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
		// saga chapters
		if ((m = plain.match(/^((?:[IVX]+)(?:, [IVX]+)*) \u2014 (.+)$/))) {
			const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }
			const compiled = compile(m[2], def.name)
			;(r.chapters ??= []).push({ nums: m[1].split(', ').map((x) => roman[x] ?? 0), text: m[2], compiled })
			if (!compiled) r.fullyAutomated = false
			return
		}
		// simple statics
		if (/^You have no maximum hand size\.$/.test(plain)) return void (r.noMaxHandSize = true)
		if (/^Whenever a creature you control attacks, it gets \+1\/\+0 until end of turn for each other attacking creature that shares a creature type with it\.$/.test(plain)) return void (r.sharedAnimosity = true)
		if (/^Players can't activate planeswalkers' loyalty abilities\.$/.test(plain)) return
		if (/^You may play an additional land on each of your turns\.$/.test(plain)) return void (r.extraLand = true)
		if (/^~ can't block\.$/.test(plain)) return void (r.cantBlock = true)
		if (/^~ can't be blocked\.$/.test(plain)) return void (r.unblockable = true)
		if (/^~ can't be blocked if you control a Spacecraft\.$/.test(plain)) return void (r.unblockable = 'ifSpacecraft')
		if ((m = plain.match(/^~ can't be blocked by creatures with power (\d+) or less\.$/))) return void (r.evasionPower = Number(m[1]))
		if (/^~ attacks each combat if able\.$/.test(plain)) return void (r.mustAttack = true)
		if ((m = plain.match(/^(.+?) spells you cast cost \{(\d+)\} less to cast\.$/))) {
			const f = parseFilter(m[1].replace(/ spells and /, ' and '))
			if (f) return void (r.costReduction = { filter: f, n: Number(m[2]) })
		}
		if ((m = plain.match(/^~ costs \{1\} less to cast for each (.+?) on the battlefield\.$/))) {
			const f = parseFilter(m[1])
			if (f) return void (r.selfReduce = { filter: f })
		}
		if ((m = plain.match(/^As an additional cost to cast ~, (.+)\.$/))) {
			const c = m[1]
			if (/^discard a card$/.test(c)) r.extraCost = { discard: 1 }
			else if (/^pay X life$/.test(c)) r.extraCost = { lifeX: true }
			else if ((m = c.match(/^discard a card or pay (\d+) life$/))) r.extraCost = { discard: 1, orLife: Number(m[1]) }
			else if ((m = c.match(/^sacrifice an? (.+)$/)) && parseFilter(m[1])) r.extraCost = { sacrifice: parseFilter(m[1])! }
			else r.fullyAutomated = false
			return
		}
		if ((m = plain.match(/^~ enters with (a|an|one|two|three|four|five|x|\d+) ([+-]1\/[+-]1|\w+) counters? on it\.$/i))) {
			const n = num(m[1])
			return void (r.entersWith = { kind: m[2].toLowerCase(), n })
		}
		if ((m = plain.match(/^~ enters with an? (\w+|[+-]1\/[+-]1) counter on it for each time it was kicked\.$/))) return void (r.entersWith = { kind: m[1], n: 'kicked' })
		// granted triggered abilities: Artifact creatures you control have "Whenever this creature …"
		if ((m = plain.match(/^(.+?) you control have "(.+)"\.?$/))) {
			const f = parseFilter(m[1])
			const inner = m[2].replace(/\.$/, '.').replace(/\bthis creature\b/g, SELF)
			if (f && /^(When|Whenever|At) /.test(inner)) {
				f.controller = 'you'
				const t0 = r.triggers.length
				handle(inner, index)
				const added = r.triggers.slice(t0)
				if (added.length) {
					added.forEach((t) => (t.granted = f))
					return
				}
			}
		}
		// triggers
		if ((m = plain.match(/^(When|Whenever|At) ([^,]+), (.+)$/))) {
			const cond = m[2]
			let effectText = m[3]
			let event: TriggerEvent | null = null
			let filter: Filter | undefined
			let fm: RegExpMatchArray | null
			if (/^~ enters or attacks$/.test(cond)) {
				const compiled = conditional0(effectText) ? null : compile(effectText, def.name)
				r.triggers.push({ index, event: 'etb', text: line, effectText, compiled }, { index, event: 'attacks', text: line, effectText, compiled })
				if (!compiled) r.fullyAutomated = false
				return
			}
			let kicked = false
			if (/^if it was kicked, /.test(effectText)) {
				kicked = true
				effectText = effectText.replace(/^if it was kicked, /, '')
			}
			let who: Trigger['who']
			if ((fm = cond.match(/^~ or another (.+?) you control enters$/))) {
				const ff = parseFilter(fm[1] + ' you control')
				const compiled = compile(effectText, def.name)
				if (ff) {
					ff.other = true
					r.triggers.push({ index, event: 'etb', text: line, effectText, compiled }, { index, event: 'otherEtb', text: line, effectText, compiled, filter: ff })
					if (!compiled) r.fullyAutomated = false
					return
				}
			}
			let equipped = false
			if ((fm = cond.match(/^equipped creature (dies|attacks|deals combat damage to a player)$/))) {
				equipped = true
				event = fm[1] === 'dies' ? 'dies' : fm[1] === 'attacks' ? 'attacks' : 'combatDamagePlayer'
			} else if (/^one or more creatures attack$/.test(cond)) event = 'youAttack'
			else if (/^the beginning of your draw step$/.test(cond)) event = 'yourDraw'
			else if (/^the beginning of each player's draw step$/.test(cond)) event = 'eachDraw'
			else if (/^you draw your second card each turn$/.test(cond)) event = 'secondDraw'
			else if ((fm = cond.match(/^(you|an opponent) casts? (?:a|an) ?(.*?) ?spell$/))) {
				const ff = parseFilter(fm[2] || 'card')
				if (ff) {
					event = 'castSpell'
					filter = ff
					who = fm[1] === 'you' ? 'you' : 'opp'
				}
			} else if ((fm = cond.match(/^(another|a) (.+?) you control dies$/))) {
				const ff = parseFilter(fm[2] + ' you control')
				if (ff) {
					if (fm[1] === 'another') ff.other = true
					event = 'otherDies'
					filter = ff
				}
			} else if (/^you gain life$/.test(cond)) event = 'gainLife'
			else if (/^~ becomes tapped$/.test(cond)) event = 'tapped'
			else if (/^the beginning of each upkeep$/.test(cond) || /^the beginning of each player's upkeep$/.test(cond)) event = 'eachUpkeep'
			else if (/^the beginning of each player's end step$/.test(cond)) event = 'eachEndStep'
			else if ((fm = cond.match(/^one or more (.+?) you control deal combat damage to a player$/))) {
				const ff = parseFilter(fm[1] + ' you control')
				if (ff) {
					event = 'teamDamage'
					filter = ff
				}
			}
			else if (/^you attack$/.test(cond)) event = 'youAttack'
			else if (/^~ enters$/.test(cond) || /^~ enters the battlefield$/.test(cond)) event = 'etb'
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
				if (compiled && kicked) compiled.ifKicked = true
				r.triggers.push({ index, event, text: line, effectText, compiled, filter, conditional, who, equipped: equipped || undefined })
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
			let lm: RegExpMatchArray | null
			if (cost && (lm = eff.match(/\s*Activate only if you control (five|four|seven|\w+) or more lands\.$/))) {
				cost.needLands = num(lm[1]) as number
				eff = eff.replace(lm[0], '')
			}
			if (cost && /\s*Activate only if you control an artifact\.$/.test(eff)) {
				cost.needArtifact = true
				eff = eff.replace(/\s*Activate only if you control an artifact\.$/, '')
			}
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
	}
	let threshold: number | undefined
	lines.forEach((line, index) => {
		const th = line.match(/^(\d+)\+ \| (.+)$/)
		if (th) threshold = Number(th[1])
		if (threshold === undefined) return handle(line, index)
		const k0 = r.keywords.length
		const s0 = r.statics.length
		const t0 = r.triggers.length
		const a0 = r.activated.length
		handle(th ? th[2] : line, index)
		const n = threshold
		const newK = r.keywords.splice(k0)
		if (newK.length) (r.thresholdKeywords ??= []).push({ n, keywords: newK })
		r.statics.slice(s0).forEach((x) => (x.threshold = n))
		r.triggers.slice(t0).forEach((x) => (x.threshold = n))
		r.activated.slice(a0).forEach((x) => (x.threshold = n))
	})
	if (isSpell) {
		const head = spellLines.findIndex((l) => /^Choose (one|two|one or both|one or more)\b/.test(l))
		if (head >= 0) {
			const h = spellLines[head]
			const n = /^Choose two/.test(h) ? 2 : /^Choose one or both/.test(h) ? 2 : /If you control a commander/.test(h) ? 1 : 1
			const modes = spellLines.slice(head + 1).filter((l) => l.startsWith('\u2022')).map((l) => {
				const text = l.replace(/^\u2022\s*/, '')
				return { text, compiled: compile(text, def.name) }
			})
			r.modal = { n, upTo: /one or both/.test(h), modes }
			if (modes.some((x) => !x.compiled)) r.fullyAutomated = false
			r.spellText = spellLines.join(' ')
			r.spell = { targets: [], effects: [] }
		} else {
			r.spellText = spellLines.join(' ').replace(/\s*~ can't be countered\.\s*/, ' ').trim()
			r.spell = r.spellText ? compile(r.spellText, def.name) : null
			if (!r.spell) r.fullyAutomated = false
		}
	}
	r.hasX = /\{X\}/.test(def.oracle)
	return r
}

const conditional0 = (t: string) => /^if /i.test(t)

export function hasType(r: Rules, t: string): boolean {
	return r.types.includes(t)
}
