// Lot M6, tour 4 (vie privée) : un téléphone déconnecté ne reçoit plus aucun push du compte. `expo-notifications`,
// l'API et le trousseau sont simulés.
import { pushRecipientId } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = { handleNotification: (n: unknown) => Promise<Record<string, boolean>> };
const sim = vi.hoisted(() => ({
  store: new Map<string, string>(),
  /** Gestionnaire posé par push.ts à son chargement (avant tout test). */
  handlers: [] as Handler[],
  notifications: {
    setNotificationHandler: (h: Handler) => void sim.handlers.push(h),
    getPermissionsAsync: vi.fn(),
    getExpoPushTokenAsync: vi.fn(),
    unregisterForNotificationsAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
  },
  api: { registerDevice: vi.fn(), unregisterDevice: vi.fn(), forgetPushToken: vi.fn() },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: { addEventListener: vi.fn(), currentState: "active" },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.0.0", extra: { eas: { projectId: "p" } } } } }));
vi.mock("expo-device", () => ({ isDevice: true, deviceName: "Pixel", modelName: "Pixel" }));
vi.mock("expo-notifications", () => sim.notifications);
vi.mock("./api", () => ({ api: sim.api }));
vi.mock("./http", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(readonly status: number) {
      super(`Erreur ${status}`);
    }
  },
}));
vi.mock("./kv", () => ({
  kvGet: async (k: string) => sim.store.get(k) ?? null,
  kvSet: async (k: string, v: string) => void sim.store.set(k, v),
  kvDel: async (k: string) => void sim.store.delete(k),
  kvGetJson: async (k: string) => {
    const v = sim.store.get(k);
    return v ? JSON.parse(v) : null;
  },
  kvSetJson: async (k: string, v: unknown) => void sim.store.set(k, JSON.stringify(v)),
}));

import { ApiRequestError } from "./http";
import {
  leavePush,
  notificationTapAction,
  presentationOf,
  receivedPush,
  registerThisDevice,
  replayPendingPush,
  setPushAccount,
} from "./push";

const TOKEN_A = "ExponentPushToken[telephone]";
const offline = () => Promise.reject(new (ApiRequestError as unknown as new (s: number) => Error)(0));
const status = (s: number) => Promise.reject(new (ApiRequestError as unknown as new (s: number) => Error)(s));
const pending = () => {
  const v = sim.store.get("push-unregister");
  return v ? JSON.parse(v) : null;
};
const pushOf = (userId: string, type = "message_received") => ({
  identifier: "systeme-1",
  content: { title: "Bob", body: "Bob : coucou", data: { notificationId: "n1", notificationType: type, recipient: pushRecipientId(userId) } },
});

beforeEach(() => {
  sim.store.clear();
  setPushAccount(null);
  vi.clearAllMocks();
  sim.notifications.getPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true });
  sim.notifications.getExpoPushTokenAsync.mockResolvedValue({ data: TOKEN_A });
  sim.notifications.unregisterForNotificationsAsync.mockResolvedValue(undefined);
  sim.api.registerDevice.mockResolvedValue({ id: "appareil" });
  sim.api.unregisterDevice.mockResolvedValue(null);
  sim.api.forgetPushToken.mockResolvedValue(null);
});

describe("appli ouverte : seul le compte ouvert voit ses push", () => {
  it("le système n'affiche rien (ni bannière, ni centre de notifications) pour un autre compte ou sans compte", async () => {
    const data = pushOf("compte-a").content.data;
    setPushAccount("compte-b");
    expect(presentationOf(data).shouldShowList).toBe(false);
    expect(await sim.handlers[0]?.handleNotification({ request: { content: { data } } })).toMatchObject({
      shouldShowList: false,
      shouldShowBanner: false,
      shouldPlaySound: false,
    });
    setPushAccount(null);
    expect(presentationOf(data).shouldShowList).toBe(false);
    setPushAccount("compte-a");
    expect(presentationOf(data).shouldShowList).toBe(true);
    expect(presentationOf({ notificationType: "message_received" }).shouldShowList).toBe(false);
  });

  it("pont des annonces : un push de A reçu après la connexion de B n'est pas annoncé", () => {
    setPushAccount("compte-b");
    expect(receivedPush(pushOf("compte-a"))).toBeNull();
    const own = receivedPush(pushOf("compte-b", "application_accepted"));
    expect(own).toMatchObject({ id: "n1", type: "application_accepted", title: "Bob", reloadApplications: true });
    expect(receivedPush(pushOf("compte-b"))?.reloadApplications).toBe(false);
  });

  it("toucher une notification : la sienne s'ouvre, celle d'un autre compte mène à l'Accueil", () => {
    const data = pushOf("compte-a").content.data;
    setPushAccount("compte-a");
    expect(notificationTapAction(data, "in")).toBe("open");
    setPushAccount("compte-b");
    expect(notificationTapAction(data, "in")).toBe("home");
    expect(notificationTapAction(data, "loading")).toBe("wait");
    expect(notificationTapAction(data, "out")).toBe("none");
  });
});

