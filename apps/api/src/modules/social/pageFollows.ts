// Abonnements d'une casquette (vague R9, lot R9a, ARCHITECTURE-R8 § 1.7, § 2.9, § 6 T6 et T14).
//
// `page_follows` porte (a) tout abonnement dont le suiveur est une **page** (structure, fiche pro, prestataire, média) et
// (b) une **personne** qui suit un prestataire ou un média. Les trois tables d'origine (`user_follows`, `structure_follows`,
// `pro_follows`) ne changent pas ; `followSets` les réunit.
//
// Défauts appliqués, pas encore confirmés par Damien (isolés ici pour qu'un changement soit simple) :
// - T6 : une page ne suit que des pages et des comptes **publics** (règle pure `canFollow`, relue à chaque lecture : un
//   compte passé en privé sort tout seul, et ses lignes sont supprimées dans la transaction du passage en privé) ;
// - T14 : quand une page suit un passionné, celui-ci n'est **ni prévenu ni crédité d'un abonné de plus**, et la page n'entre
//   pas dans sa liste d'abonnés (`countsOf` et les listes de `follows.ts` ne lisent que `user_follows`). Aucune notification
//   à la création, pour aucune cible : les structures et les pros n'en reçoivent pas non plus aujourd'hui.
import {
  type AuthorKey,
  type AuthorKind,
  authorKeyOf,
  canFollow,
  type FollowTarget,
  type PageFollowResult,
  type PageFollowState,
  pageFollowErrors,
  parseAuthorKey,
} from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  mediaProfiles,
  pageFollows,
  proFollows,
  profiles,
  proProfiles,
  providerProfiles,
  structureFollows,
  structures,
  userFollows,
} from "../../db/schema";
import { type Actor, isPageActor } from "../../lib/actor";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import type { Executor, Tx } from "../../lib/tx";
import { profilesRepo } from "../profiles/repo";

/** Ce que suit un acteur, par genre : des identifiants (compte pour `users`, UUID de la page pour les autres). */
export type FollowSets = {
  users: Set<string>;
  structures: Set<string>;
  pros: Set<string>;
  providers: Set<string>;
  medias: Set<string>;
};

const emptySets = (): FollowSets => ({
  users: new Set(),
  structures: new Set(),
  pros: new Set(),
  providers: new Set(),
  medias: new Set(),
});

const SET_OF: Record<AuthorKind, keyof FollowSets> = {
  user: "users",
  structure: "structures",
  pro: "pros",
  provider: "providers",
  media: "medias",
};

// --- « En règle » : la même définition pour une cible, un suiveur, un compteur ---------------------------------------

/**
 * Condition SQL « ce genre et cet identifiant sont en règle » : compte ni supprimé, ni banni, ni suspendu ; structure ni
 * supprimée ni suspendue ; fiche pro publiée ; prestataire ou média non supprimé. `kind` et `id` sont des fragments SQL
 * (colonnes d'un alias). Les identifiants de page sont des UUID : le `::uuid` n'est évalué que dans sa branche.
 */
const standingSql = (kind: ReturnType<typeof sql.raw>, id: ReturnType<typeof sql.raw>, at: Date) => sql`(case ${kind}
  when 'user' then exists (select 1 from profiles p where p.user_id = ${id} and p.deleted_at is null
    and p.banned_at is null and (p.suspended_until is null or p.suspended_until <= ${at}))
  when 'structure' then exists (select 1 from structures s where s.id = ${id}::uuid and s.deleted_at is null
    and s.verification <> 'suspended')
  when 'pro' then exists (select 1 from pro_profiles x where x.id = ${id}::uuid and x.deleted_at is null
    and x.published_at is not null)
  when 'provider' then exists (select 1 from provider_profiles x where x.id = ${id}::uuid and x.deleted_at is null)
  when 'media' then exists (select 1 from media_profiles x where x.id = ${id}::uuid and x.deleted_at is null)
  else false end)`;

const FOLLOWER_STANDING = (at: Date) => standingSql(sql.raw("pf.follower_kind"), sql.raw("pf.follower_id"), at);
const TARGET_STANDING = (at: Date) => standingSql(sql.raw("pf.target_kind"), sql.raw("pf.target_id"), at);

const rowsOf = <T>(res: unknown): T[] => (res as { rows: T[] }).rows;

// --- Ce que suit un acteur -------------------------------------------------------------------------------------------

/**
 * Les abonnements d'un acteur.
 * - **Moi** : mes personnes (acceptées), structures et pros des trois tables, **plus** mes lignes `page_follows`
 *   (prestataires et médias).
 * - **Une page** : ses lignes `page_follows`, **filtrées à la lecture** : cible en règle et, pour une personne, compte
 *   public (un compte passé en privé sort tout seul).
 */
