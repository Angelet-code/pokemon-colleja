/**
 * "Calcular": opens the damage calculator in another tab with one of your active Pokémon
 * attacking one of the rival's (a pairing to pick in doubles). The battle is not touched.
 */
import type { BattleView, PokemonSet } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { speciesName } from '@colleja/narration';
import { IconCalc } from '../../../components/icons';
import { ActionSelect, Button } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';
import { useCalc } from '../../calc/calc-store';
import { type BattleMatchup, battleMatchups, calcFromBattle } from '../../calc/from-battle';

const TITLE = 'Abre la calculadora en otra pestaña con los Pokémon en el campo';

export function CalcButton({
  view,
  mode,
  team,
  opponentTeam,
  disabled,
}: {
  view: BattleView;
  mode: GameMode;
  team: readonly PokemonSet[];
  opponentTeam: readonly PokemonSet[] | null;
  disabled?: boolean;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const matchups = battleMatchups(view);

  function open(matchup: BattleMatchup) {
    useCalc.getState().load(calcFromBattle({ view, mode, team, opponentTeam, matchup }));
    window.open('/calculadora', '_blank', 'noopener');
  }

  const [single] = matchups;
  if (matchups.length <= 1) {
    return (
      <Button
        size="sm"
        title={TITLE}
        disabled={disabled || !single}
        onClick={() => single && open(single)}
      >
        <IconCalc size={14} />
        Calcular
      </Button>
    );
  }
  return (
    <ActionSelect
      label="Calcular"
      icon={<IconCalc size={14} />}
      title={TITLE}
      disabled={disabled}
      options={matchups.map((matchup, index) => ({
        value: String(index),
        label: `${speciesName(matchup.attacker.species, locale)} contra ${speciesName(matchup.defender.species, locale)}`,
      }))}
      onPick={(index) => {
        const matchup = matchups[Number(index)];
        if (matchup) open(matchup);
      }}
    />
  );
}
