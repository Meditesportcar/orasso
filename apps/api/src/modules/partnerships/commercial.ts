// « Collaboration commerciale » (lot R7m2, ARCHITECTURE-R7 § 2.11, D38 : loi du 9 juin 2023 ; formulation à faire relire par
// un juriste). L'API pose `commercial_partner_id` À LA CRÉATION d'une story ou d'une publication, jamais l'écran :
// (a) l'auteur identifie un pro (identification `pro`) ou le cite dans la légende (`@<slug>`) et il a avec lui un
//     partenariat ACTIF → la mention est posée, l'auteur ne peut pas l'éviter ;
// (b) l'auteur la pose à la main (`commercialPartnerId`) sur n'importe quelle fiche pro publiée.
// Elle ne se retire jamais (aucune route d'édition ne la touche ; `PATCH` d'une publication répond 409 `commercial_locked`) :
// un contenu publié la garde même après la fin du partenariat. Les routes de lecture rendent `commercialPartner`.
import {
  type CommercialPartnerCandidate,
  type CommercialPartnerView,
  commercialPartnerOf,
  partnershipLabels,
} from "@orasso/shared";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { partnerships, proProfiles } from "../../db/schema";
import { AppError, validation } from "../../lib/errors";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";

/** Les pros avec lesquels cette personne a un partenariat `active` (fiche non supprimée). */
export async function activePartnerCandidates(ex: Executor, userId: string): Promise<CommercialPartnerCandidate[]> {
  return ex
    .select({ proId: proProfiles.id, slug: proProfiles.slug })
    .from(partnerships)
    .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
    .where(and(eq(partnerships.userId, userId), eq(partnerships.status, "active"), isNull(proProfiles.deletedAt)));
}

export type CommercialInput = {
  authorId: string;
  /** La fiche pro au nom de laquelle l'auteur publie : jamais son propre partenaire. */
  ownProId?: string | null;
  /** Les identifications `pro` DEMANDÉES (même si l'identification est écartée, par exemple pour un compte privé : le devoir de mention reste). */
  tagProIds: readonly string[];
  caption: string | null | undefined;
  /** `commercialPartnerId` explicite (mention à la main). */
  explicit?: string | null;
};

/** Le pro à mentionner, ou `null`. Voir l'en-tête du fichier. */
export async function commercialPartnerFor(ex: Executor, input: CommercialInput): Promise<string | null> {
  const partners = (await activePartnerCandidates(ex, input.authorId)).filter((p) => p.proId !== input.ownProId);
  const derived = commercialPartnerOf(
    partners,
    input.tagProIds.filter((id) => id !== input.ownProId),
    input.caption,
  );
  const explicit = input.explicit && input.explicit !== input.ownProId ? input.explicit : null;
  if (!explicit) return derived;
  if (derived && derived !== explicit) {
    throw new AppError(400, "commercial_conflict", partnershipLabels.errors.commercial_conflict);
  }
  if (derived) return derived;
  // Mention à la main : n'importe quel pro dont la fiche est publiée.
  const [pro] = await ex
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(and(eq(proProfiles.id, explicit), isNull(proProfiles.deletedAt), isNotNull(proProfiles.publishedAt)));
  if (!pro) throw validation(partnershipLabels.errors.commercial_unknown, { field: "commercialPartnerId" });
  return explicit;
}

/**
 * `commercialPartner` des contenus lus : nom, adresse de la fiche et logo, par identifiant de pro. Une fiche supprimée
 * garde sa mention (un contenu publié la garde) ; une ligne dont la fiche a disparu pour de bon n'a plus rien à dire.
 */
export async function commercialViews(
  ex: Executor,
  proIds: readonly (string | null)[],
): Promise<Map<string, CommercialPartnerView>> {
  const ids = [...new Set(proIds.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, CommercialPartnerView>();
  if (!ids.length) return out;
  const rows = await ex
    .select({ id: proProfiles.id, name: proProfiles.name, slug: proProfiles.slug, logoKey: proProfiles.logoKey })
    .from(proProfiles)
    .where(inArray(proProfiles.id, ids));
  for (const r of rows) out.set(r.id, { id: r.id, name: r.name, slug: r.slug, logoUrl: storage.url(r.logoKey) });
  return out;
}

/**
 * `partner_mention` (Journal) au titulaire de la fiche citée, dans la transaction de la publication. Pas de message à
 * soi-même, et pas de doublon avec une `story_mention` déjà envoyée à la même personne pour la même story.
 */
export async function notifyPartnerMention(
  tx: Tx,
  input: {
    proId: string;
    authorUserId: string;
    already?: readonly string[];
    kind: "story" | "post";
    actor: { userId?: string; pseudo: string; avatarUrl: string | null };
    data: Record<string, unknown>;
  },
): Promise<void> {
  const [pro] = await tx
    .select({ owner: proProfiles.ownerUserId })
    .from(proProfiles)
    .where(eq(proProfiles.id, input.proId));
  if (!pro || pro.owner === input.authorUserId || input.already?.includes(pro.owner)) return;
  await notificationsService.notify(tx, pro.owner, "partner_mention", {
    title: partnershipLabels.notifications.mentionedTitle(input.actor.pseudo),
    body:
      input.kind === "story"
        ? partnershipLabels.notifications.mentionedStoryBody(input.actor.pseudo)
        : partnershipLabels.notifications.mentionedPostBody(input.actor.pseudo),
    data: { actor: input.actor, ...input.data },
  });
}
