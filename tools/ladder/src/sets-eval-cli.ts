/**
 * The cheap test of the metagame sets (fase 22, ADR-0024): before anything is revealed, how
 * well does the set the bot assumes for each rival fit what the replays end up showing (item,
 * ability, moves)? The standard sets of `@colleja/data` against the sets that are played (the
 * active metagame snapshot, from Smogon's stats, not from these replays). Besides the first
 * set, the probability each model gives to the item and ability seen (what the level 3's
 * deduction starts from).
 *
 *   npm run ladder:sets:eval
 *   npm run ladder:sets:eval -- --min-rating 1500 --after 2026-10-01
 */
import { parseArgs } from 'node:util';
import { OpponentModel, type SetPriors } from '@colleja/bot';
import { BattleView, type PokemonSet } from '@colleja/core';
import { getFormat, getNature, getSpecies } from '@colleja/data';
import { FileMetagameStore, FolderReplayStore, ladderReplaysDir } from '@colleja/metagame';

const { values } = parseArgs({
  options: {
    'min-rating': { type: 'string', default: '1500' },
    /** Only replays uploaded on or after this date (the stats are of an earlier month). */
    after: { type: 'string' },
  },
});

const snapshot = new FileMetagameStore().active();
const priors = snapshot?.sets?.doubles;
if (!snapshot || !priors) {
  console.error('No hay instantánea del meta con sets: ejecuta npm run meta:update.');
  process.exit(1);
}

/** The metagame sets sorted by offense (to compare "plan for the worst" with "most likely"). */
const byOffense: SetPriors = Object.fromEntries(
  Object.entries(priors).map(([species, list]) => [
    species,
    [...list].sort((x, y) => offense(y.set) - offense(x.set)),
  ]),
);

const MODELS = [
  { name: 'Sets estándar', model: new OpponentModel('doubles') },
  { name: 'Meta (lo más probable)', model: new OpponentModel('doubles', null, priors) },
  { name: 'Meta (lo más ofensivo)', model: new OpponentModel('doubles', null, byOffense) },
];

interface Tally {
  items: number;
  itemHits: number;
  itemMass: number;
  abilities: number;
  abilityHits: number;
  abilityMass: number;
  moves: number;
  moveHits: number;
  moveMass: number;
}
const empty = (): Tally => ({
  items: 0,
  itemHits: 0,
  itemMass: 0,
  abilities: 0,
  abilityHits: 0,
  abilityMass: 0,
  moves: 0,
  moveHits: 0,
  moveMass: 0,
});
const tallies = MODELS.map(empty);

const minRating = Number(values['min-rating']);
const after = values.after ? Date.parse(values.after) / 1000 : 0;
const store = new FolderReplayStore(ladderReplaysDir(getFormat('doubles').showdownId));
let battles = 0;
let pokemon = 0;
let covered = 0;
for (const replay of store.replays()) {
  if (replay.rating < minRating || replay.uploadtime < after) continue;
  const view = BattleView.from(replay.log.split('\n'));
  if (view.gameType !== 'doubles') continue;
  battles++;
  for (const side of ['p1', 'p2'] as const) {
    for (const seen of view.sides[side].pokemon) {
      pokemon++;
      if (priors[seen.baseSpecies]) covered++;
      // A Mega Stone is part of the set even if the log only says it Mega Evolved.
      const item = typeof seen.item === 'string' ? seen.item : undefined;
      const multiAbility = (getSpecies(seen.baseSpecies)?.abilities.length ?? 0) > 1;
      const ability = seen.megaEvolved || !multiAbility ? undefined : seen.ability;
      const moves = seen.moves.filter((move) => move !== 'struggle' && move !== 'recharge');
      MODELS.forEach(({ model }, index) => {
        const tally = tallies[index] as Tally;
        const candidates = model.weightedCandidates({
          baseSpecies: seen.baseSpecies,
          species: seen.baseSpecies,
          item: undefined,
          ability: undefined,
          moves: [],
          megaEvolved: false,
        });
        const total = candidates.reduce((sum, c) => sum + c.weight, 0) || 1;
        const mass = (fits: (set: PokemonSet) => boolean) =>
          candidates.filter((c) => fits(c.set)).reduce((sum, c) => sum + c.weight, 0) / total;
        const first = candidates[0]?.set as PokemonSet;
        if (item) {
          tally.items++;
          if (first.item === item) tally.itemHits++;
          tally.itemMass += mass((set) => set.item === item);
        }
        if (ability) {
          tally.abilities++;
          if (first.ability === ability) tally.abilityHits++;
          tally.abilityMass += mass((set) => set.ability === ability);
        }
        for (const move of moves) {
          tally.moves++;
          if (first.moves.includes(move)) tally.moveHits++;
          tally.moveMass += mass((set) => set.moves.includes(move));
        }
      });
    }
  }
}

const pct = (x: number, n: number) => (n > 0 ? `${((100 * x) / n).toFixed(1)} %` : '—');
console.log(
  `Meta ${snapshot.id} · ${battles} partidas (rating ≥ ${minRating}${values.after ? `, desde ${values.after}` : ''}) · ${pokemon} Pokémon vistos, ${pct(covered, pokemon)} con sets del meta\n`,
);
console.log(
  'Modelo                      Objeto (1.º / prob.)   Habilidad (1.º / prob.)   Movimientos (1.º / prob.)',
);
MODELS.forEach(({ name }, index) => {
  const t = tallies[index] as Tally;
  console.log(
    `${name.padEnd(27)} ${pct(t.itemHits, t.items).padStart(8)} / ${pct(t.itemMass, t.items).padStart(7)}   ${pct(t.abilityHits, t.abilities).padStart(9)} / ${pct(t.abilityMass, t.abilities).padStart(7)}   ${pct(t.moveHits, t.moves).padStart(11)} / ${pct(t.moveMass, t.moves).padStart(7)}`,
  );
});
const t = tallies[0] as Tally;
console.log(
  `\nCasos: ${t.items} objetos, ${t.abilities} habilidades (especies con más de una, sin Mega), ${t.moves} movimientos.`,
);

function offense(set: PokemonSet): number {
  const nature = getNature(set.nature);
  const bonus = (stat: 'atk' | 'spa') =>
    nature?.plus === stat ? 10 : nature?.minus === stat ? -10 : 0;
  return Math.max(set.statPoints.atk + bonus('atk'), set.statPoints.spa + bonus('spa'));
}