export async function followSets(actor: Actor, at: Date = now(), ex: Executor = db): Promise<FollowSets> {
  const out = emptySets();
  if (!isPageActor(actor)) {
    const [u, s, p, rows] = await Promise.all([
      ex
        .select({ id: userFollows.followedId })
        .from(userFollows)
        .where(and(eq(userFollows.followerId, actor.id), eq(userFollows.status, "accepted"))),
      ex
        .select({ id: structureFollows.structureId })
        .from(structureFollows)
        .where(eq(structureFollows.userId, actor.id)),
      ex.select({ id: proFollows.proId }).from(proFollows).where(eq(proFollows.userId, actor.id)),
      ex
        .select({ kind: pageFollows.targetKind, id: pageFollows.targetId })
        .from(pageFollows)
        .where(and(eq(pageFollows.followerKind, "user"), eq(pageFollows.followerId, actor.id))),
    ]);
    for (const r of u) out.users.add(r.id);
    for (const r of s) out.structures.add(r.id);
    for (const r of p) out.pros.add(r.id);
    for (const r of rows) out[SET_OF[r.kind]].add(r.id);
    return out;
  }
  const res = await ex.execute(sql`
    select pf.target_kind as kind, pf.target_id as id from page_follows pf
    where pf.follower_kind = ${actor.kind} and pf.follower_id = ${actor.id}
      and ${TARGET_STANDING(at)}
      and (pf.target_kind <> 'user' or exists (
        select 1 from profiles p where p.user_id = pf.target_id and p.visibility = 'public'))`);
  for (const r of rowsOf<{ kind: AuthorKind; id: string }>(res)) out[SET_OF[r.kind]].add(r.id);
  return out;
}

/** Est-ce que cet acteur suit cette cible ? Moi : la table d'origine du genre ; une page : `page_follows`. */
export async function isFollowingAs(
  actor: Actor,
  target: { kind: AuthorKind; id: string },
  ex: Executor = db,
): Promise<boolean> {
  if (!isPageActor(actor)) {
    if (target.kind === "user") {
      const [r] = await ex
        .select({ id: userFollows.followedId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, actor.id),
            eq(userFollows.followedId, target.id),
            eq(userFollows.status, "accepted"),
          ),
        );
      return Boolean(r);
    }
    if (target.kind === "structure") {
      const [r] = await ex
        .select({ id: structureFollows.structureId })
        .from(structureFollows)
        .where(and(eq(structureFollows.userId, actor.id), eq(structureFollows.structureId, target.id)));
      return Boolean(r);
    }
    if (target.kind === "pro") {
      const [r] = await ex
        .select({ id: proFollows.proId })
        .from(proFollows)
        .where(and(eq(proFollows.userId, actor.id), eq(proFollows.proId, target.id)));
      return Boolean(r);
    }
  }
  const [r] = await ex
    .select({ id: pageFollows.targetId })
    .from(pageFollows)
    .where(
      and(
        eq(pageFollows.followerKind, actor.kind),
        eq(pageFollows.followerId, actor.id),
        eq(pageFollows.targetKind, target.kind),
        eq(pageFollows.targetId, target.id),
      ),
    );
  return Boolean(r);
}

// --- Compteurs -------------------------------------------------------------------------------------------------------

/**
 * Les abonnés d'une cible venus de `page_follows` (suiveurs en règle seulement). Pour une structure ou un pro : les pages
 * qui la suivent, à ajouter aux personnes des tables d'origine. Pour un prestataire ou un média : les personnes et les
 * pages. Jamais appelé pour un passionné (T14 : son compteur ne bouge pas).
 */
export async function pageFollowerCounts(
  kind: Exclude<AuthorKind, "user">,
  ids: readonly string[],
  at: Date = now(),
  ex: Executor = db,
): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const res = await ex.execute(sql`
    select pf.target_id as id, count(*)::int as n from page_follows pf
    where pf.target_kind = ${kind} and pf.target_id = any(${sql.param([...ids])}::text[])
      and ${FOLLOWER_STANDING(at)}
    group by pf.target_id`);
  return new Map(rowsOf<{ id: string; n: number }>(res).map((r) => [r.id, r.n]));
}

export async function pageFollowerCount(
  kind: Exclude<AuthorKind, "user">,
  id: string,
  at: Date = now(),
  ex: Executor = db,
): Promise<number> {
  return (await pageFollowerCounts(kind, [id], at, ex)).get(id) ?? 0;
}

/** Décoration d'une page de prestataire ou de média : ses abonnés et « je suis » pour l'acteur. Deux requêtes. */
export async function pageFollowState(
  actor: Actor,
  target: { kind: "provider" | "media"; id: string },
  at: Date = now(),
  ex: Executor = db,
): Promise<PageFollowState> {
  const [followersCount, isFollowing] = await Promise.all([
    pageFollowerCount(target.kind, target.id, at, ex),
    isFollowingAs(actor, target, ex),
  ]);
  return { followersCount, isFollowing };
}

