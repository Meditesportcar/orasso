// Du résultat d'une lecture à l'écran ScanResult (OK + zone moutarde / déjà entré crème / refusé rouge), à la
// vibration et à l'heure « 09:48 » des écrans du staff.
import type { ScanResultProps } from "@orasso/design-system/native";
import { type AccessListEntry, type ScanDecision, scanRefusalLabels, wallTime } from "@orasso/shared";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

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
    return { key, detectedAt, state: "duplicate", time: clock(decision.checkedInAt), ...entryView(decision.entry) };
  }
  return { key, detectedAt, state: "refused", reason: scanRefusalLabels[decision.reason] };
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
