/** Speed of the battle animations (ADR-0020): normal, fast or none. A per-browser setting. */
import { IconMotion } from '../../../components/icons';
import { Segmented } from '../../../components/ui';
import { type AnimationSpeed, useSettings } from '../../../stores/settings';

const SPEEDS: { value: AnimationSpeed; label: string; title: string }[] = [
  { value: 'normal', label: '×1', title: 'Animaciones a velocidad normal' },
  { value: 'fast', label: '×2', title: 'Animaciones rápidas' },
  { value: 'off', label: 'No', title: 'Sin animaciones: cada turno se ve de golpe' },
];

export function AnimationControl() {
  const animations = useSettings((state) => state.animations);
  const setAnimations = useSettings((state) => state.setAnimations);
  return (
    <span className="flex items-center gap-1.5" title="Animaciones">
      <IconMotion size={14} className="text-muted" />
      <Segmented
        label="Animaciones"
        size="sm"
        value={animations}
        onChange={setAnimations}
        options={SPEEDS}
      />
    </span>
  );
}
