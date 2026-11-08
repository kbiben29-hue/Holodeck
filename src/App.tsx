import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { actor, botStep } from './bot/bot'
import { buildGame } from './data/build'
import { allNames } from './data/decks'
import { cachedPool, loadCards, type CardPool } from './data/scryfall'
import { tryApply } from './engine/engine'
import type { CardDef, Format, GameState, Intent } from './engine/types'
import { clearJoinFromUrl, isGuestMsg, isHostMsg, joinCodeFromUrl, joinLink, stripCards, withCards, type DeckChoice, type GuestMsg, type HostMsg } from './net/online'
import { hostGame, joinGame, newGameCode, type Conn, type Host } from './net/transport'
import { Board, type LayoutChoice } from './ui/Board'
import { Setup, type SetupResult } from './ui/Setup'

const W = 1600
const H = 1000
const SAVE = 'holodeck.save.v1'
const LAYOUT_KEY = 'holodeck.layout'

interface Session {
	history: GameState[]
	bot: boolean
	online?: { role: 'host' | 'guest'; code: string; seat: number }
}

interface Lobby {
	role: 'host' | 'guest'
	code: string
	name: string
	deck: DeckChoice
	format: Format['id']
	status: string
	error?: string
}

function readLayout(): LayoutChoice {
	try {
		const v = localStorage.getItem(LAYOUT_KEY)
		return v === 'pocket' || v === 'console' ? v : 'auto'
	} catch {
		return 'auto'
	}
}
/** Phones get the touch layout; computers and iPads the table, scaled to fit (both can be switched in the menu). */
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600

function useFit() {
	const [scale, setScale] = useState(1)
	useLayoutEffect(() => {
		const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H))
		fit()
		window.addEventListener('resize', fit)
		return () => window.removeEventListener('resize', fit)
	}, [])
	return scale
}

function saveSession(s: Session) {
	try {
		const last = s.history[s.history.length - 1]
		const slim = { ...s, history: s.history.slice(-40).map((st) => ({ ...st, cards: {} })), cards: last.cards }
		localStorage.setItem(SAVE, JSON.stringify(slim))
	} catch {
		/* storage full */
	}
}
function loadSave(): Session | null {
	try {
		const raw = localStorage.getItem(SAVE)
		if (!raw) return null
		const j = JSON.parse(raw) as Session & { cards: Record<string, CardDef> }
		return { ...j, history: j.history.map((st) => ({ ...st, cards: j.cards })) }
	} catch {
		return null
	}
}

