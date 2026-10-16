// Billetterie (docs/01 « Billetterie », lot 14).
// - Billets gratuits (réservation du public), réels avant le 21 juin 2027 : interrupteur général de l'administration,
//   puis interrupteur de l'événement.
// - Billets payants en **mode présentation** : Stripe Connect en mode test uniquement (aucun encaissement réel),
//   compte de l'organisateur connecté par le parcours Stripe (Orasso ne voit jamais ses clés), commission de la
//   plateforme `PLATFORM_FEE_BASIS_POINTS`.
// - QR d'un billet : même mécanique que le QR d'inscription (message signé Ed25519 : l'identifiant du billet prend la
//   place de celui du pass). Contrôle à l'entrée en ligne par le staff « scan » (la boutique n'est pas confirmée).
import { randomUUID } from "node:crypto";
import {
  type EventTicketing,
  encodePassMessage,
  encodePassPayload,
  type MyTicket,
  platformFeeCents,
  type StripeAccountState,
  TICKET_MAX_PER_ORDER,
  type TicketCheckResult,
  type TicketHolderRow,
  type TicketingUpdate,
  type TicketOffer,
  ticketingBlock,
  ticketingBlockLabels,
  verifyPassPayload,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { events, orders, structures, tickets, ticketTypes } from "../../db/schema";
import { env } from "../../env";
import { requireOrganizer, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { ed25519Verify, signing } from "../../lib/signing";
import {
  connectAuthorizeUrl,
  createCheckoutSession,
  deauthorizeAccount,
  exchangeConnectCode,
  makeConnectState,
  parseWebhook,
  readConnectState,
  stripePlatform,
} from "../../lib/stripe";
import { type Tx, withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { settingsService } from "./settings";

type EventRow = typeof events.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;

/** Une commande payante non réglée garde ses places 30 minutes (durée minimale d'une session Stripe Checkout). */
const PENDING_MINUTES = 31;

const lockTickets = (tx: Tx, eventId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tickets:${eventId}`}, 0))`);

async function typeOf(eventId: string, ex: Pick<typeof db, "query"> = db) {
  return ex.query.ticketTypes.findFirst({ where: eq(ticketTypes.eventId, eventId) });
}

/** Billets vendus (valides ou utilisés) + places retenues par des paiements en cours. */
async function takenCount(ex: typeof db | Tx, eventId: string): Promise<number> {
  const [sold] = await ex
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), inArray(tickets.status, ["valid", "used"])));
  const [pending] = await ex
    .select({ n: sql<number>`coalesce(sum(${orders.quantity}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "pending"), gt(orders.expiresAt, now())));
  return (sold?.n ?? 0) + (pending?.n ?? 0);
}

async function userTakenCount(ex: typeof db | Tx, eventId: string, userId: string): Promise<number> {
  const [sold] = await ex
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), eq(tickets.userId, userId), inArray(tickets.status, ["valid", "used"])));
  const [pending] = await ex
    .select({ n: sql<number>`coalesce(sum(${orders.quantity}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.userId, userId),
        eq(orders.status, "pending"),
        gt(orders.expiresAt, now()),
      ),
    );
  return (sold?.n ?? 0) + (pending?.n ?? 0);
}

/** Le paiement de démonstration est possible : Stripe de test configuré, compte connecté, mode présentation actif. */
async function paymentsReady(structure: { stripeAccountId: string | null }): Promise<boolean> {
  return (
    stripePlatform().configured &&
    Boolean(structure.stripeAccountId) &&
    (await settingsService.get("ticketing.presentation_mode"))
  );
}

async function blockOf(ex: typeof db | Tx, e: EventRow, structure: { stripeAccountId: string | null }) {
  const type = await typeOf(e.id, ex);
  const taken = await takenCount(ex, e.id);
  const remaining = type?.capacity == null ? null : Math.max(0, type.capacity - taken);
  const block = ticketingBlock(
    {
      publicAccess: e.publicAccess,
      status: e.status,
      endsAt: e.endsAt,
      generalSwitch: await settingsService.get("ticketing.free_enabled"),
      eventSwitch: e.ticketsEnabled && Boolean(type),
      remaining,
      paymentsReady: await paymentsReady(structure),
    },
    now(),
  );
  return { type, remaining, block };
}

const accountHint = (id: string | null) => (id ? `${id.slice(0, 5)}…${id.slice(-4)}` : null);

function stripeState(s: { stripeAccountId: string | null }): StripeAccountState {
  return {
    ...stripePlatform(),
    connected: Boolean(s.stripeAccountId),
    accountHint: accountHint(s.stripeAccountId),
  };
}

function payloadOf(t: Pick<TicketRow, "id" | "kid" | "signature">, eventNo: number): string {
  return encodePassPayload(encodePassMessage({ kid: t.kid, eventNo, passId: t.id }), t.signature);
}

/** Émet les billets d'une commande payée (idempotent : une commande n'en reçoit qu'une fois). */
async function issueTickets(tx: Tx, order: typeof orders.$inferSelect, eventNo: number): Promise<number> {
  const existing = await tx.select({ n: count() }).from(tickets).where(eq(tickets.orderId, order.id));
  if ((existing[0]?.n ?? 0) > 0) return 0;
  await signing.ensureSynced();
  const rows = Array.from({ length: order.quantity }, () => {
    const id = randomUUID();
    const { kid, signature } = signing.sign(encodePassMessage({ kid: signing.activeKid, eventNo, passId: id }));
    return {
      id,
      orderId: order.id,
      eventId: order.eventId,
      userId: order.userId,
      ticketTypeId: order.ticketTypeId,
      kid,
      signature,
      issuedAt: now(),
    };
  });
  await tx.insert(tickets).values(rows);
  return rows.length;
}

async function myTicketsOf(userId: string, onlyEventId?: string): Promise<MyTicket[]> {
  const rows = await db
    .select({ t: tickets, type: ticketTypes, e: events, s: structures, o: orders })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(structures, eq(structures.id, events.structureId))
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .where(
      and(
        eq(tickets.userId, userId),
        inArray(tickets.status, ["valid", "used"]),
        onlyEventId ? eq(tickets.eventId, onlyEventId) : undefined,
      ),
    )
    .orderBy(asc(events.startsAt), asc(tickets.issuedAt));
  return rows.map(({ t, type, e, s, o }) => ({
    id: t.id,
    status: t.status,
    usedAt: t.usedAt?.toISOString() ?? null,
    payload: payloadOf(t, e.eventNo),
    name: type.name,
    priceCents: o.amountCents > 0 ? Math.round(o.amountCents / o.quantity) : null,
    testMode: o.testMode,
    event: {
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      city: e.city,
      structureName: s.name,
    },
  }));
}

async function eventWithStructure(id: string) {
  const e = await eventsRepo.byId(id);
  const s = await db.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
  if (!s) throw notFound("Structure introuvable");
  return { e, s };
}

export const ticketsService = {
  // --- Côté public ---------------------------------------------------------------------------------------------

  /** `GET /events/by-slug/:slug/tickets` : l'offre (ou `null` si l'événement n'a pas de billetterie Orasso) et mes billets. */
  async offerBySlug(slug: string, viewer: Viewer | null): Promise<{ offer: TicketOffer | null; mine: MyTicket[] }> {
    const e = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!e || e.status === "draft") throw notFound("Événement introuvable");
    const s = await db.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
    if (!s) throw notFound("Événement introuvable");
    const mine = viewer ? await myTicketsOf(viewer.user.id, e.id) : [];
    if (e.publicAccess !== "free_reservation" && e.publicAccess !== "paid_orasso") return { offer: null, mine };
    const { type, remaining, block } = await blockOf(db, e, s);
    const paid = e.publicAccess === "paid_orasso";
    return {
      mine,
      offer: {
        kind: paid ? "paid" : "free",
        block,
        blockLabel: block ? ticketingBlockLabels[block] : null,
        name: type?.name ?? "Entrée",
        priceCents: paid ? (type?.priceCents ?? null) : null,
        remaining,
        maxPerOrder: TICKET_MAX_PER_ORDER,
        testMode: paid,
      },
    };
  },

  /** `GET /me/tickets` : mes billets (valides ou utilisés), avec leur QR. */
  async mine(v: Viewer): Promise<MyTicket[]> {
    return myTicketsOf(v.user.id);
  },

  /** `POST /events/:id/tickets/reserve` : billets gratuits. */
  async reserve(v: Viewer, eventId: string, quantity: number): Promise<MyTicket[]> {
    rateLimit("ticketOrder", v.user.id);
    const orderId = await withTx(async (tx) => {
      await lockTickets(tx, eventId);
      const e = await eventsRepo.byId(eventId, tx);
      const s = await tx.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
      if (e.publicAccess !== "free_reservation") throw validation("Cet événement n'a pas de billets gratuits.");
      const { type, remaining, block } = await blockOf(tx, e, s ?? { stripeAccountId: null });
      if (block || !type) throw conflict("conflict", ticketingBlockLabels[block ?? "event_off"], { block });
      if (remaining !== null && quantity > remaining) throw conflict("event_full", "Il ne reste pas assez de places.");
      if ((await userTakenCount(tx, e.id, v.user.id)) + quantity > TICKET_MAX_PER_ORDER) {
        throw conflict("conflict", `${TICKET_MAX_PER_ORDER} billets au plus par personne.`);
      }
      const [order] = await tx
        .insert(orders)
        .values({
          eventId: e.id,
          userId: v.user.id,
          ticketTypeId: type.id,
          status: "paid",
          quantity,
          paidAt: now(),
        })
        .returning();
      if (!order) throw new Error("Commande non créée");
      await issueTickets(tx, order, e.eventNo);
      return order.id;
    });
    void orderId;
    return myTicketsOf(v.user.id, eventId);
  },

  /** `DELETE /tickets/:id` : le titulaire rend un billet gratuit (les billets payés ne se remboursent pas ici). */
  async cancel(v: Viewer, ticketId: string): Promise<void> {
    const row = await db
      .select({ t: tickets, o: orders, e: events })
      .from(tickets)
      .innerJoin(orders, eq(orders.id, tickets.orderId))
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.id, ticketId))
      .then((r) => r[0]);
    if (!row || row.t.userId !== v.user.id) throw notFound("Billet introuvable");
    if (row.o.amountCents > 0) throw conflict("conflict", "Un billet payé ne peut pas être rendu ici.");
    if (row.t.status !== "valid") throw conflict("conflict", "Ce billet n'est plus valable.");
    if (now() >= row.e.endsAt) throw conflict("locked", "L'événement est terminé.");
    await db.update(tickets).set({ status: "cancelled", cancelledAt: now() }).where(eq(tickets.id, ticketId));
  },

  // --- Paiement de démonstration (Stripe en mode test) ------------------------------------------------------------

  /** `POST /events/:id/tickets/checkout` : ouvre une session de paiement Stripe sur le compte de l'organisateur. */
  async checkout(v: Viewer, eventId: string, quantity: number): Promise<{ url: string }> {
    rateLimit("ticketOrder", v.user.id);
    const t = now();
    const reserved = await withTx(async (tx) => {
      await lockTickets(tx, eventId);
      const e = await eventsRepo.byId(eventId, tx);
      const s = await tx.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
      if (e.publicAccess !== "paid_orasso" || !s)
        throw validation("Cet événement n'a pas de billetterie payante Orasso.");
      const { type, remaining, block } = await blockOf(tx, e, s);
      if (block || !type) throw conflict("conflict", ticketingBlockLabels[block ?? "event_off"], { block });
      if (type.priceCents <= 0 || !s.stripeAccountId) throw conflict("conflict", ticketingBlockLabels.payments_soon);
      if (remaining !== null && quantity > remaining) throw conflict("event_full", "Il ne reste pas assez de places.");
      if ((await userTakenCount(tx, e.id, v.user.id)) + quantity > TICKET_MAX_PER_ORDER) {
        throw conflict("conflict", `${TICKET_MAX_PER_ORDER} billets au plus par personne.`);
      }
      const amount = type.priceCents * quantity;
      const [order] = await tx
        .insert(orders)
        .values({
          eventId: e.id,
          userId: v.user.id,
          ticketTypeId: type.id,
          status: "pending",
          quantity,
          amountCents: amount,
          feeCents: platformFeeCents(amount),
          testMode: true,
          stripeAccountId: s.stripeAccountId,
          expiresAt: new Date(t.getTime() + PENDING_MINUTES * 60_000),
        })
        .returning();
      if (!order) throw new Error("Commande non créée");
      return { order, e, type, accountId: s.stripeAccountId };
    });

    try {
      const session = await createCheckoutSession({
        accountId: reserved.accountId,
        orderId: reserved.order.id,
        eventId: reserved.e.id,
        productName: `${reserved.e.title} · ${reserved.type.name} (paiement de démonstration)`,
        unitAmountCents: reserved.type.priceCents,
        quantity,
        feeCents: reserved.order.feeCents,
        customerEmail: v.user.email,
        successUrl: `${env.PUBLIC_URL}/app/billets?paiement=ok`,
        cancelUrl: `${env.PUBLIC_URL}/e/${reserved.e.slug}?paiement=annule`,
        expiresAt: reserved.order.expiresAt ?? new Date(t.getTime() + PENDING_MINUTES * 60_000),
      });
      await db
        .update(orders)
        .set({ stripeSessionId: session.id, stripePaymentIntentId: session.paymentIntentId })
        .where(eq(orders.id, reserved.order.id));
      return { url: session.url };
    } catch (error) {
      // Stripe a refusé ou ne répond pas : la place est rendue tout de suite.
      await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, reserved.order.id));
      throw error;
    }
  },

  /**
   * `POST /stripe/webhook` : événements Stripe signés. Un événement dont la signature est invalide est refusé (400) ;
   * un événement inconnu est accepté sans effet (Stripe ne le renverra pas).
   */
  async webhook(rawBody: string, signature: string | undefined): Promise<{ handled: boolean }> {
    const event = parseWebhook(rawBody, signature, now());
    if (!event) throw new AppError(400, "validation_error", "Signature invalide");
    const object = event.data.object as Record<string, unknown>;

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const sessionId = String(object.id ?? "");
      const order = await db.query.orders.findFirst({ where: eq(orders.stripeSessionId, sessionId) });
      if (!order) return { handled: false };
      // Le compte et le montant doivent correspondre à la commande ; le paiement doit être réglé.
      if (event.account && order.stripeAccountId && event.account !== order.stripeAccountId) return { handled: false };
      if (object.payment_status !== "paid") return { handled: false };
      if (typeof object.amount_total === "number" && object.amount_total !== order.amountCents)
        return { handled: false };
      await withTx(async (tx) => {
        await lockTickets(tx, order.eventId);
        const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
        if (!locked || locked.status === "paid") return;
        const e = await eventsRepo.byId(order.eventId, tx);
        // Paiement arrivé après l'expiration de la commande : l'argent est pris, le billet est émis.
        const [paid] = await tx
          .update(orders)
          .set({
            status: "paid",
            paidAt: now(),
            stripePaymentIntentId:
              typeof object.payment_intent === "string" ? object.payment_intent : locked.stripePaymentIntentId,
          })
          .where(eq(orders.id, order.id))
          .returning();
        if (paid) await issueTickets(tx, paid, e.eventNo);
      });
      return { handled: true };
    }

    if (event.type === "checkout.session.expired") {
      const res = await db
        .update(orders)
        .set({ status: "expired" })
        .where(and(eq(orders.stripeSessionId, String(object.id ?? "")), eq(orders.status, "pending")))
        .returning({ id: orders.id });
      return { handled: res.length > 0 };
    }

    if (event.type === "account.application.deauthorized" && event.account) {
      const res = await db
        .update(structures)
        .set({ stripeAccountId: null })
        .where(eq(structures.stripeAccountId, event.account))
        .returning({ id: structures.id });
      return { handled: res.length > 0 };
    }
    return { handled: false };
  },

  // --- Organisateur : interrupteur de l'événement, compte Stripe --------------------------------------------------

  /** `GET /events/:id/ticketing` */
  async view(v: Viewer, eventId: string): Promise<EventTicketing> {
    const { e, s } = await eventWithStructure(eventId);
    await requireOrganizer(v, e.structureId);
    return this.viewOf(e, s);
  },

  async viewOf(e: EventRow, s: { stripeAccountId: string | null }): Promise<EventTicketing> {
    const { type, block } = await blockOf(db, e, s);
    const [sold] = await db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.eventId, e.id), inArray(tickets.status, ["valid", "used"])));
    const [used] = await db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.eventId, e.id), eq(tickets.status, "used")));
    return {
      enabled: e.ticketsEnabled,
      publicAccess: e.publicAccess,
      name: type?.name ?? "Entrée",
      capacity: type?.capacity ?? null,
      priceCents: e.publicAccess === "paid_orasso" ? (type?.priceCents ?? null) : null,
      sold: sold?.n ?? 0,
      used: used?.n ?? 0,
      generalSwitch: await settingsService.get("ticketing.free_enabled"),
      block,
      blockLabel: block ? ticketingBlockLabels[block] : null,
      stripe: stripeState(s),
      presentationMode: await settingsService.get("ticketing.presentation_mode"),
    };
  },

  /** `PUT /events/:id/ticketing` : active la billetterie de l'événement (deuxième interrupteur), places, prix. */
  async configure(v: Viewer, eventId: string, input: TicketingUpdate): Promise<EventTicketing> {
    const { e, s } = await eventWithStructure(eventId);
    await requireOrganizer(v, e.structureId);
    if (e.publicAccess !== "free_reservation" && e.publicAccess !== "paid_orasso") {
      throw validation(
        "Choisis « Gratuite sur réservation » ou « Payante · billetterie Orasso » dans l'accès du public.",
      );
    }
    const paid = e.publicAccess === "paid_orasso";
    if (paid && input.enabled && !input.priceCents) throw validation("Indique le prix du billet.");
    const taken = await takenCount(db, e.id);
    if (input.capacity !== null && input.capacity < taken) {
      throw conflict("conflict", `${taken} billets sont déjà pris : la capacité ne peut pas être plus basse.`);
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(ticketTypes)
        .values({
          eventId: e.id,
          name: input.name,
          capacity: input.capacity,
          priceCents: paid ? (input.priceCents ?? 0) : 0,
        })
        .onConflictDoUpdate({
          target: ticketTypes.eventId,
          set: {
            name: input.name,
            capacity: input.capacity,
            priceCents: paid ? (input.priceCents ?? 0) : 0,
          },
        });
      await tx.update(events).set({ ticketsEnabled: input.enabled }).where(eq(events.id, e.id));
    });
    const fresh = await eventsRepo.byId(e.id);
    return this.viewOf(fresh, s);
  },

  /** `GET /structures/:id/stripe` */
  async stripeOf(v: Viewer, structureId: string): Promise<StripeAccountState> {
    await requireOrganizer(v, structureId);
    return stripeState(await structureRow(structureId));
  },

  /** `POST /structures/:id/stripe/connect` : adresse du parcours Stripe (propriétaire seulement). */
  async startConnect(v: Viewer, structureId: string): Promise<{ url: string }> {
    const access = await requireOrganizer(v, structureId);
    if (access.role === "co_organizer")
      throw forbidden("La connexion Stripe est réservée au propriétaire de la structure.");
    if (!stripePlatform().configured) throw conflict("conflict", ticketingBlockLabels.payments_soon);
    const state = makeConnectState(structureId, v.user.id, now());
    return { url: connectAuthorizeUrl(state, `${env.PUBLIC_URL}/api/stripe/connect/callback`) };
  },

  /**
   * `GET /stripe/connect/callback` : retour du parcours Stripe. Renvoie le slug de la structure et le résultat ; la
   * route redirige ensuite vers le site. Le `state` signé tient lieu de session (le navigateur revient de Stripe).
   */
  async finishConnect(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ slug: string | null; ok: boolean }> {
    const decoded = query.state ? readConnectState(query.state, now()) : null;
    if (!decoded) return { slug: null, ok: false };
    const s = await db.query.structures.findFirst({ where: eq(structures.id, decoded.structureId) });
    if (!s) return { slug: null, ok: false };
    if (query.error || !query.code) return { slug: s.slug, ok: false };
    try {
      const { accountId } = await exchangeConnectCode(query.code);
      await db.update(structures).set({ stripeAccountId: accountId }).where(eq(structures.id, s.id));
      return { slug: s.slug, ok: true };
    } catch (error) {
      console.error("Connexion Stripe :", error instanceof Error ? error.message : error);
      return { slug: s.slug, ok: false };
    }
  },

  /** `DELETE /structures/:id/stripe` */
  async disconnect(v: Viewer, structureId: string): Promise<StripeAccountState> {
    const access = await requireOrganizer(v, structureId);
    if (access.role === "co_organizer")
      throw forbidden("La connexion Stripe est réservée au propriétaire de la structure.");
    const s = await structureRow(structureId);
    if (s.stripeAccountId) await deauthorizeAccount(s.stripeAccountId);
    await db.update(structures).set({ stripeAccountId: null }).where(eq(structures.id, structureId));
    return stripeState({ stripeAccountId: null });
  },

  // --- Contrôle à l'entrée -----------------------------------------------------------------------------------------

  /**
   * `POST /events/:id/tickets/check` : lecture d'un QR de billet par le staff (rôle « scan » ou « super staff ») ou
   * l'organisation. La signature est vérifiée avec les clés publiques ; le billet passe à « utilisé » une seule fois.
   */
  async check(v: Viewer, eventId: string, payload: string): Promise<TicketCheckResult> {
    const e = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, e.structureId, ["scan", "super_staff"], e.id);
    if (!access) throw forbidden("Réservé à l'organisation et au staff d'accueil");
    rateLimit("ticketCheck", v.user.id);
    const trusted = await signing.trustedKeys();
    const verdict = verifyPassPayload(payload.trim(), trusted, ed25519Verify);
    if (!verdict.ok) {
      return { result: "refused", reason: verdict.reason === "malformed" ? "malformed" : "forged" };
    }
    if (verdict.pass.eventNo !== e.eventNo) return { result: "refused", reason: "other_event" };
    const row = await db
      .select({ t: tickets, type: ticketTypes })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .where(and(eq(tickets.id, verdict.pass.passId), eq(tickets.eventId, e.id)))
      .then((r) => r[0]);
    if (!row) return { result: "refused", reason: "unknown" };
    const holder = await db.query.profiles.findFirst({
      where: (p, { eq: same }) => same(p.userId, row.t.userId),
      columns: { pseudo: true },
    });
    const pseudo = holder?.pseudo ?? "—";
    if (row.t.status === "cancelled") return { result: "refused", reason: "cancelled" };
    if (row.t.status === "used") {
      return { result: "already", pseudo, ticketName: row.type.name, usedAt: row.t.usedAt?.toISOString() ?? "" };
    }
    // Passage atomique : deux lecteurs qui scannent en même temps ne valident qu'une fois.
    const [updated] = await db
      .update(tickets)
      .set({ status: "used", usedAt: now(), usedBy: v.user.id })
      .where(and(eq(tickets.id, row.t.id), eq(tickets.status, "valid")))
      .returning();
    if (!updated) {
      const again = await db.query.tickets.findFirst({ where: eq(tickets.id, row.t.id) });
      return {
        result: "already",
        pseudo,
        ticketName: row.type.name,
        usedAt: again?.usedAt?.toISOString() ?? now().toISOString(),
      };
    }
    return { result: "ok", pseudo, ticketName: row.type.name, usedAt: updated.usedAt?.toISOString() ?? "" };
  },

  /** `GET /events/:id/tickets` : liste des billets et compteur d'entrées visiteurs. */
  async holders(v: Viewer, eventId: string): Promise<{ sold: number; used: number; items: TicketHolderRow[] }> {
    const e = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, e.structureId, ["scan", "super_staff"], e.id);
    if (!access) throw forbidden("Réservé à l'organisation et au staff d'accueil");
    const rows = await db
      .select({
        t: tickets,
        o: orders,
        pseudo: sql<string>`(select pseudo from profiles where user_id = ${tickets.userId})`,
      })
      .from(tickets)
      .innerJoin(orders, eq(orders.id, tickets.orderId))
      .where(and(eq(tickets.eventId, e.id), inArray(tickets.status, ["valid", "used"])))
      .orderBy(desc(tickets.usedAt), asc(tickets.issuedAt))
      .limit(500);
    return {
      sold: rows.length,
      used: rows.filter((r) => r.t.status === "used").length,
      items: rows.map(({ t, o, pseudo }) => ({
        id: t.id,
        pseudo: pseudo ?? "—",
        status: t.status,
        usedAt: t.usedAt?.toISOString() ?? null,
        orderPaid: o.status === "paid",
      })),
    };
  },
};

async function structureRow(id: string) {
  const s = await db.query.structures.findFirst({ where: eq(structures.id, id) });
  if (!s) throw notFound("Structure introuvable");
  return s;
}
