import { storyVideoLabels } from "@orasso/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Envoi d'une vidéo de story (R7g, tour 3) : le délai dépassé a son propre message (pas « Pas de connexion »), quitter l'écran
// annule l'envoi (navigateur : `XMLHttpRequest.abort` ; téléphone : le signal de la tâche native). Navigateur et tâche native simulés.
const platform = vi.hoisted(() => ({ OS: "web" as "web" | "android" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("@/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));
vi.mock("expo-file-system", () => {
  class DeviceFile {
    constructor(readonly uri: string) {}
  }
  class UploadTask {
    static last: UploadTask | null = null;
    released = false;
    constructor(
      _file: DeviceFile,
      _url: string,
      readonly options: { signal?: AbortSignal },
    ) {
      UploadTask.last = this;
    }
    uploadAsync() {
      return new Promise<{ status: number; body: string }>((_resolve, reject) => {
        this.options.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
      });
    }
    release() {
      this.released = true;
    }
  }
  return { File: DeviceFile, UploadTask, UploadType: { BINARY_CONTENT: 0 } };
});

import { type ApiRequestError, NETWORK_MESSAGE } from "../http";
import { isUploadCancelled, isUploadTimeout, uploadVideoFile } from "./storiesVideo";

class FakeXhr {
  static last: FakeXhr | null = null;
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  timeout = 0;
  aborted = false;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

beforeEach(() => {
  platform.OS = "web";
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", async () => ({ blob: async () => new Blob(["x"]) }));
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => new Promise((r) => setTimeout(r, 0));
const failure = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiRequestError,
  );

describe("envoi d'une vidéo : navigateur", () => {
  it("un délai dépassé a son propre message ; une coupure garde « Pas de connexion »", async () => {
    const slow = failure(uploadVideoFile("blob:v", () => undefined, 600_000));
    await tick();
    FakeXhr.last?.ontimeout?.();
    const timeout = await slow;
    expect(isUploadTimeout(timeout)).toBe(true);
    expect(timeout?.message).toBe(storyVideoLabels.uploadTimeout);
    expect(timeout?.message).not.toBe(NETWORK_MESSAGE);

    const cut = failure(uploadVideoFile("blob:v", () => undefined));
    await tick();
    FakeXhr.last?.onerror?.();
    const network = await cut;
    expect([network?.code, network?.message]).toEqual(["network", NETWORK_MESSAGE]);
  });

  it("quitter l'écran (signal) annule l'envoi : XHR interrompu, erreur « annulé », pas de message réseau", async () => {
    const controller = new AbortController();
    const pending = failure(uploadVideoFile("blob:v", () => undefined, 600_000, controller.signal));
    await tick();
    controller.abort();
    const error = await pending;
    expect(FakeXhr.last?.aborted).toBe(true);
    expect(isUploadCancelled(error)).toBe(true);
    expect(error?.message).not.toBe(NETWORK_MESSAGE);
    // Déjà annulé avant de commencer : rien ne part.
    FakeXhr.last = null;
    expect(
      isUploadCancelled(await failure(uploadVideoFile("blob:v", () => undefined, 600_000, controller.signal))),
    ).toBe(true);
    expect(FakeXhr.last).toBeNull();
  });
});

describe("envoi d'une vidéo : téléphone", () => {
  beforeEach(() => {
    platform.OS = "android";
  });

  it("le délai dépassé coupe la tâche native avec son message", async () => {
    const error = await failure(uploadVideoFile("file:///v.mp4", () => undefined, 20));
    expect(isUploadTimeout(error)).toBe(true);
    expect(error?.message).toBe(storyVideoLabels.uploadTimeout);
  });

  it("quitter l'écran (signal) annule la tâche native et la libère", async () => {
    const controller = new AbortController();
    const pending = failure(uploadVideoFile("file:///v.mp4", () => undefined, 600_000, controller.signal));
    await tick();
    controller.abort();
    const error = await pending;
    expect(isUploadCancelled(error)).toBe(true);
    const { UploadTask } = await import("expo-file-system");
    expect((UploadTask as unknown as { last: { released: boolean } | null }).last?.released).toBe(true);
  });
});
