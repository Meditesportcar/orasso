import { describe, expect, it } from "vitest";
import {
  awayFormStep,
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
    expect(decoded).toEqual({ owner: explorerOwner("compte-a"), kept: "tri=places", recent: [] });
    expect(decodeURIComponent(cookieValue(set))).not.toContain("compte-a");
  });

  it("arrivée sans réglage : le choix du même compte revient ; celui d'un autre compte est ignoré et effacé", () => {
    const mine = explorerChoiceStep(request(stored("a", "tri=places&autour=11")), new URL(BASE), "a");
    expect(mine).toEqual({ redirectTo: "/app/explorer?tri=places&autour=11", setCookie: null, recent: [] });
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
      recent: [],
    });
    // Une valeur gardée avant ce tour avec des dates : elles ne reviennent pas.
    expect(decodeExplorerChoice(encodeExplorerChoice(explorerOwner("a"), `tri=date&du=${DAY}`))?.kept).toBe("tri=date");
  });
});

describe("« Ailleurs » : les récents et la recherche sans JavaScript (lot R4d, tours 1 et 2)", () => {
  const visit = (cookie: string | undefined, search: string, userId = "a") =>
    explorerChoiceStep(request(cookie), new URL(`${BASE}?${search}`), userId);
  /** Un envoi du formulaire « Où chercher ? » (`valide=1`), comme le fait le chargeur : redirection, puis le cookie. */
  const submit = (cookie: string | undefined, search: string, userId = "a") => {
    const form = awayFormStep(new URL(`${BASE}?${search}&valide=1`));
    if (!form.redirectTo) throw new Error("pas de redirection");
    return { form, ...explorerChoiceStep(request(cookie), new URL(form.redirectTo, BASE), userId, form.picked) };
  };
  const next = (step: { setCookie: string | null }) => `${EXPLORER_COOKIE}=${cookieValue(step.setCookie)}`;

  it("un département validé par Ailleurs passe en tête : 3 au plus, sans doublon ; Mon coin n'y entre pas", () => {
    let cookie: string | undefined;
    for (const code of ["11", "34", "09", "34", "66"])
      cookie = next(submit(cookie, `segment=evenements&autour=ailleurs&ailleurs=${code}`));
    expect(decodeExplorerChoice(cookie?.split("=").slice(1).join("=") ?? "")?.recent).toEqual(["66", "34", "09"]);
    const coin = submit(cookie, "segment=evenements&autour=coin&ailleurs=11");
    expect(coin.recent).toEqual(["66", "34", "09"]);
    // « Ailleurs » pas coché : le département ne reste pas dans l'adresse.
    expect(coin.form.redirectTo).toBe("/app/explorer?segment=evenements&autour=coin");
    // Personnes et crews : le même « Ailleurs », la même liste.
    expect(submit(next(coin), "segment=personnes&lieu=ailleurs&ailleurs=2A").recent).toEqual(["2A", "66", "34"]);
  });

  it("tour 2 : un simple chargement (lien partagé, retour, rechargement) ne compte pas ; seule la validation compte", () => {
    const cookie = next(submit(undefined, "segment=evenements&autour=ailleurs&ailleurs=11"));
    const loaded = visit(cookie, "segment=evenements&autour=ailleurs&ailleurs=34");
    expect(loaded.recent).toEqual(["11"]);
    expect(decodeExplorerChoice(cookieValue(loaded.setCookie))?.recent).toEqual(["11"]);
    // Recharger l'adresse propre après une validation : rien ne bouge.
    const sent = submit(next(loaded), "segment=evenements&autour=ailleurs&ailleurs=34");
    expect(sent.form.redirectTo).not.toContain("valide");
    expect(sent.recent).toEqual(["34", "11"]);
    expect(visit(next(sent), "segment=evenements&autour=ailleurs&ailleurs=34").recent).toEqual(["34", "11"]);
    expect(visit(next(sent), "segment=evenements&autour=ailleurs&ailleurs=11").recent).toEqual(["34", "11"]);
  });

  it("les récents restent au cookie : ni dans l'adresse de retour, ni lus depuis l'adresse", () => {
    const cookie = next(submit(undefined, "segment=pros&autour=ailleurs&ailleurs=11"));
    const back = visit(cookie, "");
    expect(back.redirectTo).toBe("/app/explorer?segment=pros&autour=ailleurs&ailleurs=11");
    expect(back.recent).toEqual(["11"]);
    expect(visit(cookie, "segment=pros&recents=34-66").recent).toEqual(["11"]);
  });

  it("par compte : ceux d'un autre compte ne reviennent jamais ; sans session, aucun", () => {
    const cookie = next(submit(undefined, "segment=evenements&autour=ailleurs&ailleurs=11", "a"));
    expect(visit(cookie, "segment=evenements", "b").recent).toEqual([]);
    expect(visit(cookie, "", "b").recent).toEqual([]);
    expect(visit(cookie, "segment=evenements", "").recent).toEqual([]);
    // Une valeur abîmée est nettoyée.
    const bad = `${EXPLORER_COOKIE}=${encodeURIComponent(`${explorerOwner("a")}|tri=date&recents=11-99-11-34-66-09`)}`;
    expect(visit(bad, "").recent).toEqual(["11", "34", "66"]);
  });

  it("sans JavaScript, le texte tapé devient le premier département qui correspond", () => {
    const go = (search: string) => awayFormStep(new URL(`${BASE}?${search}`));
    expect(go("segment=evenements&autour=ailleurs&dq=her&ailleurs=&valide=1")).toEqual({
      redirectTo: "/app/explorer?segment=evenements&autour=ailleurs&ailleurs=34",
      picked: "34",
      unmatched: null,
    });
    expect(go("autour=ailleurs&dq=pyrenees&ailleurs=11").redirectTo).toBe("/app/explorer?autour=ailleurs&ailleurs=64");
    // Le texte ne sert qu'avec « Ailleurs » coché ; champ vide : seulement retiré ; rien à faire sans envoi.
    expect(go("autour=coin&dq=her&ailleurs=11").redirectTo).toBe("/app/explorer?autour=coin");
    expect(go("autour=coin&dq=").redirectTo).toBe("/app/explorer?autour=coin");
    expect(go("autour=coin")).toEqual({ redirectTo: null, picked: null, unmatched: null });
  });

  it("tour 2 : sans correspondance, pas de redirection ; la saisie est gardée pour l'erreur (aucun choix antérieur)", () => {
    const go = (search: string) => awayFormStep(new URL(`${BASE}?${search}`));
    expect(go("segment=evenements&autour=ailleurs&dq=zzzz&valide=1")).toEqual({
      redirectTo: null,
      picked: null,
      unmatched: "zzzz",
    });
  });
});
