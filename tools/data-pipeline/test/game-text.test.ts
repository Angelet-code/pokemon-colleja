/**
 * Readers of the official game text dumps (Scarlet/Violet and Legends: Z-A): no network, short
 * samples written like the real files.
 */
import { describe, expect, it } from 'vitest';
import {
  cleanGameText,
  descriptionsByName,
  parseSvDump,
  parseZaFile,
} from '../src/game-text/official-texts';

const SV_SAMPLE = [
  '~~~~~~~~~~~~~~~',
  'Text File : wazaname.dat',
  '~~~~~~~~~~~~~~~',
  '———',
  'Destructor',
  'Abrecaminos',
  '~~~~~~~~~~~~~~~',
  'Text File : wazainfo.dat',
  '~~~~~~~~~~~~~~~',
  '',
  'Golpea con las patas o la cola.',
  'Ataca de pronto como si saltara desde la hierba alta.\\nEl usuario se mueve con gran\\nagilidad y aumenta su Velocidad.',
].join('\n');

describe('official game texts', () => {
  it('reads the Scarlet/Violet sections by index', () => {
    const files = parseSvDump(SV_SAMPLE);
    expect([...files.keys()]).toEqual(['wazaname.dat', 'wazainfo.dat']);
    expect(files.get('wazaname.dat')?.get(2)).toBe('Abrecaminos');
    expect(files.get('wazainfo.dat')?.get(1)).toBe('Golpea con las patas o la cola.');
  });

  it('pairs each name with its description and joins the game line breaks', () => {
    const files = parseSvDump(SV_SAMPLE);
    const byName = descriptionsByName(files.get('wazaname.dat'), files.get('wazainfo.dat'));
    expect(byName.get('Abrecaminos')).toBe(
      'Ataca de pronto como si saltara desde la hierba alta. El usuario se mueve con gran agilidad y aumenta su Velocidad.',
    );
    // A name without a description is left out.
    expect(byName.has('———')).toBe(false);
  });

  it('reads the Legends: Z-A files (index, hash, label, text)', () => {
    const names = parseZaFile(
      '683\tF7F2158BCA957B59\tITEMNAME_683\tGarchompita\n2579\t7BDA09AA105A2DCF\tITEMNAME_2579\tFloettita',
    );
    const infos = parseZaFile(
      '2579\t0000000000000000\tITEMINFO_2579\tUna de las misteriosas Megapiedras.\\nPermite megaevolucionar a Floette en combate.',
    );
    const byName = descriptionsByName(names, infos);
    expect(byName.get('Floettita')).toBe(
      'Una de las misteriosas Megapiedras. Permite megaevolucionar a Floette en combate.',
    );
    expect(byName.has('Garchompita')).toBe(false);
  });

  it('drops names that are ambiguous and texts with variables', () => {
    const names = new Map([
      [1, 'Doble'],
      [2, 'Doble'],
      [3, 'Variable'],
    ]);
    const infos = new Map([
      [1, 'Uno.'],
      [2, 'Otro.'],
      [3, 'Lo lleva [VAR 0100(0000)].'],
    ]);
    expect(descriptionsByName(names, infos).size).toBe(0);
  });

  it('cleans the game line breaks', () => {
    expect(cleanGameText('Uno\\ndos\\c  tres ')).toBe('Uno dos tres');
  });
});
