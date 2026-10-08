/**
 * Start screen, as a versus: your team on the left, the rival on the right, and the rules of
 * the battle (difficulty, practice options) in the bar below.
 */
import type { MetaResponse, OpponentSummary, TeamSummary } from '@colleja/protocol';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconArrowRight, IconDice } from '../../components/icons';
import { TeamSlots } from '../../components/TeamSlots';
import {
  Button,
  Checkbox,
  Chip,
  Field,
  LegalityChip,
  Loading,
  Notice,
  Segmented,
  TextInput,
} from '../../components/ui';
import { ApiRequestError, api } from '../../lib/api';
import { type BattleError, useBattle } from '../battle/battle-store';
import { SavedTeamPicker } from './SavedTeamPicker';
import { toStartMessage, useSetup } from './setup-store';
import { TeamInput, useTeamCheck } from './TeamInput';

const TEAM_PLACEHOLDER = `Garchomp @ Life Orb
Ability: Rough Skin
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Earthquake
- Dragon Claw
…`;

/** Attempts to reach the server before giving up (about one per second). */
const META_RETRIES = 8;

export function SetupPage() {
  const form = useSetup();
  const navigate = useNavigate();
  const start = useBattle((state) => state.start);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [startError, setStartError] = useState<BattleError | null>(null);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState<'team' | 'rival' | null>(null);
  const [savedTeams, setSavedTeams] = useState<TeamSummary[] | null>(null);
  const [savedOpponents, setSavedOpponents] = useState<OpponentSummary[] | null>(null);

  const teamCheck = useTeamCheck(form.team, form.mode);
  const rivalCheck = useTeamCheck(form.opponentTeam, form.mode);

  // Right after `npm run dev` the web may be up before the server: retry for a few seconds.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      api
        .meta()
        .then((data) => {
          if (cancelled) return;
          setMeta(data);
          setServerError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (attempt < META_RETRIES) timer = setTimeout(() => load(attempt + 1), 1000);
          else setServerError(error instanceof Error ? error.message : String(error));
        });
    };
    load(1);
    api
      .listTeams()
      .then(({ teams }) => !cancelled && setSavedTeams(teams))
      .catch(() => !cancelled && setSavedTeams([]));
    api
      .listOpponents()
      .then(({ opponents }) => !cancelled && setSavedOpponents(opponents))
      .catch(() => !cancelled && setSavedOpponents([]));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const savedTeam = savedTeams?.find((team) => team.id === form.teamId) ?? null;
  const teamReady =
    form.teamSource === 'saved'
      ? savedTeam?.valid === true
      : teamCheck.sets.length > 0 && teamCheck.problems.length === 0;
  const savedOpponent = savedOpponents?.find((opponent) => opponent.id === form.opponentId) ?? null;
  const rivalReady =
    form.opponentKind === 'random' ||
    (form.opponentKind === 'saved'
      ? savedOpponent?.valid === true
      : rivalCheck.sets.length > 0 && rivalCheck.problems.length === 0);
  const levelName = (level: number) =>
    meta?.botLevels.find((info) => info.level === level)?.name ?? `Nivel ${level}`;

  async function randomTeam(target: 'team' | 'rival') {
    setGenerating(target);
    try {
      const { text } = await api.randomTeam(form.mode);
      form.update(target === 'team' ? { team: text } : { opponentTeam: text });
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : String(error));
    } finally {
      setGenerating(null);
    }
  }

  async function onStart() {
    setStarting(true);
    setStartError(null);
    const result = await start(toStartMessage(form));
    setStarting(false);
    if (result.ok) navigate('/combate');
    else setStartError(result.error);
  }

  const mine =
    form.teamSource === 'saved'
      ? {
          name: savedTeam?.name ?? null,
          species: savedTeam?.species ?? [],
          status: savedTeam && <LegalityChip problems={savedTeam.problems} />,
        }
      : {
          name: teamCheck.sets.length > 0 ? 'Pegado' : null,
          species: teamCheck.sets.map((set) => set.species),
          status: teamCheck.sets.length > 0 && <LegalityChip problems={teamCheck.problems} />,
        };
  const theirs =
    form.opponentKind === 'random'
      ? { name: 'Aleatorio', species: [], status: null }
      : form.opponentKind === 'saved'
        ? {
            name: savedOpponent?.name ?? null,
            species: savedOpponent?.species ?? [],
            status:
              savedOpponent &&
              (savedOpponent.valid ? (
                <Chip tone="rival">{levelName(savedOpponent.botLevel)}</Chip>
              ) : (
                <LegalityChip problems={savedOpponent.problems} />
              )),
          }
        : {
            name: rivalCheck.sets.length > 0 ? 'Pegado' : null,
            species: rivalCheck.sets.map((set) => set.species),
            status: rivalCheck.sets.length > 0 && <LegalityChip problems={rivalCheck.problems} />,
          };

  const missing = !teamReady ? 'Falta tu equipo' : !rivalReady ? 'Falta el rival' : null;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="display text-6xl sm:text-7xl">
          Nuevo
          <br />
          <span className="text-accent-fg">combate</span>
        </h1>
        <Segmented
          label="Modo de combate"
          size="lg"
          value={form.mode}
          onChange={(mode) => form.update({ mode })}
          options={[
            { value: 'singles', label: 'Individuales', hint: '6 → 3' },
            { value: 'doubles', label: 'Dobles', hint: '6 → 4' },
          ]}
        />
      </div>

      {serverError && (
        <Notice tone="warn" title="No hay conexión con el servidor">
          <p className="text-xs text-muted">{serverError}</p>
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] lg:gap-0">
        <Side
          side="p1"
          title="Tu equipo"
          name={mine.name}
          status={mine.status}
          species={mine.species}
          source={
            <Segmented
              label="Origen de tu equipo"
              size="sm"
              value={form.teamSource}
              onChange={(teamSource) => form.update({ teamSource })}
              options={[
                { value: 'saved', label: 'Guardado' },
                { value: 'text', label: 'Pegado' },
              ]}
            />
          }
        >
          {form.teamSource === 'saved' ? (
            <SavedTeamPicker
              teams={savedTeams}
              value={form.teamId}
              onChange={(team) => form.update({ teamId: team.id })}
              legend="Equipo guardado"
              name="saved-team"
              empty={
                <>
                  Sin equipos guardados.{' '}
                  <Link to="/equipos/nuevo" className="text-accent-fg hover:underline">
                    Crear uno
                  </Link>
                </>
              }
            />
          ) : (
            <TeamInput
              label="Export de Showdown de tu equipo"
              value={form.team}
              onChange={(team) => form.update({ team })}
              check={teamCheck}
              placeholder={TEAM_PLACEHOLDER}
              actions={
                <>
                  <Button
                    size="sm"
                    onClick={() => randomTeam('team')}
                    disabled={generating !== null}
                  >
                    <IconDice size={14} />
                    {generating === 'team' ? 'Generando…' : 'Equipo aleatorio'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => form.update({ team: '' })}
                    disabled={!form.team}
                  >
                    Borrar
                  </Button>
                </>
              }
            />
          )}
        </Side>

        <Versus />

        <Side
          side="p2"
          title="Rival"
          name={theirs.name}
          status={theirs.status}
          species={theirs.species}
          hidden={form.opponentKind === 'random'}
          source={
            <Segmented
              label="Equipo rival"
              size="sm"
              value={form.opponentKind}
              onChange={(opponentKind) => form.update({ opponentKind })}
              options={[
                { value: 'random', label: 'Aleatorio' },
                { value: 'saved', label: 'Guardado' },
                { value: 'team', label: 'Pegado' },
              ]}
            />
          }
        >
          {form.opponentKind === 'saved' && (
            <SavedTeamPicker
              side="p2"
              teams={savedOpponents}
              value={form.opponentId}
              // Picking an opponent applies its difficulty (it can still be changed).
              onChange={(opponent) =>
                form.update({ opponentId: opponent.id, botLevel: opponent.botLevel })
              }
              legend="Rival guardado"
              name="saved-opponent"
              detail={(opponent) => levelName(opponent.botLevel)}
              empty={
                <>
                  Sin rivales guardados.{' '}
                  <Link to="/rivales" className="text-accent-fg hover:underline">
                    Crear uno
                  </Link>
                </>
              }
            />
          )}
          {form.opponentKind === 'team' && (
            <TeamInput
              label="Export de Showdown del rival"
              value={form.opponentTeam}
              onChange={(opponentTeam) => form.update({ opponentTeam })}
              check={rivalCheck}
              placeholder={TEAM_PLACEHOLDER}
              actions={
                <Button
                  size="sm"
                  onClick={() => randomTeam('rival')}
                  disabled={generating !== null}
                >
                  <IconDice size={14} />
                  {generating === 'rival' ? 'Generando…' : 'Equipo aleatorio'}
                </Button>
              }
            />
          )}
        </Side>
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-t border-line pt-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span className="eyebrow text-faint">Dificultad</span>
            {meta ? (
              <Segmented
                label="Dificultad del bot"
                value={form.botLevel}
                onChange={(botLevel) => form.update({ botLevel })}
                options={meta.botLevels.map((level) => ({
                  value: level.level,
                  label: level.name,
                  title: level.description,
                }))}
              />
            ) : (
              !serverError && <Loading />
            )}
          </div>
          {form.opponentKind === 'saved' &&
            savedOpponent &&
            savedOpponent.botLevel !== form.botLevel && (
              <p className="text-xs text-faint">
                «{savedOpponent.name}» se guardó con la dificultad{' '}
                {levelName(savedOpponent.botLevel)}.{' '}
                <button
                  type="button"
                  className="text-accent-fg hover:underline"
                  onClick={() => form.update({ botLevel: savedOpponent.botLevel })}
                >
                  Usar esa
                </button>
              </p>
            )}
        </div>
        <Checkbox
          checked={form.teamPreview}
          onChange={(teamPreview) => form.update({ teamPreview })}
          label="Vista previa"
        />
        <Checkbox
          checked={form.openTeamSheets}
          onChange={(openTeamSheets) => form.update({ openTeamSheets })}
          label="Equipo abierto"
        />
        <div className="flex gap-3">
          <Field label="Tu nombre" className="w-36">
            <TextInput
              value={form.playerName}
              onChange={(event) => form.update({ playerName: event.target.value })}
              maxLength={18}
              placeholder="Jugador"
            />
          </Field>
          <Field label="Semilla" className="w-36">
            <TextInput
              value={form.seed}
              onChange={(event) => form.update({ seed: event.target.value })}
              maxLength={100}
              placeholder="Aleatoria"
            />
          </Field>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {missing && <span className="eyebrow text-faint">{missing}</span>}
          <Button
            variant="primary"
            size="lg"
            onClick={onStart}
            disabled={!teamReady || !rivalReady || starting || serverError !== null}
          >
            {starting ? 'Preparando…' : 'Combatir'}
            <IconArrowRight size={20} />
          </Button>
        </div>
      </div>

      {startError && <Notice title={startError.message} items={startError.details} />}
    </div>
  );
}

