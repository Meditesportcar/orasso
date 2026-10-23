// Notifications : l'autorisation se demande une seule fois, juste après une candidature (docs/01), jamais au premier
// lancement. L'appareil est enregistré auprès de l'API (avec son jeton Expo Push quand il existe).
//
// Lot M6, tour 4 (vie privée) : un téléphone déconnecté ne reçoit plus aucun push du compte.
// - Appli ouverte : rien ne s'affiche (bannière, centre de notifications) si le push n'est pas pour le compte ouvert
//   (`recipient`, haché du compte). Ce contrôle ne vaut qu'appli ouverte : appli fermée, c'est le système qui affiche.
// - Appli fermée : à la déconnexion, l'appareil se désinscrit chez le système (`unregisterForNotificationsAsync`) et
//   l'API retire son jeton. Ce qui échoue faute de réseau reste en attente (trousseau) et se rejoue au prochain
//   lancement, au retour au premier plan et chaque minute appli ouverte.
import { pushIsForAccount } from "@orasso/shared";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";

import { api } from "./api";
import { ApiRequestError } from "./http";
import { kvDel, kvGet, kvGetJson, kvSet, kvSetJson } from "./kv";

export type PermissionState = "granted" | "denied" | "undetermined";

/** Compte ouvert sur l'appareil, posé par la session : seul destinataire dont les push s'affichent appli ouverte. */
let openAccount: string | null = null;
export const setPushAccount = (userId: string | null) => {
  openAccount = userId;
};

/** Le push (ses `data`) est-il pour le compte ouvert ? Sans compte ouvert ou sans destinataire : non. */
export function pushIsForOpenAccount(data: unknown): boolean {
  const recipient = data && typeof data === "object" ? (data as Record<string, unknown>).recipient : undefined;
  return pushIsForAccount(recipient, openAccount);
}

/**
 * Lot M6 (système d'annonces unique) : appli ouverte, la notification arrive par le bandeau de l'appli (ui/Announce),
 * plus par la bannière du système en double ; elle reste dans le centre de notifications. Tour 4 : seulement si elle
 * est pour le compte ouvert ; sinon rien du tout, ni bannière, ni centre de notifications, ni son.
 */
export function presentationOf(data: unknown): Notifications.NotificationBehavior {
  return {
    shouldShowBanner: false,
    shouldShowList: pushIsForOpenAccount(data),
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
}

/** Push reçu appli ouverte, prêt pour le bandeau d'annonce ; `null` s'il n'est pas pour le compte ouvert. */
export type ReceivedPush = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  /** Une décision du tri (« Retenue » compris) : les candidatures se rechargent, comme avec le temps réel. */
  reloadApplications: boolean;
};
export function receivedPush(request: {
  identifier: string;
  content: { title?: string | null; body?: string | null; data?: unknown };
}): ReceivedPush | null {
  const data = (request.content.data ?? {}) as Record<string, unknown>;
  const type = typeof data.notificationType === "string" ? data.notificationType : "";
  if (!type || !pushIsForOpenAccount(data)) return null;
  return {
    id: typeof data.notificationId === "string" ? data.notificationId : request.identifier,
    type,
    title: request.content.title ?? "",
    body: request.content.body ?? null,
    data,
    reloadApplications: type.startsWith("application_") || type.startsWith("offer_"),
  };
}

/**
 * Toucher une notification du système : l'ouvrir si elle est pour le compte ouvert ; sinon l'Accueil, sans rien de son
 * contenu ; session pas encore lue : attendre ; déconnecté : rien (l'écran de connexion s'impose).
 */
export function notificationTapAction(
  data: unknown,
  status: "loading" | "in" | "out",
): "wait" | "open" | "home" | "none" {
  if (status === "loading") return "wait";
  if (status === "out") return "none";
  return pushIsForOpenAccount(data) ? "open" : "home";
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => presentationOf(notification.request.content.data),
  });
}

export async function notificationPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "undetermined";
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    return status === "denied" && !canAskAgain ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Jeton Expo Push, s'il est disponible : il faut un projet EAS (lot 11) et une autorisation accordée. */
async function pushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

// --- Jeton connu, retrait en attente -----------------------------------------------------------------------------

/** Dernier jeton inscrit auprès de l'API : connu sans réseau au moment de la déconnexion. */
const TOKEN_KEY = "push-token";
/** Retrait pas encore fait : jetons à retirer côté API, désinscription du système à refaire. */
const PENDING_KEY = "push-unregister";
export type PendingUnregister = { tokens: string[]; native: boolean };

/**
 * Délai laissé aux appels qui passent par le réseau sans le dire : la désinscription du système (Android supprime son
 * jeton chez Firebase, ce qui échoue ou traîne hors ligne) et la lecture du jeton Expo.
 */
const NATIVE_TIMEOUT_MS = 5_000;

/** Les opérations push s'enchaînent (une inscription ne croise jamais un retrait du même jeton). */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/** `fallback` si `work` échoue ou ne répond pas dans le délai. */
async function bounded<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), NATIVE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Désinscription du système ; `false` si elle a échoué ou n'a pas répondu à temps (à refaire plus tard). */
const unregisterNative = () => bounded(() => Notifications.unregisterForNotificationsAsync().then(() => true), false);

/** Jeton de l'appareil : celui gardé à l'inscription, sinon (version précédente de l'appli) celui du système. */
async function knownToken(): Promise<string | null> {
  const stored = await kvGet(TOKEN_KEY);
  if (stored) return stored;
  if ((await notificationPermission()) !== "granted") return null;
  return bounded(pushToken, null);
}

