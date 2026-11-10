// « Collaboration commerciale » (lot R7m2, ARCHITECTURE-R7 § 2.11, D38 : loi du 9 juin 2023 ; formulation à faire relire par
// un juriste). L'API pose `commercial_partner_id` À LA CRÉATION d'une story ou d'une publication, jamais l'écran :
// (a) l'auteur identifie un pro (identification `pro`) ou le cite dans la légende (`@<slug>`) et il a avec lui un
//     partenariat ACTIF → la mention est posée, l'auteur ne peut pas l'éviter ;
// (b) l'auteur la pose à la main (`commercialPartnerId`) sur une fiche pro montrable (`proShown`: publiée, vérifiée, titulaire en
//     règle) ;
// (c) une story liée à une publication qui porte déjà une mention en hérite (tour 2) : la carte montre un contenu commercial.
// Elle ne se retire jamais (aucune route d'édition ne la touche ; `PATCH` d'une publication répond 409 `commercial_locked`) :
// un contenu publié la garde même après la fin du partenariat. Les routes de lecture rendent `commercialPartner`.
import {
  type CommercialPartnerCandidate,
  type CommercialPartnerView,
  commercialPartnerOf,
  partnershipLabels,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { partnerships, proProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, validation } from "../../lib/errors";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { proShown } from "./shown";

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
  /** La mention de la publication à laquelle la story est liée (tour 2) : héritée, même pour un tiers. */
  inherited?: string | null;
};

export type CommercialSource = "derived" | "explicit" | "inherited";

/**
 * Le pro à mentionner et d'où il vient, ou `null`. Le partenaire déduit de la story passe d'abord, sinon la mention du
 * contenu lié ; un explicite qui désigne un autre pro : 400 `commercial_conflict` (une seule collaboration par contenu).
 */
export async function commercialPartnerFor(
  ex: Executor,
  input: CommercialInput,
): Promise<{ proId: string; source: CommercialSource } | null> {
  const partners = (await activePartnerCandidates(ex, input.authorId)).filter((p) => p.proId !== input.ownProId);
  const derived = commercialPartnerOf(
    partners,
    input.tagProIds.filter((id) => id !== input.ownProId),
    input.caption,
  );
  // Une mention HÉRITÉE est toujours gardée, même quand elle désigne la fiche qui publie (Wrap 66 repartage la publication d'un
  // passionné qui le concerne) : l'exclusion de soi ne vaut que pour une mention déduite ou explicite.
  const inherited = input.inherited ?? null;
  const chosen = derived
    ? { proId: derived, source: "derived" as const }
    : inherited
      ? { proId: inherited, source: "inherited" as const }
      : null;
  const explicit = input.explicit && input.explicit !== input.ownProId ? input.explicit : null;
  if (!explicit) return chosen;
  if (chosen && chosen.proId !== explicit) {
    throw new AppError(400, "commercial_conflict", partnershipLabels.errors.commercial_conflict);
  }
  if (chosen) return chosen;
  // Mention à la main : une fiche montrable seulement (une mention ne se retire pas : jamais sur un pro qui n'a rien demandé).
  const [pro] = await ex
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(and(eq(proProfiles.id, explicit), proShown(now())));
  if (!pro) throw validation(partnershipLabels.errors.commercial_unknown, { field: "commercialPartnerId" });
  return { proId: explicit, source: "explicit" };
}

/**
 * `commercialPartner` des contenus lus : nom, adresse de la fiche et logo, par identifiant de pro. Le texte reste toujours
 * (un contenu publié garde sa mention) ; l'adresse et le logo ne sortent que si la fiche est encore montrable (sinon `null`,
 * non cliquable : fiche dépubliée, supprimée, anonymisée).
 */
export async function commercialViews(
  ex: Executor,
  proIds: readonly (string | null)[],
): Promise<Map<string, CommercialPartnerView>> {
  const ids = [...new Set(proIds.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, CommercialPartnerView>();
  if (!ids.length) return out;
  const rows = await ex
    .select({
      id: proProfiles.id,
      name: proProfiles.name,
      slug: proProfiles.slug,
      logoKey: proProfiles.logoKey,
      shown: sql<boolean>`(${proShown(now())})`,
    })
    .from(proProfiles)
    .where(inArray(proProfiles.id, ids));
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.shown ? r.slug : null,
      logoUrl: r.shown ? storage.url(r.logoKey) : null,
    });
  }
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
    /** Le titulaire voit-il ce contenu ? Sinon rien ne part (une story de crew, d'abonnés ou d'un compte privé ne se révèle pas). */
    sees: (ownerId: string) => Promise<boolean>;
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
  if (!(await input.sees(pro.owner))) return;
  await notificationsService.notify(tx, pro.owner, "partner_mention", {
    title: partnershipLabels.notifications.mentionedTitle(input.actor.pseudo),
    body:
      input.kind === "story"
        ? partnershipLabels.notifications.mentionedStoryBody(input.actor.pseudo)
        : partnershipLabels.notifications.mentionedPostBody(input.actor.pseudo),
    data: { actor: input.actor, ...input.data },
  });
}
