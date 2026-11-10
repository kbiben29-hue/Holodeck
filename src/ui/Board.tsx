import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { abilityProblem, canAttack, canBlock, canCast, canPlayLand, commanderTax, manaAbilitiesOf, spellCost, STEP_NAMES, tryApply } from '../engine/engine'
import { costText } from '../engine/mana'
import { useMotion } from './motion'
import { cardName, def, findPerm, isCreature, keywords, opp, permName, pt, rulesOf } from '../engine/state'
import type { CardDef, GameState, Intent, Mana, ManualOp, Obj, Perm, Step } from '../engine/types'
import { CardBack, CardFaceView, Cost, Pip } from './Card'
import type { Hint } from './coach'
import { isMuted, setMuted, soundFor, sfx, unlockAudio } from './sfx'

export type LayoutChoice = 'auto' | 'console' | 'pocket'

export interface BoardProps {
	state: GameState
	send: (i: Intent) => string | undefined
	viewer: number
	hideHand?: boolean
	bot?: boolean
	online?: boolean
	onUndo?: () => void
	onMenu: () => void
	layout: 'console' | 'pocket'
	layoutChoice: LayoutChoice
	onLayout: (c: LayoutChoice) => void
	side?: ReactNode
	/** Tutorial coach panel and the moves it suggests. */
	coach?: ReactNode
	hint?: Hint
}

/** Does a button label match one of the hinted labels? */
const hintMatch = (h: Hint | undefined, label: string) => !!h?.buttons?.some((b) => b && label.toLowerCase().startsWith(b.toLowerCase()))

type Sel = { iid: number } | null
type ZoneView = { player: number; zone: 'graveyard' | 'exile' | 'library' | 'command' | 'peek' } | null

const PHASES: { label: string; steps: Step[] }[] = [
	{ label: 'Untap', steps: ['untap'] },
	{ label: 'Upkeep', steps: ['upkeep'] },
	{ label: 'Draw', steps: ['draw'] },
	{ label: 'Main 1', steps: ['main1'] },
	{ label: 'Combat', steps: ['beginCombat', 'attackers', 'blockers', 'firstDamage', 'damage', 'endCombat'] },
	{ label: 'Main 2', steps: ['main2'] },
	{ label: 'End', steps: ['end', 'cleanup'] },
]

const MANA: Mana[] = ['W', 'U', 'B', 'R', 'G', 'C']

