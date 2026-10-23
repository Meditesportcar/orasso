import { describe, expect, it } from "vitest";

import { pushIsForAccount, pushRecipientId } from "./pushRecipient";

describe("destinataire opaque d'un push (lot M6, tour 3)", () => {
  it("stable, court, sans l'identifiant en clair", () => {
    const id = pushRecipientId("user-a");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(pushRecipientId("user-a")).toBe(id);
    expect(pushRecipientId("user-b")).not.toBe(id);
    expect(id).not.toContain("user");
  });

  it("un push de A n'est jamais pour B, ni sans session, ni sans destinataire", () => {
    const forA = pushRecipientId("user-a");
    expect(pushIsForAccount(forA, "user-a")).toBe(true);
    expect(pushIsForAccount(forA, "user-b")).toBe(false);
    expect(pushIsForAccount(forA, null)).toBe(false);
    expect(pushIsForAccount(undefined, "user-a")).toBe(false);
  });
});
