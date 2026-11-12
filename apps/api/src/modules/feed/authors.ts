// Qui parle dans une publication (vague R8, lot R8a1) : la personne, ou la page (structure, fiche pro, prestataire, média)
// au nom de laquelle elle est faite. Une publication de page se montre sous le nom et le logo de la page, jamais sous le
// compte de qui l'a publiée (`author_id` n'est jamais servi pour une page). Chargement par lots : une requête par sorte de
// page présente dans la liste, jamais une par publication.
import { type AuthorKind, authorKeyOf, type FeedAuthorView } from "@orasso/shared";
import { eq, inArray } from "drizzle-orm";

import { mediaProfiles, proProfiles, providerProfiles, structures } from "../../db/schema";
import { type PostPageColumns, pageOf } from "../../lib/authorship";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";

/** Une page vue d'une publication : sa carte d'auteur et son état (supprimée ou suspendue : ses publications se taisent). */
export type PageInfo = { view: FeedAuthorView; inGoodStanding: boolean };

const view = (
  kind: AuthorKind,
  id: string,
  name: string,
  logoKey: string | null,
  verified: boolean,
): FeedAuthorView => ({
  key: authorKeyOf(kind, id),
  kind,
  name,
  avatarUrl: storage.url(logoKey),
  verified,
  // Pour une page, `pseudo = name` et pas de grade : les champs de `FeedPerson` restent lisibles par l'APK en ligne.
  pseudo: name,
  grade: null,
  official: false,
});

/** Les pages des publications données (clé d'auteur → page), en au plus quatre requêtes. */
export async function loadPageInfo(ex: Executor, posts: PostPageColumns[]): Promise<Map<string, PageInfo>> {
  const ids: Record<AuthorKind, string[]> = { user: [], structure: [], pro: [], provider: [], media: [] };
  for (const p of posts) {
    const page = pageOf(p);
    if (page) ids[page.kind].push(page.id);
  }
  const out = new Map<string, PageInfo>();
  const [structs, pros, providers, medias] = await Promise.all([
    ids.structure.length
      ? ex
          .select({
            id: structures.id,
            name: structures.name,
            logoKey: structures.logoKey,
            verification: structures.verification,
            deletedAt: structures.deletedAt,
          })
          .from(structures)
          .where(inArray(structures.id, [...new Set(ids.structure)]))
      : [],
    ids.pro.length
      ? ex
          .select({
            id: proProfiles.id,
            name: proProfiles.name,
            logoKey: proProfiles.logoKey,
            verifiedAt: proProfiles.verifiedAt,
            deletedAt: proProfiles.deletedAt,
          })
          .from(proProfiles)
          .where(inArray(proProfiles.id, [...new Set(ids.pro)]))
      : [],
    ids.provider.length
      ? ex
          .select({ id: providerProfiles.id, name: providerProfiles.name, deletedAt: providerProfiles.deletedAt })
          .from(providerProfiles)
          .where(inArray(providerProfiles.id, [...new Set(ids.provider)]))
      : [],
    ids.media.length
      ? ex
          .select({
            id: mediaProfiles.id,
            name: mediaProfiles.name,
            logoKey: mediaProfiles.logoKey,
            verifiedAt: mediaProfiles.pressCardVerifiedAt,
            deletedAt: mediaProfiles.deletedAt,
          })
          .from(mediaProfiles)
          .where(inArray(mediaProfiles.id, [...new Set(ids.media)]))
      : [],
  ]);
  for (const s of structs) {
    out.set(authorKeyOf("structure", s.id), {
      view: view("structure", s.id, s.name, s.logoKey, s.verification === "verified"),
      inGoodStanding: !s.deletedAt && s.verification !== "suspended",
    });
  }
  for (const p of pros) {
    out.set(authorKeyOf("pro", p.id), {
      view: view("pro", p.id, p.name, p.logoKey, Boolean(p.verifiedAt)),
      inGoodStanding: !p.deletedAt,
    });
  }
  for (const p of providers) {
    out.set(authorKeyOf("provider", p.id), {
      view: view("provider", p.id, p.name, null, false),
      inGoodStanding: !p.deletedAt,
    });
  }
  for (const m of medias) {
    out.set(authorKeyOf("media", m.id), {
      view: view("media", m.id, m.name, m.logoKey, Boolean(m.verifiedAt)),
      inGoodStanding: !m.deletedAt,
    });
  }
  return out;
}

/** La clé de page d'une publication, ou `null` pour un passionné. */
export const pageKeyOf = (post: PostPageColumns): string | null => {
  const page = pageOf(post);
  return page ? authorKeyOf(page.kind, page.id) : null;
};

/** Le département d'une page (celui de la structure ou de la fiche pro, le premier de la zone d'un prestataire ou d'un média). */
export async function pageDepartment(ex: Executor, page: { kind: AuthorKind; id: string }): Promise<string | null> {
  if (page.kind === "structure") {
    const [r] = await ex.select({ d: structures.department }).from(structures).where(eq(structures.id, page.id));
    return r?.d || null;
  }
  if (page.kind === "pro") {
    const [r] = await ex.select({ d: proProfiles.department }).from(proProfiles).where(eq(proProfiles.id, page.id));
    return r?.d || null;
  }
  if (page.kind === "provider") {
    const [r] = await ex
      .select({ d: providerProfiles.departments })
      .from(providerProfiles)
      .where(eq(providerProfiles.id, page.id));
    return r?.d[0] || null;
  }
  if (page.kind === "media") {
    const [r] = await ex
      .select({ d: mediaProfiles.departments })
      .from(mediaProfiles)
      .where(eq(mediaProfiles.id, page.id));
    return r?.d[0] || null;
  }
  return null;
}