export function Board(props: BoardProps) {
	const { state: s, send, viewer: me, layout } = props
	const them = opp(me)
	const [sel, setSel] = useState<Sel>(null)
	const [hover, setHover] = useState<number | null>(null)
	const [toast, setToast] = useState<string | null>(null)
	const [attackSel, setAttackSel] = useState<number[]>([])
	const [blockFrom, setBlockFrom] = useState<number | null>(null)
	const [blocks, setBlocks] = useState<{ blocker: number; attacker: number }[]>([])
	const [attachFrom, setAttachFrom] = useState<number | null>(null)
	const [zone, setZone] = useState<ZoneView>(null)
	const [menu, setMenu] = useState(false)
	const [tokens, setTokens] = useState(false)
	const [sheet, setSheet] = useState(false)
	const [autoEnd, setAutoEnd] = useState(false)
	const [coachMin, setCoachMin] = useState(false)
	const [muted, setMutedState] = useState(isMuted())
	const boardRef = useRef<HTMLDivElement>(null)
	useMotion(boardRef, s)
	const [zoom, setZoom] = useState<{ iid: number; x: number; y: number } | null>(null)
	/** Hovering a card: show it in the viewer and enlarged beside the pointer (table layout). */
	const peek = (iid: number, e?: MouseEvent<HTMLDivElement>) => {
		setHover(iid)
		const b = boardRef.current
		if (!e || !b || layout !== 'console') return
		const br = b.getBoundingClientRect()
		const k = br.width / 1600 || 1
		const r = e.currentTarget.getBoundingClientRect()
		const cx = (r.left + r.width / 2 - br.left) / k
		const cy = (r.top + r.height / 2 - br.top) / k
		const x = Math.max(4, Math.min(1600 - 284, cx - 140))
		const y = Math.max(4, Math.min(1000 - 394, cy - 195))
		setZoom({ iid, x, y })
	}
	const unpeek = () => setZoom(null)
	useEffect(() => setZoom(null), [s.log.length, s.pending.kind])
	const H = props.hint
	const hb = (label: string) => (hintMatch(H, label) ? 'hint' : '')
	const hHand = new Set(H?.hand ?? [])
	const hPerm = new Set(H?.perms ?? [])
	// sounds for new log lines
	const logLen = useRef(s.log.length)
	useEffect(() => {
		const fresh = s.log.slice(logLen.current)
		logLen.current = s.log.length
		const played = new Set<() => void>()
		fresh.slice(-6).forEach((line, i) => {
			const f = soundFor(line, s.players[me].name)
			if (f && !played.has(f) && played.size < 3) {
				played.add(f)
				window.setTimeout(f, i * 90)
			}
		})
	}, [s.log.length])
	const pend = s.pending
	const toastTimer = useRef<number | undefined>(undefined)

	const flash = (msg: string) => {
		setToast(msg)
		window.clearTimeout(toastTimer.current)
		toastTimer.current = window.setTimeout(() => setToast(null), 3500)
	}
	const act = (i: Intent): boolean => {
		const err = send(i)
		if (err) {
			flash(err)
			return false
		}
		return true
	}
	const tool = (m: ManualOp) => act({ type: 'manual', player: me, m })

	// reset per-decision UI state
	useEffect(() => {
		if (pend.kind === 'attackers' && pend.player === me) setAttackSel(s.battlefield.filter((p) => canAttack(s, p) && (rulesOf(s, p).mustAttack || keywords(s, p).includes('goaded'))).map((p) => p.iid))
		if (pend.kind !== 'attackers') setAttackSel([])
		if (pend.kind !== 'blockers') {
			setBlocks([])
			setBlockFrom(null)
		}
	}, [pend.kind])
	useEffect(() => {
		if (s.notice && s.notice.player === me) flash(s.notice.text)
	}, [s.notice, me])

	// "End turn": keep passing (and declaring no attack) until the turn moves on or something happens
	useEffect(() => {
		if (!autoEnd) return
		if (s.active !== me || s.stack.length || pend.kind === 'over') return setAutoEnd(false)
		if (pend.kind === 'priority' && pend.player === me) {
			const t = window.setTimeout(() => act({ type: 'pass', player: me }) || setAutoEnd(false), 60)
			return () => window.clearTimeout(t)
		}
		if (pend.kind === 'attackers' && pend.player === me) {
			const t = window.setTimeout(() => act({ type: 'attack', player: me, attackers: [] }) || setAutoEnd(false), 60)
			return () => window.clearTimeout(t)
		}
		if (pend.kind === 'choose') setAutoEnd(false)
	}, [autoEnd, s, me])

	const selected = sel ? locateAny(s, sel.iid) : null
	const shownIid = hover ?? sel?.iid ?? null
	const shown = shownIid !== null ? locateAny(s, shownIid) : null

	const boardPick = (iid: number): string | null => {
		if (pend.kind !== 'choose' || pend.player !== me) return null
		const o = pend.question.options.find((x) => x.iid === iid && (x.id === `p:${iid}` || x.id === String(iid)))
		return o ? o.id : null
	}
	const clickPerm = (p: Perm) => {
		const pick = boardPick(p.iid)
		if (pick && pend.kind === 'choose' && pend.question.max === 1) {
			act({ type: 'choose', player: me, picks: [pick] })
			return
		}
		if (attachFrom !== null) {
			if (p.iid !== attachFrom) tool({ op: 'attach', iid: attachFrom, to: p.iid })
			setAttachFrom(null)
			return
		}
		if (pend.kind === 'attackers' && pend.player === me && p.controller === me && canAttack(s, p)) {
			setAttackSel((a) => (a.includes(p.iid) ? a.filter((x) => x !== p.iid) : [...a, p.iid]))
			setSel({ iid: p.iid })
			return
		}
		if (pend.kind === 'blockers' && pend.player === me) {
			if (p.controller === me && isCreature(s, p) && !p.tapped) {
				const existing = blocks.find((b) => b.blocker === p.iid)
				if (existing) setBlocks(blocks.filter((b) => b !== existing))
				setBlockFrom(p.iid)
				setSel({ iid: p.iid })
				return
			}
			if (p.controller !== me && blockFrom !== null && s.combat?.attackers.some((a) => a.iid === p.iid)) {
				const b = findPerm(s, blockFrom)
				if (b && canBlock(s, b, p)) setBlocks([...blocks.filter((x) => x.blocker !== blockFrom), { blocker: blockFrom, attacker: p.iid }])
				else flash(`${b ? permName(s, b) : 'That'} can't block ${permName(s, p)}.`)
				setBlockFrom(null)
				return
			}
		}
		setSel({ iid: p.iid })
		if (layout === 'pocket') setSheet(true)
	}
	const clickCard = (o: Obj) => {
		setSel({ iid: o.iid })
		if (layout === 'pocket') setSheet(true)
	}
	const dbl = (p: Perm) => {
		// double-click a land/mana rock: tap it for mana; anything else: tap/untap
		const ma = manaAbilitiesOf(s, p).filter((x) => x.ok)
		if (p.controller === me && ma.length === 1 && ma[0].options.length === 1) act({ type: 'tapForMana', player: me, iid: p.iid, ability: ma[0].a.index })
		else tool({ op: 'tap', iid: p.iid, tapped: !p.tapped })
	}

	const prompt = usePrompt(s, me, { attackSel, setAttackSel, blocks, setBlocks, act, setAutoEnd, onMenu: props.onMenu })

	const permView = (p: Perm, size: 'm' | 's' = 'm') => {
		const attached = s.battlefield.filter((q) => q.attachedTo === p.iid)
		const att = s.combat?.attackers.some((a) => a.iid === p.iid)
		const blk = s.combat?.blocks.find((b) => b.blocker === p.iid)
		const pendingAtt = attackSel.includes(p.iid)
		const pendingBlk = blocks.find((b) => b.blocker === p.iid)
		const candidate = (pend.kind === 'attackers' && pend.player === me && canAttack(s, p)) || (pend.kind === 'blockers' && pend.player === me && p.controller === me && isCreature(s, p) && !p.tapped)
		const blockTarget = pend.kind === 'blockers' && pend.player === me && blockFrom !== null && s.combat?.attackers.some((a) => a.iid === p.iid)
		const creature = isCreature(s, p)
		const [pw, tg] = creature ? pt(s, p) : [0, 0]
		const d = def(s, p.card)
		const counters = Object.entries(p.counters).filter(([, v]) => v)
		return (
			<div key={p.iid} className={`perm ${size} ${p.tapped ? 'tapped' : ''}`} data-iid={p.iid}>
				<CardFaceView
					def={d}
					back={p.flipped}
					className={[
						sel?.iid === p.iid ? 'sel' : '',
						att || pendingAtt ? 'attacking' : '',
						blk || pendingBlk ? 'blocking' : '',
						candidate ? 'candidate' : '',
						blockTarget || boardPick(p.iid) ? 'target' : '',
						hPerm.has(p.iid) ? 'hint' : '',
						attachFrom !== null ? 'target' : '',
						p.faceDown ? 'facedown' : '',
					].join(' ')}
					onClick={(e) => {
						e.stopPropagation()
						clickPerm(p)
					}}
					onMouseEnter={(e) => peek(p.iid, e)} onMouseLeave={unpeek}
				>
					<span className="dbl" onDoubleClick={() => dbl(p)} />
					{p.sick && creature && p.controller === s.active && <span className="badge sick" title="Summoning sick">z</span>}
					{p.token && <span className="badge tok">token</span>}
					{p.commander && <span className="badge cmd">★</span>}
					{counters.length > 0 && (
						<span className="counters">
							{counters.map(([k, v]) => (
								<span key={k} className={`ctr ${k === '+1/+1' ? 'plus' : k === '-1/-1' ? 'minus' : k === 'loyalty' ? 'loy' : ''}`}>
									{k === '+1/+1' ? `+${v}` : k === '-1/-1' ? `-${v}` : k === 'loyalty' ? `◆${v}` : `${v} ${k}`}
								</span>
							))}
						</span>
					)}
					{creature && (
						<span className={`ptbox ${p.damage ? 'hurt' : ''}`}>
							{pw}/{tg - p.damage}
						</span>
					)}
					{(pendingBlk || blk) && <span className="badge blk">⛨</span>}
				</CardFaceView>
				{attached.length > 0 && (
					<div className="attached">
						{attached.map((q) => (
							<span
								key={q.iid}
								className={`att-tag ${sel?.iid === q.iid ? 'sel' : ''}`}
								onClick={(e) => {
									e.stopPropagation()
									clickPerm(q)
								}}
								onMouseEnter={(e) => peek(q.iid, e)} onMouseLeave={unpeek}
							>
								{permName(s, q)}
							</span>
						))}
					</div>
				)}
			</div>
		)
	}

	const field = (p: number, size: 'm' | 's') => {
		const mine = s.battlefield.filter((x) => x.controller === p && (x.attachedTo === undefined || !findPerm(s, x.attachedTo)))
		const lands = mine.filter((x) => rulesOf(s, x).types.includes('land') && !isCreature(s, x))
		const creatures = mine.filter((x) => isCreature(s, x))
		const other = mine.filter((x) => !lands.includes(x) && !creatures.includes(x))
		return (
			<>
				<div className="row creatures">{creatures.length ? creatures.map((x) => permView(x, size)) : <span className="empty">no creatures</span>}</div>
				<div className="row lower">
					<div className="lands">{groupLands(s, lands).map((g) => landGroup(g, size))}</div>
					<div className="others">{other.map((x) => permView(x, size))}</div>
				</div>
			</>
		)
	}
	const landGroup = (g: Perm[], size: 'm' | 's') => {
		if (g.length === 1) return permView(g[0], size)
		const untapped = g.filter((x) => !x.tapped)
		const top = untapped[0] ?? g[0]
		return (
			<div key={'g' + g[0].iid} className="landgroup">
				{permView(top, size)}
				<span className="count" title={`${untapped.length} untapped of ${g.length}`}>
					×{g.length}
					{untapped.length !== g.length && <small> ({untapped.length} up)</small>}
				</span>
			</div>
		)
	}

	/** Library, graveyard, exile and command zone, like piles beside a playmat. */
	const piles = (p: number) => {
		const pl = s.players[p]
		const topGy = pl.graveyard[pl.graveyard.length - 1]
		const topEx = pl.exile[pl.exile.length - 1]
		const isMe = p === me
		return (
			<div className="piles">
				<div className="pile" title="Library" onClick={() => setZone({ player: p, zone: 'library' })}>
					<span className="pile-label">Library</span>
					<div className="pile-card" data-anchor={`library-${p}`}>
						{pl.library.length ? <CardBack /> : <div className="pile-empty" />}
						{pl.library.length > 1 && <div className="pile-shadow" />}
						<span className="pile-n">{pl.library.length}</span>
					</div>
				</div>
				<div className="pile" title="Graveyard — click to see it" onClick={() => setZone({ player: p, zone: 'graveyard' })} onMouseEnter={(e) => topGy && peek(topGy.iid, e)} onMouseLeave={unpeek}>
					<span className="pile-label">Graveyard</span>
					<div className="pile-card" data-anchor={`graveyard-${p}`}>
						{topGy ? <CardFaceView def={def(s, topGy.card)} /> : <div className="pile-empty" />}
						<span className="pile-n">{pl.graveyard.length}</span>
					</div>
				</div>
				<div className="pile" title="Exile — click to see it" onClick={() => setZone({ player: p, zone: 'exile' })} onMouseEnter={(e) => topEx && peek(topEx.iid, e)} onMouseLeave={unpeek}>
					<span className="pile-label">Exile</span>
					<div className="pile-card" data-anchor={`exile-${p}`}>
						{topEx ? <CardFaceView def={def(s, topEx.card)} /> : <div className="pile-empty" />}
						<span className="pile-n">{pl.exile.length}</span>
					</div>
				</div>
				<div className="pile cmdpile" title="Command zone">
					<span className="pile-label">Command{pl.command.some((o) => pl.commanderCasts[o.card]) ? ` +${commanderTax(s, p, pl.command[0]?.card ?? '')}` : ''}</span>
					<div className="pile-card" data-anchor={`command-${p}`}>
						{pl.command.length ? (
							pl.command.map((o) => <CardFaceView key={o.iid} iid={o.iid} def={def(s, o.card)} className={`${sel?.iid === o.iid ? 'sel' : ''} ${isMe && playable(s, me, o) ? 'playable' : ''} ${hHand.has(o.iid) ? 'hint' : ''}`} onClick={(e) => (e.stopPropagation(), clickCard(o))} onMouseEnter={(e) => peek(o.iid, e)} onMouseLeave={unpeek} />)
						) : (
							<div className="pile-empty" />
						)}
					</div>
				</div>
			</div>
		)
	}

	const hand = s.players[me].hand
	const handView = (size: 'm' | 's') => (
		<div className={`hand ${size}`}>
			{hand.map((o, i) =>
				props.hideHand ? (
					<CardBack key={o.iid} />
				) : (
					<CardFaceView
						key={o.iid}
						iid={o.iid}
						def={def(s, o.card)}
						className={`${sel?.iid === o.iid ? 'sel' : ''} ${playable(s, me, o) ? 'playable' : ''} ${hHand.has(o.iid) ? 'hint' : ''}`}
						style={layout === 'console' ? { zIndex: i } : undefined}
						onClick={() => clickCard(o)}
						onMouseEnter={(e) => peek(o.iid, e)} onMouseLeave={unpeek}
					/>
				),
			)}
			{hand.length === 0 && <span className="empty">empty hand</span>}
		</div>
	)

	const playerBar = (p: number) => {
		const pl = s.players[p]
		const isMe = p === me
		const cmdDamage = s.format.commanderDamage ? Object.entries(pl.commanderDamage).filter(([, v]) => v > 0) : []
		const poolTotal = MANA.reduce((n, m) => n + pl.pool[m], 0)
		return (
			<div className={`pbar ${isMe ? 'me' : 'them'} ${s.active === p ? 'active' : ''} ${pend.kind !== 'over' && pend.player === p ? 'deciding' : ''}`}>
				<span className="pname">
					{pl.name}
					{pl.bot ? ' 🤖' : ''}
				</span>
				<span className="life" title="Life (tap ± to change)">
					<button className="mini" onClick={() => tool({ op: 'life', player: p, delta: -1 })}>
						−
					</button>
					<b data-life={p}>{pl.life}</b>
					<button className="mini" onClick={() => tool({ op: 'life', player: p, delta: 1 })}>
						+
					</button>
				</span>
				{pl.poison > 0 && <span className="poison">☣ {pl.poison}</span>}
				{cmdDamage.map(([c, v]) => (
					<span key={c} className="cmddmg" title="Commander damage taken">
						⚔ {cardName(s, c).split(',')[0]} {v}
					</span>
				))}
				<span className="zones">
					<span className="zone" title="Cards in hand" data-anchor={`hand-${p}`}>
						✋ {pl.hand.length}
					</span>
					{layout === 'pocket' && (
						<>
							<button className="zone" title="Library" data-anchor={`library-${p}`} onClick={() => setZone({ player: p, zone: 'library' })}>
								📚 {pl.library.length}
							</button>
							<button className="zone" title="Graveyard" data-anchor={`graveyard-${p}`} onClick={() => setZone({ player: p, zone: 'graveyard' })}>
								⚰ {pl.graveyard.length}
							</button>
							{pl.exile.length > 0 && (
								<button className="zone" title="Exile" data-anchor={`exile-${p}`} onClick={() => setZone({ player: p, zone: 'exile' })}>
									⊘ {pl.exile.length}
								</button>
							)}
						</>
					)}
				</span>
				{layout === 'pocket' && (
					<span className="command" data-anchor={`command-${p}`}>
						{pl.command.map((o) => (
							<CardFaceView key={o.iid} iid={o.iid} def={def(s, o.card)} className={`cmdcard ${sel?.iid === o.iid ? 'sel' : ''} ${isMe && playable(s, me, o) ? 'playable' : ''} ${hHand.has(o.iid) ? 'hint' : ''}`} onClick={() => clickCard(o)} />
						))}
					</span>
				)}
				{poolTotal > 0 && (
					<span className="pool" title="Mana pool">
						{MANA.filter((m) => pl.pool[m] > 0).map((m) => (
							<Pip key={m} m={m} n={pl.pool[m]} />
						))}
					</span>
				)}
			</div>
		)
	}

	const stackView = (
		<div className="stack">
			{s.stack.length === 0 ? null : (
				<>
					<span className="stack-label">STACK</span>
					{s.stack
						.slice()
						.reverse()
						.map((it, i) => (
							<div key={it.sid} data-iid={it.obj?.iid} className={`stack-item ${i === 0 ? 'top' : ''} ${it.controller === me ? 'mine' : 'theirs'}`} onMouseEnter={(e) => peek(it.obj?.iid ?? it.iid, e)} onMouseLeave={unpeek} title={it.text}>
								<CardFaceView def={def(s, it.card)} />
								<span className="si-text">
									<b>{it.kind === 'spell' ? cardName(s, it.card) : `${cardName(s, it.card)} — ${it.kind === 'trigger' ? 'trigger' : 'ability'}`}</b>
									{it.targets.length > 0 && <small> → {it.targets.map((t) => (t.kind === 'player' ? s.players[t.id].name : t.kind === 'perm' ? (findPerm(s, t.id) ? permName(s, findPerm(s, t.id)!) : 'gone') : 'spell')).join(', ')}</small>}
									{it.manual && <small className="manual"> by hand</small>}
								</span>
							</div>
						))}
				</>
			)}
		</div>
	)

	const phaseBar = (
		<div className="phases">
			<span className="turn">T{s.turn}</span>
			{PHASES.map((ph) => (
				<span key={ph.label} className={`ph ${ph.steps.includes(s.step) ? 'on' : ''}`}>
					{ph.label}
				</span>
			))}
		</div>
	)

	const promptBar = (
		<div className={`prompt ${prompt.mine ? 'mine' : ''}`}>
			<span className="ptext">{attachFrom !== null ? 'Click the permanent to attach it to (or click it again to cancel).' : blockFrom !== null ? 'Now click the attacker it should block.' : prompt.text}</span>
			<span className="pbtns">
				{attachFrom !== null ? (
					<button onClick={() => setAttachFrom(null)}>Cancel</button>
				) : (
					prompt.buttons.map((b) => (
						<button key={b.label} className={`${b.primary ? 'primary' : ''} ${hb(b.label)}`} onClick={b.onClick}>
							{b.label}
						</button>
					))
				)}
			</span>
		</div>
	)

	const actions = selected ? <ActionPanel
				s={s}
				me={me}
				loc={selected}
				act={(i) => {
					const ok = act(i)
					if (ok && layout === 'pocket') setSheet(false)
					return ok
				}}
				tool={(m) => {
					const ok = tool(m)
					if (ok && layout === 'pocket' && m.op === 'move') setSheet(false)
					return ok
				}}
				setAttachFrom={(n) => (setAttachFrom(n), setSheet(false))}
				close={() => (setSel(null), setSheet(false))}
				hb={hb}
			/> : null

	const viewerPanel = (
		<div className="viewer">
			{shown ? (
				<>
					<CardFaceView def={def(s, shown.obj.card)} back={(shown.obj as Perm).flipped} className="big" />
					<CardInfo s={s} loc={shown} />
				</>
			) : (
				<div className="viewer-empty">Hover or tap a card to see it here.</div>
			)}
		</div>
	)

	const logView = <Log lines={s.log} />

	const modals = (
		<>
			{pend.kind === 'mulligan' && pend.player === me && !props.hideHand && <MulliganModal s={s} me={me} act={act} hb={hb} />}
			{pend.kind === 'bottom' && pend.player === me && !props.hideHand && <BottomModal s={s} me={me} count={pend.count} act={act} />}
			{pend.kind === 'choose' && pend.player === me && !props.hideHand && <ChooseModal s={s} me={me} act={act} onHover={setHover} hb={hb} hint={H} />}
			{zone && <ZoneModal s={s} me={me} view={zone} close={() => (zone.zone === 'peek' && tool({ op: 'peek', player: me, count: 0 }), setZone(null))} tool={tool} act={act} />}
			{s.players[me].peek ? <ZoneModal s={s} me={me} view={{ player: me, zone: 'peek' }} close={() => tool({ op: 'peek', player: me, count: 0 })} tool={tool} act={act} /> : null}
			{tokens && <TokenModal s={s} me={me} tool={tool} close={() => setTokens(false)} />}
			{menu && (
				<MenuModal
					{...props}
					me={me}
					tool={tool}
					close={() => setMenu(false)}
					openTokens={() => (setMenu(false), setTokens(true))}
					openZone={(z) => (setMenu(false), setZone(z))}
				/>
			)}
			{pend.kind === 'over' && !props.coach && <OverModal s={s} me={me} onMenu={props.onMenu} />}
			{toast && (
				<div className="toast" onClick={() => setToast(null)}>
					{toast}
				</div>
			)}
		</>
	)

	if (layout === 'pocket')
		return (
			<div className="pocket" ref={boardRef} onClick={() => setHover(null)} onPointerDown={unlockAudio}>
				{props.coach &&
					(coachMin ? (
						<button className="p-coach-pill" onClick={() => setCoachMin(false)}>
							Coach ▸
						</button>
					) : (
						<div className="p-coach">
							<button className="mini p-coach-min" onClick={() => setCoachMin(true)}>
								hide
							</button>
							{props.coach}
						</div>
					))}
				<div className="p-top">
					{playerBar(them)}
					<button className="menu-btn" onClick={() => setMenu(true)}>
						☰
					</button>
				</div>
				<div className="p-field them">{field(them, 's')}</div>
				<div className="p-mid">
					{phaseBar}
					{stackView}
					{promptBar}
				</div>
				<div className="p-field me">{field(me, 's')}</div>
				<div className="p-dock">
					{playerBar(me)}
					{handView('s')}
				</div>
				{sheet && selected && (
					<div className="sheet-float">
						<div className="sheet" onClick={(e) => e.stopPropagation()}>
							<button className="mini sheet-x" onClick={() => setSheet(false)}>
								✕
							</button>
							<CardFaceView def={def(s, selected.obj.card)} back={(selected.obj as Perm).flipped} className="big" />
							<CardInfo s={s} loc={selected} />
							{actions}
						</div>
					</div>
				)}
				{modals}
			</div>
		)

	return (
		<div className="board" ref={boardRef} onMouseLeave={() => (setHover(null), setZoom(null))} onPointerDown={unlockAudio}>
			{zoom && locateAny(s, zoom.iid) && !(props.hideHand && s.players[me].hand.some((o) => o.iid === zoom.iid)) && (
				<div className="zoom" style={{ left: zoom.x, top: zoom.y }}>
					<CardFaceView def={def(s, locateAny(s, zoom.iid)!.obj.card)} back={(locateAny(s, zoom.iid)!.obj as Perm).flipped} className="big" />
				</div>
			)}
			<div className="main">
				<div className="side them">
					{playerBar(them)}
					<div className="fieldrow">
						<div className="field">{field(them, 'm')}</div>
						{piles(them)}
					</div>
				</div>
				<div className="center">
					{phaseBar}
					{stackView}
					{promptBar}
				</div>
				<div className="side me">
					<div className="fieldrow">
						<div className="field">{field(me, 'm')}</div>
						{piles(me)}
					</div>
					{playerBar(me)}
				</div>
				{handView('m')}
			</div>
			<div className="right">
				<div className="topbtns">
					<button onClick={() => setMenu(true)}>☰ Menu</button>
					<button onClick={() => setTokens(true)}>+ Token</button>
					{props.onUndo && <button onClick={props.onUndo}>↶ Undo</button>}
					<button title={muted ? 'Sound off' : 'Sound on'} onClick={() => (setMuted(!muted), setMutedState(!muted))}>
						{muted ? '🔇' : '🔊'}
					</button>
				</div>
				{props.side}
				{props.coach}
				{viewerPanel}
				<div className="actions-wrap">{actions}</div>
				{logView}
			</div>
			{modals}
		</div>
	)
}

