// Temporary one-off script (not committed): imports the selected Limitless teams as saved opponents.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getItem,
  getMove,
  getName,
  getNature,
  getStandardSets,
  type StatId,
  toId,
} from '@colleja/data';
import type { OpponentContent } from '@colleja/protocol';
import { FileOpponentRepository } from './src/opponents/opponent-repository';
import { importMembers } from './src/teams/saved-teams';
import { teamProblems } from './src/teams/team-problems';

interface Mon {
  id: string;
  name: string;
  item: string | null;
  ability: string;
  attacks: string[];
  nature: string;
}
interface Selected {
  kind: 'used' | 'strong';
  rank: number;
  uses: number;
  w: number;
  l: number;
  wr: number;
  entry: {
    tournament: string;
    date: string;
    players: number;
    player: string;
    record: { wins: number; losses: number; ties: number };
    decklist: Mon[];
  };
}

const [selectedPath, write] = [process.argv[2] ?? '', process.argv[3] === '--write'];
const selected = JSON.parse(readFileSync(selectedPath, 'utf8')) as Selected[];
const LABEL: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

function estimateSp(mon: Mon): {
  sp: Partial<Record<StatId, number>>;
  source: 'standard' | 'heuristic';
} {
  const species = toId(mon.id);
  const nature = getNature(toId(mon.nature));
  const standard = getStandardSets(species, 'doubles').find((s) => s.nature === nature?.id);
  if (standard) return { sp: { ...standard.statPoints }, source: 'standard' };
  let physical = 0;
  let special = 0;
  for (const name of mon.attacks) {
    const move = getMove(toId(name));
    if (move?.category === 'Physical') physical++;
    if (move?.category === 'Special') special++;
  }
  const attack: StatId = physical >= special ? 'atk' : 'spa';
  const attacker = physical + special > 0;
  const plus = nature?.plus ?? null;
  const minus = nature?.minus ?? null;
  const sp = (a: StatId, b: StatId, c: StatId) => ({
    sp: { [a]: 32, [b]: 32, [c]: 2 },
    source: 'heuristic' as const,
  });
  if (minus === 'spe') {
    // Trick Room: bulk plus the boosted stat.
    const main = plus && plus !== 'hp' ? plus : attack;
    return sp('hp', main, main === 'def' ? 'spd' : 'def');
  }
  if (plus === 'spe') return attacker ? sp(attack, 'spe', 'hp') : sp('hp', 'spe', 'def');
  if (plus === 'atk' || plus === 'spa') return sp('hp', plus, 'def');
  if (plus === 'def' || plus === 'spd') return sp('hp', plus, plus === 'def' ? 'spd' : 'def');
  return attacker ? sp(attack, 'spe', 'hp') : sp('hp', 'def', 'spd');
}

function exportText(team: Mon[]): { text: string; estimated: string[] } {
  const estimated: string[] = [];
  const blocks = team.map((mon) => {
    const { sp, source } = estimateSp(mon);
    if (source === 'heuristic') estimated.push(getName('species', toId(mon.id)));
    const evs = (Object.entries(sp) as [StatId, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${LABEL[k]}`)
      .join(' / ');
    return [
      `${mon.id}${mon.item ? ` @ ${mon.item}` : ''}`,
      `Ability: ${mon.ability}`,
      `EVs: ${evs}`,
      `${mon.nature} Nature`,
      ...mon.attacks.map((a) => `- ${a}`),
    ].join('\n');
  });
  return { text: blocks.join('\n\n'), estimated };
}

function teamName(s: Selected): string {
  const megas: string[] = [];
  for (const mon of s.entry.decklist) {
    const item = mon.item ? getItem(toId(mon.item)) : undefined;
    const mega = item?.megaEvolutions.find((m) => m.from === toId(mon.id));
    if (mega) megas.push(getName('species', mega.to));
  }
  const prefix = s.kind === 'used' ? `Más usado ${s.rank}` : `Más fuerte ${s.rank}`;
  return `${prefix} · ${megas.join(' + ')}`.slice(0, 60);
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const repo = new FileOpponentRepository(resolve(import.meta.dirname, '../../storage/opponents'));
for (const s of selected) {
  const { text, estimated } = exportText(s.entry.decklist);
  const { members, adjustments } = importMembers(text, 'doubles');
  const problems = teamProblems(members, 'doubles');
  const e = s.entry;
  const ranking =
    s.kind === 'used'
      ? `Composición nº ${s.rank} más usada en VGC Reg M-C`
      : `Composición nº ${s.rank} más fuerte en VGC Reg M-C (mejor % de victorias con al menos 8 equipos, límite inferior de Wilson)`;
  const notes = [
    `${ranking}: ${s.uses} equipos, ${s.w}-${s.l} (${pct(s.wr)} de victorias). Datos de Limitless, torneos del 12-09 al 08-10-2026.`,
    `Lista de ${e.player}: ${e.record.wins}-${e.record.losses} en «${e.tournament}» (${e.players} jugadores, ${e.date.slice(0, 10)}).`,
    estimated.length > 0
      ? `Stat Points estimados (las listas abiertas no los publican): ${estimated.join(', ')}. El resto, del set estándar con la misma naturaleza.`
      : 'Stat Points del set estándar con la misma naturaleza (las listas abiertas no los publican).',
  ].join('\n');
  const content: OpponentContent = {
    name: teamName(s),
    mode: 'doubles',
    ruleset: 'champions-regmc',
    members,
    notes,
    botLevel: 3,
  };
  console.log(`\n== ${content.name} (${members.length})`);
  for (const a of adjustments) console.log('  ajuste:', a);
  for (const p of problems) console.log('  PROBLEMA:', p);
  if (write) {
    const saved = await repo.create(content);
    console.log('  guardado', saved.opponent.id);
  }
}
