// Le Fil (lot R7e1) : publier, relire, retirer, flamme, signaler. Règles métier ici (jamais dans l'écran) :
// - une décision de plaque vraie pour **chaque** photo : des cadres à flouter (floutés par le serveur, irréversible,
//   aucun original gardé) ou « aucune plaque visible » ; sinon 400 `plate_decision_required` ;
// - toutes les photos au format annoncé (4:5 par défaut, 1:1 ou paysage) à 2 % près ;
// - le véhicule est celui de l'auteur, l'événement est public ;
// - la photo envoyée (`POST /me/uploads`, clé privée) n'est rattachée qu'une fois, par son auteur, puis copiée sous la clé
//   publique `feed/<postId>/<hex>.webp`.
import { randomBytes, randomUUID } from "node:crypto";
import {
  type AttachableEventItem,
  aspectMatches,
  FEED_ASPECT_RATIOS,
  FEED_CAPTION_MAX,
  type FeedEventRole,
  type FeedPostCreate,
  type FeedPostPatch,
  type FeedPostView,
  feedLabels,
  type PlateRect,
  partnershipLabels,
  publicationErrors,
  type ReportReason,
  type StoryPersona,
} from "@orasso/shared";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { feedPostPhotos, feedPostReactions, feedPosts, proProfiles, uploads, userFollows } from "../../db/schema";
import { canManagePost, requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, withTx } from "../../lib/tx";
import { moderationService } from "../moderation/service";
import { commercialPartnerFor, notifyPartnerMention } from "../partnerships/commercial";
import { assertProMayPost, lockProPostQuota } from "../pros/service";
import { composeLinkedPost, loadLinked } from "../stories/linked";
import { uploadsService } from "../uploads/service";
import { blurPlateRegions, removeOrRetry } from "../vehicles/photos-blur";
import { hasOpenReport, requireVisiblePost } from "./access";
import {
  type AttachEvent,
  attachableEvents,
  attachEventsByIds,
  deducePostRole,
  eventVisualKey,
  notAttachable,
} from "./attach";
import { pageDepartment } from "./authors";
import { reserveImportant, sendImportant } from "./important";
import { FEED_PHOTO_NAME_RE, feedPhotoKey, loadPostViews, ownActiveVehicle, softDeletePost } from "./posts";

const PAGE = 20;

const sqlState = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code;
};

const encode = (c: { at: string; id: string }) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decode(raw: string | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as { at?: string; id?: string };
    if (typeof c.at !== "string" || Number.isNaN(Date.parse(c.at)) || typeof c.id !== "string") throw new Error();
    if (!/^[0-9a-f-]{36}$/.test(c.id)) throw new Error();
    return { at: new Date(c.at), id: c.id };
  } catch {
    throw validation("Curseur invalide : recharge la liste.");
  }
}

async function ownView(v: Viewer, id: string): Promise<FeedPostView> {
  const [view] = await loadPostViews(db, [id], v.user.id, now());
  if (!view) throw notFound("Publication introuvable");
  return view;
}

/** La publication déjà enregistrée pour ce `clientId` (rejeu d'un envoi), ou `undefined`. */
async function findReplay(ex: Executor, userId: string, clientId: string | null | undefined) {
  if (!clientId) return undefined;
  const [again] = await ex
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(and(eq(feedPosts.authorId, userId), eq(feedPosts.clientId, clientId), isNull(feedPosts.deletedAt)));
  return again?.id;
}

/** Le même envoi (même `clientId`) vient d'être validé par une autre requête : on rend sa publication. */
class Replayed extends Error {
  constructor(readonly id: string) {
    super("replayed");
  }
}

