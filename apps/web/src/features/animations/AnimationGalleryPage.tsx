/**
 * Animation gallery (`/animaciones`, outside the menu): any move, by anyone, against anyone,
 * with the outcome picked, without playing a battle. It goes through the same timeline and
 * animator as a battle (ADR-0020). «Recorrido» plays the moves to review one after another.
 */
import { BattleView } from '@colleja/core';
import { getName, listMoves, listSpecies, type MoveId, type SpeciesId } from '@colleja/data';
import { Narrator } from '@colleja/narration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, type ComboOption } from '../../components/Combobox';
import {
  Button,
  Field as FormField,
  PageHeader,
  Panel,
  Segmented,
  Select,
} from '../../components/ui';
import { useSettings } from '../../stores/settings';
import type { Animator } from '../battle/animation/player';
import { planBeats, type SlotId } from '../battle/animation/timeline';
import { AnimationControl } from '../battle/components/AnimationControl';
import { Field } from '../battle/components/Field';
import {
  type GalleryMove,
  type GalleryOutcome,
  type GallerySetup,
  galleryField,
  galleryMove,
  gallerySlots,
} from './gallery-lines';

/** The moves to review with the user before finishing the catalogue (brief of phase 18). */
export const REVIEW_MOVES: MoveId[] = [
  'hydropump',
  'surf',
  'flamethrower',
  'protect',
  'leechseed',
  'earthquake',
  'closecombat',
  'fakeout',
  'trickroom',
] as MoveId[];

/** The second round: elements, draining, big charges, body motions and status with movement. */
export const VARIATION_MOVES: MoveId[] = [
  'firepunch',
  'icefang',
  'thunderpunch',
  'gigadrain',
  'drainingkiss',
  'solarbeam',
  'heatwave',
  'hyperbeam',
  'eruption',
  'bulletseed',
  'extremespeed',
  'agility',
  'doubleteam',
  'bulkup',
  'shellsmash',
  'swordsdance',
  'roar',
  'charm',
  'trick',
] as MoveId[];

const OUTCOMES: { value: GalleryOutcome; label: string }[] = [
  { value: 'hit', label: 'Golpe' },
  { value: 'super', label: 'Supereficaz' },
  { value: 'resisted', label: 'Poco eficaz' },
  { value: 'crit', label: 'Crítico' },
  { value: 'miss', label: 'Falla' },
  { value: 'protect', label: 'Protección' },
];

const SLOT_LABELS: Record<SlotId, string> = {
  p1a: 'Tu izquierda',
  p1b: 'Tu derecha',
  p1c: 'Tu tercero',
  p2a: 'Rival izquierda',
  p2b: 'Rival derecha',
  p2c: 'Rival tercero',
};

const DEFAULT_SPECIES = {
  p1a: 'charizard',
  p1b: 'garchomp',
  p1c: 'charizard',
  p2a: 'gengar',
  p2b: 'dragonite',
  p2c: 'gengar',
} as Record<SlotId, SpeciesId>;

