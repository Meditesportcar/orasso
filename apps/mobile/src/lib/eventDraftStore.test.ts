import { initialEventDraft, serializeWizardMemo } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({
  os: "web",
  storage: new Map<string, string>(),
  files: new Map<string, string>(),
  read: null as (() => Promise<void>) | null,
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => device.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void device.storage.set(key, value),
  deleteItemAsync: async (key: string) => void device.storage.delete(key),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///documents" },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    get exists() {
      return device.files.has(this.uri);
    }
    create() {
      device.files.set(this.uri, "");
    }
    write(value: string) {
      device.files.set(this.uri, value);
    }
    delete() {
      device.files.delete(this.uri);
    }
    async text() {
      const value = device.files.get(this.uri) ?? "";
      await device.read?.();
      return value;
    }
    async copy(dest: { uri: string }) {
      device.files.set(dest.uri, device.files.get(this.uri) ?? "image");
    }
  },
  Directory: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    list() {
      return [...device.files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => ({
          name: uri.slice(this.uri.length + 1),
          delete: () => void device.files.delete(uri),
        }));
    }
  },
}));

const value = () => ({
  draft: { ...initialEventDraft(new Date()), title: "Privé A", recurrence: { nth: 1, weekday: 0, count: 3 } },
  step: 2,
  createdId: null,
  savedAt: new Date().toISOString(),
});
const memo = { reached: 4, recurrence: { nth: 1, weekday: 0, count: 3 } };

describe.each(["web", "ios"])("brouillons privés (%s)", (os) => {
  let kv: typeof import("./kv");
  let drafts: typeof import("./eventDraftStore");
  beforeEach(async () => {
    vi.resetModules();
    device.os = os;
    device.storage.clear();
    device.files.clear();
    device.read = null;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => device.storage.get(key) ?? null,
      setItem: (key: string, raw: string) => void device.storage.set(key, raw),
      removeItem: (key: string) => void device.storage.delete(key),
    });
    kv = await import("./kv");
    drafts = await import("./eventDraftStore");
  });

  it("sans compte, ne garde ni brouillon, ni récurrence, ni affiche", async () => {
    await drafts.saveEventDraft("structure", value());
    await drafts.saveWizardMemo("event", memo);
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    expect(await drafts.loadWizardMemo("event")).toBeNull();
    expect(
      await drafts.keepEventDraftPoster("structure", { uri: "data:image/png;base64,A", width: 1, height: 1 }),
    ).toBeNull();
    expect(device.files.size).toBe(0);
  });

  it("A se déconnecte puis B se connecte : aucune saisie ni récurrence de A ; purge aussi au retour de A", async () => {
    await kv.bindCacheScope("a");
    await drafts.saveEventDraft("structure", value());
    await drafts.saveEventDraft("structure", value(), "event");
    await drafts.saveWizardMemo("event", memo);
    expect(await drafts.loadEventDraft("structure")).toMatchObject({ draft: { title: "Privé A" } });
    expect(await drafts.loadWizardMemo("event")).toEqual(memo);
    await kv.purgeCaches(); // même appel que clearSession
    await kv.bindCacheScope("b");
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    expect(await drafts.loadEventDraft("structure", "event")).toBeNull();
    expect(await drafts.loadWizardMemo("event")).toBeNull();
    await kv.bindCacheScope("a");
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    expect(await drafts.loadWizardMemo("event")).toBeNull();
  });

  it("changement direct de compte : les callbacks tardifs de A ne lisent, n'effacent ni n'écrivent sous B", async () => {
    await kv.bindCacheScope("a");
    const a = drafts.eventDraftStoreForAccount();
    await a.saveEventDraft("structure", value());
    await kv.bindCacheScope("b");
    await drafts.saveEventDraft("structure", { ...value(), draft: { ...value().draft, title: "Privé B" } });
    await a.saveEventDraft("structure", value());
    await a.clearEventDraft("structure");
    await a.saveWizardMemo("event", memo);
    expect(await a.loadEventDraft("structure")).toBeNull();
    expect(await drafts.loadEventDraft("structure")).toMatchObject({ draft: { title: "Privé B" } });
    expect(await drafts.loadWizardMemo("event")).toBeNull();
  });

  it("efface une saisie et sa mémoire sans toucher les autres événements", async () => {
    await kv.bindCacheScope("a");
    await drafts.saveEventDraft("structure", value(), "event");
    await drafts.saveEventDraft("structure", value(), "other");
    await drafts.saveWizardMemo("event", memo);
    await drafts.clearEventDraft("structure", "event");
    await drafts.saveWizardMemo("event", null);
    expect(await drafts.loadEventDraft("structure", "event")).toBeNull();
    expect(await drafts.loadEventDraft("structure", "other")).not.toBeNull();
    expect(await drafts.loadWizardMemo("event")).toBeNull();
  });

  it("ignore les anciennes clés sans propriétaire", async () => {
    await kv.kvSet("event-wizard-memo-event", serializeWizardMemo(memo));
    device.storage.set(kv.kvKey("event-draft-structure"), JSON.stringify(value()));
    await kv.bindCacheScope("b");
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    expect(await drafts.loadWizardMemo("event")).toBeNull();
  });

  it("les affiches gardées sont propres au compte, comme la saisie", async () => {
    const photo = { uri: os === "web" ? "data:image/png;base64,A" : "file:///picker/A.jpg", width: 10, height: 20 };
    await kv.bindCacheScope("a");
    const a = await drafts.keepEventDraftPoster("structure", photo);
    expect(a).not.toBeNull();
    await drafts.saveEventDraft("structure", { ...value(), poster: a });
    expect((await drafts.loadEventDraft("structure"))?.poster).toEqual(a);
    await kv.bindCacheScope("b");
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    const b = await drafts.keepEventDraftPoster("structure", photo);
    expect(b).not.toBeNull();
    if (os !== "web") expect(b?.uri).not.toBe(a?.uri);
  });

  if (os === "ios")
    it("une lecture de fichier terminée sous B ne rend pas le brouillon de A", async () => {
      await kv.bindCacheScope("a");
      await drafts.saveEventDraft("structure", value());
      let started!: () => void;
      let release!: () => void;
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      device.read = async () => {
        started();
        await paused;
      };
      const pending = drafts.loadEventDraft("structure");
      await reading;
      await kv.bindCacheScope("b");
      release();
      expect(await pending).toBeNull();
    });
});