// ───────── helpers ─────────

type Loc = { zone: 'battlefield' | 'hand' | 'graveyard' | 'exile' | 'library' | 'command' | 'stack'; owner: number; obj: Obj | Perm }

function locateAny(s: GameState, iid: number): Loc | null {
	const p = findPerm(s, iid)
	if (p) return { zone: 'battlefield', owner: p.owner, obj: p }
	for (let i = 0; i < s.players.length; i++) {
		const pl = s.players[i]
		for (const z of ['hand', 'graveyard', 'exile', 'library', 'command'] as const) {
			const o = pl[z].find((x) => x.iid === iid)
			if (o) return { zone: z, owner: i, obj: o }
		}
	}
	const it = s.stack.find((x) => x.obj?.iid === iid || (x.kind !== 'spell' && x.iid === iid))
	if (it) return { zone: 'stack', owner: it.controller, obj: it.obj ?? { iid: it.iid, card: it.card, owner: it.controller } }
	return null
}

function groupLands(s: GameState, lands: Perm[]): Perm[][] {
	const groups = new Map<string, Perm[]>()
	for (const l of lands) {
		const simple = !Object.keys(l.counters).length && !s.battlefield.some((q) => q.attachedTo === l.iid) && rulesOf(s, l).supertypes.includes('basic')
		const k = simple ? l.card : `u${l.iid}`
		groups.set(k, [...(groups.get(k) ?? []), l])
	}
	return [...groups.values()]
}