export const feedPostsService = {
  /** `POST /me/feed-posts` */
  async create(v: Viewer, input: FeedPostCreate): Promise<FeedPostView> {
    rateLimit("feedPost", v.user.id);
    const userId = v.user.id;
    // Rejeu d'un envoi dont la réponse s'est perdue : la même publication, rien de plus.
    if (input.clientId) {
      const [again] = await db
        .select({ id: feedPosts.id })
        .from(feedPosts)
        .where(
          and(eq(feedPosts.authorId, userId), eq(feedPosts.clientId, input.clientId), isNull(feedPosts.deletedAt)),
        );
      if (again) return ownView(v, again.id);
    }

    // 0. Au nom de qui : une casquette exige ses droits (403 `persona_forbidden`), la structure le second facteur.
    const persona = input.persona;
    const authorship = await requireAuthorship(v, input);
    // Fiche pro : publiée et abonnement en règle, comme pour une offre (`POST /pros/:id/posts`).
    if (persona === "pro") {
      const [pro] = await db.select().from(proProfiles).where(eq(proProfiles.id, authorship.id));
      if (!pro) throw new AppError(403, "persona_forbidden", publicationErrors.persona_forbidden);
      assertProMayPost(pro);
    }
    if (persona !== "fan" && (input.vehicleId || input.linked?.type === "vehicle" || input.commercialPartnerId)) {
      throw validation(publicationErrors.fanOnly);
    }
    // Légende : 500 caractères pour un passionné, 2 000 pour une casquette (le schéma borne à 2 000).
    if (persona === "fan" && (input.caption?.length ?? 0) > FEED_CAPTION_MAX) {
      throw validation(publicationErrors.captionTooLong, { field: "caption" });
    }

    // 1. Une décision de plaque par photo, avant tout le reste (le message dit laquelle manque).
    const decisions = input.photos.map((p) => ({
      rects: (p.plateRects ?? []) as PlateRect[],
      confirmed: p.noPlateConfirmed === true,
    }));
    const missing = decisions.findIndex((d) => d.rects.length === 0 && !d.confirmed);
    if (missing >= 0) {
      throw new AppError(400, "plate_decision_required", feedLabels.plateDecision, { photoIndex: missing });
    }

    // 2. Véhicule (le sien, actif) et événement. Une carte partagée (R7f4) donne elle-même son véhicule ou son événement.
    const linkedContent = input.linked ? await loadLinked(v, input.linked.type, input.linked.id) : null;
    const vehicleId = linkedContent?.type === "vehicle" ? linkedContent.id : (input.vehicleId ?? null);
    const eventId = linkedContent?.type === "event" ? linkedContent.id : (input.eventId ?? null);
    if (vehicleId && !(await ownActiveVehicle(db, userId, vehicleId))) {
      throw validation("Véhicule introuvable dans ton garage");
    }
    // Rattachement : le rôle est **déduit** des droits, jamais reçu. Casquette : événement non rattachable → 422 ;
    // passionné : accepté sans rôle (l'APK en ligne envoie n'importe quel événement public ; ni verbe, ni mention).
    const at = now();
    let event: AttachEvent | undefined;
    let eventRole: FeedEventRole | null = null;
    if (eventId) {
      event = (await attachEventsByIds(db, [eventId])).get(eventId);
      if (persona === "fan") {
        if (event?.status !== "published") throw validation("Événement introuvable");
      } else if (!event) {
        throw notAttachable(publicationErrors.event_not_attachable);
      }
      if (event) {
        eventRole = await deducePostRole(
          db,
          { userId, persona, pageId: authorship.kind === "user" ? null : authorship.id, event },
          at,
        );
      }
      if (persona !== "fan" && !eventRole) throw notAttachable(publicationErrors.event_not_attachable);
    }
    // Visuel (T1, Damien 11/11) : une photo ou une carte ; sinon seulement une publication rattachée (rôle déduit), avec
    // une légende, dont l'événement a une affiche : elle prend l'affiche (une référence, jamais une copie).
    if (!input.photos.length && !linkedContent) {
      const ok = event && eventRole && input.caption && eventVisualKey(event);
      if (!ok) throw new AppError(400, "photo_required", publicationErrors.photo_required);
    }
    // « Info importante » : la casquette organisateur, pour un événement de sa structure.
    if (input.important && !(persona === "organizer" && event && eventRole === "organizer")) {
      throw new AppError(400, "important_requires_event", publicationErrors.important_requires_event);
    }

    // « Collaboration commerciale » (R7m2) : posée par l'API d'après la légende (`@<slug>`) et le choix explicite, pour une
    // publication personnelle seulement.
    const commercialPartnerId =
      persona !== "fan"
        ? null
        : ((
            await commercialPartnerFor(db, {
              authorId: userId,
              tagProIds: [],
              caption: input.caption,
              explicit: input.commercialPartnerId,
            })
          )?.proId ?? null);
    const department =
      persona === "fan"
        ? (v.profile.departments[0] ?? "")
        : ((await pageDepartment(db, authorship)) ?? event?.department ?? "");

    // 3. Les fichiers envoyés : à moi, pour cet usage, pas encore rattachés, au bon format.
    const keys = input.photos.map((p) => p.uploadKey);
    const rows = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.userId, userId), eq(uploads.purpose, "feed_post"), isNull(uploads.consumedAt)));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const key of keys) {
      if (!byKey.has(key)) {
        // Le même envoi vient peut-être d'être validé par une autre requête qui a consommé ces photos.
        const again = await findReplay(db, userId, input.clientId);
        if (again) return ownView(v, again);
        throw validation("Photo inconnue ou déjà utilisée : envoie-la à nouveau.");
      }
    }
    for (const key of keys) {
      const u = byKey.get(key);
      if (u && !aspectMatches(input.aspect, u.width, u.height)) {
        throw validation(
          `Une photo n'a pas le format ${input.aspect === "portrait_4_5" ? "4:5" : input.aspect === "square" ? "1:1" : "paysage"} (${FEED_ASPECT_RATIOS[input.aspect]} ± 2 %).`,
        );
      }
    }

    // 4. Floutage et copie sous la clé publique, hors transaction (aucune écriture de fichier sous verrou).
    const postId = randomUUID();
    const written: string[] = [];
    const photos: {
      key: string;
      width: number;
      height: number;
      blurred: boolean;
      confirmed: boolean;
      /** Absent pour une carte rendue par l'API (aucun fichier envoyé). */
      uploadKey: string | null;
    }[] = [];
    try {
      for (const [index, p] of input.photos.entries()) {
        const source = await storage.get(p.uploadKey);
        if (!source) {
          const again = await findReplay(db, userId, input.clientId);
          if (again) throw new Replayed(again);
          throw validation("Photo introuvable : envoie-la à nouveau.");
        }
        const d = decisions[index] as (typeof decisions)[number];
        const out = d.rects.length
          ? await blurPlateRegions(source, d.rects)
          : {
              data: source,
              info: {
                width: (byKey.get(p.uploadKey) as { width: number }).width,
                height: (byKey.get(p.uploadKey) as { height: number }).height,
              },
            };
        const key = feedPhotoKey(postId, randomBytes(16).toString("hex"));
        await storage.put(key, out.data);
        written.push(key);
        photos.push({
          key,
          width: out.info.width,
          height: out.info.height,
          blurred: d.rects.length > 0,
          // Les cadres floutés valent décision : « aucune plaque » n'est posé que sans cadre.
          confirmed: d.rects.length === 0,
          uploadKey: p.uploadKey,
        });
      }

      // Carte partagée : l'API rend le 4:5 elle-même (image déjà masquée : plaque floutée ou « aucune plaque »).
      if (linkedContent) {
        const png = await composeLinkedPost(linkedContent);
        const webp = await sharp(png).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        const key = feedPhotoKey(postId, randomBytes(16).toString("hex"));
        await storage.put(key, webp.data);
        written.push(key);
        photos.push({
          key,
          width: webp.info.width,
          height: webp.info.height,
          blurred: linkedContent.plate === "blurred",
          confirmed: linkedContent.plate === "none_confirmed",
          uploadKey: null,
        });
      }

      // 5. Une transaction : rattacher les fichiers (une seule fois), écrire la publication et ses photos.
      await withTx(async (tx, after) => {
        // « Info importante » : le plafond se compte sous verrou, dans cette transaction, avant d'écrire la publication.
        // Sous chaque verrou, on cherche de nouveau le `clientId` : deux envois simultanés du même identifiant rendent la
        // même publication au lieu d'un faux refus de plafond.
        const replayed = async () => {
          if (!input.clientId) return;
          const [again] = await tx
            .select({ id: feedPosts.id })
            .from(feedPosts)
            .where(
              and(eq(feedPosts.authorId, userId), eq(feedPosts.clientId, input.clientId), isNull(feedPosts.deletedAt)),
            );
          if (again) throw new Replayed(again.id);
        };
        // Fiche pro : même limite mensuelle et même verrou que `POST /pros/:id/posts`.
        const proAt = persona === "pro" ? await lockProPostQuota(tx, authorship.id, replayed) : null;
        if (input.important && event) await reserveImportant(tx, event.id, at, replayed);
        for (const p of photos) {
          if (p.uploadKey && !(await uploadsService.consume(tx, userId, p.uploadKey, "feed_post"))) {
            const again = await findReplay(tx, userId, input.clientId);
            if (again) throw new Replayed(again);
            throw validation("Photo déjà utilisée : envoie-la à nouveau.");
          }
        }
        await tx.insert(feedPosts).values({
          id: postId,
          authorId: userId,
          caption: input.caption,
          vehicleId,
          eventId,
          aspect: linkedContent ? "portrait_4_5" : input.aspect,
          department,
          clientId: input.clientId ?? null,
          commercialPartnerId,
          persona,
          // Fiche pro : l'instant pris sous le verrou, celui-là même qui a servi à compter le mois (horloge de
          // l'application, comme les offres) : le comptage et l'insertion ne peuvent pas tomber dans deux mois.
          ...(proAt ? { createdAt: proAt } : {}),
          structureId: authorship.kind === "structure" ? authorship.id : null,
          proId: authorship.kind === "pro" ? authorship.id : null,
          providerId: authorship.kind === "provider" ? authorship.id : null,
          mediaId: authorship.kind === "media" ? authorship.id : null,
          eventRole,
          // Le lieu libre ne vaut que sans événement (sinon c'est la ville de l'événement).
          placeLabel: eventId ? null : (input.placeLabel ?? null),
          importantReason: input.important?.reason ?? null,
        });
        if (photos.length) {
          await tx.insert(feedPostPhotos).values(
            photos.map((p, position) => ({
              postId,
              storageKey: p.key,
              width: p.width,
              height: p.height,
              position,
              plateBlurred: p.blurred,
              noPlateConfirmed: p.confirmed,
            })),
          );
        }
        if (input.important && event) {
          await sendImportant(tx, after, {
            postId,
            authorUserId: userId,
            reason: input.important.reason,
            caption: input.caption ?? null,
            now: at,
            event,
          });
        }
        if (commercialPartnerId) {
          await notifyPartnerMention(tx, {
            proId: commercialPartnerId,
            authorUserId: userId,
            kind: "post",
            // Le titulaire ne voit la publication que d'un compte public, ou qu'il suit (règle du Fil).
            sees: async (ownerId) =>
              v.profile.visibility !== "private" ||
              Boolean(
                (
                  await tx
                    .select({ id: userFollows.followerId })
                    .from(userFollows)
                    .where(
                      and(
                        eq(userFollows.followerId, ownerId),
                        eq(userFollows.followedId, userId),
                        eq(userFollows.status, "accepted"),
                      ),
                    )
                )[0],
              ),
            actor: { userId, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) },
            // Aucune page ne montre une seule publication : le lien ouvre le Fil, la publication est dans `postId`.
            data: { postId, link: "/app/fil" },
          });
        }
      });
    } catch (error) {
      for (const key of written) await removeOrRetry(key);
      if (error instanceof Replayed) return ownView(v, error.id);
      // Deux envois simultanés du même `clientId` : le second rend la publication du premier.
      if (input.clientId && sqlState(error) === "23505") {
        const [again] = await db
          .select({ id: feedPosts.id })
          .from(feedPosts)
          .where(and(eq(feedPosts.authorId, userId), eq(feedPosts.clientId, input.clientId)));
        if (again) return ownView(v, again.id);
      }
      if (sqlState(error) === "23505" || sqlState(error) === "40P01") {
        throw new AppError(409, "conflict", "Quelqu'un vient de faire la même chose : réessaie.");
      }
      throw error;
    }
    // Les envois (privés) ont été copiés : on les efface (leurs lignes restent, rattachées).
    for (const p of photos) if (p.uploadKey) await removeOrRetry(p.uploadKey);
    return ownView(v, postId);
  },

  /**
   * `PATCH /me/feed-posts/:id` `{ commercialPartnerId: null }` : retirer la mention « Collaboration commerciale ». Une
   * publication qui la porte la garde TOUJOURS (partenariat actif ou fini : un contenu publié garde sa mention) : 409
   * `commercial_locked`. Sans mention, rien à retirer : la publication est rendue telle quelle.
   */
  async patch(v: Viewer, id: string, _input: FeedPostPatch): Promise<FeedPostView> {
    rateLimit("feedWrite", v.user.id);
    const [post] = await db
      .select({
        authorId: feedPosts.authorId,
        persona: feedPosts.persona,
        structureId: feedPosts.structureId,
        proId: feedPosts.proId,
        providerId: feedPosts.providerId,
        mediaId: feedPosts.mediaId,
        deletedAt: feedPosts.deletedAt,
        commercial: feedPosts.commercialPartnerId,
      })
      .from(feedPosts)
      .where(eq(feedPosts.id, id));
    if (!post || post.deletedAt || !(await canManagePost(v, post))) throw notFound("Publication introuvable");
    if (post.commercial) {
      throw new AppError(409, "commercial_locked", partnershipLabels.errors.commercial_locked);
    }
    return ownView(v, id);
  },

  /** `GET /feed-posts/:id` : le regard de la personne (404 si elle ne peut pas la voir). */
  async get(v: Viewer, id: string): Promise<FeedPostView> {
    rateLimit("feedRead", v.user.id);
    await requireVisiblePost(v, id);
    return ownView(v, id);
  },

  /**
   * `GET /feed-posts/:id/photos/:nom` : une photo, à qui peut voir la publication **à cet instant** (session, auteur en
   * règle, compte privé suivi, publication non retirée), vérifié à chaque lecture. La clé est privée (jamais servie par
   * `/api/files`). Le navigateur revalide à chaque affichage (`ETag`) : une révocation prend effet, un 304 reste léger.
   */
  async photo(
    v: Viewer,
    id: string,
    name: string,
    ifNoneMatch: string | undefined,
  ): Promise<{ status: 304; etag: string } | { status: 200; etag: string; data: Buffer }> {
    if (!FEED_PHOTO_NAME_RE.test(name)) throw notFound("Photo introuvable");
    await requireVisiblePost(v, id);
    const key = feedPhotoKey(id, name.slice(0, -".webp".length));
    const [known] = await db
      .select({ id: feedPostPhotos.id })
      .from(feedPostPhotos)
      .where(and(eq(feedPostPhotos.postId, id), eq(feedPostPhotos.storageKey, key)));
    if (!known) throw notFound("Photo introuvable");
    // Le fichier ne change jamais sous une même clé : son nom suffit comme empreinte (pas de lecture pour un 304).
    const etag = `"${name.slice(0, -".webp".length)}"`;
    const sent = (ifNoneMatch ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
    if (sent.includes(etag)) return { status: 304, etag };
    const data = await storage.get(key);
    if (!data) throw notFound("Photo introuvable");
    return { status: 200, etag, data };
  },

  /** `GET /me/feed-posts/attachable-events` : les événements rattachables pour cette casquette (50 au plus). */
  async attachable(
    v: Viewer,
    q: { persona: StoryPersona; structureId?: string; proId?: string },
  ): Promise<{ items: AttachableEventItem[] }> {
    rateLimit("feedRead", v.user.id);
    const authorship = await requireAuthorship(v, q);
    return {
      items: await attachableEvents(
        db,
        v.user.id,
        { persona: q.persona, pageId: authorship.kind === "user" ? null : authorship.id },
        now(),
      ),
    };
  },

  /**
   * `GET /me/feed-posts/by-client/:clientId` (R8p, tour 3) : la publication que **cet auteur** a envoyée avec cet identifiant,
   * quelle que soit la casquette (même règle que le contrôle de rejeu de `create`), ou 404. Jamais celle d'un autre compte.
   */
  async byClient(v: Viewer, clientId: string): Promise<FeedPostView> {
    rateLimit("feedRead", v.user.id);
    const id = await findReplay(db, v.user.id, clientId);
    if (!id) throw notFound("Publication introuvable");
    return ownView(v, id);
  },

  /** `GET /me/feed-posts?cursor=` : mes publications, les plus récentes d'abord. */
  async mine(v: Viewer, cursor: string | undefined): Promise<{ items: FeedPostView[]; nextCursor: string | null }> {
    rateLimit("feedRead", v.user.id);
    const after = decode(cursor);
    // Le curseur porte des millisecondes (JavaScript) : on compare et on trie à la milliseconde, pas à la microseconde de
    // PostgreSQL, sinon des publications de la même milliseconde seraient sautées entre deux pages.
    const at = sql<Date>`date_trunc('milliseconds', ${feedPosts.createdAt})`;
    const rows = await db
      .select({ id: feedPosts.id, createdAt: at.mapWith(feedPosts.createdAt) })
      .from(feedPosts)
      .where(
        and(
          eq(feedPosts.authorId, v.user.id),
          // Mes publications personnelles : celles d'une page sont sur la page, jamais mêlées aux miennes.
          eq(feedPosts.persona, "fan"),
          isNull(feedPosts.deletedAt),
          after ? or(sql`${at} < ${after.at}`, and(sql`${at} = ${after.at}`, lt(feedPosts.id, after.id))) : undefined,
        ),
      )
      .orderBy(desc(at), desc(feedPosts.id))
      .limit(PAGE + 1);
    const page = rows.slice(0, PAGE);
    const last = page.at(-1);
    return {
      items: await loadPostViews(
        db,
        page.map((r) => r.id),
        v.user.id,
        now(),
      ),
      nextCursor: rows.length > PAGE && last ? encode({ at: last.createdAt.toISOString(), id: last.id }) : null,
    };
  },

  /** `DELETE /me/feed-posts/:id` : l'auteur retire sa publication (photos effacées, sauf signalement en attente). */
  async remove(v: Viewer, id: string): Promise<void> {
    rateLimit("feedWrite", v.user.id);
    const keys = await withTx(async (tx) => {
      const [post] = await tx
        .select({
          id: feedPosts.id,
          authorId: feedPosts.authorId,
          persona: feedPosts.persona,
          structureId: feedPosts.structureId,
          proId: feedPosts.proId,
          providerId: feedPosts.providerId,
          mediaId: feedPosts.mediaId,
          deletedAt: feedPosts.deletedAt,
        })
        .from(feedPosts)
        .where(eq(feedPosts.id, id))
        .for("update");
      // Une publication de page se retire au nom de la page (mêmes droits que pour publier), jamais par le seul `author_id`.
      if (!post || post.deletedAt || !(await canManagePost(v, post, tx))) throw notFound("Publication introuvable");
      // Un signalement attend sa décision : l'auteur retire sa publication (elle disparaît du Fil), mais les photos restent
      // pour la modération, qui les efface à sa décision.
      return softDeletePost(tx, id, v.user.id, now(), { keepPhotos: await hasOpenReport(tx, id) });
    });
    for (const key of keys) await removeOrRetry(key);
  },

  /** `PUT|DELETE /feed-posts/:id/reaction` : la flamme (idempotent). */
  async react(v: Viewer, id: string, on: boolean): Promise<{ reactionsCount: number; reactedByMe: boolean }> {
    rateLimit("feedReact", v.user.id);
    return withTx(async (tx) => {
      const row = await requireVisiblePost(v, id, tx);
      // Verrou de la publication : les compteurs ne se perdent pas à deux flammes simultanées.
      const [locked] = await tx
        .select({ n: feedPosts.reactionsCount, deletedAt: feedPosts.deletedAt })
        .from(feedPosts)
        .where(eq(feedPosts.id, row.post.id))
        .for("update");
      if (!locked || locked.deletedAt) throw notFound("Publication introuvable");
      let count = locked.n;
      if (on) {
        const inserted = await tx
          .insert(feedPostReactions)
          .values({ postId: row.post.id, userId: v.user.id })
          .onConflictDoNothing()
          .returning({ id: feedPostReactions.postId });
        if (inserted.length) count += 1;
      } else {
        const removed = await tx
          .delete(feedPostReactions)
          .where(and(eq(feedPostReactions.postId, row.post.id), eq(feedPostReactions.userId, v.user.id)))
          .returning({ id: feedPostReactions.postId });
        if (removed.length) count = Math.max(0, count - 1);
      }
      if (count !== locked.n)
        await tx.update(feedPosts).set({ reactionsCount: count }).where(eq(feedPosts.id, row.post.id));
      return { reactionsCount: count, reactedByMe: on };
    });
  },

  /** `POST /feed-posts/:id/report` : un signalement (cible `feed_post`), comme les autres contenus. */
  async report(
    v: Viewer,
    id: string,
    input: { reason: ReportReason; details: string | null },
  ): Promise<{ id: string }> {
    const created = await moderationService.create(v, {
      targetType: "feed_post",
      targetId: id,
      reason: input.reason,
      details: input.details,
      screenshotKey: null,
    });
    return { id: created.id };
  },
};