// --- Écrire ----------------------------------------------------------------------------------------------------------

type Loaded = FollowTarget & { holderUserId: string | null };

/** La cible : en règle ou non, confidentialité d'un compte, compte qui tient la page ; `null` si elle n'existe pas. */
async function loadTarget(kind: AuthorKind, id: string, at: Date, ex: Executor): Promise<Loaded | null> {
  if (kind === "user") {
    const [p] = await ex
      .select({
        visibility: profiles.visibility,
        deletedAt: profiles.deletedAt,
        bannedAt: profiles.bannedAt,
        suspendedUntil: profiles.suspendedUntil,
      })
      .from(profiles)
      .where(eq(profiles.userId, id));
    if (!p) return null;
    const available = !p.deletedAt && !p.bannedAt && !(p.suspendedUntil && p.suspendedUntil > at);
    return { kind, id, available, visibility: p.visibility, holderUserId: id };
  }
  if (kind === "structure") {
    const [s] = await ex
      .select({ deletedAt: structures.deletedAt, verification: structures.verification })
      .from(structures)
      .where(eq(structures.id, id));
    return s ? { kind, id, available: !s.deletedAt && s.verification !== "suspended", holderUserId: null } : null;
  }
  if (kind === "pro") {
    const [p] = await ex
      .select({
        deletedAt: proProfiles.deletedAt,
        publishedAt: proProfiles.publishedAt,
        owner: proProfiles.ownerUserId,
      })
      .from(proProfiles)
      .where(eq(proProfiles.id, id));
    return p ? { kind, id, available: !p.deletedAt && p.publishedAt !== null, holderUserId: p.owner } : null;
  }
  if (kind === "provider") {
    const [p] = await ex
      .select({ deletedAt: providerProfiles.deletedAt, owner: providerProfiles.userId })
      .from(providerProfiles)
      .where(eq(providerProfiles.id, id));
    return p ? { kind, id, available: !p.deletedAt, holderUserId: p.owner } : null;
  }
  const [m] = await ex
    .select({ deletedAt: mediaProfiles.deletedAt, owner: mediaProfiles.userId })
    .from(mediaProfiles)
    .where(eq(mediaProfiles.id, id));
  return m ? { kind, id, available: !m.deletedAt, holderUserId: m.owner } : null;
}

/** Le refus de la règle pure, rendu en erreur de l'API. */
function refusal(code: ReturnType<typeof canFollow>): AppError | null {
  switch (code) {
    case null:
      return null;
    case "self":
      return validation(pageFollowErrors.selfFollow);
    case "existing_route":
      return validation(pageFollowErrors.existingRoute);
    case "private_account":
      return new AppError(422, "follow_private_account", pageFollowErrors.privateAccount);
    default:
      return notFound(pageFollowErrors.notFound);
  }
}

/** `u: s: p:` pour moi : les routes existantes (400) ; la clé doit être lisible, sinon 400 aussi. */
function targetKeyOf(raw: string): AuthorKey {
  const key = parseAuthorKey(raw);
  if (!key) throw validation(pageFollowErrors.invalidTarget);
  return key;
}

export const pageFollowsService = {
  /**
   * `PUT /me/page-follows/:targetKey` et les routes « suivre » existantes quand l'en-tête désigne une page : idempotent.
   * Page → toute cible permise par `canFollow` ; moi → un prestataire ou un média. Aucune notification (T14).
   */
  async follow(v: Viewer, actor: Actor, raw: string): Promise<PageFollowResult> {
    rateLimit("pageFollow", v.user.id);
    const key = targetKeyOf(raw);
    // Moi → `u: s: p:` : le message qui renvoie aux routes existantes, avant de dire si la cible existe.
    if (!isPageActor(actor) && key.kind !== "provider" && key.kind !== "media") {
      throw validation(pageFollowErrors.existingRoute);
    }
    const at = now();
    const target = await loadTarget(key.kind, key.id, at, db);
    if (!target) throw notFound(pageFollowErrors.notFound);
    const sameAccount = isPageActor(actor)
      ? key.kind === "user" && key.id === v.user.id
      : target.holderUserId === v.user.id;
    const denied = refusal(canFollow({ kind: actor.kind, id: actor.id }, { ...target, sameAccount }));
    if (denied) throw denied;
    await db
      .insert(pageFollows)
      .values({ followerKind: actor.kind, followerId: actor.id, targetKind: key.kind, targetId: key.id, createdAt: at })
      .onConflictDoNothing();
    return { following: true, followersCount: await followersCountOf(key, at) };
  },

  /** `DELETE /me/page-follows/:targetKey` : toujours possible (la cible peut avoir disparu), idempotent. */
  async unfollow(v: Viewer, actor: Actor, raw: string): Promise<PageFollowResult> {
    rateLimit("pageFollow", v.user.id);
    const key = targetKeyOf(raw);
    if (!isPageActor(actor) && key.kind !== "provider" && key.kind !== "media") {
      throw validation(pageFollowErrors.existingRoute);
    }
    await db
      .delete(pageFollows)
      .where(
        and(
          eq(pageFollows.followerKind, actor.kind),
          eq(pageFollows.followerId, actor.id),
          eq(pageFollows.targetKind, key.kind),
          eq(pageFollows.targetId, key.id),
        ),
      );
    return { following: false, followersCount: await followersCountOf(key, now()) };
  },
};