describe("déconnexion : l'appareil quitte les push du compte", () => {
  it("avec réseau : désinscription du système et jeton retiré par la session, rien en attente", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    expect(sim.api.registerDevice).toHaveBeenCalledWith(expect.objectContaining({ expoPushToken: TOKEN_A }));
    await leavePush({ withSession: true });
    expect(sim.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(sim.api.unregisterDevice).toHaveBeenCalledWith({ expoPushToken: TOKEN_A });
    expect(sim.api.forgetPushToken).not.toHaveBeenCalled();
    expect(pending()).toBeNull();
    expect(presentationOf(pushOf("compte-a").content.data).shouldShowList).toBe(false);
  });

  it("sans réseau : désinscription du système quand même, retrait mis en attente puis rejoué", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    sim.api.unregisterDevice.mockImplementation(offline);
    sim.api.forgetPushToken.mockImplementation(offline);
    sim.notifications.getExpoPushTokenAsync.mockClear();
    await leavePush({ withSession: true });
    expect(sim.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    // Le jeton gardé à l'inscription sert : pas de nouvelle demande au système (elle réinscrirait l'appareil).
    expect(sim.notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    // Pas de réseau sur la route du compte : inutile d'essayer l'autre.
    expect(sim.api.forgetPushToken).not.toHaveBeenCalled();
    expect(pending()).toEqual({ token: TOKEN_A, native: false });

    await replayPendingPush(); // toujours hors ligne
    expect(pending()).toEqual({ token: TOKEN_A, native: false });
    sim.api.forgetPushToken.mockResolvedValue(null); // le réseau revient
    await replayPendingPush();
    expect(sim.api.forgetPushToken).toHaveBeenLastCalledWith({ expoPushToken: TOKEN_A });
    expect(pending()).toBeNull();
  });

  it("session déjà refusée (401) : retrait sans session, sur preuve du jeton", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    sim.api.unregisterDevice.mockImplementation(() => status(401));
    await leavePush({ withSession: true });
    expect(sim.api.forgetPushToken).toHaveBeenCalledWith({ expoPushToken: TOKEN_A });
    expect(pending()).toBeNull();
  });

  it("session révoquée à distance : retrait sans session, jamais par la route du compte", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    await leavePush({ withSession: false });
    expect(sim.api.unregisterDevice).not.toHaveBeenCalled();
    expect(sim.api.forgetPushToken).toHaveBeenCalledWith({ expoPushToken: TOKEN_A });
    expect(sim.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it("Android hors ligne : la désinscription du système qui échoue est refaite au rejeu, tant que personne n'est connecté", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    sim.notifications.unregisterForNotificationsAsync.mockRejectedValueOnce(new Error("SERVICE_NOT_AVAILABLE"));
    await leavePush({ withSession: true });
    expect(pending()).toEqual({ token: null, native: true });
    await replayPendingPush();
    expect(sim.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(pending()).toBeNull();
  });

  it("désinscription du système sans réponse : abandonnée après le délai, refaite plus tard", async () => {
    vi.useFakeTimers();
    try {
      sim.store.set("push-token", TOKEN_A);
      sim.notifications.unregisterForNotificationsAsync.mockReturnValueOnce(new Promise(() => undefined));
      const done = leavePush({ withSession: true });
      await vi.advanceTimersByTimeAsync(5_000);
      await done;
      expect(pending()).toEqual({ token: null, native: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnexion : le retrait en attente passe avant, puis le compte suivant se réinscrit normalement", async () => {
    setPushAccount("compte-a");
    await registerThisDevice();
    sim.api.unregisterDevice.mockImplementation(offline);
    sim.api.forgetPushToken.mockImplementation(offline);
    sim.notifications.unregisterForNotificationsAsync.mockRejectedValueOnce(new Error("hors ligne"));
    await leavePush({ withSession: true });
    expect(pending()).toEqual({ token: TOKEN_A, native: true });

    // B se connecte (réseau revenu) : pas de nouvelle désinscription du système, retrait d'abord, puis inscription.
    const order: string[] = [];
    sim.api.forgetPushToken.mockImplementation(async () => void order.push("retrait"));
    sim.api.registerDevice.mockImplementation(async () => {
      order.push("inscription");
      return { id: "appareil-b" };
    });
    setPushAccount("compte-b");
    await registerThisDevice();
    expect(order).toEqual(["retrait", "inscription"]);
    expect(sim.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(sim.api.registerDevice).toHaveBeenLastCalledWith(expect.objectContaining({ expoPushToken: TOKEN_A }));
    expect(pending()).toBeNull();
    expect(sim.store.get("push-token")).toBe(TOKEN_A);
  });

  it("le même jeton repris par le compte suivant n'est jamais retiré ensuite", async () => {
    // Retrait en attente du jeton, mais B s'inscrit avec ce jeton alors que la route sans session échoue encore.
    sim.store.set("push-unregister", JSON.stringify({ token: TOKEN_A, native: false }));
    sim.api.forgetPushToken.mockImplementation(() => status(503));
    setPushAccount("compte-b");
    await registerThisDevice();
    expect(pending()).toBeNull();
    sim.api.forgetPushToken.mockClear();
    await replayPendingPush();
    expect(sim.api.forgetPushToken).not.toHaveBeenCalled();
  });
});
