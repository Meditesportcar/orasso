// Casquette Pro : lecture du résultat d'un scan du QR de compte (pseudo, grade, remise, rien d'autre).
import { type AccountQrVerify, gradeLabels } from "@orasso/shared";

export type ProScan =
  | { state: "ok"; key: string; pseudo: string; grade: string; discount: string; percent: number | null }
  | { state: "refused"; key: string; reason: string };

const REFUSALS = {
  malformed: "Ce n'est pas un QR de compte Orasso",
  unknown: "Compte inconnu",
  expired: "Code expiré : le client rouvre son QR",
  replayed: "Code déjà lu : attends le suivant",
} as const;

export function proScanOf(result: AccountQrVerify, key: string): ProScan {
  if (!result.valid) return { state: "refused", key, reason: REFUSALS[result.reason] };
  const percent = result.discount?.percent ?? null;
  return {
    state: "ok",
    key,
    pseudo: result.pseudo,
    grade: gradeLabels[result.grade],
    discount: percent ? `−${percent} %` : "Pas de remise",
    percent,
  };
}