function playable(s: GameState, me: number, o: Obj): boolean {
	if (s.pending.kind !== 'priority' || s.pending.player !== me) return false
	if (rulesOf(s, o).types.includes('land')) return !canPlayLand(s, me, o.iid)
	return !canCast(s, me, o.iid)
}

function usePrompt(
	s: GameState,
	me: number,
	ui: {
		attackSel: number[]
		setAttackSel: (a: number[]) => void
		blocks: { blocker: number; attacker: number }[]
		setBlocks: (b: { blocker: number; attacker: number }[]) => void
		act: (i: Intent) => boolean
		setAutoEnd: (b: boolean) => void
		onMenu: () => void
	},
): { text: string; mine: boolean; buttons: { label: string; primary?: boolean; onClick: () => void }[] } {
	const p = s.pending
	const name = (i: number) => s.players[i].name
	if (p.kind === 'over') return { text: p.winner === null ? 'Draw game.' : `${name(p.winner)} wins!`, mine: false, buttons: [{ label: 'Back to menu', primary: true, onClick: ui.onMenu }] }
	if (p.player !== me) {
		const what = p.kind === 'mulligan' ? 'deciding on a mulligan' : p.kind === 'attackers' ? 'declaring attackers' : p.kind === 'blockers' ? 'declaring blockers' : p.kind === 'choose' ? 'making a choice' : 'thinking'
		return { text: `Waiting for ${name(p.player)} (${what})…`, mine: false, buttons: [] }
	}
	switch (p.kind) {
		case 'mulligan':
			return { text: 'Keep this hand or mulligan?', mine: true, buttons: [] }
		case 'bottom':
			return { text: `Put ${p.count} card(s) on the bottom.`, mine: true, buttons: [] }
		case 'choose':
			return { text: p.question.prompt, mine: true, buttons: [] }
		case 'attackers': {
			const all = s.battlefield.filter((x) => canAttack(s, x)).map((x) => x.iid)
			return {
				text: ui.attackSel.length ? `Attack with ${ui.attackSel.length} creature${ui.attackSel.length > 1 ? 's' : ''}?` : 'Declare attackers: click your creatures (glowing) to attack.',
				mine: true,
				buttons: [
					{ label: ui.attackSel.length ? `Attack (${ui.attackSel.length})` : 'No attack', primary: true, onClick: () => ui.act({ type: 'attack', player: me, attackers: ui.attackSel }) },
					{ label: 'All', onClick: () => ui.setAttackSel(all) },
				],
			}
		}
		case 'blockers': {
			const n = ui.blocks.length
			const incoming = (s.combat?.attackers ?? []).reduce((t, a) => t + (findPerm(s, a.iid) ? pt(s, findPerm(s, a.iid)!)[0] : 0), 0)
			return {
				text: n ? `${n} block${n > 1 ? 's' : ''} assigned. Click a creature again to change.` : `Incoming: ${incoming} damage. Click your creature, then the attacker it blocks.`,
				mine: true,
				buttons: [
					{ label: n ? `Confirm blocks (${n})` : 'No blocks', primary: true, onClick: () => ui.act({ type: 'block', player: me, blocks: ui.blocks }) },
					...(n ? [{ label: 'Clear', onClick: () => ui.setBlocks([]) }] : []),
				],
			}
		}
		case 'priority': {
			const top = s.stack[s.stack.length - 1]
			const pass = (label: string, primary = true) => ({ label, primary, onClick: () => ui.act({ type: 'pass', player: me }) })
			if (top) {
				const who = top.controller === me ? 'Your' : `${name(top.controller)}'s`
				return { text: `${who} ${top.kind === 'spell' ? cardName(s, top.card) : `${cardName(s, top.card)} ability`} is on the stack. Respond, or let it resolve.`, mine: true, buttons: [pass(top.controller === me ? 'Resolve' : 'Let it resolve')] }
			}
			if (s.active === me) {
				const label: Partial<Record<Step, string>> = { main1: 'Go to combat', main2: 'End turn', end: 'End turn', upkeep: 'Continue', draw: 'Continue', beginCombat: 'Continue', blockers: 'To damage', damage: 'Continue', endCombat: 'Continue', cleanup: 'Continue' }
				const btns = [pass(label[s.step] ?? 'Continue')]
				if (s.step === 'main1') btns.push({ label: 'End turn', primary: false, onClick: () => ui.setAutoEnd(true) })
				return { text: s.step === 'main1' || s.step === 'main2' ? `Your ${STEP_NAMES[s.step]}: play a land, cast spells, use abilities.` : `Your turn — ${STEP_NAMES[s.step]}.`, mine: true, buttons: btns }
			}
			return { text: `${name(s.active)}'s ${STEP_NAMES[s.step]}. You may respond with instants and abilities.`, mine: true, buttons: [pass('Pass')] }
		}
	}
	return { text: '', mine: false, buttons: [] }
}

