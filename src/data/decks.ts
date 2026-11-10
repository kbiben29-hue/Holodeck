// The four Magic: The Gathering | Star Trek Commander decks (official decklists, Nov 2026).
// Names only; card details and images are loaded from Scryfall on the player's device.

export interface StarterDeck {
	id: string
	name: string
	colors: string
	commander: string
	/** The deck's other legendary that can lead it instead. */
	alt: string
	cards: string[]
	basics: [string, number][]
}

const split = (s: string) =>
	s
		.split('\n')
		.map((x) => x.trim())
		.filter(Boolean)

export const DECKS: StarterDeck[] = [
	{
		id: 'federation',
		name: 'Federation Fleet',
		colors: 'WUR',
		commander: 'Jean-Luc Picard, Luminary',
		alt: 'Captain Janeway, Endgame',
		basics: [['Island', 5], ['Plains', 4], ['Mountain', 4]],
		cards: split(`
Captain Janeway, Endgame
Ambassador K'Ehleyr
Beverly Crusher, Ship's Doctor
Dr. Pulaski, Cynical Clinician
Ensign Harry Kim, Operations
Ezri Dax, Newly Joined
Guinan, Ancient Advisor
Julian Bashir, Frontier Doctor
Spot, Felis catus
U.S.S. Enterprise-E, Sovereign
Chief Miles O'Brien
Data, Exploring Humanity
Geordi La Forge, Innovator
Kes, Evolving Telepath
On the Shoulders of Giants
Seven of Nine, Tertiary Adjunct
Temporal Tribulation
Tuvok, Chief Tactical Officer
Ro Laren, Double Agent
Rom and Leeta, Unlikely Pair
B'Elanna Torres, Scrapper
Cmdr. Troi, Outgoing Empath
Commander William Riker
Reg Barclay, Fidgety Fantasist
Tom Paris, Risk-Taker
Unification
Vic Fontaine, One Night Only
Worf, Son of Mogh
U.S.S. Defiant, Tough Little Ship
U.S.S. Enterprise-C, Time-Tossed
U.S.S. Prometheus, Prototype
U.S.S. Stargazer, Here and There
Grand Crescendo
Loran of the Third Path
Promise of Loyalty
Cryptic Command
Chain Reaction
Fevered Visions
Fractured Identity
Supreme Verdict
Alhammarret's Archive
Howling Mine
Battlefield Forge
Clifftop Retreat
Coastal Peak
Command Beacon
Desolate Lighthouse
Exotic Orchard
Fabled Passage
Frostboil Snarl
Furycalm Snarl
Glacial Fortress
Glittering Massif
Irrigated Farmland
Port Town
Prairie Stream
Radiant Summit
Scorched Geyser
Sulfur Falls
Training Center
Malfunctioning Holodeck
Chronomantic Escape
Swords to Plowshares
Frantic Search
Negate
Pongify
Abrade
Thrill of Possibility
Faithful Mending
Arcane Signet
Commander's Sphere
Hedron Archive
Mind Stone
Sol Ring
Stonespeaker Crystal
Talisman of Conviction
Talisman of Creativity
Talisman of Progress
Thought Vessel
Command Tower
Evolving Wilds
Mystic Monastery
Path of Ancestry
Perilous Landscape
Reliquary Tower
Terramorphic Expanse`),
	},
	{
		id: 'landing',
		name: 'Landing Party',
		colors: 'GWU',
		commander: 'Commander Spock',
		alt: 'Captain Kirk, Boldly Going',
		basics: [['Forest', 4], ['Plains', 2], ['Island', 2]],
		cards: split(`
Captain Kirk, Boldly Going
Balance of Terror
Merciful Mandate
M'Ress, Crew Coordinator
Shuttlecraft Galileo
Tribble Cluster
Colossal Clone Master
Fleet Captain Christopher Pike
Giant Space Amoeba
Lieutenant Nyota Uhura
Sam Kirk, Xenoanthropologist
Temporal Tribulation
Amanda Grayson, Logic's Link
Christine Chapel, Combat Medic
Janice Rand, Essential Aide
Lieutenant Hikaru Sulu
Chief Kyle, Transporter Tech
Chief Montgomery Scott
Lt. Arex, Ever-Adapting
McCoy, Not a Bricklayer
Pavel Chekov, First Posting
T'Pring, Never Parted
Command Chair
The Guardian of Forever
Jefferies Tube
Planet Killer
S.S. Botany Bay
Starfleet Communicator
Starship Enterprise
U.S.S. Defiant, Mirror Migrant
U.S.S. Farragut, Bold Explorer
Shore Leave
Austere Command
Sun Titan
Wrath of God
Echo of Eons
Ancient Greenwarden
Augur of Autumn
Exploration
Guardian Project
Heroic Intervention
Lotus Cobra
Scute Swarm
Tireless Tracker
Canopy Vista
Exotic Orchard
Fabled Passage
Fortified Village
Glacial Fortress
Hinterland Harbor
Irrigated Farmland
Mosswort Bridge
Mutavault
Port Town
Prairie Stream
Rain-Slicked Copse
Scattered Groves
Sea of Clouds
Sodden Verdure
Sunpetal Grove
Temple of Enlightenment
Temple of Mystery
Temple of Plenty
Vineglimmer Snarl
Cold-Blooded Crew
Syndicate Liquidators
Earth, Sector 001
Risa
Vulcan
Path to Exile
Brainstorm
Ponder
Reality Shift
Beast Within
Cultivate
Farseek
Harmonize
Nature's Lore
Rampant Growth
Satyr Wayfinder
Growth Spiral
Arcane Signet
Sol Ring
Command Tower
Evolving Wilds
Path of Ancestry
Reliquary Tower
Seaside Citadel
Temple of the False God
Terramorphic Expanse
Tranquil Landscape`),
	},
	{
		id: 'klingon',
		name: 'Klingon Fury',
		colors: 'RWB',
		commander: 'Worf, Defiant Commander',
		alt: 'Kor, Cause of Vengeance',
		basics: [['Mountain', 5], ['Plains', 5], ['Swamp', 5]],
		cards: split(`
Kor, Cause of Vengeance
Ambassador K'Ehleyr
Imperial Hullbreachers
Indelicate Healer
Korok, Liberated Rage
Martok, Hero of the Empire
Merciful Mandate
Right of Vengeance
Blood-Sport Champion
Kurn, Son of Mogh
The Promise of Kahless
Voq, Torchbearer
The Beacon of Kahless
Ferocious Colonist
Gagh Slinger
Galvanizing Tenor
Glory to the Empire!
Gnarling Targ
Grilka, Widowed Warrior
Kang, Suspicious Captain
Koloth, Tribble Hunter
Own the Day
Qo'noS Quartermaster
Alexander, Ship's Fool
Chancellor Gorkon
Curzon Dax, Bound by Blood
Rite of Ascension
Sins of the Father
I.K.S. Negh'Var, Imperial Flagship
K't'inga-Class Battle Cruiser
K'Vort-Class Raider
The Sword of Kahless
Concerted Effort
Duelist's Heritage
Vanquish the Horde
Painful Truths
Combat Celebrant
Disrupt Decorum
Professional Face-Breaker
Shared Animosity
World at War
Pest Control
Ruinous Ultimatum
Vindicate
Warleader's Call
Sword of Light and Shadow
Battlefield Forge
Canyon Slough
Clifftop Retreat
Dragonskull Summit
Eclipsed Steppe
Exotic Orchard
Foreboding Ruins
Furycalm Snarl
Glittering Massif
Isolated Chapel
Radiant Summit
Shineshadow Snarl
Smoldering Marsh
Temple of Malice
Umbral Expanse
Vault of Champions
Cha'DIch Investigator
Path to Exile
Return to Dust
Valorous Stance
Night's Whisper
Rite of Oblivion
Terminate
Arcane Signet
Herald's Horn
Lightning Greaves
Mind Stone
Sol Ring
Talisman of Conviction
Talisman of Hierarchy
Talisman of Indulgence
Command Tower
Evolving Wilds
Nomad Outpost
Path of Ancestry
Rogue's Passage
Shattered Landscape
Terramorphic Expanse`),
	},
	{
		id: 'borg',
		name: 'We Are the Borg',
		colors: 'WUB',
		commander: 'The Borg Queen',
		alt: 'Locutus of Borg',
		basics: [['Plains', 4], ['Island', 4], ['Swamp', 4]],
		cards: split(`
Locutus of Borg
Borg Incursion
Emergency Regeneration
Join the Collective
Korok, Liberated Rage
Maturation Chamber
Stratagem Emulator
Supplementation Node
Type-03 Borg Vessel
Ambulatory Reactor
Borg Scout Sphere
Co-Option Adjutant
Gift of Perfection
Optimization Annex
Seven of Nine, Tertiary Adjunct
Transwarp Hub
Võx, Child of the Collective
Assimilate the Wounded
Assimilation Assessor
Battle of Wolf 359
Extraction Integrant
Reclamation Specialist
The Best of Both Worlds
Collective Override
Deliver from Chaos
Hugh, First of Many
Jurati, Cordial Queen
One, Borg Evolved
Class-4 Tactical Cube
Queen's Diamond
Reconnaissance Partition
Shore Leave
Tempered Steel
Disallow
Toxic Deluge
Anguished Unmaking
Astral Cornucopia
Darksteel Plate
Door of Destinies
Forsaken Monument
The Immortal Sun
Skullclamp
Unwinding Clock
Academy Ruins
Choked Estuary
Drowned Catacomb
Eclipsed Steppe
Exotic Orchard
Fetid Pools
Glacial Fortress
Irrigated Farmland
Isolated Chapel
Morphic Pool
Port Town
Prairie Stream
Shineshadow Snarl
Skycloud Expanse
Spire of Industry
Sunken Hollow
Umbral Expanse
Underground River
Command Subadjunct
Conquest Mission
Hive Mind Coprocessor
Locutus, the One Who Speaks
Dispatch
Return to Dust
Thirst for Knowledge
Thoughtcast
Bitter Triumph
Arcane Signet
Commander's Sphere
Everflowing Chalice
Sol Ring
Stonespeaker Crystal
Swiftfoot Boots
Talisman of Dominance
Talisman of Hierarchy
Talisman of Progress
Wayfarer's Bauble
Arcane Sanctum
Command Tower
Contaminated Landscape
Evolving Wilds
Path of Ancestry
Rogue's Passage
Terramorphic Expanse`),
	},
]