/** One side of the versus: its source, the chosen team in big slots and the picker. */
function Side({
  side,
  title,
  source,
  name,
  status,
  species,
  hidden = false,
  children,
}: {
  side: 'p1' | 'p2';
  title: string;
  source: ReactNode;
  name: string | null;
  status: ReactNode;
  species: string[];
  hidden?: boolean;
  children?: ReactNode;
}) {
  const color = side === 'p1' ? 'text-accent-fg' : 'text-rival';
  const mark = side === 'p1' ? 'bg-accent' : 'bg-rival';
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-md border border-line bg-surface shadow-panel"
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className={`eyebrow flex items-center gap-2 ${color}`}>
          <span className={`size-2 ${mark}`} aria-hidden="true" />
          {title}
        </h2>
        {source}
      </header>
      <div className="flex flex-col gap-4 border-b border-line px-5 pt-5 pb-4">
        <div className="flex min-h-9 items-baseline gap-3">
          <span className={`display truncate text-[34px] ${name ? '' : 'text-faint'}`}>
            {name ?? 'Sin elegir'}
          </span>
          {status}
        </div>
        <TeamSlots species={species} hidden={hidden} label={`Pokémon de ${title.toLowerCase()}`} />
      </div>
      {children && <div className="p-2">{children}</div>}
    </section>
  );
}

function Versus() {
  return (
    <div className="relative hidden items-center justify-center lg:flex" aria-hidden="true">
      <span className="absolute inset-y-6 left-1/2 w-px bg-gradient-to-b from-transparent via-line-strong to-transparent" />
      <span className="display relative bg-bg py-3 text-[44px] italic">VS</span>
    </div>
  );
}