// ───────── panels ─────────

function CardInfo({ s, loc }: { s: GameState; loc: Loc }) {
	const d = def(s, loc.obj.card)
	const p = loc.zone === 'battlefield' ? (loc.obj as Perm) : null
	const host = p?.attachedTo !== undefined ? findPerm(s, p.attachedTo) : undefined
	const r = rulesOf(s, loc.obj)
	return (
		<div className="cardinfo">
			<div className="ci-name">
				{p ? permName(s, p) : d.name} <Cost cost={p?.flipped && d.back ? d.back.manaCost : d.manaCost} small />
			</div>
			<div className="ci-type">{p?.flipped && d.back ? d.back.typeLine : d.typeLine}</div>
			{d.missing && <div className="ci-warn">Card details couldn’t be loaded — play it with the table tools.</div>}
			{!d.image && <div className="ci-text">{p?.flipped && d.back ? d.back.oracle : d.oracle}</div>}
			{p && (
				<div className="ci-state">
					{isCreature(s, p) && (
						<span>
							{pt(s, p).join('/')}
							{p.damage ? ` (${p.damage} damage)` : ''}
						</span>
					)}
					{keywords(s, p).length > 0 && <span>{keywords(s, p).join(', ')}</span>}
					{host && <span>Attached to {permName(s, host)}</span>}
					{p.controller !== p.owner && <span>Owner: {s.players[p.owner].name}</span>}
				</div>
			)}
			{!r.fullyAutomated && !d.missing && <div className="ci-hint">Some of this card’s text is done by hand (the game will remind you).</div>}
			<div className="ci-zone">{loc.zone === 'battlefield' ? `${s.players[(loc.obj as Perm).controller].name}’s battlefield` : `${s.players[loc.owner].name}’s ${loc.zone}`}</div>
		</div>
	)
}

