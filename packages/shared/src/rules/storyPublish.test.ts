import { describe, expect, it, vi } from "vitest";
import { storyCreateSchema } from "../schemas/stories";
import { DEFAULT_PLATE_FRAME, nextPlateFrame } from "./plateFrame";
import {
  fillFrame,
  fillScale,
  frameState,
  isStoryRatio,
  limitFrame,
  moveFrame,
  STORY_H,
  STORY_W,
  zoomPercent,
} from "./storyFrame";
import {
  addTag,
  pruneForAudience,
  removeTag,
  sendIfAlive,
  storyAudienceOptions,
  storyBody,
  storyEffectiveVisibility,
  storyEventSticker,
  storyPlaceText,
  storyPlateDecided,
  storyPlateIssue,
  storyPublishIssue,
  taggableHint,
  taggableQuery,
} from "./storyPublish";

const land = { w: 4000, h: 3000 };
const fan = { persona: "fan" as const };
const placed = { x: 0.2, y: 0.5, w: 0.3, h: 0.1 };

describe("ajuster une photo (R7.22)", () => {
  it("reconnaît le 9:16 à un centième près", () => {
    expect(isStoryRatio(1080, 1920)).toBe(true);
    expect(isStoryRatio(720, 1280)).toBe(true);
    expect(isStoryRatio(1079, 1920)).toBe(true);
    expect(isStoryRatio(1067, 1600)).toBe(false);
    expect(isStoryRatio(4000, 3000)).toBe(false);
    expect(isStoryRatio(0, 0)).toBe(false);
  });

  it("limites : posée = rien ne bouge d'un axe plein ; remplie = aucun vide ; jamais hors du canevas", () => {
    // Paysage posée : 1080 de large, 810 de haut. Horizontal : bloqué. Vertical : dans le canevas (± 555).
    const posed = limitFrame({ scale: 1, offsetX: 500, offsetY: 9000 }, land.w, land.h);
    expect(posed.offsetX).toBe(0);
    expect(posed.offsetY).toBeCloseTo((STORY_H - 810) / 2, 6);
    // Remplie : la photo couvre le canevas, le décalage est borné par ce qui dépasse.
    const full = fillFrame(land.w, land.h);
    expect(full.scale).toBeCloseTo(STORY_H / 810, 6);
    const moved = limitFrame({ ...full, offsetX: 99_999, offsetY: 99_999 }, land.w, land.h);
    expect(moved.offsetY).toBe(0);
    expect(moved.offsetX).toBeCloseTo((land.w * (STORY_H / land.h) - STORY_W) / 2, 6);
    expect(moved.offsetX).toBeGreaterThan(0);
  });

  it("les bornes de zoom : de « posée » (1) à quatre fois ; les valeurs absurdes retombent dans les bornes", () => {
    expect(limitFrame({ scale: 0.2, offsetX: 0, offsetY: 0 }, land.w, land.h).scale).toBe(1);
    expect(limitFrame({ scale: 99, offsetX: 0, offsetY: 0 }, land.w, land.h).scale).toBe(4);
    expect(
      limitFrame({ scale: Number.NaN, offsetX: Number.NaN, offsetY: Number.POSITIVE_INFINITY }, land.w, land.h),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("une photo très large ne peut pas remplir : le zoom maximal compte comme « remplir »", () => {
    expect(fillScale(10_000, 1000)).toBe(4);
    expect(fillFrame(10_000, 1000).scale).toBe(4);
  });

  it("trois états : posée, ajustée, remplie ; Rétablir revient à posée", () => {
    const reset = { scale: 1, offsetX: 0, offsetY: 0 };
    expect(frameState(reset, land.w, land.h)).toBe("fit");
    expect(frameState({ scale: 1.5, offsetX: 0, offsetY: 0 }, land.w, land.h)).toBe("adjusted");
    expect(frameState({ scale: 1, offsetX: 0, offsetY: 100 }, land.w, land.h)).toBe("adjusted");
    expect(frameState(fillFrame(land.w, land.h), land.w, land.h)).toBe("full");
    // Une photo 9:16 : rien à remplir, jamais « remplie » par erreur sur un cadrage par défaut ; elle est « posée ».
    expect(frameState(reset, 1080, 1920)).toBe("fit");
  });

  it("le pourcentage de zoom va de 0 (posée) à 100 (remplie)", () => {
    expect(zoomPercent({ scale: 1, offsetX: 0, offsetY: 0 }, land.w, land.h)).toBe(0);
    expect(zoomPercent(fillFrame(land.w, land.h), land.w, land.h)).toBe(100);
    const mid = zoomPercent({ scale: 1 + (STORY_H / 810 - 1) * 0.62, offsetX: 0, offsetY: 0 }, land.w, land.h);
    expect(mid).toBe(62);
    expect(zoomPercent({ scale: 1, offsetX: 0, offsetY: 0 }, 1080, 1920)).toBe(100);
  });

  it("un geste : zoom autour du centre, glissement en pixels du canevas, toujours dans les bornes", () => {
    const start = { scale: 1.5, offsetX: 100, offsetY: 0 };
    const next = moveFrame(start, 2, 10, 0, land.w, land.h);
    expect(next.scale).toBe(3);
    expect(next.offsetX).toBe(210);
    // Un geste incohérent (NaN, zéro) ne casse rien.
    expect(moveFrame(start, 0, Number.NaN, Number.NaN, land.w, land.h)).toEqual(limitFrame(start, land.w, land.h));
    // Les offsets envoyés à l'API sont toujours valides.
    const body = storyCreateSchema.safeParse({
      uploadKey: "k",
      frame: moveFrame(start, 50, 99_999, -99_999, land.w, land.h),
      noPlateConfirmed: true,
      audience: "followers",
    });
    expect(body.success).toBe(true);
  });
});

describe("à qui s'adresse la story", () => {
  const crews = [
    { id: "c1", name: "Roussillon Drift", members: 6 },
    { id: "c2", name: "Solo", members: 1 },
  ];

  it("passionné : « Mes abonnés » (sous-titre selon le compte) et un choix par crew", () => {
    const pub = storyAudienceOptions(fan, "public", crews);
    expect(pub.map((o) => o.key)).toEqual(["followers", "crew:c1", "crew:c2"]);
    expect(pub[0]?.hint).toContain("quiconque ouvre ton profil");
    expect(storyAudienceOptions(fan, "private", [])[0]?.hint).toContain("abonnés acceptés");
    expect(pub[1]).toMatchObject({ audience: "crew", crewId: "c1", label: "Mon crew · Roussillon Drift" });
    expect(pub[2]?.hint).toBe("1 membre · rien ne sort du crew");
  });

  it("organisateur, pro : « Public » seul (publics par nature), jamais un crew, quel que soit le compte", () => {
    for (const persona of ["organizer", "pro"] as const) {
      for (const visibility of ["public", "private"] as const) {
        const options = storyAudienceOptions({ persona, name: "Roues Libres 66" }, visibility, crews);
        expect(options).toHaveLength(1);
        expect(options[0]).toMatchObject({ audience: "public", crewId: null });
        expect(options[0]?.hint).toContain("Roues Libres 66");
      }
    }
  });

  it("prestataire, média : « Public » seul, quel que soit le compte de leur titulaire (lot R9a, D38 : une page est publique)", () => {
    for (const persona of ["provider", "media"] as const) {
      for (const visibility of ["public", "private"] as const) {
        const options = storyAudienceOptions({ persona, name: "Garage Sud" }, visibility, crews);
        expect(options).toHaveLength(1);
        expect(options[0]).toMatchObject({ audience: "public", crewId: null, label: "Public" });
        expect(options[0]?.hint).toContain("Garage Sud");
      }
    }
  });

  it("un public perdu bloque l'envoi avec la ligne qui dit de choisir à nouveau", () => {
    const plate = { rects: [], noPlate: true, detection: "none" as const };
    expect(storyPublishIssue({ hasPhoto: true, plate, caption: "", audienceLost: true })).toBe(
      "Choisis à nouveau qui la voit.",
    );
    expect(storyPublishIssue({ hasPhoto: true, plate, caption: "" })).toBeNull();
  });

  it("l'autocollant d'événement est grisé, avec la raison, pour un compte privé et pour un crew", () => {
    expect(storyEventSticker("public", "followers")).toEqual({ allowed: true, reason: null });
    expect(storyEventSticker("public", "public").allowed).toBe(true);
    expect(storyEventSticker("private", "followers")).toMatchObject({ allowed: false });
    expect(storyEventSticker("private", "followers").reason).toContain("compte privé");
    expect(storyEventSticker("public", "crew").reason).toContain("crew");
  });
});

describe("identifier", () => {
  it("la liste des identifiables est demandée avec le public, le crew et la casquette", () => {
    expect(taggableQuery({ audience: "followers", crewId: null, persona: "fan" })).toEqual({
      taggableFor: "followers",
      persona: "fan",
    });
    expect(taggableQuery({ audience: "crew", crewId: "c1", persona: "fan" })).toEqual({
      taggableFor: "crew",
      crewId: "c1",
      persona: "fan",
    });
    // Un crew non choisi n'ajoute pas de crewId (l'API répond « personne »).
    expect(taggableQuery({ audience: "crew", crewId: null, persona: "fan" })).not.toHaveProperty("crewId");
  });

  it("la phrase dit à qui la liste est limitée", () => {
    expect(taggableHint("crew", "public", "fan")).toContain("crew");
    expect(taggableHint("followers", "private", "fan")).toContain("abonnés acceptés");
    expect(taggableHint("followers", "public", "fan")).toContain("n'importe quel membre");
    expect(taggableHint("public", "private", "organizer")).toContain("n'importe quel membre");
  });

  it("sans doublon, dix au plus, retrait", () => {
    let tags = addTag([], { id: "a", pseudo: "Kenji_66" });
    tags = addTag(tags, { id: "a", pseudo: "Kenji_66" });
    expect(tags).toHaveLength(1);
    for (let i = 0; i < 20; i++) tags = addTag(tags, { id: `u${i}`, pseudo: `P${i}` });
    expect(tags).toHaveLength(10);
    expect(removeTag(tags, "a")).toHaveLength(9);
  });

  it("changer le public retire les personnes identifiées (elles ne verraient peut-être plus la story) ; un crew retire l'événement", () => {
    const state = { tags: [{ id: "a", pseudo: "Kenji_66" }], eventId: "e1" };
    const before = { audience: "followers" as const, crewId: null };
    const same = pruneForAudience(before, before, state);
    expect(same).toEqual({ tags: state.tags, eventId: "e1", changed: false });
    const crew = pruneForAudience(before, { audience: "crew", crewId: "c1" }, state);
    expect(crew).toEqual({ tags: [], eventId: null, changed: true });
    const other = pruneForAudience(
      { audience: "crew", crewId: "c1" },
      { audience: "crew", crewId: "c2" },
      { tags: state.tags, eventId: null },
    );
    expect(other.tags).toEqual([]);
    expect(other.changed).toBe(true);
    const back = pruneForAudience(before, { audience: "public", crewId: null }, { tags: [], eventId: "e1" });
    expect(back).toEqual({ tags: [], eventId: "e1", changed: false });
  });
});

describe("la plaque (décision obligatoire)", () => {
  it("sans décision : la ligne dit quoi ; un cadre jamais placé n'est pas une décision", () => {
    expect(storyPlateIssue({ rects: [], noPlate: false, detection: "none" })).toContain("confirme qu'aucune");
    expect(storyPlateIssue({ rects: [DEFAULT_PLATE_FRAME], noPlate: false, detection: "none" })).toContain(
      "Place le cadre",
    );
    expect(storyPlateDecided({ rects: [nextPlateFrame([])], noPlate: false })).toBe(false);
    expect(storyPlateIssue({ rects: [placed], noPlate: false, detection: "found" })).toBeNull();
    expect(storyPlateIssue({ rects: [], noPlate: true, detection: "unavailable" })).toBeNull();
  });

  it("pendant la recherche : « Recherche de la plaque… », même avec une décision", () => {
    expect(storyPlateIssue({ rects: [], noPlate: true, detection: "pending" })).toContain("Recherche");
  });

  it("ce qui bloque « Publier » : préparation, photo, plaque, crew, légende", () => {
    const plate = { rects: [], noPlate: true, detection: "none" as const };
    const base = { hasPhoto: true, plate, caption: "" };
    expect(storyPublishIssue({ ...base, preparing: true })).toContain("Préparation");
    expect(storyPublishIssue({ ...base, hasPhoto: false })).toBe("Choisis une photo.");
    expect(storyPublishIssue({ ...base, plate: { ...plate, noPlate: false } })).toContain("plaque");
    expect(storyPublishIssue({ ...base, needsCrew: true })).toContain("crew");
    expect(storyPublishIssue({ ...base, caption: "x".repeat(201) })).toContain("200");
    expect(storyPublishIssue({ ...base, caption: "x".repeat(200) })).toBeNull();
    expect(storyPublishIssue(base)).toBeNull();
  });
});

describe("le corps de POST /me/stories", () => {
  const frame = { scale: 1, offsetX: 0, offsetY: 0 };
  const base = {
    uploadKey: "k",
    frame,
    rects: [placed],
    noPlate: false,
    audience: "followers" as const,
    crewId: null,
    author: fan,
    caption: "  Prête pour le Lydia  ",
    place: "  Le Barcarès ",
    vehicleId: null,
    eventId: null,
    tags: [{ id: "u1" }],
  };

  it("cadres floutés : l'un ou l'autre, jamais les deux ; coordonnées de la photo d'origine inchangées", () => {
    const body = storyBody(base);
    expect(body.plateRects).toEqual([placed]);
    expect(body.noPlateConfirmed).toBe(false);
    expect(storyCreateSchema.safeParse(body).success).toBe(true);
    const none = storyBody({ ...base, rects: [], noPlate: true });
    expect(none.plateRects).toBeNull();
    expect(none.noPlateConfirmed).toBe(true);
    expect(storyCreateSchema.safeParse(none).success).toBe(true);
    // Des cadres posés l'emportent sur « aucune plaque » resté vrai par erreur.
    const both = storyBody({ ...base, noPlate: true });
    expect(both.noPlateConfirmed).toBe(false);
    expect(storyCreateSchema.safeParse(both).success).toBe(true);
  });

  it("légende rognée, lieu en texte seulement, identifiés en `user`", () => {
    const body = storyBody(base);
    expect(body.caption).toBe("Prête pour le Lydia");
    expect(body.placeLabel).toBe("Le Barcarès");
    expect(body.tags).toEqual([{ kind: "user", id: "u1" }]);
    expect(storyBody({ ...base, caption: "   ", place: "" })).toMatchObject({ caption: null, placeLabel: null });
    expect(storyPlaceText("x".repeat(200))).toHaveLength(80);
  });

  it("casquette et public : crew seulement pour un passionné, structure et fiche pro portées", () => {
    const crew = storyBody({ ...base, audience: "crew", crewId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" });
    expect(crew.crewId).toBe("6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11");
    expect(storyBody(base)).not.toHaveProperty("crewId");
    const orga = storyBody({
      ...base,
      audience: "public",
      author: { persona: "organizer", structureId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" },
    });
    expect(orga).toMatchObject({ persona: "organizer", structureId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" });
    const pro = storyBody({
      ...base,
      audience: "public",
      author: { persona: "pro", proId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" },
    });
    expect(pro).toMatchObject({ persona: "pro", proId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" });
    expect(pro).not.toHaveProperty("structureId");
    expect(storyCreateSchema.safeParse(pro).success).toBe(true);
  });

  it("l'événement part pour un public, jamais pour un crew", () => {
    const withEvent = { ...base, eventId: "6f1c2a52-0f11-4c4c-8d4a-1d6a1e0b1a11" };
    expect(storyBody(withEvent).eventId).toBe(withEvent.eventId);
    expect(storyBody({ ...withEvent, audience: "crew", crewId: "c1" })).not.toHaveProperty("eventId");
  });
});

describe("envoi d'une story", () => {
  it("écran fermé pendant l'envoi de la photo : la story n'est jamais créée", async () => {
    let open = true;
    const create = vi.fn(async () => "story");
    const out = await sendIfAlive(
      () => open,
      async () => {
        open = false;
      },
      create,
    );
    expect(out).toEqual({ sent: false });
    expect(create).not.toHaveBeenCalled();
  });
  it("écran ouvert : la story est créée", async () => {
    const out = await sendIfAlive(
      () => true,
      async () => undefined,
      async () => "story",
    );
    expect(out).toEqual({ sent: true, value: "story" });
  });
  it("l'envoi de la photo échoue : l'erreur remonte, rien n'est créé", async () => {
    const create = vi.fn(async () => "story");
    await expect(
      sendIfAlive(
        () => true,
        async () => {
          throw new Error("hors ligne");
        },
        create,
      ),
    ).rejects.toThrow("hors ligne");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("storyEffectiveVisibility : la confidentialité qui compte pour l'auteur (R9h, tour 1)", () => {
  it("un compte privé : l'autocollant d'événement reste permis pour un média et un prestataire (pages publiques), pas pour la personne", () => {
    const sticker = (persona: "fan" | "organizer" | "pro" | "provider" | "media") =>
      storyEventSticker(storyEffectiveVisibility({ persona }, "private"), "public").allowed;
    expect(sticker("media")).toBe(true);
    expect(sticker("provider")).toBe(true);
    expect(sticker("fan")).toBe(false);
    // Une structure et une fiche pro suivent le réglage du compte, comme `canTag` de l'API.
    expect(sticker("organizer")).toBe(false);
    expect(sticker("pro")).toBe(false);
  });
  it("un compte public : permis partout", () => {
    for (const persona of ["fan", "organizer", "pro", "provider", "media"] as const) {
      expect(storyEventSticker(storyEffectiveVisibility({ persona }, "public"), "public").allowed).toBe(true);
    }
  });
});
