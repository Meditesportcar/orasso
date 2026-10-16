// Calcul du curseur (ui/Slider.tsx), à part pour être testé sans React Native.
/** Valeur la plus proche du point `x` (px) sur une piste de `width` px, arrondie au pas. */
export function sliderValueAt(x: number, width: number, min: number, max: number, step: number): number {
  if (width <= 0) return min;
  const ratio = Math.min(1, Math.max(0, x / width));
  const raw = min + ratio * (max - min);
  const stepped = Math.round((raw - min) / step) * step + min;
  return Math.min(max, Math.max(min, stepped));
}
