// Lot R5b, tour 2 (relecture Codex 3) : après un enregistrement réussi de « Modifier mon profil », le formulaire et le
// profil gardé hors ligne sont ceux renvoyés par le PATCH ; un `/me` relu ensuite sans réseau (la session lit alors le
// cache) rend le nouveau profil, jamais l'ancien. Le trousseau est simulé en mémoire, comme dans `cacheScope.test.ts`.
import type { Me } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));

import { cachedMe, rememberMe } from "../../lib/meStore";
import { editFormOf, saveEditProfile } from "./editProfileModel";

const meWith = (profile: Partial<Me["profile"]>): Me =>
  ({
    user: { id: "compte-kenji" },
    profile: { pseudo: "Kenji_66", bio: "Supra", socials: { instagram: "kenji.old" }, ...profile },
  }) as unknown as Me;

beforeEach(() => store.clear());

describe("« Modifier mon profil » : le profil renvoyé par le PATCH", () => {
  it("formulaire et cache hors ligne à jour ; un /me relu sans réseau rend le nouveau profil", async () => {
    // Le profil d'avant, gardé pour l'affichage hors ligne.
    await rememberMe(meWith({}));
    const sent: unknown[] = [];
    const form = await saveEditProfile(
      {
        pseudo: "Kenji_R5",
        bio: "Supra et glisse",
        socials: { instagram: "https://www.instagram.com/kenji.supra/", tiktok: "", youtube: "", facebook: "", snapchat: "" },
      },
      {
        // L'API ramène le lien collé au pseudo et retire les réseaux vides.
        update: async (body) => {
          sent.push(body);
          return meWith({ pseudo: "Kenji_R5", bio: "Supra et glisse", socials: { instagram: "kenji.supra" } });
        },
        adopt: (me) => rememberMe(me),
      },
    );
    expect(sent).toHaveLength(1);
    // Le formulaire montre ce que l'API a enregistré (le pseudo Instagram, pas le lien tapé).
    expect(form).toEqual({
      pseudo: "Kenji_R5",
      bio: "Supra et glisse",
      socials: { instagram: "kenji.supra", tiktok: "", youtube: "", facebook: "", snapchat: "" },
    });
    // Puis `/me` sans réseau : la session lit le cache, qui est déjà le nouveau profil.
    const offline = await cachedMe();
    expect(offline?.profile.pseudo).toBe("Kenji_R5");
    expect(offline?.profile.socials).toEqual({ instagram: "kenji.supra" });
    expect(editFormOf(offline?.profile as Me["profile"])).toEqual(form);
  });

  it("un PATCH refusé ne touche ni au cache ni au profil du compte", async () => {
    await rememberMe(meWith({}));
    const adopt = vi.fn(async () => undefined);
    await expect(
      saveEditProfile(
        { pseudo: "Pris", bio: "", socials: { instagram: "", tiktok: "", youtube: "", facebook: "", snapchat: "" } },
        {
          update: async () => {
            throw new Error("Ce pseudo est déjà pris");
          },
          adopt,
        },
      ),
    ).rejects.toThrow("Ce pseudo est déjà pris");
    expect(adopt).not.toHaveBeenCalled();
    expect((await cachedMe())?.profile.pseudo).toBe("Kenji_66");
  });
});