/**
 * Le nombre d'abonnés rendu avec la réponse : pour un prestataire, un média, une structure ou un pro, ceux de
 * `page_follows` plus les personnes des tables d'origine ; pour un compte, celui de `countsOf` (T14 : une page ne l'augmente
 * pas) — la route n'en rend pas d'autre que `followersCount` de `user_follows`.
 */
async function followersCountOf(key: AuthorKey, at: Date): Promise<number> {
  if (key.kind === "user") {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(and(eq(userFollows.followedId, key.id), eq(userFollows.status, "accepted")));
    return r?.n ?? 0;
  }
  const pages = await pageFollowerCount(key.kind, key.id, at);
  if (key.kind === "structure") {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(structureFollows)
      .where(eq(structureFollows.structureId, key.id));
    return (r?.n ?? 0) + pages;
  }
  if (key.kind === "pro") {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(proFollows).where(eq(proFollows.proId, key.id));
    return (r?.n ?? 0) + pages;
  }
  return pages;
}

// --- Disparitions ----------------------------------------------------------------------------------------------------

/**
 * Compte supprimé : ses lignes `page_follows` partent dans les deux sens (`u:<compte>` suiveur ou cible), et celles de ses
 * pages de prestataire et de média (suiveuses ou suivies). Appelé par `accountService.anonymize`, dans sa transaction.
 */
export async function anonymizePageFollowsForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`
    delete from page_follows
    where (follower_kind = 'user' and follower_id = ${userId})
       or (target_kind = 'user' and target_id = ${userId})
       or (follower_kind = 'provider' and follower_id in (select id::text from provider_profiles where user_id = ${userId}))
       or (target_kind = 'provider' and target_id in (select id::text from provider_profiles where user_id = ${userId}))
       or (follower_kind = 'media' and follower_id in (select id::text from media_profiles where user_id = ${userId}))
       or (target_kind = 'media' and target_id in (select id::text from media_profiles where user_id = ${userId}))`);
}

/**
 * Un compte qui passe en **privé** : les pages qui le suivaient ne le suivent plus (T6), dans la même transaction que le
 * changement de réglage (seule une page peut suivre un compte : la base l'impose). Rien n'est servi entre-temps : `followSets` relit la confidentialité.
 */
export async function dropPageFollowsOfPrivateAccount(tx: Executor, userId: string): Promise<void> {
  await tx.delete(pageFollows).where(and(eq(pageFollows.targetKind, "user"), eq(pageFollows.targetId, userId)));
}

// --- Les routes « suivre » existantes, avec l'en-tête d'une page ----------------------------------------------------

/**
 * `POST|DELETE /users/:pseudo/follow` avec l'en-tête d'une page : jamais un abonnement personnel pris par mégarde, la ligne
 * va dans `page_follows` par le même service. Réponse de la route d'origine (`{ mine }`) : « accepté » ou « aucun » ;
 * un compte privé est refusé (422) et une page n'a jamais de demande en attente (T6).
 */
export async function followUserAsPage(
  v: Viewer,
  actor: Actor,
  pseudo: string,
  on: boolean,
): Promise<{ mine: "accepted" | "none" }> {
  const target = await profilesRepo.byPseudo(pseudo);
  if (!target) throw notFound(pageFollowErrors.notFound);
  const key = authorKeyOf("user", target.userId);
  if (on) await pageFollowsService.follow(v, actor, key);
  else await pageFollowsService.unfollow(v, actor, key);
  return { mine: on ? "accepted" : "none" };
}

/** `POST|DELETE /structures/:id/follow` et `/pros/:id/follow` avec l'en-tête d'une page. */
export async function followPageAsPage(
  v: Viewer,
  actor: Actor,
  target: { kind: "structure" | "pro"; id: string },
  on: boolean,
): Promise<void> {
  const key = authorKeyOf(target.kind, target.id);
  if (on) await pageFollowsService.follow(v, actor, key);
  else await pageFollowsService.unfollow(v, actor, key);
}
