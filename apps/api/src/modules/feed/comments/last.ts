// Les deux derniers commentaires sous une carte (lot R8k1) : pour un lot de publications, les deux commentaires de premier
// niveau les plus récents **visibles de ce lecteur** (même règle que la liste), dans l'ordre du temps, en une seule requête.
// Branché sur `loadPostViews` par `registerLastComments` ; ce fichier est importé au démarrage de l'API par les routes.
// Ici le lecteur n'est connu que par son identifiant (contrat figé de `registerLastComments`) : seul l'auteur d'une
// publication de personne compte comme « gérant » ; un responsable de page (second facteur à prouver) lit les commentaires
// d'un compte privé dans la liste complète, jamais dans cet aperçu.
import { FEED_COMMENT_PREVIEW_COUNT, type FeedCommentPreview } from "@orasso/shared";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { feedPostComments, feedPosts, profiles } from "../../../db/schema";
import type { Executor } from "../../../lib/tx";
import { authorVisibleSql, profileOkSql } from "../access";
import { loadPageInfo, pageKeyOf } from "../authors";
import { personAuthorView, registerLastComments } from "../posts";
import { commentPageOkSql } from "./view";

export async function loadLastComments(
  ex: Executor,
  postIds: string[],
  viewerId: string,
  at: Date,
): Promise<Map<string, FeedCommentPreview[]>> {
  const out = new Map<string, FeedCommentPreview[]>();
  if (!postIds.length) return out;
  const c = feedPostComments;
  const mine = (
    await ex
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(and(inArray(feedPosts.id, postIds), eq(feedPosts.persona, "fan"), eq(feedPosts.authorId, viewerId)))
  ).map((r) => r.id);
  // Un commentaire de page est servi à qui voit la publication, la page en règle et la personne non bannie, quelle que
  // soit la confidentialité de son compte (lot R9a) ; celui d'une personne, comme avant.
  const visible = or(
    and(sql`${c.persona} <> 'fan'`, sql`profiles.banned_at is null`, commentPageOkSql),
    and(
      eq(c.persona, "fan"),
      or(
        mine.length ? and(inArray(c.postId, mine), profileOkSql("profiles", at)) : undefined,
        authorVisibleSql("profiles", sql`${c.authorId}`, viewerId, at),
      ),
    ),
  );
  const ranked = ex
    .select({
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      persona: c.persona,
      structureId: c.structureId,
      proId: c.proId,
      providerId: c.providerId,
      mediaId: c.mediaId,
      text: c.text,
      createdAt: c.createdAt,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
      grade: profiles.grade,
      official: profiles.official,
      rank: sql<number>`row_number() over (partition by ${c.postId} order by ${c.createdAt} desc, ${c.id} desc)`.as(
        "rank",
      ),
    })
    .from(c)
    .innerJoin(profiles, eq(profiles.userId, c.authorId))
    .where(and(inArray(c.postId, postIds), isNull(c.parentId), isNull(c.deletedAt), visible))
    .as("ranked");
  const rows = await ex
    .select()
    .from(ranked)
    .where(lte(ranked.rank, FEED_COMMENT_PREVIEW_COUNT))
    .orderBy(asc(ranked.createdAt), asc(ranked.id));
  const pageRows = rows.filter((r) => r.persona !== "fan");
  const pages = pageRows.length ? await loadPageInfo(ex, pageRows) : new Map();
  for (const r of rows) {
    const list = out.get(r.postId) ?? [];
    // Un commentaire de page se montre sous la page, jamais sous le compte de qui l'a écrit.
    const pageView = r.persona !== "fan" ? pages.get(pageKeyOf(r) ?? "")?.view : undefined;
    // Une page introuvable : le commentaire est écarté, jamais montré sous le compte de la personne.
    if (r.persona !== "fan" && !pageView) continue;
    list.push({
      id: r.id,
      author: pageView ?? personAuthorView(r.authorId, r),
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    });
    out.set(r.postId, list);
  }
  return out;
}

registerLastComments(loadLastComments);
