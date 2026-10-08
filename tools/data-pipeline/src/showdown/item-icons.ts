/**
 * Item icons cut from Showdown's item sheet, for the items PokeAPI has no sprite for. Each icon
 * (24 px) is centred on a transparent 30 px canvas so it shares the framing of the PokeAPI
 * sprites.
 */
import { PNG } from 'pngjs';
import { SHOWDOWN_ITEM_SHEET } from '../config';

const ICON_SIZE = 24;
const SHEET_COLUMNS = 16;
/** Size of the PokeAPI item sprites. */
const CANVAS_SIZE = 30;

export interface ItemSheet {
  png: PNG;
  /** Last-Modified header of the downloaded sheet (it is not versioned). */
  lastModified: string | null;
}

export async function fetchItemSheet(): Promise<ItemSheet> {
  const response = await fetch(SHOWDOWN_ITEM_SHEET);
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${SHOWDOWN_ITEM_SHEET}`);
  const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  return { png, lastModified: response.headers.get('last-modified') };
}

/**
 * PNG of the icon at `spritenum`, or null when the slot is out of the sheet or empty (Showdown
 * gives new items a `spritenum` before drawing them).
 */
export function cutItemIcon(sheet: PNG, spritenum: number): Buffer | null {
  const left = (spritenum % SHEET_COLUMNS) * ICON_SIZE;
  const top = Math.floor(spritenum / SHEET_COLUMNS) * ICON_SIZE;
  if (spritenum <= 0 || top + ICON_SIZE > sheet.height) return null;

  const icon = new PNG({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const offset = (CANVAS_SIZE - ICON_SIZE) / 2;
  let opaque = false;
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const from = ((top + y) * sheet.width + left + x) * 4;
      const to = ((offset + y) * CANVAS_SIZE + offset + x) * 4;
      sheet.data.copy(icon.data, to, from, from + 4);
      if ((sheet.data[from + 3] ?? 0) > 0) opaque = true;
    }
  }
  return opaque ? PNG.sync.write(icon) : null;
}