type Outcome = "done" | "public" | "later";
/** 2xx ou 400 (jeton mal formé : rien à refaire) = fait ; 401/403 = essayer sans session ; le reste = plus tard. */
async function outcomeOf(call: () => Promise<unknown>): Promise<Outcome> {
  try {
    await call();
    return "done";
  } catch (error) {
    if (!(error instanceof ApiRequestError)) return "later";
    if (error.status === 400) return "done";
    if (error.status === 401 || error.status === 403) return "public";
    return "later";
  }
}

/** Retire le jeton côté API : par la session si elle vit encore, sinon sur preuve du jeton. `true` si c'est fait. */
async function retireToken(token: string, withSession: boolean): Promise<boolean> {
  if (withSession) {
    const outcome = await outcomeOf(() => api.unregisterDevice({ expoPushToken: token }));
    if (outcome !== "public") return outcome === "done";
  }
  return (await outcomeOf(() => api.forgetPushToken({ expoPushToken: token }))) === "done";
}

async function readPending(): Promise<PendingUnregister> {
  const saved = await kvGetJson<Partial<PendingUnregister>>(PENDING_KEY);
  return { tokens: Array.isArray(saved?.tokens) ? saved.tokens : [], native: saved?.native === true };
}

async function savePending(next: PendingUnregister): Promise<void> {
  if (next.tokens.length || next.native) await kvSetJson(PENDING_KEY, next);
  else await kvDel(PENDING_KEY);
}

/** Rejoue le retrait en attente (sans session : sur preuve du jeton). */
async function replayPending(): Promise<void> {
  const pending = await readPending();
  if (!pending.tokens.length && !pending.native) return;
  let { native } = pending;
  // Un compte a été ouvert depuis : l'appareil se réinscrit pour lui, la désinscription du système n'a plus lieu d'être.
  if (native) native = openAccount ? false : !(await unregisterNative());
  const tokens: string[] = [];
  for (const token of pending.tokens) if (!(await retireToken(token, false))) tokens.push(token);
  await savePending({ tokens, native });
}

// --- Inscription, déconnexion ------------------------------------------------------------------------------------

/** Enregistre cet appareil auprès de l'API (nécessaire aux appareils du staff, utile aux notifications). */
export function registerThisDevice(): Promise<void> {
  return serial(async () => {
    // Un retrait en attente passe d'abord : il ne retirera jamais l'inscription qui suit.
    await replayPending();
    const granted = (await notificationPermission()) === "granted";
    const token = granted ? await pushToken() : null;
    try {
      await api.registerDevice({
        platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
        expoPushToken: token,
        name: Device.deviceName ?? Device.modelName ?? null,
        appVersion: Constants.expoConfig?.version ?? null,
      });
    } catch {
      // Hors ligne ou déjà enregistré : sans conséquence, repris au prochain lancement.
      return;
    }
    if (!token) return;
    await kvSet(TOKEN_KEY, token);
    // L'API a repris ce jeton pour le compte ouvert (retiré de tout autre) : son retrait en attente n'a plus d'objet.
    const pending = await readPending();
    if (pending.tokens.includes(token))
      await savePending({ ...pending, tokens: pending.tokens.filter((t) => t !== token) });
  });
}

/**
 * Lot M6, tours 3 et 4 (vie privée) : à la déconnexion, ou quand l'API refuse la session (révoquée, expirée),
 * l'appareil quitte les push du compte. Toujours : plus rien ne s'affiche appli ouverte, et désinscription du système.
 * Puis l'API retire le jeton (par la session si `withSession`, sinon sur preuve du jeton). Ce qui échoue (pas de
 * réseau) reste en attente et se rejoue (`replayPendingPush`). À appeler avant d'effacer la session.
 */
export function leavePush({ withSession }: { withSession: boolean }): Promise<void> {
  setPushAccount(null);
  if (Platform.OS === "web") return Promise.resolve();
  return serial(async () => {
    await clearShownNotifications();
    const pending = await readPending();
    // Le jeton se lit avant la désinscription du système (le redemander après réinscrirait l'appareil).
    const token = await knownToken();
    const native = !(await unregisterNative());
    await kvDel(TOKEN_KEY);
    const retired = token ? await retireToken(token, withSession) : true;
    // Un ancien jeton encore en attente (autre déconnexion hors ligne) reste à retirer avec celui-ci.
    const tokens = pending.tokens.filter((t) => t !== token);
    if (token && !retired) tokens.push(token);
    await savePending({ tokens, native });
  });
}

/**
 * Les notifications déjà reçues du compte (aperçus de messages compris) quittent le centre de notifications et l'écran
 * verrouillé, et la pastille de l'icône repart à zéro (relecture du lot M6, tour 4). Jamais bloquant pour la sortie.
 */
async function clearShownNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Module natif absent ou refus du système : la déconnexion continue.
  }
}

/** Rejoue le retrait en attente : au lancement, au retour au premier plan, chaque minute appli ouverte. */
export function replayPendingPush(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  return serial(replayPending);
}

let watching = false;
/** Lance le rejeu du retrait en attente (une fois, au démarrage de l'appli). */
export function watchPendingPush(): void {
  if (Platform.OS === "web" || watching) return;
  watching = true;
  void replayPendingPush();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void replayPendingPush();
  });
  setInterval(() => {
    if (AppState.currentState === "active") void replayPendingPush();
  }, 60_000);
}

/** Demande l'autorisation (fenêtre du système) puis enregistre l'appareil avec son jeton. */
export async function askNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "undetermined";
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === "granted") {
      await registerThisDevice();
      return "granted";
    }
    return "denied";
  } catch {
    return "denied";
  }
}