function ActionPanel({ s, me, loc, act, tool, setAttachFrom, close, hb }: { s: GameState; me: number; loc: Loc; act: (i: Intent) => boolean; tool: (m: ManualOp) => boolean; setAttachFrom: (n: number | null) => void; close: () => void; hb: (label: string) => string }) {
	const [more, setMore] = useState(false)
	const [ctrKind, setCtrKind] = useState('+1/+1')
	const o = loc.obj
	const d = def(s, o.card)
	const btns: ReactNode[] = []
	const b = (label: ReactNode, fn: () => void, opts: { primary?: boolean; key?: string; text?: string } = {}) =>
		btns.push(
			<button key={opts.key ?? String(label)} className={`${opts.primary ? 'primary' : ''} ${hb(opts.text ?? (typeof label === 'string' ? label : ''))}`} onClick={fn}>
				{label}
			</button>,
		)
	const move = (to: Extract<ManualOp, { op: 'move' }>['to'], label: string) => b(label, () => tool({ op: 'move', iid: o.iid, to, player: me }), { key: 'mv' + label })

	if (loc.zone === 'hand' && loc.owner === me) {
		const r = rulesOf(s, o)
		if (r.types.includes('land')) b('Play land', () => act({ type: 'playLand', player: me, iid: o.iid }), { primary: true })
		else {
			const cost = spellCost(s, me, o.card, false)
			b(
				<>
					Cast <Cost cost={costText(cost)} small />
				</>,
				() => act({ type: 'cast', player: me, iid: o.iid }),
				{ primary: true, key: 'cast', text: 'Cast' },
			)
		}
		if (d.back) {
			const rb = rulesOf(s, { card: o.card, flipped: true })
			if (rb.types.includes('land')) b(`Play ${d.back.name}`, () => act({ type: 'playLand', player: me, iid: o.iid, back: true }))
			else b(`Cast ${d.back.name}`, () => act({ type: 'cast', player: me, iid: o.iid, back: true }))
		}
		const cy = rulesOf(s, o).cycling
		if (cy) b(
				<>
					{cy.basic ? 'Basic landcycling' : 'Cycle'} <Cost cost={cy.cost} small />
				</>,
				() => act({ type: 'cycle', player: me, iid: o.iid }),
				{ key: 'cycle', text: 'Cycle' },
			)
		move('battlefield', 'Put onto battlefield')
		move('graveyard', 'Discard')
		move('exile', 'Exile')
		move('library', 'Library top')
		move('libraryBottom', 'Library bottom')
	} else if (loc.zone === 'command') {
		if (loc.owner === me) {
			const cost = spellCost(s, me, o.card, true)
			b(
				<>
					Cast commander <Cost cost={costText(cost)} small />
				</>,
				() => act({ type: 'cast', player: me, iid: o.iid }),
				{ primary: true, key: 'cast', text: 'Cast commander' },
			)
		}
		move('battlefield', 'Put onto battlefield')
		move('hand', 'To hand')
	} else if (loc.zone === 'battlefield') {
		const p = o as Perm
		if (p.controller === me) {
			for (const m of manaAbilitiesOf(s, p)) {
				if (!m.ok || !m.amount) continue
				for (const col of m.a.kind === 'fixed' ? [m.options[0]] : m.options)
					b(
						<>
							Tap for {m.a.kind === 'fixed' ? <Cost cost={m.a.mana.map((x) => `{${x}}`).join('')} small /> : <Pip m={col} n={m.amount > 1 ? m.amount : undefined} />}
						</>,
						() => act({ type: 'tapForMana', player: me, iid: p.iid, ability: m.a.index, color: col }),
						{ key: `mana${m.a.index}${col}` },
					)
			}
			for (const a of rulesOf(s, p).activated) {
				const why = abilityProblem(s, me, p, a)
				btns.push(
					<button key={'ab' + a.index} className={`ability ${why ? 'dim' : 'primary'} ${hb(a.equip ? 'Equip' : a.text)}`} title={why ?? (a.compiled ? '' : 'Done by hand after it resolves')} onClick={() => act({ type: 'activate', player: me, iid: p.iid, ability: a.index })}>
						{a.equip ? `Equip ${a.cost.mana}` : a.text.length > 70 ? a.text.slice(0, 68) + '…' : a.text}
					</button>,
				)
			}
		}
		b(p.tapped ? 'Untap' : 'Tap', () => tool({ op: 'tap', iid: p.iid, tapped: !p.tapped }))
		if (isCreature(s, p) || p.counters['+1/+1']) {
			b('+1/+1 ctr', () => tool({ op: 'counter', iid: p.iid, kind: '+1/+1', delta: 1 }))
			if (p.counters['+1/+1']) b('−1 ctr', () => tool({ op: 'counter', iid: p.iid, kind: '+1/+1', delta: -1 }))
		}
		if (rulesOf(s, p).types.includes('planeswalker')) {
			b('Loyalty +1', () => tool({ op: 'counter', iid: p.iid, kind: 'loyalty', delta: 1 }))
			b('Loyalty −1', () => tool({ op: 'counter', iid: p.iid, kind: 'loyalty', delta: -1 }))
		}
		move('graveyard', 'Graveyard')
		move('exile', 'Exile')
		move('hand', 'Hand')
		btns.push(
			<button key="more" onClick={() => setMore(!more)}>
				{more ? 'Fewer tools' : 'More tools…'}
			</button>,
		)
		if (more) {
			btns.push(
				<span key="ctr" className="ctr-tool">
					<select value={ctrKind} onChange={(e) => setCtrKind(e.target.value)}>
						{['+1/+1', '-1/-1', 'loyalty', 'charge', 'shield', 'stun', 'oil', 'lore', 'time', 'quest'].map((k) => (
							<option key={k}>{k}</option>
						))}
					</select>
					<button onClick={() => tool({ op: 'counter', iid: p.iid, kind: ctrKind, delta: 1 })}>+</button>
					<button onClick={() => tool({ op: 'counter', iid: p.iid, kind: ctrKind, delta: -1 })}>−</button>
				</span>,
			)
			if (isCreature(s, p)) {
				b('+1/+1 this turn', () => tool({ op: 'pt', iid: p.iid, power: 1, toughness: 1, until: 'eot' }))
				b('−1/−1 this turn', () => tool({ op: 'pt', iid: p.iid, power: -1, toughness: -1, until: 'eot' }))
				b('Damage +1', () => tool({ op: 'damage', iid: p.iid, delta: 1 }))
				if (p.damage) b('Damage −1', () => tool({ op: 'damage', iid: p.iid, delta: -1 }))
				b(p.sick ? 'Remove summoning sickness' : 'Summoning sick', () => tool({ op: 'sick', iid: p.iid, sick: !p.sick }))
			}
			if (p.mods.length) b('Clear P/T changes', () => tool({ op: 'clearMods', iid: p.iid }))
			if (d.back) b('Transform', () => tool({ op: 'flip', iid: p.iid }))
			else b(p.faceDown ? 'Turn face up' : 'Turn face down', () => tool({ op: 'flip', iid: p.iid }))
			b('Attach to…', () => setAttachFrom(p.iid))
			if (p.attachedTo !== undefined) b('Detach', () => tool({ op: 'attach', iid: p.iid, to: null }))
			b(p.controller === me ? `Give control to ${s.players[opp(me)].name}` : 'Gain control', () => tool({ op: 'control', iid: p.iid, player: p.controller === me ? opp(me) : me }))
			b('Create a token copy', () => tool({ op: 'token', player: me, card: p.card, count: 1 }))
			move('library', 'Library top')
			move('libraryBottom', 'Library bottom')
			if (p.commander) move('command', 'Command zone')
		}
	} else if (loc.zone === 'stack') {
		const it = s.stack.find((x) => x.obj?.iid === o.iid)
		if (it) {
			b('Counter it', () => tool({ op: 'counterSpell', sid: it.sid }))
			b('Copy it', () => tool({ op: 'copySpell', sid: it.sid }))
		}
	} else {
		const r = rulesOf(s, o)
		if (loc.owner === me && loc.zone === 'graveyard' && r.flashback)
			b(
				<>
					Flashback <Cost cost={r.flashback} small />
				</>,
				() => act({ type: 'cast', player: me, iid: o.iid }),
				{ primary: true, key: 'fb', text: 'Flashback' },
			)
		if (loc.owner === me && loc.zone === 'exile' && s.players[me].playable?.some((x) => x.iid === o.iid && x.until >= s.turn)) {
			if (r.types.includes('land')) b('Play land', () => act({ type: 'playLand', player: me, iid: o.iid }), { primary: true })
			else b('Cast', () => act({ type: 'cast', player: me, iid: o.iid }), { primary: true })
		}
		move('hand', 'Hand')
		move('battlefield', 'Battlefield')
		move('graveyard', 'Graveyard')
		move('exile', 'Exile')
		move('library', 'Library top')
		move('libraryBottom', 'Library bottom')
		if ((o as Obj).commander) move('command', 'Command zone')
	}
	return (
		<div className="actions">
			<div className="act-head">
				<span>{d.name}</span>
				<button className="mini" onClick={close}>
					✕
				</button>
			</div>
			<div className="act-btns">{btns}</div>
		</div>
	)
}

function Log({ lines }: { lines: string[] }) {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		ref.current?.scrollTo({ top: ref.current.scrollHeight })
	}, [lines.length])
	return (
		<div className="log" ref={ref}>
			{lines.slice(-150).map((l, i) => (
				<div key={i} className={l.startsWith('—') ? 'log-turn' : ''}>
					{l}
				</div>
			))}
		</div>
	)
}

function Modal({ title, children, onClose, wide }: { title: ReactNode; children: ReactNode; onClose?: () => void; wide?: boolean }) {
	return (
		<div className="modal-bg" onClick={onClose}>
			<div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
				<div className="modal-title">
					<span>{title}</span>
					{onClose && (
						<button className="mini" onClick={onClose}>
							✕
						</button>
					)}
				</div>
				{children}
			</div>
		</div>
	)
}

