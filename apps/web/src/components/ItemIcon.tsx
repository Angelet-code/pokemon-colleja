/**
 * Held-item icons: the 30 px pixel-art sprite, or nothing when it is not downloaded (the name
 * next to it is enough). `reserve` keeps the slot so that rows in a list stay aligned.
 */
import { useState } from 'react';
import { itemSprite } from '../lib/sprites';

/** Native size of the item sprites. */
const NATIVE_SIZE = 30;

export function ItemIcon({
  item,
  size = NATIVE_SIZE,
  reserve = false,
  className = '',
}: {
  item: string;
  size?: number;
  reserve?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = itemSprite(item);
  const style = { width: size, height: size };

  if (!src || failed === item) {
    return reserve ? (
      <span aria-hidden="true" style={style} className={`shrink-0 ${className}`} />
    ) : null;
  }
  return (
    <img
      src={src}
      alt=""
      style={style}
      className={`shrink-0 object-contain ${size >= NATIVE_SIZE ? '[image-rendering:pixelated]' : ''} ${className}`}
      onError={() => setFailed(item)}
      loading="lazy"
      draggable={false}
    />
  );
}
