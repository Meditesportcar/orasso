// B2a, tour 2 : la clé d'envoi d'une story est gardée tant qu'une tentative antérieure reste incertaine, même après un refus ultérieur.
import { describe, expect, it } from "vitest";

import { forget, mayRenewKey, newUncertainty, settleAttempt } from "./sendKey";

/** Le composeur, réduit à sa clé : un refus net renouvelle la clé seulement si `mayRenewKey` le permet. L'API : une story par clé. */
function composer() {
  const state = newUncertainty();
  const server = new Map<string, number>(); // clé -> nombre de stories créées (`storyIdFor` : une par clé)
  let seq = 0;
  let key: string | null = null;
  const currentKey = () => {
    if (key === null) key = `k${++seq}`;
    return key;
  };
  const serverCreate = (k: string) => server.set(k, 1);
  const attempt = (res: { ok: boolean; status: number }) => {
    const sent = currentKey();
    const renewable = mayRenewKey(state, res);
    settleAttempt(state, res);
    if (res.ok) key = null;
    else if (renewable) key = null;
    return sent;
  };
  return {
    state,
    server,
    attempt,
    serverCreate,
    newFile: () => {
      key = null;
      forget(state);
    },
  };
}

describe("la clé d'envoi d'une story", () => {
  it("délai, puis 400, puis 1re publication tardive, puis reprise : une seule story", () => {
    const c = composer();
    const k1 = c.attempt({ ok: false, status: 0 }); // 1er POST sans réponse (délai)
    const k2 = c.attempt({ ok: false, status: 400 }); // reprise : refusée (compte devenu privé…)
    expect(k2).toBe(k1);
    c.serverCreate(k1); // le 1er POST aboutit enfin côté API
    const k3 = c.attempt({ ok: true, status: 201 }); // reprise après correction : même clé, l'API retrouve la story
    expect(k3).toBe(k1);
    c.serverCreate(k3);
    expect([...c.server.values()].reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("sans tentative incertaine, un refus net renouvelle la clé", () => {
    const c = composer();
    const k1 = c.attempt({ ok: false, status: 400 });
    const k2 = c.attempt({ ok: false, status: 400 });
    expect(k2).not.toBe(k1);
  });

  it("un succès lève l'incertitude ; un nouveau fichier aussi", () => {
    const c = composer();
    c.attempt({ ok: false, status: 0 });
    expect(c.state.uncertain).toBe(true);
    c.attempt({ ok: true, status: 201 });
    expect(c.state.uncertain).toBe(false);
    c.attempt({ ok: false, status: 503 });
    expect(c.state.uncertain).toBe(true);
    c.newFile();
    expect(c.state.uncertain).toBe(false);
    const k = c.attempt({ ok: false, status: 400 });
    expect(c.attempt({ ok: false, status: 400 })).not.toBe(k);
  });

  it("un refus net ne lève pas l'incertitude (4xx après 5xx : clé gardée)", () => {
    const c = composer();
    const k1 = c.attempt({ ok: false, status: 502 });
    expect(c.attempt({ ok: false, status: 429 })).toBe(k1);
    expect(c.attempt({ ok: false, status: 400 })).toBe(k1);
    expect(c.state.uncertain).toBe(true);
  });
});
