/** Start screen: mode, your team, the rival, the difficulty and the practice options. */
import type { MetaResponse, TeamSummary } from '@colleja/protocol';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Checkbox, Panel, Segmented } from '../../components/ui';
import { ApiRequestError, api } from '../../lib/api';
import { type BattleError, useBattle } from '../battle/battle-store';
import { SavedTeamPicker } from './SavedTeamPicker';
import { toStartMessage, useSetup } from './setup-store';
import { TeamInput, useTeamCheck } from './TeamInput';

const TEAM_PLACEHOLDER = `Pega aquí tu equipo en formato de Showdown, por ejemplo:

Garchomp @ Life Orb
Ability: Rough Skin
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Rock Slide
- Protect

(Los EVs son Stat Points de Champions: 66 en total, 32 como máximo por stat.)`;

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

  const teamCheck = useTeamCheck(form.team, form.mode);
  const rivalCheck = useTeamCheck(form.opponentTeam, form.mode);
  const pickSize = form.mode === 'singles' ? 3 : 4;

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
  const rivalReady =
    form.opponentKind === 'random' ||
    (rivalCheck.sets.length > 0 && rivalCheck.problems.length === 0);

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

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nuevo combate</h1>
            <p className="text-sm text-muted">
              Practica contra el bot con las reglas de Pokémon Champions (nivel 50, Stat Points,
              Megas).
            </p>
          </div>
          <Segmented
            label="Modo de combate"
            value={form.mode}
            onChange={(mode) => form.update({ mode })}
            options={[
              { value: 'singles', label: 'Individuales', title: 'Llevas 6 y eliges 3' },
              { value: 'doubles', label: 'Dobles', title: 'Llevas 6 y eliges 4' },
            ]}
          />
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
            {serverError}
          </p>
        )}

        <Panel
          title="Tu equipo"
          actions={
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
          <div className="p-4">
            {form.teamSource === 'saved' ? (
              <SavedTeamPicker
                teams={savedTeams}
                value={form.teamId}
                onChange={(teamId) => form.update({ teamId })}
                pickSize={pickSize}
              />
            ) : (
              <TeamInput
                label={`Export de Showdown (6 Pokémon; en combate eliges ${pickSize})`}
                value={form.team}
                onChange={(team) => form.update({ team })}
                check={teamCheck}
                placeholder={TEAM_PLACEHOLDER}
                actions={
                  <>
                    <Button onClick={() => randomTeam('team')} disabled={generating !== null}>
                      {generating === 'team' ? 'Generando…' : 'Equipo aleatorio'}
                    </Button>
                    <Button
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
          </div>
        </Panel>

        <Panel
          title="Equipo rival"
          actions={
            <Segmented
              label="Equipo rival"
              size="sm"
              value={form.opponentKind}
              onChange={(opponentKind) => form.update({ opponentKind })}
              options={[
                { value: 'random', label: 'Aleatorio' },
                { value: 'team', label: 'Pegado' },
              ]}
            />
          }
        >
          <div className="p-4">
            {form.opponentKind === 'random' ? (
              <p className="text-sm text-muted">
                El bot llevará un equipo aleatorio y legal generado a partir de los sets estándar
                (con una megapiedra como mucho).
              </p>
            ) : (
              <TeamInput
                label="Export de Showdown del rival"
                value={form.opponentTeam}
                onChange={(opponentTeam) => form.update({ opponentTeam })}
                check={rivalCheck}
                actions={
                  <Button onClick={() => randomTeam('rival')} disabled={generating !== null}>
                    {generating === 'rival' ? 'Generando…' : 'Generar uno'}
                  </Button>
                }
              />
            )}
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel title="Dificultad">
          <fieldset className="flex flex-col gap-2 p-3">
            <legend className="sr-only">Dificultad del bot</legend>
            {(meta?.botLevels ?? []).map((level) => {
              const selected = level.level === form.botLevel;
              return (
                <label
                  key={level.level}
                  className={`cursor-pointer rounded-lg border px-3 py-2 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    selected ? 'border-accent bg-accent/10' : 'border-border hover:bg-panel-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="bot-level"
                    value={level.level}
                    aria-label={level.name}
                    className="sr-only"
                    checked={selected}
                    onChange={() => form.update({ botLevel: level.level })}
                  />
                  <span className="flex items-center justify-between text-sm font-semibold">
                    {level.name}
                    <span className="text-xs font-normal text-muted">Nivel {level.level}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{level.description}</span>
                </label>
              );
            })}
            {!meta && !serverError && <p className="text-sm text-muted">Cargando…</p>}
          </fieldset>
        </Panel>

        <Panel title="Opciones de práctica">
          <div className="flex flex-col gap-3 p-4">
            <Checkbox
              checked={form.teamPreview}
              onChange={(teamPreview) => form.update({ teamPreview })}
              label="Vista previa de equipos"
              hint={`Ves los 6 del rival y eliges tus ${pickSize}. Sin ella, salen los primeros en orden.`}
            />
            <Checkbox
              checked={form.openTeamSheets}
              onChange={(openTeamSheets) => form.update({ openTeamSheets })}
              label="Equipo abierto"
              hint="Ves los sets completos del rival (movimientos, objeto, habilidad)."
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Tu nombre</span>
              <input
                value={form.playerName}
                onChange={(event) => form.update({ playerName: event.target.value })}
                maxLength={18}
                placeholder="Jugador"
                className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Semilla (opcional)</span>
              <input
                value={form.seed}
                onChange={(event) => form.update({ seed: event.target.value })}
                maxLength={100}
                placeholder="Aleatoria"
                className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-muted">
                Misma semilla y mismas elecciones = mismo combate.
              </span>
            </label>
          </div>
        </Panel>

        {startError && (
          <div role="alert" className="rounded-xl border border-bad/40 bg-bad/5 p-3 text-sm">
            <p className="font-semibold text-bad">{startError.message}</p>
            {startError.details && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-bad">
                {startError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button
          variant="primary"
          className="py-3 text-base"
          onClick={onStart}
          disabled={!teamReady || !rivalReady || starting || serverError !== null}
        >
          {starting ? 'Preparando el combate…' : 'Empezar combate'}
        </Button>
        {!teamReady && (
          <p className="text-center text-xs text-muted">
            {form.teamSource === 'saved' ? (
              <>
                Elige un equipo guardado legal o{' '}
                <Link to="/equipos" className="text-accent hover:underline">
                  créalo
                </Link>
                .
              </>
            ) : (
              'Pega un equipo legal para empezar.'
            )}
          </p>
        )}
      </aside>
    </div>
  );
}
