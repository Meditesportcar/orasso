import { describe, expect, it } from "vitest";

import { appLinkOf } from "../../lib/links";

describe("lien d un rendez-vous au spot (notification)", () => {
  const id = "0b9d6a3e-4c2f-4d1a-9a1b-3f2e8c7d5a10";
  it("/app/spot/<id> mène à /spot/<id>", () => {
    expect(appLinkOf(`/app/spot/${id}`)).toBe(`/spot/${id}`);
  });
  it("refuse un identifiant mal formé ou un autre chemin", () => {
    expect(appLinkOf("/app/spot/abc")).toBeNull();
    expect(appLinkOf(`/app/spot/${id}/plus`)).toBeNull();
    expect(appLinkOf(`https://exemple.fr/app/spot/${id}`)).toBeNull();
  });
});
