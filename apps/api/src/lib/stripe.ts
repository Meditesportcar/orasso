// Stripe Connect en mode test (docs/01 « Billetterie », lot 14). Appels REST directs (pas de SDK : une dépendance de
// moins, et les tests simulent les réponses avec `setStripeFetch`, sans réseau).
//
// - Connexion du compte de l'organisateur par le parcours Stripe (OAuth Connect, comptes Standard) : Orasso ne reçoit
//   jamais ses clés ni ses coordonnées bancaires, seulement l'identifiant `acct_…` du compte connecté.
// - Paiement d'un billet : session Checkout créée **sur le compte connecté** (charge directe), avec la commission de
//   la plateforme en `application_fee_amount`.
// - Webhooks signés (`Stripe-Signature`, HMAC-SHA256, tolérance de 5 minutes).
// - Seules les clés de test sont acceptées (`env.ts` refuse de démarrer avec `sk_live_`) ; un compte connecté en
//   mode réel est refusé à la connexion.
import { createHmac, timingSafeEqual } from "node:crypto";

import { env, stripeKeyError } from "../env";
import { AppError } from "./errors";

export type StripeConfig = { secretKey?: string; webhookSecret?: string; connectClientId?: string };

let override: StripeConfig | null = null;

/** Tests : remplace la configuration (`null` pour revenir aux variables d'environnement). */
export function setStripeConfig(config: StripeConfig | null) {
  const problem = stripeKeyError(config?.secretKey);
  if (problem) throw new Error(problem);
  override = config;
}

function config(): StripeConfig {
  return (
    override ?? {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      connectClientId: env.STRIPE_CONNECT_CLIENT_ID,
    }
  );
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

/** Tests : remplace l'appel réseau (`null` pour revenir au vrai Stripe). */
export function setStripeFetch(f: FetchLike | null) {
  fetchImpl = f;
}

/**
 * État de la plateforme : `test` seulement si les trois variables sont renseignées ; sinon `off` (billetterie payante
 * « bientôt », sans erreur). Jamais `live` dans cette version.
 */
export function stripePlatform(): { configured: boolean; mode: "off" | "test" } {
  const c = config();
  const configured = Boolean(c.secretKey && c.webhookSecret && c.connectClientId);
  return { configured, mode: configured ? "test" : "off" };
}

/** Encodage `application/x-www-form-urlencoded` imbriqué de Stripe : `a[b][0][c]=v`. */
export function formEncode(data: Record<string, unknown>): string {
  const pairs: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const [i, v] of value.entries()) add(`${key}[${i}]`, v);
    } else if (typeof value === "object") for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(data)) add(k, v);
  return pairs.join("&");
}

const API = "https://api.stripe.com/v1";
const CONNECT = "https://connect.stripe.com";

