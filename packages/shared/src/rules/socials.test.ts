import { describe, expect, it } from "vitest";
import { filledSocials, type SocialNetwork, socialHandle, socialNetworks, socialUrl } from "./socials";

const ok = (network: SocialNetwork, input: string) => {
  const r = socialHandle(network, input);
  if (!r.ok) throw new Error(`${network} « ${input} » refusé : ${r.reason}`);
  return r.handle;
};
const refused = (network: SocialNetwork, input: string) => {
  const r = socialHandle(network, input);
  if (r.ok) throw new Error(`${network} « ${input} » accepté : ${r.handle}`);
  return r.reason;
};

describe("socialHandle : pseudo propre ou refus expliqué (lot R5b)", () => {
  it("vide = pas de pseudo, pour chaque réseau", () => {
    for (const n of socialNetworks) {
      expect(socialHandle(n, "")).toEqual({ ok: true, handle: null });
      expect(socialHandle(n, "   ")).toEqual({ ok: true, handle: null });
      expect(socialHandle(n, null)).toEqual({ ok: true, handle: null });
      expect(socialHandle(n, "@")).toEqual({ ok: true, handle: null });
    }
  });

  it("Instagram : pseudo, @pseudo, lien de profil ; publication et autre site refusés", () => {
    expect(ok("instagram", "kenji.supra")).toBe("kenji.supra");
    expect(ok("instagram", " @kenji.supra ")).toBe("kenji.supra");
    expect(ok("instagram", "https://www.instagram.com/kenji.supra/")).toBe("kenji.supra");
    expect(ok("instagram", "instagram.com/kenji.supra?igsh=abc")).toBe("kenji.supra");
    expect(ok("instagram", "https://instagram.com/kenji.supra/reels/")).toBe("kenji.supra");
    expect(refused("instagram", "https://www.instagram.com/p/C1abcDEF/")).toBe(
      "Ce lien mène à une publication. Mets ton pseudo Instagram, par exemple kenji.supra.",
    );
    expect(refused("instagram", "https://www.instagram.com/reel/C1abc/")).toMatch(/publication/);
    expect(refused("instagram", "https://instagram.com/stories/kenji.supra/123/")).toMatch(/publication/);
    expect(refused("instagram", "https://evil.example/instagram.com/kenji")).toMatch(/autre site/);
    expect(refused("instagram", "https://instagram.com.evil.example/kenji")).toMatch(/autre site/);
    expect(refused("instagram", "kenji supra")).toMatch(/espace/);
    expect(refused("instagram", "kenji-supra")).toMatch(/lettres, des chiffres, « \. » et « _ »/);
    expect(refused("instagram", "a".repeat(31))).toBe("30 caractères au plus pour un pseudo Instagram.");
    expect(ok("instagram", "a".repeat(30))).toBe("a".repeat(30));
  });

  it("TikTok : @pseudo et lien de profil ; vidéo et lien court refusés", () => {
    expect(ok("tiktok", "kenji66.drift")).toBe("kenji66.drift");
    expect(ok("tiktok", "https://www.tiktok.com/@kenji66.drift")).toBe("kenji66.drift");
    expect(ok("tiktok", "tiktok.com/@kenji66.drift?lang=fr")).toBe("kenji66.drift");
    expect(refused("tiktok", "https://www.tiktok.com/@kenji66.drift/video/7300000000000")).toMatch(/publication/);
    expect(refused("tiktok", "https://vm.tiktok.com/ZMabc123/")).toMatch(/publication/);
    expect(refused("tiktok", "https://www.tiktok.com/kenji")).toMatch(/publication/);
    expect(refused("tiktok", "k")).toMatch(/2 caractères au moins/);
    expect(refused("tiktok", "a".repeat(25))).toMatch(/24 caractères au plus/);
  });

  it("YouTube : @chaîne et lien en @ ; vidéo, short et anciennes adresses refusés", () => {
    expect(ok("youtube", "@kenji66")).toBe("kenji66");
    expect(ok("youtube", "https://www.youtube.com/@kenji-66")).toBe("kenji-66");
    expect(ok("youtube", "https://youtube.com/@kenji66/videos")).toBe("kenji66");
    expect(refused("youtube", "https://www.youtube.com/watch?v=abc")).toMatch(/publication/);
    expect(refused("youtube", "https://youtu.be/abc")).toMatch(/publication/);
    expect(refused("youtube", "https://www.youtube.com/shorts/abc")).toMatch(/publication/);
    expect(refused("youtube", "https://www.youtube.com/channel/UCabc")).toMatch(/publication/);
    expect(refused("youtube", "ab")).toMatch(/3 caractères au moins/);
  });

  it("Facebook : pseudo, lien de profil, profile.php?id ; publication, vidéo et groupe refusés", () => {
    expect(ok("facebook", "kenji.supra")).toBe("kenji.supra");
    expect(ok("facebook", "https://www.facebook.com/kenji.supra")).toBe("kenji.supra");
    expect(ok("facebook", "https://m.facebook.com/profile.php?id=100012345678")).toBe("100012345678");
    expect(ok("facebook", "fb.com/kenji.supra")).toBe("kenji.supra");
    expect(refused("facebook", "https://www.facebook.com/kenji.supra/posts/123")).toMatch(/publication/);
    expect(refused("facebook", "https://www.facebook.com/groups/drift66")).toMatch(/publication/);
    expect(refused("facebook", "https://fb.watch/abc/")).toMatch(/publication/);
    expect(refused("facebook", "https://www.facebook.com/share/p/abc/")).toMatch(/publication/);
    expect(refused("facebook", "ken_ji")).toMatch(/lettres, des chiffres et « \. »/);
    expect(refused("facebook", "kenj")).toMatch(/5 caractères au moins/);
  });

  it("Snapchat : pseudo, /add/ et @ ; story et lien court refusés", () => {
    expect(ok("snapchat", "kenji66")).toBe("kenji66");
    expect(ok("snapchat", "https://www.snapchat.com/add/kenji66")).toBe("kenji66");
    expect(ok("snapchat", "https://snapchat.com/@kenji66")).toBe("kenji66");
    expect(refused("snapchat", "https://t.snapchat.com/abc")).toMatch(/publication/);
    expect(refused("snapchat", "https://www.snapchat.com/spotlight/abc")).toMatch(/publication/);
    expect(refused("snapchat", "66kenji")).toMatch(/lettres \(en premier\)/);
    expect(refused("snapchat", "a".repeat(16))).toMatch(/15 caractères au plus/);
  });

  it("jamais d'adresse libre : javascript:, data:, autre protocole refusés", () => {
    for (const n of socialNetworks) {
      expect(socialHandle(n, "javascript://instagram.com/%0aalert(1)").ok).toBe(false);
      expect(socialHandle(n, "ftp://instagram.com/kenji").ok).toBe(false);
      expect(socialHandle(n, "kenji/../../evil").ok).toBe(false);
    }
  });
});

