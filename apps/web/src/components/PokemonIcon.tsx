/** Pokémon sprites with fallbacks: icon → render → initials (when sprites are not downloaded). */
import { getName } from '@colleja/data';
import { useState } from 'react';
import { pokemonIcon, pokemonSprite } from '../lib/sprites';

export function PokemonIcon({
  species,
  size = 40,
  fainted = false,
}: {
  species: string;
  size?: number;
  fainted?: boolean;
}) {
  const icon = pokemonIcon(species);
  const [source, setSource] = useState<'icon' | 'render' | 'none'>(
    icon.isRender ? 'render' : 'icon',
  );
  const style = { width: size, height: size };
  const dim = fainted ? 'opacity-30 grayscale' : '';

  if (source === 'none') return <Initials species={species} size={size} className={dim} />;
  return (
    <img
      src={source === 'icon' ? icon.src : pokemonSprite(species)}
      alt=""
      style={style}
      className={`shrink-0 object-contain ${source === 'icon' ? 'pixel' : ''} ${dim}`}
      onError={() => setSource(source === 'icon' ? 'render' : 'none')}
      loading="lazy"
      draggable={false}
    />
  );
}

export function PokemonSprite({
  species,
  size = 120,
  className = '',
}: {
  species: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Initials species={species} size={size} className={className} />;
  return (
    <img
      src={pokemonSprite(species)}
      alt=""
      style={{ width: size, height: size }}
      className={`object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.35)] ${className}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

function Initials({
  species,
  size,
  className = '',
}: {
  species: string;
  size: number;
  className?: string;
}) {
  const name = getName('species', species);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-display font-semibold text-muted uppercase ${className}`}
    >
      {name.slice(0, 2)}
    </span>
  );
}
