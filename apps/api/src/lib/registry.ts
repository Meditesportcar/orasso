// Contrôle automatique du SIRET ou du RNA d'une structure (docs/01 « Organisateurs : la structure », bloc 1) dans le
// registre public : API Recherche d'entreprises de l'État (recherche-entreprises.api.gouv.fr), gratuite et sans clé.
// Elle couvre les entreprises et les associations immatriculées au répertoire SIRENE ; une association déclarée
// seulement au RNA, sans SIRET, n'y figure pas : elle passe par la pièce justificative validée à la main.
import { departmentFromPostalCode, type RegistryCheck } from "@orasso/shared";

import { env } from "../env";
import { now } from "./deps";

type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

/** Tests : remplace l'appel réseau (`null` pour revenir au vrai registre). */
export function setRegistryFetch(f: FetchLike | null) {
  fetchImpl = f;
}

type Etablissement = {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
  departement?: string;
  etat_administratif?: string;
};
type RegistryResult = {
  siren?: string;
  nom_complet?: string;
  etat_administratif?: string;
  siege?: Etablissement;
  matching_etablissements?: Etablissement[];
  complements?: { est_association?: boolean; identifiant_association?: string | null };
};

const empty = (source: "siret" | "rna", query: string, status: RegistryCheck["status"]): RegistryCheck => ({
  checkedAt: now().toISOString(),
  source,
  query,
  status,
  name: null,
  siren: null,
  siret: null,
  rna: null,
  isAssociation: false,
  address: null,
  postalCode: null,
  city: null,
  department: null,
});

/**
 * Interroge le registre pour un numéro déjà validé (`parseRegistryNumber`). Ne lève jamais : un registre injoignable
 * donne `unavailable` (le contrôle sera refait, l'équipe peut aussi valider sur pièce).
 */
export async function lookupRegistry(source: "siret" | "rna", value: string): Promise<RegistryCheck> {
  let results: RegistryResult[];
  try {
    const url = `${env.REGISTRY_API_URL}/search?q=${encodeURIComponent(value)}&per_page=5`;
    const res = await (fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty(source, value, "unavailable");
    results = ((await res.json()) as { results?: RegistryResult[] }).results ?? [];
  } catch {
    return empty(source, value, "unavailable");
  }

  for (const r of results) {
    const etab =
      source === "siret"
        ? [r.siege, ...(r.matching_etablissements ?? [])].find((e) => e?.siret === value)
        : r.complements?.identifiant_association === value
          ? r.siege
          : undefined;
    if (!etab) continue;
    const active = r.etat_administratif !== "C" && etab.etat_administratif !== "F";
    const postalCode = etab.code_postal ?? null;
    return {
      checkedAt: now().toISOString(),
      source,
      query: value,
      status: active ? "matched" : "closed",
      name: r.nom_complet ?? null,
      siren: r.siren ?? null,
      siret: etab.siret ?? null,
      rna: r.complements?.identifiant_association ?? (source === "rna" ? value : null),
      isAssociation: r.complements?.est_association === true,
      address: etab.adresse ?? null,
      postalCode,
      city: etab.libelle_commune ?? null,
      department: departmentFromPostalCode(postalCode) ?? etab.departement ?? null,
    };
  }
  return empty(source, value, "not_found");
}