function MulliganModal({ s, me, act, hb }: { s: GameState; me: number; act: (i: Intent) => boolean; hb: (l: string) => string }) {
	const pl = s.players[me]
	const bottom = pl.mulligans + 1 - (s.format.freeMulligan ? 1 : 0)
	return (
		<Modal title={`Opening hand${pl.mulligans ? ` (mulligan ${pl.mulligans})` : ''} — ${s.players[s.firstPlayer].name} goes first`} wide>
			<div className="cardgrid">
				{pl.hand.map((o) => (
					<CardFaceView key={o.iid} def={def(s, o.card)} />
				))}
			</div>
			<div className="modal-btns">
				<button className={`primary ${hb('Keep')}`} onClick={() => act({ type: 'keep', player: me })}>
					Keep{pl.mulligans - (s.format.freeMulligan ? 1 : 0) > 0 ? ` (bottom ${pl.mulligans - (s.format.freeMulligan ? 1 : 0)})` : ''}
				</button>
				<button className={hb('Mulligan')} onClick={() => act({ type: 'mulligan', player: me })}>Mulligan{bottom > 0 ? ` (then bottom ${bottom})` : ' (free)'}</button>
			</div>
		</Modal>
	)
}

function BottomModal({ s, me, count, act }: { s: GameState; me: number; count: number; act: (i: Intent) => boolean }) {
	const [pick, setPick] = useState<number[]>([])
	return (
		<Modal title={`Choose ${count} card${count > 1 ? 's' : ''} to put on the bottom of your library`} wide>
			<div className="cardgrid">
				{s.players[me].hand.map((o) => (
					<CardFaceView key={o.iid} def={def(s, o.card)} className={pick.includes(o.iid) ? 'picked' : ''} onClick={() => setPick(pick.includes(o.iid) ? pick.filter((x) => x !== o.iid) : pick.length < count ? [...pick, o.iid] : pick)} />
				))}
			</div>
			<div className="modal-btns">
				<button className="primary" disabled={pick.length !== count} onClick={() => act({ type: 'bottom', player: me, iids: pick })}>
					Confirm ({pick.length}/{count})
				</button>
			</div>
		</Modal>
	)
}

function ChooseModal({ s, me, act, onHover, hb, hint }: { s: GameState; me: number; act: (i: Intent) => boolean; onHover: (n: number | null) => void; hb: (l: string) => string; hint?: Hint }) {
	const p = s.pending
	const [pick, setPick] = useState<string[]>([])
	const [hidden, setHidden] = useState(false)
	const q = p.kind === 'choose' ? p.question : null
	useEffect(() => {
		setPick([])
		setHidden(false)
	}, [q?.key, p.kind === 'choose' ? p.task : 0])
	if (!q) return null
	const single = q.max === 1 && q.min === 1
	const toggle = (id: string) => {
		if (single) {
			act({ type: 'choose', player: me, picks: [id] })
			return
		}
		setPick(pick.includes(id) ? pick.filter((x) => x !== id) : pick.length < q.max ? [...pick, id] : pick)
	}
	const hinted = (id: string) => {
		const o = q.options.find((x) => x.id === id)
		return hint?.options?.includes(id) || (o?.iid !== undefined && hint?.perms?.includes(o.iid)) ? 'hint' : ''
	}
	const asCards = q.options.some((o) => o.card) && (q.cards || q.options.every((o) => o.card))
	const onBoard = q.options.some((o) => o.iid !== undefined && findPerm(s, o.iid))
	if (hidden)
		return (
			<button className="peek-back" onClick={() => setHidden(false)}>
				Show the choice again
			</button>
		)
	return (
		<div className={`qpanel ${asCards ? 'wide' : ''}`}>
			<div className="q-title">{q.prompt.split('\n')[0]}</div>
			{q.prompt.includes('\n') && <div className="q-sub">{q.prompt.split('\n').slice(1).join('\n')}</div>}
			{onBoard && single && <div className="q-sub">Click a glowing card on the table, or pick from the list.</div>}
			{asCards ? (
				<div className="cardgrid">
					{q.options.map((o) => (
						<div key={o.id} className="opt-card">
							{o.card ? <CardFaceView def={def(s, o.card)} className={`${pick.includes(o.id) ? 'picked' : ''} ${hinted(o.id)}`} onClick={() => toggle(o.id)} onMouseEnter={() => o.iid && onHover(o.iid)} /> : <button className={hinted(o.id) || hb(o.label)} onClick={() => toggle(o.id)}>{o.label}</button>}
							{q.ordered && pick.includes(o.id) && <span className="order">{pick.indexOf(o.id) + 1}</span>}
							<small>{o.label}</small>
						</div>
					))}
				</div>
			) : (
				<div className="optlist">
					{q.options.map((o) => (
						<button key={o.id} className={`${pick.includes(o.id) ? 'picked' : ''} ${hinted(o.id) || hb(o.label)}`} onClick={() => toggle(o.id)} onMouseEnter={() => o.iid && onHover(o.iid)}>
							{o.label}
						</button>
					))}
				</div>
			)}
			<div className="modal-btns">
				{!single && (
					<button className={`primary ${hb('Confirm')}`} disabled={pick.length < q.min || pick.length > q.max} onClick={() => act({ type: 'choose', player: me, picks: pick })}>
						Confirm ({pick.length}
						{q.max > 1 ? `/${q.max}` : ''})
					</button>
				)}
				<button onClick={() => setHidden(true)}>Look at the board</button>
			</div>
			{q.ordered && <div className="q-sub">Pick in order: the first card you pick ends up on top.</div>}
		</div>
	)
}

function ZoneModal({ s, me, view, close, tool, act }: { s: GameState; me: number; view: NonNullable<ZoneView>; close: () => void; tool: (m: ManualOp) => boolean; act: (i: Intent) => boolean }) {
	const pl = s.players[view.player]
	const [open, setOpen] = useState<number | null>(null)
	const [n, setN] = useState(3)
	let cards: Obj[] = []
	let title = ''
	const hidden = view.zone === 'library' && view.player !== me
	if (view.zone === 'peek') {
		cards = pl.library.slice(0, pl.peek ?? 0)
		title = `Top ${cards.length} of your library (top first)`
	} else {
		cards = pl[view.zone]
		title = `${pl.name}’s ${view.zone === 'library' ? 'library' : view.zone} (${cards.length})`
	}
	return (
		<Modal title={title} onClose={close} wide>
			{view.zone === 'library' && view.player === me && (
				<div className="libtools">
					<button onClick={() => tool({ op: 'draw', player: me, count: 1 })}>Draw 1</button>
					<button onClick={() => tool({ op: 'mill', player: me, count: 1 })}>Mill 1</button>
					<button onClick={() => tool({ op: 'shuffle', player: me })}>Shuffle</button>
					<span>
						Look at top <input type="number" min={1} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} />
						<button onClick={() => (tool({ op: 'peek', player: me, count: n }), close())}>Look</button>
					</span>
				</div>
			)}
			{hidden ? (
				<div className="q-sub">{cards.length} cards (hidden).</div>
			) : (
				<div className="cardgrid">
					{(view.zone === 'library' ? cards.slice().sort((a, b) => cardName(s, a.card).localeCompare(cardName(s, b.card))) : cards).map((o) => (
						<div key={o.iid} className="opt-card">
							<CardFaceView def={def(s, o.card)} className={open === o.iid ? 'picked' : ''} onClick={() => setOpen(open === o.iid ? null : o.iid)} />
							{open === o.iid && (
								<div className="zone-acts">
									{view.player === me && view.zone === 'graveyard' && rulesOf(s, o).flashback && (
										<button className="primary" onClick={() => (act({ type: 'cast', player: me, iid: o.iid }) && close(), setOpen(null))}>
											Flashback
										</button>
									)}
									{view.player === me && view.zone === 'exile' && s.players[me].playable?.some((x) => x.iid === o.iid && x.until >= s.turn) && (
										<button className="primary" onClick={() => (act(rulesOf(s, o).types.includes('land') ? { type: 'playLand', player: me, iid: o.iid } : { type: 'cast', player: me, iid: o.iid }) && close(), setOpen(null))}>
											{rulesOf(s, o).types.includes('land') ? 'Play' : 'Cast'}
										</button>
									)}
									{(['hand', 'battlefield', 'graveyard', 'exile', 'library', 'libraryBottom', ...(o.commander ? ['command'] : [])] as const)
										.filter((z) => z !== view.zone)
										.map((z) => (
											<button key={z} onClick={() => (tool({ op: 'move', iid: o.iid, to: z as 'hand', player: me }), setOpen(null))}>
												{z === 'libraryBottom' ? 'Lib bottom' : z === 'library' ? 'Lib top' : z === 'battlefield' ? 'Battlefield' : z[0].toUpperCase() + z.slice(1)}
											</button>
										))}
								</div>
							)}
						</div>
					))}
					{cards.length === 0 && <div className="q-sub">Empty.</div>}
				</div>
			)}
			{view.zone === 'library' && view.player === me && <div className="q-sub">Moving a card out of your library doesn’t shuffle it — press Shuffle if the card says to.</div>}
		</Modal>
	)
}

