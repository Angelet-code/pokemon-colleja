/**
 * The animation layers of the stage (ADR-0020): weather behind the Pokémon, effects in front
 * and an overlay for the move banner and labels. It builds the `Stage` and its `Animator` and
 * hands them to whoever plays the battle (the store, or the replay viewer).
 */
import { type RefObject, useEffect, useRef } from 'react';
import { ANIMATION_FACTOR, useSettings } from '../../../stores/settings';
import { Animator } from './player';
import { Stage } from './stage';

export function FxLayer({
  rootRef,
  onAnimator,
}: {
  rootRef: RefObject<HTMLElement | null>;
  onAnimator: (animator: Animator | null) => void;
}) {
  const fxRef = useRef<HTMLCanvasElement>(null);
  const weatherRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const animations = useSettings((state) => state.animations);
  const theme = useSettings((state) => state.theme);

  useEffect(() => {
    const root = rootRef.current;
    const fx = fxRef.current;
    const weather = weatherRef.current;
    const overlay = overlayRef.current;
    if (!root || !fx || !weather || !overlay || typeof ResizeObserver === 'undefined') return;
    let stage: Stage;
    try {
      stage = new Stage(root, fx, weather, overlay);
    } catch {
      // Without a 2D canvas (tests, old browsers) the battle simply shows every turn at once.
      return;
    }
    stageRef.current = stage;
    const animator = new Animator(stage);
    onAnimator(animator);
    const onVisibility = () => {
      if (document.hidden) stage.skip();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      onAnimator(null);
      stage.dispose();
      stageRef.current = null;
    };
  }, [rootRef, onAnimator]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (animations === 'off') {
      stage.skip();
      stage.weather.set(null, false);
    } else {
      stage.speed = ANIMATION_FACTOR[animations];
      stage.resume();
    }
  }, [animations]);

  useEffect(() => {
    stageRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <>
      <canvas ref={weatherRef} className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
      <canvas ref={fxRef} className="pointer-events-none absolute inset-0 z-[2] h-full w-full" />
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
      />
    </>
  );
}
