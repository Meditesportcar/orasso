// Temps 8 (`s-create` data-cs 7) : « Tout est prêt » — vignette de l'affiche, récapitulatif ; les boutons Publier /
// Brouillon / Aperçu sont dans `EventWizard` (ils enregistrent).
import { Icon } from "@orasso/design-system/web";
import {
  draftStart,
  type EventDraft,
  eventFormatLabels,
  eventKindOf,
  previewTimeline,
  wizardV2Labels as W,
} from "@orasso/shared";
import { formatDayTime, formatShortDay } from "./types";

export function ReadyStep({ d, posterUrl }: { d: EventDraft; posterUrl: string | null }) {
  const start = draftStart(d);
  const t = previewTimeline(d);
  const rows = [
    `${eventFormatLabels[d.format]} · ${d.title || "—"}`,
    start ? formatDayTime(start) : "—",
    [d.addressLine, d.city].filter(Boolean).join(", ") || "—",
    d.unlimited ? W.recapNoLimit : W.recapExhibitors(Number(d.capacity)),
    t.subscribers ? W.recapPreview(formatShortDay(t.subscribers)) : W.recapNoPreview,
    ...(eventKindOf(d) === "rec" && d.recurrence ? [W.recapRecurrence(d.recurrence.count)] : []),
  ];
  return (
    <div className="wz-ready">
      <div className="wz-ready__poster">
        {posterUrl ? <img src={posterUrl} alt={W.posterPreviewAlt} data-testid="wizard-ready-poster" /> : null}
      </div>
      <ul className="wz-recap" data-testid="wizard-recap">
        {rows.map((r) => (
          <li key={r}>
            <Icon name="check" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
