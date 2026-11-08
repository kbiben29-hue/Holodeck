import { useState } from 'react'
import { APP_NAME } from '../config'
import { DECKS } from '../data/decks'
import { slug, type CardPool } from '../data/scryfall'
import { FORMATS } from '../engine/engine'
import type { Format } from '../engine/types'
import { Pip } from './Card'

export interface SetupResult {
	mode: 'bot' | 'local' | 'host' | 'guest'
	names: [string, string]
	decks: [string, string]
	leaders: ['commander' | 'alt', 'commander' | 'alt']
	format: Format['id']
	seed: number
}

const NAME_KEY = 'holodeck.name'

export function Setup({ pool, loading, onReload, onStart, joinCode, resume }: { pool: CardPool | null; loading: { f: number; text: string; error?: string } | null; onReload: () => void; onStart: (r: SetupResult) => void; joinCode: string | null; resume?: { label: string; go: () => void } }) {
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
		</div>
	)

	const start = () => {
		localStorage.setItem(NAME_KEY, names[0])
		onStart({ mode, names: [names[0] || 'Player 1', mode === 'bot' ? 'Ensign (computer)' : names[1] || 'Player 2'], decks, leaders, format, seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 })
	}

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
							<button className="primary big" disabled={!ready} onClick={start}>
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
							<button className="primary big" disabled={!ready} onClick={start}>
								{mode === 'host' ? 'Create invite link' : 'Start game'}
							</button>
							{resume && <button onClick={resume.go}>{resume.label}</button>}
						</div>
						<p className="dim small">
							Duel Commander is the usual 2-player way to play Commander: 20 life and no commander damage. Its ban list is not used, so the decks play as they come out of the box. Card images and text come from Scryfall. This is a fan project; it isn’t affiliated with Wizards of the Coast or Paramount.
						</p>
					</>
				)}
			</div>
		</div>
	)
}
