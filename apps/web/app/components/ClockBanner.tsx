import { Icon } from "@orasso/design-system/web";
import { devClockLabels, formatClockOffset } from "@orasso/shared";

import { useClockOffset } from "../lib/clock";

/**
 * Bandeau « Horloge simulée : +2 j 4 h » (lot 34a), tant que l'API annonce un décalage non nul : on ne confond jamais
 * l'heure d'Orasso avec l'heure réelle. Rien n'est rendu hors simulation.
 */
export function ClockBanner() {
  const text = formatClockOffset(useClockOffset());
  if (!text) return null;
  return (
    <p className="clock-banner" role="status" title={devClockLabels.bannerHint} data-testid="clock-banner">
      <Icon name="wait" size={16} />
      <span>{devClockLabels.banner(text)}</span>
    </p>
  );
}