describe("brouillons privés sur appareil (fichiers)", () => {
  let kv: typeof import("./kv");
  let drafts: typeof import("./eventDraftStore");
  beforeEach(async () => {
    vi.resetModules();
    device.os = "ios";
    device.storage.clear();
    device.files.clear();
    device.read = null;
    kv = await import("./kv");
    drafts = await import("./eventDraftStore");
  });

  it("effacer puis enregistrer sans attendre : la dernière saisie est gardée et lisible", async () => {
    await kv.bindCacheScope("a");
    await drafts.saveEventDraft("structure", value());
    const clearing = drafts.clearEventDraft("structure");
    const saving = drafts.saveEventDraft("structure", {
      ...value(),
      draft: { ...value().draft, title: "Dernière saisie" },
    });
    await Promise.all([clearing, saving]);
    expect(await drafts.loadEventDraft("structure")).toMatchObject({ draft: { title: "Dernière saisie" } });
  });

  it("enregistrer puis effacer sans attendre : plus de brouillon, ni fichier", async () => {
    await kv.bindCacheScope("a");
    await Promise.all([drafts.saveEventDraft("structure", value()), drafts.clearEventDraft("structure")]);
    expect(await drafts.loadEventDraft("structure")).toBeNull();
    expect([...device.files.keys()]).toEqual([]);
  });

  it("déconnexion : les fichiers du compte (JSON, affiche) et les anciens fichiers sans compte sont supprimés", async () => {
    await kv.bindCacheScope("a");
    await drafts.saveEventDraft("structure", value());
    await drafts.keepEventDraftPoster("structure", { uri: "file:///cache/photo.jpg", width: 1, height: 1 });
    device.files.set("file:///documents/orasso.event-draft-structure.json", "{}");
    device.files.set("file:///documents/orasso.autre-fichier.json", "{}");
    expect([...device.files.keys()].filter((k) => k.includes("draft")).length).toBeGreaterThanOrEqual(3);
    await kv.purgeCaches(); // même appel que clearSession
    expect([...device.files.keys()].filter((k) => k.includes("draft"))).toEqual([]);
    expect(device.files.has("file:///documents/orasso.autre-fichier.json")).toBe(true);
  });

  it("changement direct de compte sans déconnexion : les fichiers de A sont supprimés", async () => {
    await kv.bindCacheScope("a");
    await drafts.saveEventDraft("structure", value());
    await kv.bindCacheScope("b");
    expect([...device.files.keys()].filter((k) => k.includes("draft.a."))).toEqual([]);
  });
});
