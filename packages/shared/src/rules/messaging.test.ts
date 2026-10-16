import { describe, expect, it } from "vitest";

import { messageSendSchema } from "../schemas/messaging";
import {
  directKey,
  isAfter,
  isReadBy,
  MESSAGE_PUSH_INTERVAL_MS,
  messagePreview,
  organizerKey,
  shorten,
  shouldPushMessage,
} from "./messaging";

const at = (iso: string) => new Date(iso);

describe("messagerie : règles pures", () => {
  it("clé d'une conversation à deux, identique dans les deux sens", () => {
    expect(directKey("b", "a")).toBe("a:b");
    expect(directKey("a", "b")).toBe("a:b");
    expect(organizerKey("s1", "u1")).toBe("structure:s1:u1");
  });

  it("aperçu : texte raccourci, photo, message supprimé", () => {
    expect(messagePreview({ kind: "text", body: "Salut", deleted: false })).toBe("Salut");
    expect(messagePreview({ kind: "image", body: null, deleted: false })).toBe("📷 Photo");
    expect(messagePreview({ kind: "text", body: "secret", deleted: true })).toBe("Message supprimé");
    const long = "mot ".repeat(40);
    const short = shorten(long, 20);
    expect(short.length).toBeLessThanOrEqual(20);
    expect(short.endsWith("…")).toBe(true);
  });

  it("ordre des messages et marqueur de lecture (date puis identifiant)", () => {
    const m1 = { at: at("2026-10-17T10:00:00Z"), id: "a" };
    const m2 = { at: at("2026-10-17T10:00:00Z"), id: "b" };
    const m3 = { at: at("2026-10-17T10:01:00Z"), id: "0" };
    expect(isAfter(m2, m1)).toBe(true);
    expect(isAfter(m3, m2)).toBe(true);
    expect(isReadBy(m2, m1)).toBe(true);
    expect(isReadBy(m2, m2)).toBe(true);
    expect(isReadBy(m2, m3)).toBe(false);
    expect(isReadBy(null, m1)).toBe(false);
  });

  it("S12 : un push par conversation et par 5 minutes tant qu'il reste du non lu", () => {
    const now = at("2026-10-17T10:00:00Z");
    const recent = new Date(now.getTime() - 60_000);
    expect(shouldPushMessage({ lastPushAt: null, lastReadAt: null, mutedUntil: null }, now)).toBe(true);
    expect(shouldPushMessage({ lastPushAt: recent, lastReadAt: null, mutedUntil: null }, now)).toBe(false);
    // Lu depuis le dernier push : le suivant part tout de suite.
    expect(shouldPushMessage({ lastPushAt: recent, lastReadAt: now, mutedUntil: null }, now)).toBe(true);
    const old = new Date(now.getTime() - MESSAGE_PUSH_INTERVAL_MS);
    expect(shouldPushMessage({ lastPushAt: old, lastReadAt: null, mutedUntil: null }, now)).toBe(true);
    const muted = new Date(now.getTime() + 60_000);
    expect(shouldPushMessage({ lastPushAt: null, lastReadAt: null, mutedUntil: muted }, now)).toBe(false);
  });

  it("envoi : un texte ou une image, jamais les deux ni aucun", () => {
    const clientId = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(messageSendSchema.safeParse({ clientId, body: "Salut" }).success).toBe(true);
    expect(messageSendSchema.safeParse({ clientId, imageKey: "private/messages/x.webp" }).success).toBe(true);
    expect(messageSendSchema.safeParse({ clientId }).success).toBe(false);
    expect(messageSendSchema.safeParse({ clientId, body: "a", imageKey: "private/messages/x.webp" }).success).toBe(
      false,
    );
    expect(messageSendSchema.safeParse({ clientId, body: "   " }).success).toBe(false);
    expect(messageSendSchema.safeParse({ clientId, body: "x".repeat(2001) }).success).toBe(false);
  });
});
