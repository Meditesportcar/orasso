import { describe, expect, it } from "vitest";

import { type ActivityRow, activityDay, groupActivity } from "./activity";
import { fromWallTime } from "./time";

const NOW = fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 });
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

let n = 0;
const row = (over: Partial<ActivityRow> = {}): ActivityRow => {
  n += 1;
  return {
    id: `n${String(n).padStart(3, "0")}`,
    type: "story_like",
    groupKey: null,
    at: ago(1),
    readAt: null,
    title: "Titre",
    body: "Texte",
    count: 1,
    actors: [],
    data: {},
    eventId: null,
    ...over,
  };
};
const actor = (pseudo: string) => ({ pseudo, avatarUrl: null });

describe("période d'une ligne", () => {
  it("aujourd'hui, cette semaine, plus tôt (jours calendaires de Paris)", () => {
    expect(activityDay(ago(2), NOW)).toBe("today");
    // Hier à 23 h : un autre jour calendaire, même à moins de 24 h.
    expect(activityDay(fromWallTime({ year: 2026, month: 11, day: 8, hour: 23, minute: 0 }), NOW)).toBe("week");
    expect(activityDay(ago(24 * 6), NOW)).toBe("week");
    expect(activityDay(ago(24 * 8), NOW)).toBe("earlier");
  });
});

describe("regroupement de l'Activité", () => {
  it("une ligne sans clé reste seule", () => {
    const groups = groupActivity([row({ actors: [actor("Kenji_66")] })], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.day).toBe("today");
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.items[0]).toMatchObject({ count: 1, read: false, actors: [{ pseudo: "Kenji_66" }] });
  });

  it("tour 2 : une même personne dans une ligne lue et une nouvelle le même jour ne compte qu'une fois", () => {
    const [group] = groupActivity(
      [
        row({
          groupKey: "story_like:s1",
          at: ago(5),
          readAt: ago(4),
          count: 2,
          actors: [actor("Kenji_66"), actor("Julie_66")],
          people: ["Kenji_66", "Julie_66"],
        }),
        row({
          groupKey: "story_like:s1",
          at: ago(1),
          count: 2,
          actors: [actor("Kenji_66"), actor("Marc_66")],
          people: ["Kenji_66", "Marc_66"],
        }),
      ],
      NOW,
    );
    expect(group?.items[0]?.count).toBe(3);
    expect(group?.items[0]?.read).toBe(false);
  });

  it("rien : aucun groupe", () => {
    expect(groupActivity([], NOW)).toEqual([]);
  });

  it("deux lignes de même clé le même jour : une ligne, deux personnes, le texte de la plus récente", () => {
    const [group] = groupActivity(
      [
        row({ groupKey: "story_like:s1", at: ago(3), actors: [actor("Julie_66")], title: "Ancien" }),
        row({ groupKey: "story_like:s1", at: ago(1), actors: [actor("Kenji_66")], title: "Récent" }),
      ],
      NOW,
    );
    expect(group?.items).toHaveLength(1);
    const item = group?.items[0];
    expect(item).toMatchObject({ count: 2, title: "Récent", groupKey: "story_like:s1" });
    expect(item?.actors.map((a) => a.pseudo)).toEqual(["Kenji_66", "Julie_66"]);
    expect(item?.ids).toHaveLength(2);
  });

  it("cinq lignes : cinq occurrences, trois personnes montrées au plus", () => {
    const rows = ["A", "B", "C", "D", "E"].map((p, i) =>
      row({ groupKey: "story_like:s2", at: ago(5 - i), actors: [actor(`${p}_66`)] }),
    );
    const item = groupActivity(rows, NOW)[0]?.items[0];
    expect(item?.count).toBe(5);
    expect(item?.actors.map((a) => a.pseudo)).toEqual(["E_66", "D_66", "C_66"]);
  });

  it("une ligne déjà regroupée en base compte ses personnes (count) ; la même personne ne compte qu'une fois en tête", () => {
    const item = groupActivity(
      [
        row({ groupKey: "story_like:s3", at: ago(2), count: 4, actors: [actor("A_66"), actor("B_66")] }),
        row({ groupKey: "story_like:s3", at: ago(1), count: 1, actors: [actor("A_66")] }),
      ],
      NOW,
    )[0]?.items[0];
    expect(item?.count).toBe(5);
    expect(item?.actors.map((a) => a.pseudo)).toEqual(["A_66", "B_66"]);
  });

  it("la même clé sur deux jours donne deux lignes, dans deux périodes", () => {
    const groups = groupActivity(
      [row({ groupKey: "story_like:s4", at: ago(1) }), row({ groupKey: "story_like:s4", at: ago(24 * 3) })],
      NOW,
    );
    expect(groups.map((g) => g.day)).toEqual(["today", "week"]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(2);
  });

  it("deux clés différentes ne se mélangent pas ; les plus récentes d'abord", () => {
    const [group] = groupActivity(
      [
        row({ groupKey: "story_like:a", at: ago(5) }),
        row({ groupKey: "story_like:b", at: ago(1) }),
        row({ at: ago(3) }),
      ],
      NOW,
    );
    expect(group?.items.map((i) => i.groupKey)).toEqual(["story_like:b", null, "story_like:a"]);
  });

  it("non lue dès que l'une des lignes l'est", () => {
    const rows = [row({ groupKey: "k", at: ago(2), readAt: ago(1) }), row({ groupKey: "k", at: ago(1), readAt: null })];
    expect(groupActivity(rows, NOW)[0]?.items[0]?.read).toBe(false);
    expect(
      groupActivity(
        rows.map((r) => ({ ...r, readAt: ago(0) })),
        NOW,
      )[0]?.items[0]?.read,
    ).toBe(true);
  });

  it("trois périodes dans l'ordre aujourd'hui, semaine, plus tôt", () => {
    const groups = groupActivity([row({ at: ago(24 * 20) }), row({ at: ago(1) }), row({ at: ago(24 * 3) })], NOW);
    expect(groups.map((g) => g.day)).toEqual(["today", "week", "earlier"]);
  });
});
