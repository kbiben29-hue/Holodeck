// Loads card details and images from Scryfall (https://scryfall.com/docs/api) on the player's own
// device, prefers the Star Trek printings, and keeps them in localStorage. No card data ships with
// the app. Scryfall allows browser requests (CORS); we stay well under its rate limit.

import type { CardDef, CardFace, Color, Mana } from '../engine/types'

const API = 'https://api.scryfall.com'
const CACHE = 'holodeck.cards.v1'
const MAX_AGE = 7 * 24 * 3600 * 1000

export const slug = (n: string) =>
	n
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

interface SfFace {
	name: string
	mana_cost?: string
	type_line?: string
	oracle_text?: string
	power?: string
	toughness?: string
	loyalty?: string
	colors?: string[]
	image_uris?: { normal?: string; small?: string; large?: string }
}
interface SfCard extends SfFace {
	id: string
	layout: string
	cmc: number
	color_identity: string[]
	keywords?: string[]
	produced_mana?: string[]
	set: string
	set_name: string
	card_faces?: SfFace[]
	all_parts?: { id: string; component: string; name: string; type_line: string }[]
}

export interface CardPool {
	cards: Record<string, CardDef>
	/** Names that could not be found. */
	missing: string[]
	loadedAt: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(url: string, body?: unknown): Promise<any> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) } : { headers: { Accept: 'application/json' } })
		if (res.status === 429) {
			await sleep(1000 * (attempt + 1))
			continue
		}
		if (res.status === 404) return null
		if (!res.ok) throw new Error(`Scryfall: ${res.status}`)
		return res.json()
	}
	throw new Error('Scryfall is busy, try again in a minute')
}

const faceOf = (f: SfFace): CardFace => ({
	name: f.name,
	manaCost: f.mana_cost ?? '',
	typeLine: f.type_line ?? '',
	oracle: f.oracle_text ?? '',
	power: f.power,
	toughness: f.toughness,
	loyalty: f.loyalty,
	image: f.image_uris?.normal,
})

export function toDef(c: SfCard, isToken = false): CardDef {
	const faces = c.card_faces ?? []
	const twoFaced = faces.length === 2 && ['transform', 'modal_dfc', 'double_faced_token', 'flip', 'meld', 'reversible_card'].includes(c.layout)
	const front: SfFace = faces.length ? { ...faces[0], image_uris: faces[0].image_uris ?? c.image_uris } : c
	const name = twoFaced || !faces.length ? front.name : c.name
	// split/adventure cards keep both halves' text on one face
	const oracle = faces.length && !twoFaced ? faces.map((f) => f.oracle_text ?? '').join('\n') : (front.oracle_text ?? '')
	return {
		id: isToken ? `token:${c.id}` : slug(c.name.split(' // ')[0]),
		name,
		manaCost: front.mana_cost ?? c.mana_cost ?? '',
		cmc: c.cmc ?? 0,
		typeLine: front.type_line ?? c.type_line ?? '',
		oracle,
		power: front.power,
		toughness: front.toughness,
		loyalty: front.loyalty,
		colors: ((front.colors ?? c.colors ?? []) as Color[]).filter((x) => 'WUBRG'.includes(x)),
		identity: (c.color_identity ?? []) as Color[],
		keywords: (c.keywords ?? []).map((k) => k.toLowerCase()),
		produces: (c.produced_mana ?? []).filter((m) => 'WUBRGC'.includes(m)) as Mana[],
		image: front.image_uris?.normal ?? c.image_uris?.normal,
		back: twoFaced ? faceOf(faces[1]) : undefined,
		layout: c.layout,
		tokens: (c.all_parts ?? []).filter((p) => p.component === 'token').map((p) => `token:${p.id}`),
		isToken: isToken || undefined,
	}
}

function readCache(): CardPool | null {
	try {
		const raw = localStorage.getItem(CACHE)
		if (!raw) return null
		const p = JSON.parse(raw) as CardPool
		return p && p.cards ? p : null
	} catch {
		return null
	}
}

function writeCache(p: CardPool) {
	try {
		localStorage.setItem(CACHE, JSON.stringify(p))
	} catch {
		/* storage full: keep it in memory only */
	}
}

