// Du résultat d'une lecture à l'écran ScanResult (OK + zone moutarde / déjà entré crème / refusé rouge), à la
// vibration et à l'heure « 09:48 » des écrans du staff.

import type { ScanResultProps } from "@orasso/design-system/native";
import {
  type AccessListEntry,
  expiredScanLabel,
  formatDayDate,
  localDate,
  type ScanDecision,
  scanRefusalLabels,
  shopLabels,
  type TicketScanDecision,
  ticketRefusalLabels,
  wallTime,
} from "@orasso/shared";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { now as clockNow } from "@/lib/clock";

import { scanLines } from "@/lib/staff/model";

/** « 09:48 » (heure de Paris), comme les écrans du staff du prototype. */
export function clock(iso: string | Date): string {
  const w = wallTime(new Date(iso));
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

export type ResultProps = Pick<ScanResultProps, "state" | "vehicle" | "pseudo" | "zone" | "time" | "reason">;

export type ShownResult = ResultProps & {
  /** Identifiant de l'affichage : un nouveau résultat relance l'écran plein et son retour en 1 s. */
  key: string;
  /** Heure de la détection (performance.now), pour mesurer le temps jusqu'à l'affichage. */
  detectedAt?: number;
};

const entryView = scanLines;

/** L'affichage d'une décision locale (`unknown_pass` a son propre panneau : il attend un geste du staff). */
export function resultOf(
  decision: Exclude<ScanDecision, { decision: "unknown_pass" }>,
  key: string,
  detectedAt?: number,
): ShownResult {
  if (decision.decision === "ok")
    return { key, detectedAt, state: "ok", time: "à l'instant", ...entryView(decision.entry) };
  if (decision.decision === "already") {
    // Lot 26 (S29) : « tout l'événement » déjà entré un jour précédent → « le 14 mars · 09:48 », le staff laisse passer.
    const earlier = localDate(new Date(decision.checkedInAt)) !== localDate(clockNow());
    const time = earlier
      ? `le ${formatDayDate(localDate(new Date(decision.checkedInAt)), { weekday: false })} · ${clock(decision.checkedInAt)}`
      : clock(decision.checkedInAt);
    return { key, detectedAt, state: "duplicate", time, ...entryView(decision.entry) };
  }
  // Relecture du lot 48 : code tournant périmé au MAC valide → l'écart d'horloge et le pointage à la main.
  const reason =
    decision.reason === "expired" && decision.offsetSeconds !== undefined
      ? expiredScanLabel(decision.offsetSeconds)
      : scanRefusalLabels[decision.reason];
  return { key, detectedAt, state: "refused", reason };
}

/**
 * Un billet du public lu par la boutique : « Billet OK · Entrée » (moutarde), « Déjà utilisé » + l'heure (crème),
 * ou la raison du refus (rouge). Jamais d'identité : le staff boutique n'a pas besoin du nom du visiteur.
 */
export function ticketResultOf(decision: TicketScanDecision, key: string, detectedAt?: number): ShownResult {
  if (decision.decision === "ok") {
    const type = decision.ticket?.typeLabel;
    return {
      key,
      detectedAt,
      state: "ok",
      time: "à l'instant",
      vehicle: type ? `${shopLabels.ticketOk} · ${type}` : shopLabels.ticketOk,
      pseudo: decision.listed ? undefined : "à resynchroniser",
    };
  }
  if (decision.decision === "already") {
    return {
      key,
      detectedAt,
      state: "duplicate",
      time: decision.usedAt ? clock(decision.usedAt) : undefined,
      vehicle: shopLabels.ticketAlready,
    };
  }
  return { key, detectedAt, state: "refused", reason: ticketRefusalLabels[decision.reason] };
}

/** Pointé à la main (recherche, liste) : même écran que le scan OK, avec la zone à lire au conducteur. */
export function pointedResult(entry: AccessListEntry, key: string, already: string | null): ShownResult {
  return already
    ? { key, state: "duplicate", time: clock(already), ...entryView(entry) }
    : { key, state: "ok", time: "pointé", ...entryView(entry) };
}

/** Ce que ScanResult reçoit (sans la clé d'affichage ni l'heure de détection). */
export const resultProps = ({ key: _key, detectedAt: _at, ...props }: ShownResult): ResultProps => props;

/** Une vibration par résultat (le son est joué par ScanResult) ; rien sur le web. */
export function vibrate(state: ShownResult["state"]): void {
  if (Platform.OS === "web") return;
  const type =
    state === "ok"
      ? Haptics.NotificationFeedbackType.Success
      : state === "duplicate"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  Haptics.notificationAsync(type).catch(() => undefined);
}
