import { describe, expect, it } from "vitest";

import { createSessionGuard } from "./sessionGuard";

describe("garde de session (R8q, tour 2)", () => {
  it("rien ne part tant que l'identité n'est pas connue", () => {
    const guard = createSessionGuard(() => null);
    expect(guard.begin()).toBeNull();
  });

  it("A lance une lecture, B se connecte avant la réponse : la réponse de A est jetée", async () => {
    let who: string | null = "A";
    const guard = createSessionGuard(() => who);
    const memory = new Map<string, string>();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("sortie de A"), 10));
    const ticket = guard.begin();
    expect(ticket).toEqual({ who: "A", gen: 0 });
    who = "B";
    const data = await slow;
    if (ticket && guard.valid(ticket)) memory.set(`${who}|outing`, data);
    expect(memory.size).toBe(0);
    // B lit pour lui-même : sa réponse est gardée sous sa clé.
    const mine = guard.begin();
    if (mine && guard.valid(mine)) memory.set("B|outing", "sortie de B");
    expect([...memory.keys()]).toEqual(["B|outing"]);
  });

  it("A, puis B, puis A : la lecture de la première session de A reste jetée", () => {
    let who: string | null = "A";
    const guard = createSessionGuard(() => who);
    const ticket = guard.begin();
    who = "B";
    guard.sync();
    who = "A";
    expect(ticket && guard.valid(ticket)).toBe(false);
  });
});
