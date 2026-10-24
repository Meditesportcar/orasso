import { describe, expect, it } from "vitest";
import {
  decodeExplorerChoice,
  EXPLORER_COOKIE,
  encodeExplorerChoice,
  explorerChoiceStep,
  explorerOwner,
  keptExplorerParams,
} from "./explorerChoice.server";

const BASE = "http://localhost/app/explorer";
const DAY = new Date().toISOString().slice(0, 10);
const request = (cookie?: string) => new Request(BASE, cookie ? { headers: { cookie } } : undefined);
const stored = (userId: string, kept: string) =>
  `${EXPLORER_COOKIE}=${encodeExplorerChoice(explorerOwner(userId), kept)}`;
const cookieValue = (setCookie: string | null) => setCookie?.split(";")[0]?.split("=").slice(1).join("=") ?? "";

describe("choix de l'Explorer du site (lot R1, tour 2)", () => {
  it("garde les sélecteurs et filtres relatifs, jamais la position, le texte, la page ni les dates", () => {
    const kept = keptExplorerParams(
      new URLSearchParams(
        `segment=evenements&tri=places&autour=moi&lat=42.7&lng=2.9&q=supra&suite=abc&du=${DAY}&au=${DAY}&rayon=partout`,
      ),
    );
    expect(kept).toBe("segment=evenements&tri=places&autour=moi&rayon=partout");
    expect(keptExplorerParams(new URLSearchParams("q=supra&segment=resultats"))).toBeNull();
    expect(keptExplorerParams(new URLSearchParams("q=supra"))).toBeNull();
  });

  it("« Tous les formats » (format vide) est un choix gardé, distinct de l'absence de format", () => {
    expect(keptExplorerParams(new URLSearchParams("segment=evenements&format="))).toBe("segment=evenements&format=");
    expect(keptExplorerParams(new URLSearchParams("segment=evenements"))).toBe("segment=evenements");
    const step = explorerChoiceStep(request(stored("a", "segment=evenements&format=")), new URL(BASE), "a");
    // Lot R2 : le choix « Tous les formats » d'un cookie du lot R1 (`format=`) devient explicite (`format=all`).
    expect(step.redirectTo).toBe("/app/explorer?segment=evenements&format=all");
  });

  it("cookies du lot R1 : migrés vers les clés du lot R2 à la lecture", () => {
    const go = (kept: string) => {
      const step = explorerChoiceStep(request(stored("a", kept)), new URL(BASE), "a");
      return Object.fromEntries(new URL(`http://x${step.redirectTo}`).searchParams);
    };
    // Événements : « Tous les formats », département filtré, tout le pays.
    expect(go("segment=evenements&format=&departement=66&categorie=3f1e0b5e-8c2d-4f67-9a10-1b2c3d4e5f60")).toEqual({
      segment: "evenements",
      autour: "ailleurs",
      ailleurs: "66",
      format: "all",
    });
    expect(go("segment=evenements&autour=coin&rayon=partout&format=rassemblement")).toEqual({
      segment: "evenements",
      autour: "partout",
      format: "rassemblement",
    });
    // Pros : activite -> metier ; le tri R1 reste lisible.
    expect(go("segment=pros&activite=detailing&departement=11&tri=nom")).toEqual({
      segment: "pros",
      tri: "nom",
      autour: "ailleurs",
      ailleurs: "11",
      metier: "detailing",
    });
    // Personnes : le département devient le lieu (Ailleurs), les filtres restent.
    expect(go("segment=personnes&departement=66&grade=route")).toEqual({
      segment: "personnes",
      ailleurs: "66",
      lieu: "ailleurs",
      grade: "route",
    });
    // « Autour de moi » est gardé tel quel (la position n'est jamais dans le cookie).
    expect(go("segment=evenements&autour=moi&rayon=50&departement=66")).toEqual({
      segment: "evenements",
      autour: "moi",
      rayon: "50",
    });
    // Un département inconnu est ignoré.
    expect(go("segment=pros&departement=xx&activite=pneus")).toEqual({ segment: "pros", metier: "pneus" });
  });

  it("le cookie porte un identifiant opaque du compte, jamais l'identifiant lui-même", () => {
    const set = explorerChoiceStep(request(), new URL(`${BASE}?tri=places`), "compte-a").setCookie;
    expect(set).toContain(`${EXPLORER_COOKIE}=`);
    expect(set).toContain("HttpOnly");
    const decoded = decodeExplorerChoice(cookieValue(set));
    expect(decoded).toEqual({ owner: explorerOwner("compte-a"), kept: "tri=places" });
    expect(decodeURIComponent(cookieValue(set))).not.toContain("compte-a");
  });

  it("arrivée sans réglage : le choix du même compte revient ; celui d'un autre compte est ignoré et effacé", () => {
    const mine = explorerChoiceStep(request(stored("a", "tri=places&autour=11")), new URL(BASE), "a");
    expect(mine).toEqual({ redirectTo: "/app/explorer?tri=places&autour=11", setCookie: null });
    // Session de A expirée, B se connecte dans le même navigateur sans déconnexion.
    const other = explorerChoiceStep(request(stored("a", "tri=places&autour=11")), new URL(BASE), "b");
    expect(other.redirectTo).toBeNull();
    expect(other.setCookie).toMatch(new RegExp(`^${EXPLORER_COOKIE}=; Max-Age=0`));
    // B choisit à son tour : le cookie devient le sien.
    const mineNow = explorerChoiceStep(request(stored("a", "tri=date")), new URL(`${BASE}?tri=distance`), "b");
    expect(decodeExplorerChoice(cookieValue(mineNow.setCookie))?.owner).toBe(explorerOwner("b"));
  });

  it("cookie d'avant le tour 2 (sans compte), illisible, ou sans session : jamais repris", () => {
    const legacy = `${EXPLORER_COOKIE}=${encodeURIComponent("tri=places&autour=11")}`;
    const step = explorerChoiceStep(request(legacy), new URL(BASE), "a");
    expect(step.redirectTo).toBeNull();
    expect(step.setCookie).toMatch(/Max-Age=0/);
    expect(explorerChoiceStep(request(`${EXPLORER_COOKIE}=%E0%A4%A`), new URL(BASE), "a").redirectTo).toBeNull();
    expect(explorerChoiceStep(request(stored("a", "tri=places")), new URL(BASE), null)).toEqual({
      redirectTo: null,
      setCookie: null,
    });
    // Une valeur gardée avant ce tour avec des dates : elles ne reviennent pas.
    expect(decodeExplorerChoice(encodeExplorerChoice(explorerOwner("a"), `tri=date&du=${DAY}`))?.kept).toBe("tri=date");
  });
});
