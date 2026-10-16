// Contrôle SIRET / RNA des structures (docs/01 « Organisateurs : la structure », bloc 1). Les registres publics sont
// interrogés par l'API (`apps/api/src/lib/registry.ts`) ; ces fonctions pures valident la forme des numéros avant
// tout appel réseau et lisent le résultat.
import type { RegistryCheck } from "../schemas/structure";

/** SIREN : 9 chiffres, clé de Luhn. */
export function isValidSiren(siren: string): boolean {
  return /^\d{9}$/.test(siren) && luhn(siren);
}

/**
 * SIRET : 14 chiffres, clé de Luhn. Exception de La Poste (SIREN 356 000 000) : ses établissements peuvent aussi se
 * valider par une somme des chiffres multiple de 5.
 */
export function isValidSiret(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false;
  if (luhn(siret)) return true;
  return siret.startsWith("356000000") && [...siret].reduce((sum, d) => sum + Number(d), 0) % 5 === 0;
}

/** Numéro RNA (répertoire national des associations) : « W » et 9 chiffres. */
export function isValidRna(rna: string): boolean {
  return /^W\d{9}$/.test(rna);
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Interprétation de la saisie : un SIRET (14 chiffres) ou un RNA (W + 9 chiffres), espaces ignorés. */
export function parseRegistryNumber(input: string): { source: "siret" | "rna"; value: string } | { error: string } {
  const compact = input.replace(/[\s.]/g, "").toUpperCase();
  if (/^\d{14}$/.test(compact)) {
    return isValidSiret(compact)
      ? { source: "siret", value: compact }
      : { error: "Ce numéro SIRET n'est pas valide (clé de contrôle)." };
  }
  if (/^W\d{9}$/.test(compact)) return { source: "rna", value: compact };
  return { error: "Saisis un SIRET (14 chiffres) ou un numéro RNA (W suivi de 9 chiffres)." };
}

/** Le contrôle automatique est concluant : numéro trouvé et établissement actif. */
export function registryPassed(check: RegistryCheck | null | undefined): boolean {
  return check?.status === "matched";
}

/** Le justificatif peut être envoyé à l'équipe : au moins un document, et soit un registre concluant, soit une pièce d'identité d'un responsable (club non déclaré). */
export function canSubmitVerification(
  check: RegistryCheck | null | undefined,
  documentKinds: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (documentKinds.length === 0) return { ok: false, reason: "Ajoute au moins un justificatif." };
  if (registryPassed(check)) return { ok: true };
  if (documentKinds.includes("identity")) return { ok: true };
  return {
    ok: false,
    reason:
      "Fais d'abord contrôler ton SIRET ou ton RNA. Un club non déclaré joint à la place la pièce d'identité de son responsable.",
  };
}
