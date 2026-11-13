import { describe, expect, it } from "vitest";

import { cancelOp, createRemovalQueue, type QueuedUpload, type RemovalStore } from "./removalQueue";

const up = (n: number): QueuedUpload => ({ id: `u${n}`, key: `private/album-uploads/u${n}.webp` });

function memoryStore(initial: QueuedUpload[] = []) {
  let list = [...initial];
  let account = "A";
  const writes: string[][] = [];
  const store: RemovalStore = {
    current: () => account === "A",
    read: async () => (account === "A" ? [...list] : []),
    write: async (l) => {
      if (account !== "A") return;
      list = [...l];
      writes.push(l.map((u) => u.id));
    },
  };
  return { store, list: () => list.map((u) => u.id), writes, switchAccount: () => (account = "B") };
}

describe("file des envois à supprimer", () => {
  it("quota plein : `release` supprime les envois retirés AVANT que l'écran n'envoie la remplaçante", async () => {
    const order: string[] = [];
    const mem = memoryStore();
    const q = createRemovalQueue({
      remove: async (u) => {
        order.push(`delete ${u.id}`);
      },
      store: mem.store,
    });
    q.retire(up(1));
    q.retire(up(2));
    await q.release();
    order.push("upload remplaçante");
    expect(order).toEqual(["delete u1", "delete u2", "upload remplaçante"]);
    expect(mem.list()).toEqual([]);
  });

  it("suppression hors ligne : l'envoi reste dans la liste du compte (inscrit avant la tentative), puis est rejoué", async () => {
    let online = false;
    const calls: string[] = [];
    const mem = memoryStore();
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(u.id);
        if (!online) throw new Error("réseau");
      },
      store: mem.store,
    });
    q.retire(up(1));
    q.retire(up(2));
    await q.release();
    // Hors ligne : arrêt à la première panne (la deuxième n'est pas tentée), les deux restent dans la liste.
    expect(calls).toEqual(["u1"]);
    expect(mem.list()).toEqual(["u1", "u2"]);
    // Retour du réseau : l'ouverture suivante rejoue la liste.
    online = true;
    await q.replay();
    expect(calls).toEqual(["u1", "u1", "u2"]);
    expect(mem.list()).toEqual([]);
  });

  it("une suppression déjà faite (404) peut être traitée comme réussie par `remove`", async () => {
    const mem = memoryStore([up(7)]);
    const q = createRemovalQueue({ remove: async () => undefined, store: mem.store });
    await q.replay();
    expect(mem.list()).toEqual([]);
  });

  it("le compte change : rien n'est lu, écrit ni supprimé (jamais les envois de A dans la liste de B)", async () => {
    const calls: string[] = [];
    const mem = memoryStore([up(1)]);
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(u.id);
      },
      store: mem.store,
    });
    mem.switchAccount();
    q.retire(up(2));
    await q.release();
    await q.replay();
    expect(calls).toEqual([]);
    expect(mem.writes).toEqual([]);
  });

  it("un `replay` ne double pas un `release` en cours (tout est sérialisé)", async () => {
    const calls: string[] = [];
    let gate!: () => void;
    const blocked = new Promise<void>((r) => {
      gate = r;
    });
    const mem = memoryStore();
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(`start ${u.id}`);
        if (u.id === "u1") await blocked;
        calls.push(`end ${u.id}`);
      },
      store: mem.store,
    });
    q.retire(up(1));
    const first = q.release();
    const second = q.replay();
    await Promise.resolve();
    gate();
    await Promise.all([first, second]);
    expect(calls).toEqual(["start u1", "end u1"]);
  });
});

describe("file des opérations, tour 2", () => {
  it("stockage indisponible + panne réseau : les suppressions non confirmées restent en mémoire, `replay()` les rejoue dans la même page", async () => {
    let online = false;
    const calls: string[] = [];
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(u.id);
        if (!online) throw new TypeError("réseau");
      },
      // Le stockage refuse tout (navigation privée, quota, panne).
      store: {
        read: async () => {
          throw new Error("stockage indisponible");
        },
        write: async () => {
          throw new Error("stockage indisponible");
        },
      },
      stops: (e) => e instanceof TypeError,
    });
    q.retire(up(1));
    q.retire(cancelOp("A", "c1"));
    await q.release();
    expect(q.hasPending()).toBe(true);
    online = true;
    await q.replay();
    // L'annulation passe avant la suppression de l'envoi ; les deux sont confirmées.
    expect(calls.slice(-2)).toEqual(["cancel:A:c1", "u1"]);
    expect(q.hasPending()).toBe(false);
  });

  it("un refus définitif sort de la file avec une trace et n'est plus rejoué ; une panne passagère reste", async () => {
    const dropped: string[] = [];
    const calls: string[] = [];
    const mem = memoryStore();
    const refusal = Object.assign(new Error("403"), { status: 403 });
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(u.id);
        if (u.id === "u1") throw refusal;
        if (u.id === "u2") throw new TypeError("réseau");
      },
      store: mem.store,
      stops: (e) => e instanceof TypeError,
      final: (e) => (e as { status?: number }).status === 403,
      onDrop: (u) => dropped.push(u.id),
    });
    q.retire(up(1));
    q.retire(up(2));
    await q.release();
    expect(dropped).toEqual(["u1"]);
    // Le refus (u1) n'est plus dans la liste ; la panne réseau (u2) y est restée.
    expect(mem.list()).toEqual(["u2"]);
    await q.replay();
    expect(calls.filter((c) => c === "u1")).toHaveLength(1);
    expect(mem.list()).toEqual(["u2"]);
  });

  it("les annulations d'ajout passent avant les suppressions d'envois (une photo non confirmée absente ne perd pas son envoi)", async () => {
    const calls: string[] = [];
    const q = createRemovalQueue({
      remove: async (u) => {
        calls.push(u.id);
      },
      store: memoryStore().store,
    });
    q.retire(up(1));
    q.retire(cancelOp("A", "c1"));
    await q.release();
    expect(calls).toEqual(["cancel:A:c1", "u1"]);
  });
});