export function cachedPool(): CardPool | null {
	return readCache()
}

/** Find the Star Trek sets (main set, Commander decks, tokens) so we can prefer their printings. */
async function starTrekSets(): Promise<string[]> {
	try {
		const j = await getJson(`${API}/sets`)
		const sets = (j?.data ?? []) as { code: string; name: string; set_type: string }[]
		const st = sets.filter((x) => /star trek/i.test(x.name))
		// commander decks first, then the main set, then the rest
		st.sort((a, b) => (a.set_type === 'commander' ? 0 : a.set_type === 'expansion' ? 1 : 2) - (b.set_type === 'commander' ? 0 : b.set_type === 'expansion' ? 1 : 2))
		return st.map((x) => x.code)
	} catch {
		return []
	}
}

/**
 * Load every named card (and the tokens they make). `progress` gets a 0–1 fraction.
 * Uses the cache when it's fresh and has every name.
 */
export async function loadCards(names: string[], progress?: (f: number, text: string) => void, force = false): Promise<CardPool> {
	const cached = readCache()
	const want = names.map((n) => slug(n))
	if (!force && cached && Date.now() - cached.loadedAt < MAX_AGE && want.every((id) => cached.cards[id])) return cached
	progress?.(0.02, 'Finding the Star Trek sets…')
	const sets = await starTrekSets()
	const found = new Map<string, SfCard>()
	let todo = names.slice()
	const batches = (arr: unknown[]) => Math.ceil(arr.length / 75)
	let done = 0
	const totalSteps = batches(todo) * (sets.length + 1) + 4
	const step = (text: string) => progress?.(Math.min(0.95, ++done / totalSteps), text)
	// pass 1..n: the Star Trek printing; last pass: any printing
	for (const set of [...sets.slice(0, 2), null]) {
		if (!todo.length) break
		const next: string[] = []
		for (let i = 0; i < todo.length; i += 75) {
			const chunk = todo.slice(i, i + 75)
			step(`Loading cards (${found.size}/${names.length})…`)
			const j = await getJson(`${API}/cards/collection`, { identifiers: chunk.map((name) => (set ? { name, set } : { name })) })
			for (const c of (j?.data ?? []) as SfCard[]) {
				const key = chunk.find((n) => slug(n) === slug(c.name.split(' // ')[0]) || slug(n) === slug(c.name))
				if (key) found.set(key, c)
			}
			for (const nf of (j?.not_found ?? []) as { name: string }[]) next.push(nf.name)
			await sleep(120)
		}
		todo = next
	}
	// fuzzy lookups for anything still missing (names we may have spelled differently)
	const missing: string[] = []
	for (const n of todo) {
		step(`Looking up ${n}…`)
		const c = (await getJson(`${API}/cards/named?fuzzy=${encodeURIComponent(n)}`)) as SfCard | null
		if (c) found.set(n, c)
		else missing.push(n)
		await sleep(120)
	}
	const cards: Record<string, CardDef> = {}
	for (const [n, c] of found) {
		const d = toDef(c)
		d.id = slug(n) // keep the decklist's id even if Scryfall spells it differently
		cards[d.id] = d
	}
	// tokens
	const tokenIds = [...new Set(Object.values(cards).flatMap((c) => c.tokens ?? []))].map((t) => t.replace('token:', ''))
	for (let i = 0; i < tokenIds.length; i += 75) {
		step('Loading tokens…')
		const j = await getJson(`${API}/cards/collection`, { identifiers: tokenIds.slice(i, i + 75).map((id) => ({ id })) })
		for (const c of (j?.data ?? []) as SfCard[]) {
			const d = toDef(c, true)
			cards[d.id] = d
		}
		await sleep(120)
	}
	const pool: CardPool = { cards, missing, loadedAt: Date.now() }
	writeCache(pool)
	progress?.(1, 'Cards ready')
	return pool
}

/** A stand-in for a card that couldn't be loaded: just its name. */
export function missingDef(name: string): CardDef {
	return { id: slug(name), name, manaCost: '', cmc: 0, typeLine: 'Card', oracle: 'This card could not be loaded. Use the table tools to play it.', colors: [], identity: [], keywords: [], missing: true }
}
