/**
 * Pokémon sprites: the Champions render at any size, or initials when sprites are not
 * downloaded. A shiny without its render (not downloaded) falls back to the normal one.
 */
import { getName } from '@colleja/data';
import { useState } from 'react';
import { pokemonSprite } from '../lib/sprites';

export function PokemonIcon({
  species,
  shiny = false,
  size = 40,
  fainted = false,
}: {
  species: string;
  shiny?: boolean;
  size?: number;
  fainted?: boolean;
}) {
  const sprite = useSprite(species, shiny);
  const dim = fainted ? 'opacity-30 grayscale' : '';

  if (!sprite.src) return <Initials species={species} size={size} className={dim} />;
  return (
    <img
      src={sprite.src}
      alt=""
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain ${dim}`}
      onError={sprite.onError}
      loading="lazy"
      draggable={false}
    />
  );
}

export function PokemonSprite({
  species,
  shiny = false,
  size = 120,
  className = '',
}: {
  species: string;
  shiny?: boolean;
  size?: number;
  className?: string;
}) {
  const sprite = useSprite(species, shiny);
  if (!sprite.src) return <Initials species={species} size={size} className={className} />;
  return (
    <img
      src={sprite.src}
      alt=""
      style={{ width: size, height: size }}
      className={`object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.35)] ${className}`}
      onError={sprite.onError}
      draggable={false}
    />
  );
}

/**
 * The render to show and what to do when it fails: a shiny falls back to the normal render, and
 * that to the initials (`src: null`). Failures reset when the species or the shiny flag change.
 */
function useSprite(species: string, shiny: boolean): { src: string | null; onError: () => void } {
  const key = `${species}:${shiny}`;
  const [failed, setFailed] = useState({ key, count: 0 });
  const failures = failed.key === key ? failed.count : 0;
  const onError = () => setFailed({ key, count: failures + 1 });
  if (failures >= (shiny ? 2 : 1)) return { src: null, onError };
  return { src: pokemonSprite(species, shiny && failures === 0), onError };
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
