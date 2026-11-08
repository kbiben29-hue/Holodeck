// Core types for the Holodeck rules engine (Magic: The Gathering, Commander, two players).
// The engine is pure: GameState is plain JSON, `apply(state, intent)` returns a new state.

export type Color = 'W' | 'U' | 'B' | 'R' | 'G'
export type Mana = Color | 'C'
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G']
export const MANA: Mana[] = ['W', 'U', 'B', 'R', 'G', 'C']

export interface CardFace {
	name: string
	manaCost: string
	typeLine: string
	oracle: string
	power?: string
	toughness?: string
	loyalty?: string
	image?: string
}

/** One card's printed information (from Scryfall, or a stand-in in tests). */
export interface CardDef {
	id: string
	name: string
	manaCost: string
	cmc: number
	typeLine: string
	oracle: string
	power?: string
	toughness?: string
	loyalty?: string
	colors: Color[]
	identity: Color[]
	/** Keyword abilities, lower case ("flying", "first strike"…). */
	keywords: string[]
	/** Colours of mana the card can produce (Scryfall produced_mana). */
	produces?: Mana[]
	image?: string
	/** Second face of a double-faced card. */
	back?: CardFace
	layout?: string
	/** Ids of token cards this card can make. */
	tokens?: string[]
	isToken?: boolean
	/** True for a card the app could not find (only its name is known). */
	missing?: boolean
}

export type Zone = 'library' | 'hand' | 'graveyard' | 'exile' | 'command' | 'battlefield' | 'stack'

/** A card in a hidden or non-battlefield zone. */
export interface Obj {
	iid: number
	card: string
	owner: number
	token?: boolean
	commander?: boolean
}

export interface Mod {
	power: number
	toughness: number
	keywords?: string[]
	/** 'eot' = until end of turn; 'perm' = until removed with the table tools. */
	until: 'eot' | 'perm'
	note?: string
}

/** A permanent on the battlefield. */
export interface Perm extends Obj {
	controller: number
	tapped: boolean
	/** Came under its controller's control this turn (summoning sickness). */
	sick: boolean
	counters: Record<string, number>
	damage: number
	/** Damage from a source with deathtouch this turn. */
	deathtouched?: boolean
	attachedTo?: number
	/** Showing its back face. */
	flipped?: boolean
	faceDown?: boolean
	mods: Mod[]
	/** Number of this turn's activations of each once-per-turn ability. */
	used?: Record<string, number>
}

export interface Target {
	kind: 'perm' | 'player' | 'stack'
	id: number
}

export interface StackItem {
	sid: number
	kind: 'spell' | 'ability' | 'trigger'
	controller: number
	/** The card (for a spell) or the source card (for an ability). */
	card: string
	/** The spell's object (for spells) or the source permanent's iid. */
	iid: number
	obj?: Obj
	/** Text shown for the item. */
	text: string
	/** Index of the parsed ability (abilities/triggers). */
	ability?: number
	targets: Target[]
	x?: number
	/** Copy of the spell. */
	copy?: boolean
	/** Cast from the command zone. */
	fromCommand?: boolean
	/** The item can only be done by hand (the engine can't do its effect). */
	manual?: boolean
	/** The source showed its back face. */
	flipped?: boolean
}

export interface PlayerState {
	name: string
	life: number
	poison: number
	library: Obj[]
	hand: Obj[]
	graveyard: Obj[]
	exile: Obj[]
	command: Obj[]
	pool: Record<Mana, number>
	landsPlayed: number
	/** Times each commander (by card id) has been cast from the command zone. */
	commanderCasts: Record<string, number>
	/** Combat damage taken from each commander (by card id). */
	commanderDamage: Record<string, number>
	mulligans: number
	kept: boolean
	lost?: string
	/** Card ids of this player's commanders. */
	commanders: string[]
	identity: Color[]
	/** Looked-at top cards (only shown to this player). */
	peek?: number
	bot?: boolean
}

export type Step =
	| 'mulligan'
	| 'untap'
	| 'upkeep'
	| 'draw'
	| 'main1'
	| 'beginCombat'
	| 'attackers'
	| 'blockers'
	| 'firstDamage'
	| 'damage'
	| 'endCombat'
	| 'main2'
	| 'end'
	| 'cleanup'

export interface Combat {
	attackers: { iid: number; defender: number }[]
	/** blocker iid -> attacker iid */
	blocks: { blocker: number; attacker: number }[]
	declared: boolean
	blocksDeclared: boolean
	firstStrikeDone: boolean
}

