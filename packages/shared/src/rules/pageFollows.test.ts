import { describe, expect, it } from "vitest";

import type { AuthorKind } from "./authors";
import { canFollow, type FollowTarget } from "./pageFollows";

const t = (kind: AuthorKind, over: Partial<FollowTarget> = {}): FollowTarget => ({
  kind,
  id: `${kind}-cible`,
  available: true,
  ...(kind === "user" ? { visibility: "public" as const } : {}),
  ...over,
});
const me = { kind: "user", id: "moi" } as const;
const page = (kind: Exclude<AuthorKind, "user">) => ({ kind, id: `${kind}-suiveuse` }) as const;

describe("canFollow : une personne", () => {
  it("suit un prestataire ou un média en règle", () => {
    expect(canFollow(me, t("provider"))).toBeNull();
    expect(canFollow(me, t("media"))).toBeNull();
  });
  it("une personne, une structure, un pro : les routes existantes", () => {
    for (const kind of ["user", "structure", "pro"] as const) {
      expect(canFollow(me, t(kind))).toBe("existing_route");
    }
  });
  it("jamais soi-même, ni sa propre page", () => {
    expect(canFollow(me, t("user", { id: "moi" }))).toBe("self");
    expect(canFollow(me, t("provider", { sameAccount: true }))).toBe("self");
  });
  it("un prestataire ou un média hors règle : indisponible", () => {
    expect(canFollow(me, t("provider", { available: false }))).toBe("unavailable");
    expect(canFollow(me, t("media", { available: false }))).toBe("unavailable");
  });
});

describe("canFollow : une page", () => {
  it("suit chacune des quatre pages en règle", () => {
    for (const follower of ["structure", "pro", "provider", "media"] as const) {
      for (const target of ["structure", "pro", "provider", "media"] as const) {
        const f = page(follower);
        const r = canFollow(f, t(target));
        expect(r).toBeNull();
      }
    }
  });
  it("jamais elle-même", () => {
    expect(canFollow(page("provider"), { ...t("provider"), id: "provider-suiveuse" })).toBe("self");
  });
  it("suit un compte public en règle", () => {
    expect(canFollow(page("provider"), t("user"))).toBeNull();
  });
  it("jamais un compte privé (T6)", () => {
    expect(canFollow(page("provider"), t("user", { visibility: "private" }))).toBe("private_account");
    expect(canFollow(page("structure"), t("user", { visibility: "private" }))).toBe("private_account");
  });
  it("jamais le compte qui la tient, ni une page hors règle", () => {
    expect(canFollow(page("media"), t("user", { sameAccount: true }))).toBe("self");
    expect(canFollow(page("pro"), t("structure", { available: false }))).toBe("unavailable");
    expect(canFollow(page("pro"), t("user", { available: false }))).toBe("unavailable");
  });
  it("un compte sans réglage connu n'est pas public", () => {
    expect(canFollow(page("pro"), { kind: "user", id: "x", available: true })).toBe("private_account");
  });
});