export default function App() {
	const scale = useFit()
	const [pool, setPool] = useState<CardPool | null>(() => cachedPool())
	const [loading, setLoading] = useState<{ f: number; text: string; error?: string } | null>(null)
	const [session, setSession] = useState<Session | null>(null)
	const [viewer, setViewer] = useState(0)
	const [handoff, setHandoff] = useState<number | null>(null)
	const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>(() => readLayout())
	const pocket = layoutChoice === 'pocket' || (layoutChoice === 'auto' && isPhone())
	const [lobby, setLobby] = useState<Lobby | null>(null)
	const [net, setNet] = useState<{ ok: boolean; text: string } | null>(null)
	const [netError, setNetError] = useState<string | null>(null)
	const [joinCode, setJoinCode] = useState<string | null>(() => joinCodeFromUrl())
	const sessionRef = useRef<Session | null>(null)
	const lobbyRef = useRef<Lobby | null>(null)
	const hostRef = useRef<Host | null>(null)
	const connRef = useRef<Conn | null>(null)
	const cardsRef = useRef<Record<string, CardDef>>({})
	const poolRef = useRef<CardPool | null>(pool)
	sessionRef.current = session
	lobbyRef.current = lobby
	poolRef.current = pool

	const chooseLayout = (c: LayoutChoice) => {
		setLayoutChoice(c)
		try {
			localStorage.setItem(LAYOUT_KEY, c)
		} catch {
			/* ignore */
		}
	}

	const reload = useCallback((force = false) => {
		setLoading({ f: 0, text: 'Loading cards from Scryfall…' })
		loadCards(allNames(), (f, text) => setLoading({ f, text }), force)
			.then((p) => {
				setPool(p)
				setLoading(null)
			})
			.catch((e) => setLoading({ f: 0, text: '', error: (e as Error).message || 'network error' }))
	}, [])
	useEffect(() => reload(false), [reload])

	const state = session?.history[session.history.length - 1]

	useEffect(() => {
		if (session) saveSession(session)
	}, [session])

	const send = useCallback(
		(i: Intent) => {
			const cur = sessionRef.current
			if (!cur) return 'No game'
			const st = cur.history[cur.history.length - 1]
			const r = tryApply(st, i)
			if (r.error) return r.error
			if (cur.online?.role === 'guest') {
				if (!connRef.current) return 'Not connected to your friend’s game'
				connRef.current.send({ type: 'intent', intent: i } satisfies GuestMsg)
				return undefined
			}
			const next = { ...cur, history: [...cur.history.slice(-80), r.state!] }
			sessionRef.current = next
			setSession(next)
			return undefined
		},
		[],
	)

	// Hot-seat: whoever must decide sits at the bottom; hide their hand until they take the device.
	useEffect(() => {
		if (!state || !session) return
		if (session.online) {
			setViewer(session.online.seat)
			setHandoff(null)
			return
		}
		if (session.bot) {
			setViewer(0)
			return
		}
		const who = actor(state)
		if (who !== null && who !== viewer) {
			setViewer(who)
			setHandoff(who)
		}
	}, [state, session, viewer])

	// Online host: every new state goes to the guest.
	useEffect(() => {
		if (!state || session?.online?.role !== 'host' || !connRef.current) return
		connRef.current.send({ type: 'state', state: stripCards(state) } satisfies HostMsg)
	}, [state, session?.online?.role])

	// Computer opponent plays seat 1.
	useEffect(() => {
		if (!state || !session?.bot) return
		const who = actor(state)
		if (who !== 1) return
		const t = window.setTimeout(() => {
			const cur = sessionRef.current
			if (!cur) return
			const st = cur.history[cur.history.length - 1]
			if (actor(st) !== 1) return
			const next = botStep(st, 1)
			if (next) {
				const n = { ...cur, history: [...cur.history.slice(-80), next] }
				sessionRef.current = n
				setSession(n)
			}
		}, 420)
		return () => window.clearTimeout(t)
	}, [state, session?.bot])

	// ───── online play ─────
	const closeNet = () => {
		connRef.current?.close()
		connRef.current = null
		hostRef.current?.destroy()
		hostRef.current = null
		setNet(null)
	}

	const attachGuest = (c: Conn) => {
		connRef.current?.close()
		connRef.current = c
		setNet({ ok: true, text: 'Friend connected' })
		c.onClose(() => {
			if (connRef.current === c) {
				connRef.current = null
				setNet({ ok: false, text: 'Friend disconnected — they can reopen your link to come back' })
			}
		})
		c.onMessage((m) => {
			if (!isGuestMsg(m)) return
			const cur = sessionRef.current
			if (m.type === 'hello') {
				if (cur?.online?.role === 'host') {
					const st = cur.history[cur.history.length - 1]
					c.send({ type: 'start', cards: st.cards, state: stripCards(st), hostName: st.players[0].name } satisfies HostMsg)
					return
				}
				const lb = lobbyRef.current
				const p = poolRef.current
				if (!lb || !p) return
				const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
				const g = buildGame(
					p.cards,
					[
						{ name: lb.name, deck: lb.deck.deck, leader: lb.deck.leader },
						{ name: (m.name || 'Player 2').slice(0, 24), deck: m.deck?.deck ?? 'klingon', leader: m.deck?.leader === 'alt' ? 'alt' : 'commander' },
					],
					lb.format,
					seed,
				)
				const next: Session = { history: [g], bot: false, online: { role: 'host', code: lb.code, seat: 0 } }
				sessionRef.current = next
				setSession(next)
				setLobby(null)
				c.send({ type: 'start', cards: g.cards, state: stripCards(g), hostName: lb.name } satisfies HostMsg)
				return
			}
			if (m.type === 'intent') {
				if (!cur) return
				const st = cur.history[cur.history.length - 1]
				if (m.intent.player !== 1) return
				const r = tryApply(st, m.intent)
				if (r.error) c.send({ type: 'error', message: r.error } satisfies HostMsg)
				else {
					const next = { ...cur, history: [...cur.history.slice(-80), r.state!] }
					sessionRef.current = next
					setSession(next)
				}
			}
		})
	}

	const openHost = async (code: string) => {
		closeNet()
		setNet({ ok: false, text: 'Opening the game for your friend…' })
		try {
			const h = await hostGame(code)
			hostRef.current = h
			h.onConnection(attachGuest)
			h.onError((e) => setNet({ ok: false, text: e }))
			setNet({ ok: false, text: 'Waiting for your friend to open the link…' })
			setLobby((lb) => (lb ? { ...lb, status: 'Waiting for your friend to open the link…' } : lb))
		} catch (e) {
			const msg = (e as Error).message
			setNet({ ok: false, text: msg })
			setLobby((lb) => (lb ? { ...lb, error: msg } : lb))
		}
	}

	const openGuest = async (code: string, name: string, deck: DeckChoice) => {
		closeNet()
		setNet({ ok: false, text: 'Connecting to your friend’s game…' })
		try {
			const c = await joinGame(code)
			connRef.current = c
			setNet({ ok: true, text: 'Connected' })
			c.onClose(() => {
				if (connRef.current === c) {
					connRef.current = null
					setNet({ ok: false, text: 'Disconnected from your friend’s game — reopen the invite link to reconnect' })
				}
			})
			c.onMessage((m) => {
				if (!isHostMsg(m)) return
				if (m.type === 'start') {
					cardsRef.current = m.cards
					setLobby(null)
					const next: Session = { history: [withCards(m.state, m.cards)], bot: false, online: { role: 'guest', code, seat: 1 } }
					sessionRef.current = next
					setSession(next)
				} else if (m.type === 'state') {
					const st = withCards(m.state, cardsRef.current)
					setSession((prev) => {
						const next = prev ? { ...prev, history: [...prev.history.slice(-40), st] } : prev
						sessionRef.current = next
						return next
					})
				} else if (m.type === 'error') setNetError(m.message)
			})
			c.send({ type: 'hello', name, deck } satisfies GuestMsg)
		} catch (e) {
			const msg = (e as Error).message
			setNet({ ok: false, text: msg })
			setLobby((lb) => (lb ? { ...lb, error: msg } : lb))
		}
	}

	useEffect(() => () => closeNet(), [])

	const start = (r: SetupResult) => {
		if (!pool) return
		if (r.mode === 'host') {
			const code = newGameCode()
			setLobby({ role: 'host', code, name: r.names[0], deck: { deck: r.decks[0], leader: r.leaders[0] }, format: r.format, status: 'Opening…' })
			void openHost(code)
			return
		}
		if (r.mode === 'guest' && joinCode) {
			const deck = { deck: r.decks[0], leader: r.leaders[0] }
			setLobby({ role: 'guest', code: joinCode, name: r.names[0], deck, format: r.format, status: 'Connecting…' })
			clearJoinFromUrl()
			void openGuest(joinCode, r.names[0], deck)
			return
		}
		const g = buildGame(
			pool.cards,
			[
				{ name: r.names[0], deck: r.decks[0], leader: r.leaders[0] },
				{ name: r.names[1], deck: r.decks[1], leader: r.leaders[1], bot: r.mode === 'bot' },
			],
			r.format,
			r.seed,
		)
		const next: Session = { history: [g], bot: r.mode === 'bot' }
		sessionRef.current = next
		setSession(next)
		setViewer(0)
		setHandoff(null)
	}

	const undo = () => {
		const cur = sessionRef.current
		if (!cur || cur.history.length < 2) return
		let h = cur.history.slice(0, -1)
		if (cur.bot) while (h.length > 1 && actor(h[h.length - 1]) === 1) h = h.slice(0, -1)
		const next = { ...cur, history: h }
		sessionRef.current = next
		setSession(next)
	}

	const saved = !session && !lobby ? loadSave() : null
	let body
	if (lobby && (!session || !state))
		body = (
			<LobbyScreen
				lobby={lobby}
				net={net}
				onCancel={() => {
					closeNet()
					setLobby(null)
				}}
				onRetry={() => (lobby.role === 'host' ? openHost(lobby.code) : openGuest(lobby.code, lobby.name, lobby.deck))}
			/>
		)
	else if (!session || !state)
		body = (
			<Setup
				pool={pool}
				loading={loading}
				onReload={() => reload(true)}
				onStart={start}
				joinCode={joinCode}
				resume={
					saved
						? {
								label: saved.online ? 'Resume online game' : 'Resume saved game',
								go: () => {
									if (saved.online?.role === 'guest') {
										const me = saved.history[saved.history.length - 1].players[1]
										const deck = { deck: 'federation', leader: 'commander' as const }
										setLobby({ role: 'guest', code: saved.online.code, name: me.name, deck, format: 'duel', status: 'Reconnecting…' })
										void openGuest(saved.online.code, me.name, deck)
										return
									}
									sessionRef.current = saved
									setSession(saved)
									if (saved.online?.role === 'host') void openHost(saved.online.code)
								},
							}
						: undefined
				}
			/>
		)
	else
		body = (
			<>
				<Board
					state={state}
					send={send}
					viewer={viewer}
					hideHand={handoff !== null}
					bot={session.bot}
					online={!!session.online}
					onUndo={session.history.length > 1 && !session.online ? undo : undefined}
					onMenu={() => {
						if (session.online) closeNet()
						sessionRef.current = null
						setSession(null)
						setJoinCode(null)
					}}
					layout={pocket ? 'pocket' : 'console'}
					layoutChoice={layoutChoice}
					onLayout={chooseLayout}
					side={session.online ? <NetPanel net={net} code={session.online.code} host={session.online.role === 'host'} error={netError} onDismiss={() => setNetError(null)} /> : undefined}
				/>
				{handoff !== null && !session.bot && state.pending.kind !== 'over' && (
					<div className="handoff" onClick={() => setHandoff(null)}>
						<div>
							Pass the device to <b>{state.players[handoff].name}</b>
							<small>Tap when ready</small>
						</div>
					</div>
				)}
			</>
		)

	if (pocket && session && state && !lobby) return <div className="pocket-root">{body}</div>
	if (!session && !lobby) return <div className="page-root">{body}</div>

	return (
		<div className="viewport">
			<div className="stage" style={{ width: W, height: H, transform: `scale(${scale})`, left: (window.innerWidth - W * scale) / 2, top: (window.innerHeight - H * scale) / 2 }}>
				{body}
			</div>
		</div>
	)
}

