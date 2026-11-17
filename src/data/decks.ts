// The Commander decks: the four Magic: The Gathering | Star Trek decks (official decklists, Nov 2026), the four
// The Lord of the Rings: Tales of Middle-earth decks (official decklists, June 2023) and the four Bloomburrow decks
// (official decklists, June 2024).
// Names only; card details and images are loaded from Scryfall on the player's device.

export interface StarterDeck {
	id: string
	/** Which game the deck comes from: Star Trek (default), The Lord of the Rings (Middle-earth) or Bloomburrow. */
	world?: 'trek' | 'me' | 'bb'
	/** The two legends are partners ("Partner with"): they can lead the deck together. */
	partners?: boolean
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
	{
		id: 'rohan',
		world: 'me',
		name: 'Riders of Rohan',
		colors: 'WUR',
		commander: 'Éowyn, Shieldmaiden',
		alt: 'Aragorn, King of Gondor',
		basics: [['Plains', 9], ['Island', 5], ['Mountain', 5]],
		cards: split(`
Aragorn, King of Gondor
Beregond of the Guard
Champions of Minas Tirith
Gilraen, Dúnedain Protector
Grey Host Reinforcements
Lossarnach Captain
Archivist of Gondor
Denethor, Stone Seer
Fealty to the Realm
Call for Aid
Gimli of the Glittering Caves
Boromir, Gondor's Hope
Éomer, King of Rohan
Faramir, Steward of Gondor
Forth Eorlingas!
Oath of Eorl
Riders of Rohan
Taunt from the Rampart
Crown of Gondor
Bastion Protector
Dearly Departed
Frontline Medic
Increasing Devotion
Marshal's Anthem
Selfless Squire
Unbreakable Formation
Verge Rangers
Visions of Glory
Weathered Wayfarer
Combat Celebrant
Court of Ire
Earthquake
Flamerush Rider
Frontier Warmonger
Harsh Mentor
Shared Animosity
Zealous Conscripts
Supreme Verdict
Door of Destinies
Vanquisher's Banner
Battlefield Forge
Clifftop Retreat
Exotic Orchard
Furycalm Snarl
Glacial Fortress
Port Town
Prairie Stream
Sulfur Falls
Throne of the High City
Windbrisk Heights
Lost to Legend
Erkenbrand, Lord of Westfold
Banishing Light
Fiend Hunter
Palace Jailer
Path to Exile
Sunset Revelry
Swords to Plowshares
Village Bell-Ringer
Prince Imrahil the Fair
Humble Defector
Théoden, King of Rohan
Arcane Signet
Commander's Sphere
Heirloom Blade
Herald's Horn
Sol Ring
Talisman of Conviction
Talisman of Progress
Thought Vessel
Wayfarer's Bauble
Command Tower
Evolving Wilds
Field of Ruin
Path of Ancestry
Rogue's Passage
Secluded Courtyard
Terramorphic Expanse
Tranquil Cove
Wind-Scarred Crag`),
	},
	{
		id: 'fellowship',
		world: 'me',
		name: 'Food and Fellowship',
		colors: 'WBG',
		commander: 'Frodo, Adventurous Hobbit',
		alt: 'Sam, Loyal Attendant',
		partners: true,
		basics: [['Plains', 4], ['Swamp', 4], ['Forest', 8]],
		cards: split(`
Sam, Loyal Attendant
Field-Tested Frying Pan
The Gaffer
Gwaihir, Greatest of the Eagles
Of Herbs and Stewed Rabbit
Gollum, Obsessed Stalker
Lobelia, Defender of Bag End
Rapacious Guest
Assemble the Entmoot
Feasting Hobbit
Motivated Pony
Prize Pig
Banquet Guests
Bilbo, Birthday Celebrant
Farmer Cotton
Merry, Warden of Isengard
Pippin, Warden of Isengard
Treebeard, Gracious Host
Hithlain Rope
Call for Unity
Dawn of Hope
Dusk
Fell the Mighty
Fumigate
Mentor of the Meek
Sanguine Bond
Toxic Deluge
Birds of Paradise
Gilded Goose
Woodfall Primus
Anguished Unmaking
Chromatic Lantern
Trading Post
Well of Lost Dreams
Brushland
Canopy Vista
Exotic Orchard
Fortified Village
Isolated Chapel
Murmuring Bosk
Necroblossom Snarl
Scattered Groves
Shineshadow Snarl
Sunpetal Grove
Woodland Cemetery
Eagles of the North
Landroval, Horizon Witness
Rosie Cotton of South Lane
Shire Shirriff
Mirkwood Bats
Generous Ent
Path to Exile
Swords to Plowshares
Revive the Shire
Butterbur, Bree Innkeeper
Crypt Incursion
Go for the Throat
Night's Whisper
Cultivate
Essence Warden
Farseek
Great Oak Guardian
Harmonize
Orchard Strider
Prosperous Innkeeper
Shire Terrace
Tireless Provisioner
Mortify
Savvy Hunter
Arcane Signet
Commander's Sphere
Pristine Talisman
Sol Ring
Access Tunnel
Ash Barrens
Command Tower
Evolving Wilds
Ghost Quarter
Graypelt Refuge
Path of Ancestry
Rogue's Passage
Sandsteppe Citadel
Scoured Barrens`),
	},
	{
		id: 'elven',
		world: 'me',
		name: 'Elven Council',
		colors: 'GU',
		commander: 'Galadriel, Elven-Queen',
		alt: 'Gandalf, Westward Voyager',
		basics: [['Island', 11], ['Forest', 15]],
		cards: split(`
Gandalf, Westward Voyager
Raise the Palisade
Trap the Trespassers
Arwen, Weaver of Hope
Galadhrim Ambush
Haldir, Lórien Lieutenant
Legolas Greenleaf
Mirkwood Elk
Travel Through Caradhras
Windswift Slice
Círdan the Shipwright
Elrond of the White Council
Erestor of the Council
Mirkwood Trapper
Radagast, Wizard of Wilds
Sail into the West
Song of Eärendil
Lothlórien Blade
Model of Unity
Colossal Whale
Devastation Tide
Mystic Confluence
Plea for Power
Swan Song
Asceticism
Elvish Archdruid
Elvish Piper
Elvish Warmaster
Genesis Wave
Heroic Intervention
Hornet Queen
Inscription of Abundance
Overwhelming Stampede
Realm Seekers
Seeds of Renewal
Sylvan Offering
Exotic Orchard
Flooded Grove
Hinterland Harbor
Rejuvenating Springs
Vineglimmer Snarl
Lórien Revealed
Celeborn the Wise
Elven Farsight
Wose Pathfinder
Learn from the Past
Opt
Preordain
Arbor Elf
Beast Within
Cultivate
Elvish Mystic
Elvish Visionary
Farhaven Elf
Mirror of Galadriel
Lignify
Paradise Druid
Rampant Growth
Reclamation Sage
Wood Elves
Growth Spiral
Arcane Signet
Commander's Sphere
Lightning Greaves
Sol Ring
Whispersilk Cloak
Ash Barrens
Command Tower
Field of Ruin
Lonely Sandbar
Thornwood Falls
Tranquil Thicket
Woodland Stream`),
	},
	{
		id: 'mordor',
		world: 'me',
		name: 'The Hosts of Mordor',
		colors: 'UBR',
		commander: 'Sauron, Lord of the Rings',
		alt: 'Saruman, the White Hand',
		basics: [['Island', 6], ['Swamp', 6], ['Mountain', 7]],
		cards: split(`
Saruman, the White Hand
Corsairs of Umbar
Monstrosity of the Lake
Subjugate the Hobbits
Shelob, Dread Weaver
Cavern-Hoard Dragon
Orcish Siegemaster
Rampaging War Mammoth
The Balrog of Moria
Gríma, Saruman's Footman
In the Darkness Bind Them
Lidless Gaze
Lord of the Nazgûl
Moria Scavenger
Summons of Saruman
Too Greedily, Too Deep
Wake the Dragon
Relic of Sauron
The Black Gate
Decree of Pain
Languish
Living Death
Reanimate
Blasphemous Act
Goblin Dark-Dwellers
Inferno Titan
Knollspine Dragon
Scourge of the Throne
Siege-Gang Commander
Treasure Nabber
Hostage Taker
Notion Thief
Choked Estuary
Desolate Lighthouse
Dragonskull Summit
Drowned Catacomb
Foreboding Ruins
Frostboil Snarl
Smoldering Marsh
Sulfur Falls
Sulfurous Springs
Sunken Hollow
Underground River
Treason of Isengard
Bitter Downfall
Troll of Khazad-dûm
Voracious Fell Beast
Fiery Inscription
Grishnákh, Brash Instigator
Arcane Denial
Boon of the Wish-Giver
Consider
Deep Analysis
Fact or Fiction
Forbidden Alchemy
Feed the Swarm
Merciless Executioner
Revenge of Ravens
Anger
Faithless Looting
The Mouth of Sauron
Goblin Cratermaker
Guttersnipe
Shiny Impetus
Thrill of Possibility
Extract from Darkness
Arcane Signet
Basalt Monolith
Commander's Sphere
Everflowing Chalice
Mind Stone
Sol Ring
Worn Powerstone
Command Tower
Crumbling Necropolis
Evolving Wilds
Field of Ruin
Path of Ancestry
Rogue's Passage
Terramorphic Expanse`),
	},
	{
		id: 'animated',
		world: 'bb',
		name: 'Animated Army',
		colors: 'RG',
		commander: 'Bello, Bard of the Brambles',
		alt: 'Wildsear, Scouring Maw',
		basics: [['Mountain', 8], ['Forest', 10]],
		cards: split(`
Wildsear, Scouring Maw
Domri, Anarch of Bolas
Etali, Primal Storm
Prosperous Bandit
Pyreswipe Hawk
Alchemist's Talent
Berserkers' Onslaught
Outpost Siege
Rain of Riches
Chaos Warp
Sunbird's Invocation
Gratuitous Violence
Warstorm Surge
Starstorm
Lotus Cobra
Evercoat Ursine
Brightcap Badger
Trailtracker Scout
Thickest in the Thicket
Ghalta, Primal Hunger
Esika's Chariot
Unnatural Growth
Greater Good
Kodama of the East Tree
Grothama, All-Devouring
Rampaging Baloths
Bootleggers' Stash
Primeval Bounty
Gilded Lotus
Spine of Ish Sah
Temple of Abandon
Karplusan Forest
Exotic Orchard
Sheltered Thicket
Game Trail
Raging Ravine
Copperline Gorge
Mossfire Valley
Cinder Glade
Rootbound Crag
Mosswort Bridge
Blasphemous Act
Llanowar Loamspeaker
Tendershoot Dryad
Goreclaw, Terror of Qal Sisma
Path of Discovery
Decimate
Rolling Hamsphere
Teapot Slinger
Explore
Farseek
Cultivate
Grumgully, the Generous
Wandertale Mentor
Thought Vessel
Arcane Signet
Wooded Ridgeline
Big Score
Abrade
Rampant Growth
Sakura-Tribe Elder
Beast Within
Garruk's Packleader
Harmonize
Garruk's Uprising
Gruul Signet
Burnished Hart
Hedron Archive
Fellwar Stone
Thran Dynamo
Sol Ring
Mind Stone
Talisman of Impulse
Terramorphic Expanse
Path of Ancestry
Gruul Turf
Evolving Wilds
Forgotten Cave
Tranquil Thicket
Command Tower
Reliquary Tower`),
	},
	{
		id: 'family',
		world: 'bb',
		name: 'Family Matters',
		colors: 'WUR',
		commander: "Zinnia, Valley's Voice",
		alt: 'Arthur, Marigold Knight',
		basics: [['Plains', 5], ['Island', 4], ['Mountain', 4]],
		cards: split(`
Arthur, Marigold Knight
Elspeth, Sun's Champion
Jazal Goldmane
Martial Coup
Storm of Souls
Selfless Spirit
Murmuration
Blade Splicer
Hanged Executioner
Loyal Warhound
Restoration Angel
Jacked Rabbit
Skyclave Apparition
Dusk // Dawn
Boss's Chauffeur
Angel of the Ruins
Luminous Broodmoth
Sun Titan
Pollywog Prodigy
Fortune Teller's Talent
Aether Channeler
Pull from Tomorrow
Shield Broker
Stolen by the Fae
Rapid Augmenter
Bident of Thassa
Curiosity Crafter
Devilish Valet
Siege-Gang Commander
Echoing Assault
Agate Instigator
Calamity of Cinders
Rose Room Treasurer
Combat Celebrant
Inferno Titan
Time Wipe
Solemn Simulacrum
Helm of the Host
Glacial Fortress
Adarkar Wastes
Temple of Enlightenment
Castle Ardenvale
Seachrome Coast
Sulfur Falls
Cascade Bluffs
Exotic Orchard
Clifftop Retreat
Shivan Reef
Temple of Triumph
Battlefield Forge
Skycloud Expanse
Temple of Epiphany
Ferrous Lake
Rugged Prairie
Sunscorched Divide
Spirited Companion
Inspiring Overseer
Cut a Deal
Path to Exile
Illusory Ambusher
Rowdy Research
Plumecreed Escort
Rapid Hybridization
Junk Winder
Aetherize
Chart a Course
Tetsuko Umezawa, Fugitive
Thopter Engineer
Cloudblazer
Arcane Signet
Boros Signet
Ornithopter of Paradise
Azorius Signet
Izzet Signet
Circuit Mender
Fellwar Stone
Sol Ring
Mind Stone
Terramorphic Expanse
Path of Ancestry
Thriving Heath
Evolving Wilds
Thriving Isle
Thriving Bluff
Command Tower
Mystic Monastery`),
	},
	{
		id: 'peace',
		world: 'bb',
		name: 'Peace Offering',
		colors: 'WUG',
		commander: 'Ms. Bumbleflower',
		alt: 'Mr. Foxglove',
		basics: [['Plains', 4], ['Island', 4], ['Forest', 4]],
		cards: split(`
Mr. Foxglove
Tamiyo, Field Researcher
Tenuous Truce
Loran of the Third Path
Steelburr Champion
Tempt with Bunnies
Perch Protection
Sunscorch Regent
Promise of Loyalty
Hoofprints of the Stag
Mangara, the Diplomat
Realm-Cloaked Giant
Sphinx of Enlightenment
Forgotten Ancient
Bloodroot Apothecary
Communal Brewing
Managorger Hydra
Rishkar, Peema Renegade
Rites of Flourishing
Tempt with Discovery
Kalonian Hydra
Faeburrow Elder
Exotic Orchard
Simic Ascendancy
Ghirapur Orrery
Psychosis Crawler
Adarkar Wastes
Temple of Enlightenment
Seachrome Coast
Glacial Fortress
Hinterland Harbor
Razorverge Thicket
Flooded Grove
Skycloud Expanse
Canopy Vista
Prairie Stream
Brushland
Temple of Mystery
Yavimaya Coast
Overflowing Basin
Sungrass Prairie
Sunpetal Grove
Triskaidekaphile
Octomancer
Twenty-Toed Toad
Intellectual Offering
Illusionist's Gambit
Body of Knowledge
Chasm Skulker
Perplexing Test
Jolrael, Mwonvuli Recluse
Fisher's Talent
Selvala, Explorer Returned
Kwain, Itinerant Meddler
Coveted Jewel
Temple of Plenty
Generous Gift
Swords to Plowshares
Secret Rendezvous
Baird, Steward of Argive
An Offer You Can't Refuse
Wizard Class
Cultivate
Farseek
Broken Wings
Spore Frog
Wear Down
Peerless Recycling
Coiling Oracle
Riot Control
Martial Impetus
Jolly Gerbils
Long River's Pull
Thought Vessel
Arcane Signet
Swiftfoot Boots
Fellwar Stone
Sol Ring
Mind Stone
Thriving Heath
Thriving Isle
Thriving Grove
Terramorphic Expanse
Command Tower
Evolving Wilds
Reliquary Tower
Seaside Citadel`),
	},
	{
		id: 'squirrel',
		world: 'bb',
		name: 'Squirreled Away',
		colors: 'BG',
		commander: 'Hazel of the Rootbloom',
		alt: 'The Odd Acorn Gang',
		basics: [['Swamp', 8], ['Forest', 9]],
		cards: split(`
The Odd Acorn Gang
Garruk, Cursed Huntsman
Chittering Witch
Insatiable Frugivore
Moonstone Eulogist
Swarmyard Massacre
Hazel's Brewmaster
Woe Strider
Saw in Half
Ogre Slumlord
Decree of Pain
Gourmand's Talent
Rootcast Apprenticeship
Scurry of Squirrels
End-Raze Forerunners
Arasta of the Endless Web
Deep Forest Hermit
Toski, Bearer of Secrets
Beastmaster Ascension
Second Harvest
Shamanic Revelation
Chatterfang, Squirrel General
Temple of Malady
Casualties of War
Windgrace's Judgment
Maskwood Nexus
Academy Manufactor
Woodland Cemetery
Necroblossom Snarl
Oran-Rief, the Vastwood
Swarmyard
Exotic Orchard
Llanowar Wastes
Grim Backwoods
Viridescent Bog
Twilight Mire
Gilded Goose
Chitterspitter
Maelstrom Pulse
Beledros Witherbloom
Idol of Oblivion
Sword of the Squeak
Morbid Opportunist
Nadier's Nightblade
Plumb the Forbidden
Bastion of Remembrance
Plaguecrafter
Cache Grab
Chatterstorm
Poison-Tip Archer
Moldervine Reclamation
Ravenous Squirrel
Skyfisher Spider
Binding the Old Gods
Golgari Rot Farm
Jungle Hollow
Haunted Mire
Nested Shambler
Deadly Dispute
Zulaport Cutthroat
Squirrel Sovereign
Prosperous Innkeeper
Haywire Mite
Tireless Provisioner
Squirrel Nest
Honored Dreyleader
Tear Asunder
Wolfwillow Haven
Putrefy
Arcane Signet
Golgari Signet
Talisman of Resilience
Sol Ring
Skullclamp
Terramorphic Expanse
Path of Ancestry
Evolving Wilds
Command Tower
Tranquil Thicket
Bojuka Bog
Tainted Wood
Barren Moor`),
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

// ───────── which world a card or player belongs to ─────────

let worldIndex: Map<string, 'trek' | 'me' | 'bb' | 'both'> | null = null
/** 'trek', 'me' or 'bb' for a card that's only in one world's decks; undefined for shared cards (Sol Ring…) or tokens. */
export function worldOfName(name: string): 'trek' | 'me' | 'bb' | undefined {
	if (!worldIndex) {
		worldIndex = new Map()
		for (const d of DECKS)
			for (const n of [d.commander, d.alt, ...d.cards]) {
				const w = d.world ?? 'trek'
				const was = worldIndex.get(n)
				worldIndex.set(n, was && was !== w ? 'both' : w)
			}
	}
	const w = worldIndex.get(name)
	return w === 'both' ? undefined : w
}

/** The deck a player is playing, recognised from their commanders (or, in a 60-card game, from their cards). */
export function deckOfPlayer(commanderNames: string[], cardNames: string[]): StarterDeck | undefined {
	const byCmd = DECKS.find((d) => commanderNames.some((n) => n === d.commander || n === d.alt))
	if (byCmd) return byCmd
	let best: StarterDeck | undefined
	let score = 0
	for (const d of DECKS) {
		const set = new Set([d.commander, d.alt, ...d.cards])
		const n = cardNames.filter((x) => set.has(x)).length
		if (n > score) {
			score = n
			best = d
		}
	}
	return best
}
