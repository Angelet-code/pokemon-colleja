/** Colours of the Pokémon types (move buttons, type badges). */
import type { TypeName } from '@colleja/data';

export const TYPE_COLORS: Record<TypeName, string> = {
  Normal: '#9fa19f',
  Fire: '#e62829',
  Water: '#2980ef',
  Electric: '#fac000',
  Grass: '#3fa129',
  Ice: '#3dcef3',
  Fighting: '#ff8000',
  Poison: '#9141cb',
  Ground: '#915121',
  Flying: '#81b9ef',
  Psychic: '#ef4179',
  Bug: '#91a119',
  Rock: '#afa981',
  Ghost: '#704170',
  Dragon: '#5060e1',
  Dark: '#624d4e',
  Steel: '#60a1b8',
  Fairy: '#ef70ef',
};

export function typeColor(type: string | undefined): string {
  return (type && TYPE_COLORS[type as TypeName]) || '#78716c';
}
