import { scrubErrorEvent, scrubPrivate } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { initSentry } from "./sentry";

describe("Sentry / GlitchTip (lot 15)", () => {
  it("sans DSN, rien n'est initialisé", () => {
    expect(initSentry()).toBe(false);
  });

  it("retire plaque, téléphone, e-mail, jetons et corps de requête", () => {
    expect(scrubPrivate({ plate: "AB-123-CD", nested: { phone: "06", email: "a@b.c", ok: 1 } })).toEqual({
      plate: "[retiré]",
      nested: { phone: "[retiré]", email: "[retiré]", ok: 1 },
    });
    const event = scrubErrorEvent({
      request: {
        data: { plate: "AB-123-CD" },
        headers: { cookie: "s=1", authorization: "Bearer x", "user-agent": "ua" },
        query_string: "token=abc&x=1",
      },
      user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4" },
      extra: { body: "{}", eventId: "e1" },
    });
    expect(event.request.data).toBeUndefined();
    expect(event.request.headers).toEqual({ cookie: "[retiré]", authorization: "[retiré]", "user-agent": "ua" });
    expect(event.request.query_string).toBe("token=[retiré]&x=1");
    expect(event.user).toEqual({ id: "u1" });
    expect(event.extra).toEqual({ body: "[retiré]", eventId: "e1" });
  });
});