describe("socialUrl : Orasso fabrique le lien", () => {
  it("un lien par réseau, à partir du pseudo", () => {
    expect(socialUrl("instagram", "kenji.supra")).toBe("https://www.instagram.com/kenji.supra/");
    expect(socialUrl("tiktok", "kenji66.drift")).toBe("https://www.tiktok.com/@kenji66.drift");
    expect(socialUrl("youtube", "kenji66")).toBe("https://www.youtube.com/@kenji66");
    expect(socialUrl("facebook", "kenji.supra")).toBe("https://www.facebook.com/kenji.supra");
    expect(socialUrl("snapchat", "kenji66")).toBe("https://www.snapchat.com/add/kenji66");
  });

  it("rien pour un pseudo vide ou invalide (une valeur abîmée en base ne devient pas un lien)", () => {
    expect(socialUrl("instagram", null)).toBeNull();
    expect(socialUrl("instagram", "")).toBeNull();
    expect(socialUrl("instagram", "https://evil.example/x")).toBeNull();
    expect(socialUrl("facebook", "a b")).toBeNull();
  });

  it("filledSocials : les réseaux renseignés, dans l'ordre de la maquette", () => {
    expect(filledSocials({ snapchat: "kenji66", instagram: "kenji.supra" })).toEqual([
      { network: "instagram", handle: "kenji.supra" },
      { network: "snapchat", handle: "kenji66" },
    ]);
    expect(filledSocials(null)).toEqual([]);
  });
});