async function request<T>(
  url: string,
  form: Record<string, unknown>,
  opts: { account?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const { secretKey } = config();
  if (!secretKey) throw new AppError(503, "internal", "Paiement indisponible");
  const headers: Record<string, string> = {
    authorization: `Bearer ${secretKey}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (opts.account) headers["stripe-account"] = opts.account;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await (fetchImpl ?? fetch)(url, {
      method: "POST",
      headers,
      body: formEncode(form),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, "internal", "Le service de paiement ne répond pas. Réessaie dans un instant.");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: string } }) | null;
  if (!res.ok || !json) {
    // Le message de Stripe ne contient aucun secret ; il est journalisé, pas renvoyé tel quel au navigateur.
    console.error("Stripe :", res.status, json?.error?.code ?? "", json?.error?.message ?? "");
    throw new AppError(502, "internal", "Le service de paiement a refusé la demande.");
  }
  return json;
}

// --- Connexion du compte de l'organisateur (OAuth Connect) -------------------------------------------------------

/** Adresse du parcours Stripe où l'organisateur connecte (ou crée) son compte. */
export function connectAuthorizeUrl(state: string, redirectUri: string): string {
  const { connectClientId } = config();
  if (!connectClientId) throw new AppError(503, "internal", "Paiement indisponible");
  const q = new URLSearchParams({
    response_type: "code",
    client_id: connectClientId,
    scope: "read_write",
    state,
    redirect_uri: redirectUri,
  });
  return `${CONNECT}/oauth/authorize?${q.toString()}`;
}

/** Échange le code renvoyé par Stripe contre l'identifiant du compte connecté (jamais ses clés). */
export async function exchangeConnectCode(code: string): Promise<{ accountId: string }> {
  const res = await request<{ stripe_user_id?: string; livemode?: boolean }>(`${CONNECT}/oauth/token`, {
    grant_type: "authorization_code",
    code,
  });
  if (!res.stripe_user_id) throw new AppError(502, "internal", "Le service de paiement a refusé la demande.");
  if (res.livemode) {
    throw new AppError(
      409,
      "conflict",
      "Ce compte Stripe est un compte réel : seul un compte de test peut être connecté.",
    );
  }
  return { accountId: res.stripe_user_id };
}

/** Retire l'accès de la plateforme au compte (déconnexion demandée par l'organisateur). Meilleur effort. */
export async function deauthorizeAccount(accountId: string): Promise<void> {
  const { connectClientId } = config();
  if (!connectClientId) return;
  try {
    await request(`${CONNECT}/oauth/deauthorize`, { client_id: connectClientId, stripe_user_id: accountId });
  } catch {
    // Le compte peut déjà avoir révoqué l'accès : la déconnexion locale suffit.
  }
}

// --- Paiement d'un billet -----------------------------------------------------------------------------------------

export type CheckoutSession = { id: string; url: string; paymentIntentId: string | null };

export async function createCheckoutSession(input: {
  accountId: string;
  orderId: string;
  eventId: string;
  productName: string;
  unitAmountCents: number;
  quantity: number;
  feeCents: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}): Promise<CheckoutSession> {
  const res = await request<{ id?: string; url?: string; payment_intent?: string | null }>(
    `${API}/checkout/sessions`,
    {
      mode: "payment",
      client_reference_id: input.orderId,
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      metadata: { order_id: input.orderId, event_id: input.eventId },
      line_items: [
        {
          quantity: input.quantity,
          price_data: {
            currency: "eur",
            unit_amount: input.unitAmountCents,
            product_data: { name: input.productName },
          },
        },
      ],
      payment_intent_data: { application_fee_amount: input.feeCents, metadata: { order_id: input.orderId } },
    },
    { account: input.accountId, idempotencyKey: `order-${input.orderId}` },
  );
  if (!res.id || !res.url) throw new AppError(502, "internal", "Le service de paiement a refusé la demande.");
  return { id: res.id, url: res.url, paymentIntentId: res.payment_intent ?? null };
}

// --- Webhooks signés ------------------------------------------------------------------------------------------------

/** En-tête `Stripe-Signature` d'une charge utile (tests, et référence du format : `t=<s>,v1=<hmac>`). */
export function signWebhookPayload(rawBody: string, secret: string, timestampSec: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSec}.${rawBody}`).digest("hex");
  return `t=${timestampSec},v1=${v1}`;
}

/** Vérifie la signature et la fraîcheur (5 minutes) d'un webhook ; `false` si l'une des deux manque. */
export function verifyWebhookSignature(rawBody: string, header: string | undefined, secret: string, at: Date): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(at.getTime() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export type StripeEvent = {
  id: string;
  type: string;
  /** Compte connecté concerné (événements Connect). */
  account?: string;
  livemode?: boolean;
  data: { object: Record<string, unknown> };
};

/** Webhook vérifié → événement ; `null` si la signature est invalide, non configurée ou si l'événement est « live ». */
export function parseWebhook(rawBody: string, header: string | undefined, at: Date): StripeEvent | null {
  const { webhookSecret } = config();
  if (!webhookSecret || !verifyWebhookSignature(rawBody, header, webhookSecret, at)) return null;
  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    // Aucun événement réel n'est traité dans cette version.
    if (event.livemode === true || !event.id || !event.type) return null;
    return event;
  } catch {
    return null;
  }
}
