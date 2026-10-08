import { useState } from 'react';
import { getSpecies, spriteId, TYPE_COLOR, TYPE_ES } from '../lib/dex';

export function Sprite({ species, size = 64 }: { species: string; size?: number }) {
  const sid = spriteId(species);
  const srcs = [
    `https://play.pokemonshowdown.com/sprites/gen5/${sid}.png`,
    `https://play.pokemonshowdown.com/sprites/dex/${sid}.png`,
    `https://play.pokemonshowdown.com/sprites/gen5/${spriteId(getSpecies(species)?.baseSpecies ?? species)}.png`,
  ];
  const [i, setI] = useState(0);
  if (i >= srcs.length) {
    return <div className="sprite-fallback" style={{ width: size, height: size }}>{species.slice(0, 2)}</div>;
  }
  return (
    <img
      className="sprite" src={srcs[i]} width={size} height={size} alt={species} loading="lazy"
      onError={() => setI(i + 1)}
    />
  );
}

export function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  return (
    <span className={`type-badge${small ? ' small' : ''}`} style={{ background: TYPE_COLOR[type] ?? '#666' }}>
      {TYPE_ES[type] ?? type}
    </span>
  );
}

export function Types({ species }: { species: string }) {
  const s = getSpecies(species);
  return <span className="types">{s?.types.map((t) => <TypeBadge key={t} type={t} small />)}</span>;
}

export function HpBar({ pct }: { pct: number }) {
  const color = pct > 50 ? 'var(--hp-good)' : pct > 20 ? 'var(--hp-mid)' : 'var(--hp-low)';
  return (
    <div className="hpbar">
      <div className="hpbar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function DamageBar({ min, max }: { min: number; max: number }) {
  const ko = min >= 100 ? 'ko' : max >= 100 ? 'maybe' : '';
  return (
    <div className={`dmgbar ${ko}`} title={`${min}% – ${max}%`}>
      <div className="dmgbar-min" style={{ width: `${Math.min(100, min)}%` }} />
      <div className="dmgbar-max" style={{ width: `${Math.max(0, Math.min(100, max) - Math.min(100, min))}%` }} />
      <span>{min}–{max}%</span>
    </div>
  );
}

export const tierColor: Record<string, string> = { S: '#ff5d5d', A: '#ffa34d', B: '#ffd84d', C: '#8bd36b', D: '#5cc8d6', E: '#8f9cf0', F: '#b8a0c8' };