function TokenModal({ s, me, tool, close }: { s: GameState; me: number; tool: (m: ManualOp) => boolean; close: () => void }) {
	const [name, setName] = useState('Token')
	const [p, setP] = useState(1)
	const [t, setT] = useState(1)
	const [count, setCount] = useState(1)
	const [kw, setKw] = useState('')
	const deckTokens = useMemo(() => {
		const ids = new Set<string>()
		for (const pl of s.players) for (const o of [...pl.library, ...pl.hand, ...pl.graveyard, ...pl.exile, ...pl.command]) for (const tk of def(s, o.card).tokens ?? []) ids.add(tk)
		for (const q of s.battlefield) for (const tk of def(s, q.card).tokens ?? []) ids.add(tk)
		return [...ids].map((id) => s.cards[id]).filter(Boolean) as CardDef[]
	}, [s])
	return (
		<Modal title="Create tokens" onClose={close} wide>
			<div className="libtools">
				How many: <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
			</div>
			<div className="cardgrid">
				{deckTokens.map((d) => (
					<div key={d.id} className="opt-card">
						<CardFaceView def={d} onClick={() => (tool({ op: 'token', player: me, card: d.id, count }), close())} />
						<small>{d.name}</small>
					</div>
				))}
			</div>
			<div className="custom-token">
				<b>Custom:</b> <input value={name} onChange={(e) => setName(e.target.value)} />
				<input type="number" value={p} onChange={(e) => setP(Number(e.target.value))} />/<input type="number" value={t} onChange={(e) => setT(Number(e.target.value))} />
				<input placeholder="keywords (flying, haste)" value={kw} onChange={(e) => setKw(e.target.value)} />
				<button
					className="primary"
					onClick={() => (
						tool({
							op: 'customToken',
							player: me,
							name,
							power: p,
							toughness: t,
							types: `Creature — ${name}`,
							count,
							keywords: kw
								.split(',')
								.map((x) => x.trim().toLowerCase())
								.filter(Boolean),
						}),
						close()
					)}
				>
					Create
				</button>
			</div>
		</Modal>
	)
}

function MenuModal(props: BoardProps & { me: number; tool: (m: ManualOp) => boolean; close: () => void; openTokens: () => void; openZone: (z: NonNullable<ZoneView>) => void }) {
	const { state: s, me, tool, close } = props
	const [confirm, setConfirm] = useState(false)
	const them = opp(me)
	return (
		<Modal title="Menu & table tools" onClose={close}>
			<div className="menu-grid">
				<section>
					<h4>Your library</h4>
					<button onClick={() => tool({ op: 'draw', player: me, count: 1 })}>Draw a card</button>
					<button onClick={() => tool({ op: 'mill', player: me, count: 1 })}>Mill 1</button>
					<button onClick={() => tool({ op: 'shuffle', player: me })}>Shuffle</button>
					<button onClick={() => props.openZone({ player: me, zone: 'library' })}>Search / look…</button>
				</section>
				<section>
					<h4>Board</h4>
					<button onClick={props.openTokens}>Create tokens…</button>
					<button onClick={() => tool({ op: 'untapAll', player: me })}>Untap all mine</button>
					<button onClick={() => props.openZone({ player: me, zone: 'command' })}>Command zone…</button>
				</section>
				<section>
					<h4>Life & counters</h4>
					{[me, them].map((p) => (
						<div key={p} className="lifetools">
							<span>{s.players[p].name}</span>
							<button onClick={() => tool({ op: 'life', player: p, delta: -5 })}>−5</button>
							<button onClick={() => tool({ op: 'life', player: p, delta: -1 })}>−1</button>
							<b>{s.players[p].life}</b>
							<button onClick={() => tool({ op: 'life', player: p, delta: 1 })}>+1</button>
							<button onClick={() => tool({ op: 'life', player: p, delta: 5 })}>+5</button>
							<button title="Poison" onClick={() => tool({ op: 'poison', player: p, delta: 1 })}>
								☣+
							</button>
							{s.players[p].poison > 0 && <button onClick={() => tool({ op: 'poison', player: p, delta: -1 })}>☣−</button>}
							{s.format.commanderDamage &&
								s.players[opp(p)].commanders.map((c) => (
									<span key={c} className="cmdtool">
										⚔{cardName(s, c).split(',')[0]} {s.players[p].commanderDamage[c] ?? 0}
										<button onClick={() => tool({ op: 'commanderDamage', player: p, card: c, delta: 1 })}>+</button>
										<button onClick={() => tool({ op: 'commanderDamage', player: p, card: c, delta: -1 })}>−</button>
									</span>
								))}
						</div>
					))}
				</section>
				<section>
					<h4>Mana pool</h4>
					<div className="manatools">
						{MANA.map((m) => (
							<span key={m}>
								<Pip m={m} n={s.players[me].pool[m]} />
								<button className="mini" onClick={() => tool({ op: 'mana', player: me, mana: m, delta: 1 })}>
									+
								</button>
								<button className="mini" onClick={() => tool({ op: 'mana', player: me, mana: m, delta: -1 })}>
									−
								</button>
							</span>
						))}
					</div>
				</section>
				<section>
					<h4>Game</h4>
					<div className="layout-pick">
						Layout:
						{(['auto', 'console', 'pocket'] as LayoutChoice[]).map((c) => (
							<button key={c} className={props.layoutChoice === c ? 'primary' : ''} onClick={() => props.onLayout(c)}>
								{c === 'auto' ? 'Auto' : c === 'console' ? 'Table' : 'Touch'}
							</button>
						))}
					</div>
					{props.onUndo && <button onClick={() => (props.onUndo!(), close())}>Undo last move</button>}
					<button onClick={() => (confirm ? (props.send({ type: 'concede', player: me }), close()) : setConfirm(true))}>{confirm ? 'Really concede?' : 'Concede'}</button>
					<button onClick={props.onMenu}>Leave game (it’s saved)</button>
					<p className="dim">
						{s.format.name}: {s.format.life} life{s.format.commanderDamage ? ', 21 commander damage' : ', no commander damage'}. Double-click a land to tap it for mana. Everything the game can’t do by itself, you do with these tools — like at a real table.
					</p>
				</section>
			</div>
		</Modal>
	)
}

function OverModal({ s, me, onMenu }: { s: GameState; me: number; onMenu: () => void }) {
	const p = s.pending
	if (p.kind !== 'over') return null
	return (
		<Modal title="Game over">
			<div className="over">
				<h2>{p.winner === null ? 'Draw' : p.winner === me && !s.players[me].bot ? 'You win!' : `${s.players[p.winner].name} wins`}</h2>
				<p>{s.players.filter((x) => x.lost).map((x) => `${x.name}: ${x.lost}`).join(' · ')}</p>
				<button className="primary" onClick={onMenu}>
					Back to menu
				</button>
			</div>
		</Modal>
	)
}

export { tryApply }
