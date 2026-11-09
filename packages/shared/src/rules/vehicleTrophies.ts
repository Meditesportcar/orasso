// Trophées d'un véhicule (lot R7l3, maquette R7.18 `vr_car`) : les podiums des votes de l'événement, lus par la carte du
// véhicule (garage, fiche publique, site). Pur. Le partenaire (R7m1) s'affiche quand l'API le renvoie, rien sinon.
import { vehicleTrophyTexts as T } from "../labels/votePass.fr";
import type { VehicleTrophy } from "../schemas/vehicle";
import { withYear } from "./dateYear";
import { wallTime } from "./time";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export type TrophyLine = {
  id: string;
  /** Le titre du vote : « Plus belle japonaise ». */
  title: string;
  /** « Rassemblement du Lydia · 10 nov. » (l'année seulement hors année en cours). */
  sub: string;
  /** « 1er », « 2e », « 3e ». */
  rank: string;
  /** Le premier d'un vote : mis en avant. */
  first: boolean;
};

/** Les trophées reçus d'une API qui ne les sert peut-être pas encore (réponse en cache d'avant R7l3) : jamais d'erreur. */
export function trophiesOf(v: unknown): VehicleTrophy[] {
  const list = (v as { trophies?: unknown } | null)?.trophies;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t): t is VehicleTrophy =>
      !!t &&
      typeof (t as VehicleTrophy).id === "string" &&
      typeof (t as VehicleTrophy).voteTitle === "string" &&
      typeof (t as VehicleTrophy).eventTitle === "string" &&
      typeof (t as VehicleTrophy).rank === "number",
  );
}

/** Une ligne de trophée : le plus récent d'abord (l'API les trie ; on ne change pas l'ordre). */
export function trophyLine(t: VehicleTrophy, now: Date): TrophyLine {
  const at = new Date(t.awardedAt);
  const w = wallTime(at);
  const day = Number.isNaN(at.getTime()) ? null : withYear(`${w.day} ${MONTHS[w.month - 1]}`, at, now);
  return {
    id: t.id,
    title: t.voteTitle,
    sub: day ? `${t.eventTitle} · ${day}` : t.eventTitle,
    rank: T.rank(t.rank),
    first: t.rank === 1,
  };
}

export type VehiclePartnerLine = { name: string; slug: string | null; title: string };

/**
 * « Partenaire : Wrap 66 » : le champ `partner` de la carte du véhicule (R7m1 : `{ name, logoUrl, slug } | null`). Rien si
 * l'API ne le renvoie pas ou s'il est vide.
 */
export function partnerOf(v: unknown): VehiclePartnerLine | null {
  const p = (v as { partner?: { name?: unknown; slug?: unknown } | null } | null)?.partner;
  if (!p || typeof p.name !== "string" || p.name.trim() === "") return null;
  const slug = typeof p.slug === "string" && p.slug !== "" ? p.slug : null;
  return { name: p.name, slug, title: T.partnerTitle(p.name) };
}