export function AnimationGalleryPage() {
  const locale = useSettings((state) => state.namesLocale);
  const animations = useSettings((state) => state.animations);
  const [mode, setMode] = useState<GallerySetup['mode']>('doubles');
  const [species, setSpecies] = useState(DEFAULT_SPECIES);
  const [move, setMove] = useState<MoveId>('hydropump' as MoveId);
  const [user, setUser] = useState<SlotId>('p1a');
  const [target, setTarget] = useState<SlotId>('p2a');
  const [outcome, setOutcome] = useState<GalleryOutcome>('hit');
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<{ view: BattleView; tick: number }>({
    view: new BattleView(),
    tick: 0,
  });
  const animatorRef = useRef<Animator | null>(null);
  const narratorRef = useRef<Narrator | null>(null);
  const runRef = useRef(0);

  const setup = useMemo<GallerySetup>(() => ({ mode, species }), [mode, species]);
  const slots = gallerySlots(mode);

  const reset = useCallback(() => {
    const narrator = new Narrator('p1', { namesLocale: locale });
    narrator.pushAll(galleryField(setup));
    narratorRef.current = narrator;
    setView((previous) => ({ view: narrator.state, tick: previous.tick + 1 }));
    animatorRef.current?.syncField(narrator.state);
  }, [locale, setup]);

  useEffect(reset, [reset]);

  const onAnimator = useCallback((animator: Animator | null) => {
    animatorRef.current = animator;
  }, []);

  async function play(list: GalleryMove[]) {
    const run = ++runRef.current;
    setPlaying(true);
    for (const chosen of list) {
      if (run !== runRef.current) return;
      reset();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const narrator = narratorRef.current;
      const animator = animatorRef.current;
      if (!narrator) break;
      for (const beat of planBeats(galleryMove(setup, chosen))) {
        const commit = () => {
          narrator.pushAll(beat.lines);
          setView((previous) => ({ view: narrator.state, tick: previous.tick + 1 }));
        };
        if (animator && animations !== 'off') {
          animator.stage.resume();
          await animator.play(beat, { view: narrator.state, commit, locale });
          animator.syncField(narrator.state);
        } else commit();
      }
      await new Promise((resolve) => setTimeout(resolve, list.length > 1 ? 700 : 300));
    }
    if (run === runRef.current) setPlaying(false);
  }

  const moveOptions = useMemo<ComboOption[]>(
    () =>
      listMoves()
        .map((data) => ({
          value: data.id,
          label: getName('moves', data.id, locale),
          search: `${data.name} ${data.type}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [locale],
  );
  const speciesOptions = useMemo<ComboOption[]>(
    () =>
      listSpecies()
        .map((data) => ({
          value: data.id,
          label: getName('species', data.id, locale),
          search: data.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [locale],
  );

  const current: GalleryMove = { move, user, target, outcome };
  const tour = (moves: MoveId[]) =>
    moves.map((id) => ({
      move: id,
      user: 'p1a' as SlotId,
      target: 'p2a' as SlotId,
      outcome: 'hit' as GalleryOutcome,
    }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Animaciones">
        <AnimationControl />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Field key={mode} view={view.view} own={[]} onAnimator={onAnimator} />
        <Panel title="Movimiento" bodyClassName="flex flex-col gap-3 p-4">
          <Segmented
            label="Modo"
            size="sm"
            stretch
            value={mode}
            onChange={(next) => {
              setMode(next);
              if (next === 'singles') {
                setUser((slot) => (slot.endsWith('b') ? 'p1a' : slot));
                setTarget((slot) => (slot.endsWith('b') ? 'p2a' : slot));
              }
            }}
            options={[
              { value: 'singles', label: 'Individuales' },
              { value: 'doubles', label: 'Dobles' },
            ]}
          />
          <Combobox
            label="Movimiento"
            value={move}
            options={moveOptions}
            onChange={(value) => value && setMove(value as MoveId)}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Lo usa">
              <Select value={user} onChange={(event) => setUser(event.target.value as SlotId)}>
                {slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {SLOT_LABELS[slot]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Contra">
              <Select value={target} onChange={(event) => setTarget(event.target.value as SlotId)}>
                {slots
                  .filter((slot) => slot !== user)
                  .map((slot) => (
                    <option key={slot} value={slot}>
                      {SLOT_LABELS[slot]}
                    </option>
                  ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Resultado">
            <Select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as GalleryOutcome)}
            >
              {OUTCOMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void play([current])}>
              Reproducir
            </Button>
            <Button onClick={() => void play(tour(REVIEW_MOVES))} disabled={playing}>
              Recorrido
            </Button>
            <Button onClick={() => void play(tour(VARIATION_MOVES))} disabled={playing}>
              Variaciones
            </Button>
          </div>
          <details className="mt-1">
            <summary className="eyebrow cursor-pointer text-muted">Pokémon</summary>
            <div className="mt-3 flex flex-col gap-3">
              {slots.map((slot) => (
                <Combobox
                  key={slot}
                  label={SLOT_LABELS[slot]}
                  value={species[slot]}
                  options={speciesOptions}
                  onChange={(value) =>
                    value && setSpecies((previous) => ({ ...previous, [slot]: value as SpeciesId }))
                  }
                />
              ))}
            </div>
          </details>
        </Panel>
      </div>
    </div>
  );
}