/** All card names the decks use (for loading). */
export function allNames(): string[] {
	const set = new Set<string>()
	for (const d of DECKS) {
		set.add(d.commander)
		d.cards.forEach((c) => set.add(c))
		d.basics.forEach(([b]) => set.add(b))
	}
	return [...set]
}

/** Deck contents as card names: commanders and the other 99 (or 98 with two commanders). */
export function deckCards(d: StarterDeck, leader: 'commander' | 'alt' | 'both' = 'commander'): { commanders: string[]; cards: string[] } {
	const commanders = leader === 'both' ? [d.commander, d.alt] : [leader === 'alt' ? d.alt : d.commander]
	const rest = [d.commander, ...d.cards].filter((n) => !commanders.includes(n))
	for (const [b, n] of d.basics) for (let i = 0; i < n; i++) rest.push(b)
	return { commanders, cards: rest }
}

// ───────── Classic 60-card cut ─────────

/** Minimal card info the 60-card cut looks at (a CardDef works). */
interface CutInfo {
	name: string
	cmc: number
	typeLine: string
	oracle: string
	produces?: string[]
	back?: { oracle?: string }
}

/** Spells by mana value for the 36 non-land cards (6+ shares the last slot). */
const CURVE = [0, 4, 9, 9, 7, 4, 3]
export const SIXTY_LANDS = 24
const MAX_NONBASIC = 10
const MAX_ROCKS = 3