export interface ChoiceOption {
	id: string
	label: string
	/** Card shown for the option. */
	card?: string
	iid?: number
	score?: number
}

export interface Question {
	key: string
	prompt: string
	options: ChoiceOption[]
	min: number
	max: number
	/** Show the options as cards (e.g. a library search). */
	cards?: boolean
	/** Order matters (scry: choose cards to keep on top, in order). */
	ordered?: boolean
}

export type Pending =
	| { kind: 'mulligan'; player: number }
	| { kind: 'bottom'; player: number; count: number }
	| { kind: 'priority'; player: number }
	| { kind: 'attackers'; player: number }
	| { kind: 'blockers'; player: number }
	| { kind: 'choose'; player: number; question: Question; task: number }
	| { kind: 'discard'; player: number; count: number }
	| { kind: 'over'; winner: number | null }

export interface Task {
	tid: number
	kind: 'cast' | 'resolve' | 'activate' | 'trigger' | 'script'
	player: number
	/** Recorded answers, keyed by question key. */
	answers: Record<string, string[]>
	data: Record<string, unknown>
}

export interface Format {
	id: 'duel' | 'oneVsOne' | 'classic'
	name: string
	life: number
	commanderDamage: boolean
	/** The first mulligan is free (Commander rule 103.5c applies to multiplayer; on by default). */
	freeMulligan: boolean
}

export interface GameState {
	v: 1
	seed: number
	rng: number
	format: Format
	players: PlayerState[]
	battlefield: Perm[]
	stack: StackItem[]
	turn: number
	active: number
	step: Step
	/** Players who passed priority in a row with the stack unchanged. */
	passes: number
	pending: Pending
	combat: Combat | null
	tasks: Task[]
	nextId: number
	log: string[]
	cards: Record<string, CardDef>
	/** Short note shown to everyone (e.g. "Do this by hand: …"). */
	notice?: { player: number; text: string; card?: string } | null
	/** First player to act skips their first draw. */
	firstPlayer: number
	/** Number of free (land-or-not) state changes, to stop runaway loops. */
	ticks: number
}

export interface DeckList {
	name: string
	commanders: string[]
	/** Card names with counts (not including commanders). */
	cards: { name: string; count: number }[]
}

// ───────── intents ─────────

export type ManualOp =
	| { op: 'move'; iid: number; to: Zone | 'libraryBottom'; player?: number }
	| { op: 'tap'; iid: number; tapped: boolean }
	| { op: 'counter'; iid: number; kind: string; delta: number }
	| { op: 'life'; player: number; delta: number }
	| { op: 'poison'; player: number; delta: number }
	| { op: 'commanderDamage'; player: number; card: string; delta: number }
	| { op: 'token'; player: number; card: string; count: number; tapped?: boolean }
	| { op: 'customToken'; player: number; name: string; power: number; toughness: number; types: string; count: number; keywords?: string[] }
	| { op: 'draw'; player: number; count: number }
	| { op: 'mill'; player: number; count: number }
	| { op: 'shuffle'; player: number }
	| { op: 'control'; iid: number; player: number }
	| { op: 'flip'; iid: number }
	| { op: 'attach'; iid: number; to: number | null }
	| { op: 'pt'; iid: number; power: number; toughness: number; until: 'eot' | 'perm' }
	| { op: 'clearMods'; iid: number }
	| { op: 'mana'; player: number; mana: Mana; delta: number }
	| { op: 'untapAll'; player: number }
	| { op: 'peek'; player: number; count: number }
	| { op: 'damage'; iid: number; delta: number }
	| { op: 'copySpell'; sid: number }
	| { op: 'counterSpell'; sid: number }
	| { op: 'sick'; iid: number; sick: boolean }

export type Intent =
	| { type: 'keep'; player: number }
	| { type: 'mulligan'; player: number }
	| { type: 'bottom'; player: number; iids: number[] }
	| { type: 'playLand'; player: number; iid: number; back?: boolean }
	| { type: 'cast'; player: number; iid: number; back?: boolean }
	| { type: 'activate'; player: number; iid: number; ability: number }
	| { type: 'tapForMana'; player: number; iid: number; ability: number; color?: Mana }
	| { type: 'pass'; player: number }
	| { type: 'attack'; player: number; attackers: number[] }
	| { type: 'block'; player: number; blocks: { blocker: number; attacker: number }[] }
	| { type: 'choose'; player: number; picks: string[] }
	| { type: 'discard'; player: number; iids: number[] }
	| { type: 'concede'; player: number }
	| { type: 'manual'; player: number; m: ManualOp }
	| { type: 'resolveManual'; player: number }