function LobbyScreen({ lobby, net, onCancel, onRetry }: { lobby: Lobby; net: { ok: boolean; text: string } | null; onCancel: () => void; onRetry: () => void }) {
	const [copied, setCopied] = useState(false)
	const link = joinLink(lobby.code)
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			/* select the text instead */
		}
	}
	return (
		<div className="lobby">
			<h2>{lobby.role === 'host' ? 'Invite a friend' : 'Joining your friend’s game'}</h2>
			{lobby.role === 'host' && (
				<>
					<p>Send this link to your friend. When they open it, pick a deck and press Join, the game starts for both of you.</p>
					<div className="invite">
						<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
						<button className="primary" onClick={copy}>
							{copied ? 'Copied!' : 'Copy link'}
						</button>
					</div>
					<p className="dim">Keep this page open until your friend joins. Game code: {lobby.code}</p>
				</>
			)}
			<div className={`lobby-status ${lobby.error ? 'bad' : ''}`}>{lobby.error ?? net?.text ?? lobby.status}</div>
			<div className="setup-buttons">
				{lobby.error && (
					<button className="primary" onClick={onRetry}>
						Try again
					</button>
				)}
				<button onClick={onCancel}>Cancel</button>
			</div>
		</div>
	)
}

function NetPanel({ net, code, host, error, onDismiss }: { net: { ok: boolean; text: string } | null; code: string; host: boolean; error: string | null; onDismiss: () => void }) {
	const [copied, setCopied] = useState(false)
	return (
		<div className={`netpanel ${net?.ok ? 'ok' : 'bad'}`}>
			<div className="net-status">
				<span className="dot" /> {net?.text ?? 'Not connected'} · {host ? 'you host' : 'friend hosts'} · {code}
			</div>
			{host && !net?.ok && (
				<button
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(joinLink(code))
							setCopied(true)
						} catch {
							/* ignore */
						}
					}}
				>
					{copied ? 'Link copied' : 'Copy invite link again'}
				</button>
			)}
			{error && (
				<div className="error-inline" onClick={onDismiss}>
					{error}
				</div>
			)}
		</div>
	)
}