/** True for text that only makes sense with a commander (Command Tower, Arcane Signet, Path of Ancestry…). */
export function needsCommander(c: CutInfo): boolean {
	const text = `${c.oracle}\n${c.back?.oracle ?? ''}`.split(c.name).join('CARDNAME')
	return /\bcommanders?\b/i.test(text)
}

/**
 * A 60-card deck built from one of the Commander decks, for classic Magic rules: 24 lands (the deck's
 * dual and utility lands first, then its basics in the same proportions) and 36 spells picked along a
 * normal curve, always including both legends. Cards that refer to a commander are left out.
 * Cards with no data yet count as 3-mana spells. Deterministic: same pool, same 60.
 */
export function sixtyCards(d: StarterDeck, pool: Record<string, CutInfo | undefined>, slugOf: (n: string) => string): string[] {
	const info = (n: string): CutInfo => pool[slugOf(n)] ?? { name: n, cmc: 3, typeLine: '', oracle: '' }
	const all = [d.commander, ...d.cards]
	const isLand = (n: string) => /\bLand\b/.test(info(n).typeLine)
	const usable = all.filter((n) => !needsCommander(info(n)))

	// lands
	const nonbasic = usable.filter(isLand)
	const colorsMade = (n: string) => (info(n).produces ?? []).filter((m) => d.colors.includes(m)).length
	const lands = [...nonbasic].sort((a, b) => Math.min(colorsMade(b), 2) - Math.min(colorsMade(a), 2)).slice(0, MAX_NONBASIC)
	const basicTotal = d.basics.reduce((t, [, n]) => t + n, 0)
	const need = SIXTY_LANDS - lands.length
	const counts = d.basics.map(([b, n]) => [b, Math.floor((n * need) / basicTotal)] as [string, number])
	for (let i = 0; counts.reduce((t, [, n]) => t + n, 0) < need; i++) counts[i % counts.length][1]++
	for (const [b, n] of counts) for (let i = 0; i < n; i++) lands.push(b)

	// spells
	const spells = usable.filter((n) => !isLand(n))
	const bucket = (n: string) => Math.max(1, Math.min(6, Math.round(info(n).cmc)))
	const isRock = (n: string) => {
		const c = info(n)
		return /\bArtifact\b/.test(c.typeLine) && !/\bCreature\b/.test(c.typeLine) && (c.produces?.length ?? 0) > 0
	}
	const picked: string[] = []
	const left = [0, ...CURVE.slice(1)]
	let rocks = 0
	const take = (n: string) => {
		picked.push(n)
		left[bucket(n)]--
		if (isRock(n)) rocks++
	}
	for (const n of [d.commander, d.alt]) if (spells.includes(n)) take(n)
	for (const n of spells) {
		if (picked.includes(n) || left[bucket(n)] <= 0) continue
		if (isRock(n) && rocks >= MAX_ROCKS) continue
		take(n)
	}
	// short somewhere on the curve: fill with the cheapest cards left
	const rest = spells.filter((n) => !picked.includes(n)).sort((a, b) => info(a).cmc - info(b).cmc)
	for (const n of rest) {
		if (picked.length >= 60 - SIXTY_LANDS) break
		if (!(isRock(n) && rocks >= MAX_ROCKS)) take(n)
	}
	for (const n of rest) if (picked.length < 60 - SIXTY_LANDS && !picked.includes(n)) take(n)
	return [...picked, ...lands]
}
