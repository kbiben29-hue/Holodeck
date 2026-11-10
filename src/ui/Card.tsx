import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { CardDef } from '../engine/types'

/** Mana symbols as small coloured pips: "{2}{W}{U}" */
export function Cost({ cost, small }: { cost: string; small?: boolean }) {
	if (!cost) return null
	const syms = cost.match(/\{[^}]+\}/g) ?? []
	return (
		<span className={`cost ${small ? 'small' : ''}`}>
			{syms.map((s, i) => {
				const t = s.slice(1, -1)
				const cls = /^[WUBRGC]$/.test(t) ? `pip-${t}` : t.includes('/') ? 'pip-h' : 'pip-n'
				return (
					<span key={i} className={`pip ${cls}`}>
						{t === 'T' ? '⟳' : t.replace('/P', 'ᵖ')}
					</span>
				)
			})}
		</span>
	)
}

export function Pip({ m, n }: { m: string; n?: number }) {
	return (
		<span className={`pip pip-${m}`}>
			{n !== undefined ? n : m}
		</span>
	)
}

/** A card face: the Scryfall image when we have it, a simple text frame otherwise. */
export function CardFaceView({ def, back, style, className, children, onClick, onMouseEnter, onMouseLeave, title, iid }: { iid?: number; def: CardDef; back?: boolean; style?: CSSProperties; className?: string; children?: ReactNode; onClick?: (e: MouseEvent) => void; onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void; onMouseLeave?: () => void; title?: string }) {
	const face = back && def.back ? def.back : def
	const img = back && def.back ? def.back.image : def.image
	return (
		<div className={`cardface ${className ?? ''}`} data-iid={iid} style={style} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} title={title}>
			{img ? (
				<img src={img} alt={face.name} draggable={false} loading="lazy" />
			) : (
				<div className={`textcard ${(def.colors[0] ?? 'C').toLowerCase()} ${def.colors.length > 1 ? 'gold' : ''}`}>
					<div className="tc-head">
						<span className="tc-name">{face.name}</span>
						<Cost cost={face.manaCost} small />
					</div>
					<div className="tc-type">{face.typeLine}</div>
					<div className="tc-text">{face.oracle}</div>
					{face.power !== undefined && (
						<div className="tc-pt">
							{face.power}/{face.toughness}
						</div>
					)}
					{face.loyalty !== undefined && <div className="tc-pt">◆{face.loyalty}</div>}
				</div>
			)}
			{children}
		</div>
	)
}

export function CardBack({ style, className, children }: { style?: CSSProperties; className?: string; children?: ReactNode }) {
	return (
		<div className={`cardface cardback ${className ?? ''}`} style={style}>
			<div className="back-inner">
				<span>HOLODECK</span>
			</div>
			{children}
		</div>
	)
}
