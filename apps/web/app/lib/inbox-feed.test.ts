import type { ContactRequestView, ConversationSummary, FriendRequestView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { byRecent, inboxSources } from "./inbox-feed";

const friend = { id: "f", createdAt: "2026-10-20T10:00:00.000Z", person: { pseudo: "Kenji_66" } } as FriendRequestView;
const contact = {
  id: "c",
  direction: "in",
  createdAt: "2026-10-21T10:00:00.000Z",
  person: { pseudo: "Léa_66" },
} as ContactRequestView;
const convo = { id: "v", lastMessage: { at: "2026-10-19T10:00:00.000Z" } } as ConversationSummary;

describe("segment « Tout » de la Boîte du site", () => {
  it("tout est lu : rien d'indisponible", () => {
    const r = inboxSources(
      { ok: true, data: { items: [convo] } },
      { ok: true, data: { items: [friend] } },
      {
        ok: true,
        data: { items: [contact] },
      },
    );
    expect(r.unavailable).toEqual({ messages: false, requests: false });
    expect(r.requests.map((x) => x.pseudo)).toEqual(["Kenji_66", "Léa_66"]);
  });

  it("échec partiel : la source en panne est dite indisponible, les autres restent", () => {
    const r = inboxSources({ ok: false }, { ok: true, data: { items: [friend] } }, { ok: false });
    expect(r.unavailable).toEqual({ messages: true, requests: true });
    expect(r.conversations).toEqual([]);
    expect(r.requests.map((x) => x.pseudo)).toEqual(["Kenji_66"]);
    expect(
      inboxSources({ ok: true, data: { items: [] } }, { ok: false }, { ok: true, data: { items: [] } }).unavailable,
    ).toEqual({ messages: false, requests: true });
  });

  it("pages suivantes (sources non lues) : ni liste ni panne", () => {
    expect(inboxSources(null, null, null).unavailable).toEqual({ messages: false, requests: false });
  });

  it("messages, demandes et notifications mêlés du plus récent au plus ancien", () => {
    const notif = [{ at: "2026-10-22T08:00:00.000Z", k: "notif" }];
    const msgs = [{ at: "2026-10-19T10:00:00.000Z", k: "msg" }];
    const reqs = [{ at: "2026-10-21T10:00:00.000Z", k: "req" }];
    expect(byRecent(msgs, reqs, notif).map((x) => x.k)).toEqual(["notif", "req", "msg"]);
  });
});
