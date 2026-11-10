import { useState } from 'react'
import { APP_NAME } from '../config'
import { DECKS, sixtyCards } from '../data/decks'
import { slug, type CardPool } from '../data/scryfall'
import { FORMATS } from '../engine/engine'
import type { Format } from '../engine/types'
import { Pip } from './Card'
import { DRILLS, drillsFor, PLANS, rivalDeck, type DeckId } from './lessons'

export interface SetupResult {
	mode: 'bot' | 'local' | 'host' | 'guest'
	/** Practice game with the tutorial coach. */
	tutorial?: boolean
	/** Deck lessons: coached game with a deck's plan, or one of its combo drills. */
	lesson?: { deck: DeckId; drill?: string }
	names: [string, string]
	decks: [string, string]
	leaders: ['commander' | 'alt', 'commander' | 'alt']
	format: Format['id']
	seed: number
}

const NAME_KEY = 'holodeck.name'

export function Setup({ pool, loading, onReload, onStart, joinCode, resume, initialLessons }: { pool: CardPool | null; loading: { f: number; text: string; error?: string } | null; onReload: () => void; onStart: (r: SetupResult) => void; joinCode: string | null; resume?: { label: string; go: () => void }; initialLessons?: boolean }) {
	const [lessons, setLessons] = useState(!!initialLessons)
	const [mode, setMode] = useState<SetupResult['mode']>(joinCode ? 'guest' : 'bot')
	const [names, setNames] = useState<[string, string]>(() => [localStorage.getItem(NAME_KEY) || 'Captain', 'Ensign Bot'])
	const [decks, setDecks] = useState<[string, string]>(['federation', 'klingon'])
	const [leaders, setLeaders] = useState<SetupResult['leaders']>(['commander', 'commander'])
	const [format, setFormat] = useState<Format['id']>('duel')
	const ready = !!pool
	const two = mode === 'bot' || mode === 'local'

	const deckPicker = (i: 0 | 1) => (
		<div className="deckpick">
			{DECKS.map((d) => {
				const lead = leaders[i] === 'alt' && decks[i] === d.id ? d.alt : d.commander
				const img = pool?.cards[slug(lead)]?.image
				return (
					<button key={d.id} className={`decktile ${decks[i] === d.id ? 'on' : ''}`} onClick={() => setDecks((x) => (i === 0 ? [d.id, x[1]] : [x[0], d.id]))}>
						{img ? <img src={img} alt={lead} /> : <div className="noimg">{lead}</div>}
						<span className="dname">{d.name}</span>
						<span className="dcolors">
							{d.colors.split('').map((c) => (
								<Pip key={c} m={c} />
							))}
						</span>
					</button>
				)
			})}
			{FORMATS[format].noCommander ? (
				<details className="leader sixty-list">
					<summary>The 60 cards</summary>
					{sixtyList(DECKS.find((x) => x.id === decks[i])!)}
				</details>
			) : (
			<div className="leader">
				Commander:
				{(['commander', 'alt'] as const).map((l) => {
					const d = DECKS.find((x) => x.id === decks[i])!
					return (
						<button key={l} className={leaders[i] === l ? 'primary' : ''} onClick={() => setLeaders((x) => (i === 0 ? [l, x[1]] : [x[0], l]))}>
							{(l === 'commander' ? d.commander : d.alt).split(',')[0]}
						</button>
					)
				})}
			</div>
			)}
		</div>
	)

	/** What the 60-card cut of a deck holds, grouped like a decklist. */
	const sixtyList = (d: (typeof DECKS)[number]) => {
		const cards = pool ? sixtyCards(d, pool.cards, slug) : []
		if (!cards.length) return <p className="dim small">Loading the cards…</p>
		const counts = new Map<string, number>()
		for (const n of cards) counts.set(n, (counts.get(n) ?? 0) + 1)
		const kind = (n: string) => {
			const t = pool?.cards[slug(n)]?.typeLine ?? ''
			return /Land/.test(t) ? 'Lands' : /Creature/.test(t) ? 'Creatures' : 'Other spells'
		}
		return (['Creatures', 'Other spells', 'Lands'] as const).map((k) => {
			const names = [...counts].filter(([n]) => kind(n) === k)
			return (
				<div key={k} className="small">
					<b>
						{k} ({names.reduce((t, [, c]) => t + c, 0)})
					</b>
					<div className="dim">{names.map(([n, c]) => (c > 1 ? `${c} ${n}` : n)).join(' · ')}</div>
				</div>
			)
		})
	}

	const start = (extra: Partial<SetupResult> = {}) => {
		localStorage.setItem(NAME_KEY, names[0])
		onStart({ mode, names: [names[0] || 'Player 1', mode === 'bot' ? 'Ensign (computer)' : names[1] || 'Player 2'], decks, leaders, format, seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, ...extra })
	}
	const practice = () => {
		const d = decks[0] as DeckId
		start({ mode: 'bot', tutorial: true, decks: [d, rivalDeck(d)], leaders: ['commander', 'commander'], format: 'duel', names: [names[0] || 'Captain', 'Ensign (computer)'] })
	}
	const lesson = (deck: DeckId, drill?: string) => start({ mode: 'bot', tutorial: true, lesson: { deck, drill }, decks: [deck, rivalDeck(deck)], leaders: ['commander', 'commander'], format: 'duel', names: [names[0] || 'Captain', 'Ensign (computer)'] })

	if (lessons)
		return (
			<div className="setup">
				<div className="lcars-head">
					<span className="elbow" />
					<h1>Lessons</h1>
					<span className="sub">DECK LESSONS & COMBOS</span>
				</div>
				<p className="dim">Each deck has a guide to its game plan followed by a coached game against the computer (the coach points out combos as you draw them), and combo drills: set positions with a goal, coached step by step.</p>
				<div className="lessons">
					{DECKS.map((d) => {
						const img = pool?.cards[slug(d.commander)]?.image
						return (
							<div key={d.id} className="lesson-deck">
								{img ? <img src={img} alt={d.commander} /> : <div className="noimg">{d.commander}</div>}
								<div className="lesson-body">
									<h3>
										{d.name}{' '}
										{d.colors.split('').map((c) => (
											<Pip key={c} m={c} />
										))}
									</h3>
									<p className="dim small">{PLANS[d.id as DeckId][0].body}</p>
									<button className="primary" disabled={!ready} onClick={() => lesson(d.id as DeckId)}>
										Game plan + coached game
									</button>
									{drillsFor(d.id).map((dr) => (
										<button key={dr.id} disabled={!ready} onClick={() => lesson(d.id as DeckId, dr.id)} title={dr.goal}>
											Drill: {dr.title}
										</button>
									))}
								</div>
							</div>
						)
					})}
				</div>
				<div className="setup-buttons">
					<button onClick={() => setLessons(false)}>Back</button>
				</div>
				<p className="dim small">{DRILLS.length} drills. New to Magic? Start with the Tutorial practice game on the main screen.</p>
			</div>
		)

	return (
		<div className="setup">
			<div className="lcars-head">
				<span className="elbow" />
				<h1>{APP_NAME}</h1>
				<span className="sub">STAR TREK · COMMANDER · TWO PLAYERS</span>
			</div>
			<div className="setup-body">
				<div className="carddata">
					{loading && !loading.error && (
						<div className="progress">
							<div className="bar" style={{ width: `${Math.round(loading.f * 100)}%` }} />
							<span>{loading.text}</span>
						</div>
					)}
					{loading?.error && (
						<div className="bad">
							Couldn’t load the cards: {loading.error}. <button onClick={onReload}>Try again</button>
						</div>
					)}
					{pool && (
						<div className="dim">
							{Object.values(pool.cards).filter((c) => !c.isToken).length} cards loaded from Scryfall{pool.missing.length ? ` · not found: ${pool.missing.join(', ')}` : ''} · <button className="linkish" onClick={onReload}>refresh</button>
						</div>
					)}
				</div>
				{joinCode && mode === 'guest' ? (
					<section>
						<h2>You’ve been invited to a game</h2>
						<label>
							Your name <input value={names[0]} maxLength={24} onChange={(e) => setNames([e.target.value, names[1]])} />
						</label>
						<h3>Your deck</h3>
						{deckPicker(0)}
						<div className="setup-buttons">
							<button className="primary big" disabled={!ready} onClick={() => start()}>
								Join game
							</button>
							<button onClick={() => setMode('bot')}>Play something else</button>
						</div>
					</section>
				) : (
					<>
						<section className="modes">
							{(
								[
									['bot', 'vs Computer'],
									['local', 'Two players, one device'],
									['host', 'Play a friend online'],
								] as const
							).map(([m, label]) => (
								<button key={m} className={mode === m ? 'primary' : ''} onClick={() => setMode(m)}>
									{label}
								</button>
							))}
						</section>
						<section className="players">
							<div>
								<label>
									{two ? 'Player 1' : 'Your name'} <input value={names[0]} maxLength={24} onChange={(e) => setNames([e.target.value, names[1]])} />
								</label>
								{deckPicker(0)}
							</div>
							{two && (
								<div>
									<label>
										{mode === 'bot' ? 'Computer’s deck' : 'Player 2'}
										{mode === 'local' && <input value={names[1]} maxLength={24} onChange={(e) => setNames([names[0], e.target.value])} />}
									</label>
									{deckPicker(1)}
								</div>
							)}
						</section>
						<section className="formats">
							<span>Format:</span>
							{Object.values(FORMATS).map((f) => (
								<button key={f.id} className={format === f.id ? 'primary' : ''} onClick={() => setFormat(f.id)} title={`${f.life} life${f.commanderDamage ? ', 21 commander damage' : ', no commander damage'}`}>
									{f.name} · {f.life}
								</button>
							))}
						</section>
						<div className="setup-buttons">
							<button className="primary big" disabled={!ready} onClick={() => start()}>
								{mode === 'host' ? 'Create invite link' : 'Start game'}
							</button>
							{resume && <button onClick={resume.go}>{resume.label}</button>}
						</div>
						<section className="learn">
							<span>Learn:</span>
							<button disabled={!ready} onClick={practice} title="A real game against the computer with a coach explaining every step (uses Player 1’s deck)">
								Tutorial: practice game
							</button>
							<button disabled={!ready} onClick={() => setLessons(true)} title="Each deck’s game plan, a coached game with combo alerts, and combo drills">
								Deck lessons & combos
							</button>
						</section>
						<p className="dim small">
							{format === 'sixty' && <>Classic 60-card: each deck is cut to 60 cards (24 lands, 36 spells on a normal curve, both legends included as regular cards, anything that needs a commander left out). 20 life, no command zone, standard Magic rules. </>}
							Duel Commander is the usual 2-player way to play Commander: 20 life and no commander damage. Its ban list is not used, so the decks play as they come out of the box. Card images and text come from Scryfall. This is a fan project; it isn’t affiliated with Wizards of the Coast or Paramount.
						</p>
					</>
				)}
			</div>
		</div>
	)
}
