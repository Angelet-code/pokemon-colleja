/**
 * Damage matrix before benching (see docs/guias/banco.md): for each member of your team, the
 * rival sets that hurt it most (incoming) and how hard it hits each rival set (outgoing).
 *
 *   npm run bench:calc -- --team "Collejas pingüi"
 *   npm run bench:calc -- --team v1.json --opponents all --member jolteon --top 10
 */
import { parseArgs } from 'node:util';
import { type DamageCell, damageMatrix } from '@colleja/bench';
import type { GameMode } from '@colleja/data';
import { getName } from '@colleja/data';
import { loadOpponents, loadTeam } from './load';

const USAGE = `Uso: npm run bench:calc -- --team <equipo> [opciones]

  --team <id|nombre|fichero>     Tu equipo (guardado, o un fichero JSON o de texto exportado)
  --opponents <all|id,nombre…>   Rivales guardados. Por defecto: all (los del modo)
  --mode singles|doubles         Por defecto: el modo preferido del equipo guardado, o doubles
  --member <especie>             Solo ese miembro de tu equipo (id: jolteon, empoleon…)
  --top <N>                      Amenazas que se enseñan por miembro. Por defecto: 8
  -h, --help                     Esta ayuda`;

const species = (id: string) => getName('species', id);
const move = (id: string) => getName('moves', id);
const range = (cell: DamageCell) =>
  `${move(cell.move)} ${Math.round(cell.min * 100)}–${Math.round(cell.max * 100)} %${
    cell.koChance > 0 ? ` (KO ${Math.round(cell.koChance * 100)} %)` : ''
  }`;

function main(): number {
  const { values } = parseArgs({
    options: {
      team: { type: 'string' },
      opponents: { type: 'string', default: 'all' },
      mode: { type: 'string' },
      member: { type: 'string' },
      top: { type: 'string', default: '8' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || !values.team) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const team = loadTeam(values.team);
  const modeText = values.mode ?? ('mode' in team ? String(team.mode) : 'doubles');
  if (modeText !== 'singles' && modeText !== 'doubles') {
    console.error(`--mode debe ser singles o doubles.\n\n${USAGE}`);
    return 2;
  }
  const mode: GameMode = modeText;
  const opponents = loadOpponents(values.opponents, [mode]);
  const top = Number(values.top);
  const matrix = damageMatrix(team.members, opponents, mode);
  console.log(
    `Matriz de daño · ${team.name} · ${opponents.length} rivales (${matrix.rivals.length} sets distintos) · ${mode === 'doubles' ? 'dobles' : 'individuales'}`,
  );

  for (const { member, matchups } of matrix.members) {
    if (values.member && member.species !== values.member) continue;
    console.log(`\n${species(member.species)}`);
    const incoming = matchups
      .filter((matchup) => matchup.incoming)
      .sort((a, b) => (b.incoming?.max ?? 0) - (a.incoming?.max ?? 0))
      .slice(0, top);
    console.log('  Le hacen más daño:');
    for (const { rival, incoming: cell } of incoming) {
      if (cell) console.log(`    ${species(rival.set.species)} ×${rival.count}: ${range(cell)}`);
    }
    const outgoing = matchups
      .filter((matchup) => matchup.outgoing)
      .sort((a, b) => (a.outgoing?.max ?? 0) - (b.outgoing?.max ?? 0))
      .slice(0, top);
    console.log('  A quién hace menos daño:');
    for (const { rival, outgoing: cell } of outgoing) {
      if (cell) console.log(`    ${species(rival.set.species)} ×${rival.count}: ${range(cell)}`);
    }
  }
  return 0;
}

process.exitCode = main();
