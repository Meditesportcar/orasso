// Fichiers qui sortent d'Orasso (lot R7f4, maquette R7.24 ; invariant « Un fichier qui sort d'Orasso… ») : partage du
// téléphone vers Instagram, WhatsApp, TikTok… Le fichier part du rendu serveur : 9:16 pour une story photo, 4:5 pour une
// publication du Fil, plaques déjà floutées (rien n'est relu ni refait ici), signature « orasso.fr » ; une vidéo sort
// telle qu'elle a été publiée (ni floutage ni signature, décision de Damien du 09/11) ; refusé pour un contenu de crew.
// Un fichier de sortie est un JPEG (lu partout) généré à la demande, jamais stocké.
import {
  partnershipLabels,
  type ShareFileFormat,
  STORY_H,
  STORY_W,
  type StoryLinkType,
  shareLabels,
} from "@orasso/shared";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { feedPostPhotos, feedPosts } from "../../db/schema";
import { canManagePost } from "../../lib/authorship";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { albumCreditLineOf } from "../albums/share-to-story";
import { requireVisiblePost } from "../feed/access";
import { commercialViews } from "../partnerships/commercial";
import { MAX_INPUT_PIXELS } from "../vehicles/photos-blur";
import { CANVAS_H, CANVAS_W, GROUND_BLUR, GROUND_BRIGHTNESS, signFile } from "./card";
import {
  composeLinkedPost,
  composeLinkedStory,
  inspect,
  LinkedError,
  loadLinked,
  renderLinkedCard,
  renderLinkedGround,
} from "./linked";
import { requireVisibleStory } from "./service";

export type ExportedFile = { data: Buffer; type: string; name: string };

/** La ligne imprimée sur un fichier qui sort d'Orasso quand le contenu est une « Collaboration commerciale » (R7m2). */
async function commercialMention(proId: string | null): Promise<string | null> {
  if (!proId) return null;
  const partner = (await commercialViews(db, [proId])).get(proId);
  return partner ? partnershipLabels.commercialLine(partner.name) : null;
}

const jpeg = (name: string) => ({ type: "image/jpeg", name: `orasso-${name}.jpg` });

export const exportService = {
  /**
   * `GET /stories/:id/export` : ma story, en 9:16 signé. Auteur seul ; une story de crew ne sort jamais (403 `crew_only`,
   * y compris pour un auteur encore membre) ; une copie « Ajouter à ma story » n'est pas à moi à faire sortir.
   */
  async story(v: Viewer, id: string): Promise<ExportedFile> {
    rateLimit("shareExport", v.user.id);
    const { story } = await requireVisibleStory(v, id);
    if (story.audience === "crew") throw new AppError(403, "crew_only", shareLabels.errors.crewOnly);
    if (story.authorId !== v.user.id || story.sharedFromStoryId) {
      throw new AppError(403, "author_only", shareLabels.errors.authorOnly);
    }
    if (story.status !== "ready") throw new AppError(409, "story_not_ready", shareLabels.errors.notFound);
    // Une vidéo sort telle quelle (aucun rendu serveur) : elle ne saurait porter la mention. Tant que c'est ainsi, une story
    // vidéo « Collaboration commerciale » ne sort pas d'Orasso (R7m2, tour 2).
    if (story.mediaKind === "video" && story.commercialPartnerId) {
      throw new AppError(409, "commercial_video", partnershipLabels.errors.commercial_video);
    }
    // Le fichier garde la provenance de son contenu lié : repartager la publication d'un autre en story ne la fait pas
    // devenir « à moi », et un classement ne sort que par les règles de `/me/share/export` (événement ouvert à tous,
    // publié, visible pour moi). Un contenu supprimé ou devenu privé ne sort plus non plus (ses pixels sont dans le fichier).
    if (story.linkedType && story.linkedId) {
      const found = await inspect(v, story.linkedType, story.linkedId);
      if (!found.ok) throw new LinkedError(found.refusal);
      if (found.content.type === "feed_post" && !found.content.mine) {
        throw new AppError(403, "author_only", shareLabels.errors.authorOnly);
      }
    }
    const file = await storage.get(story.storageKey);
    if (!file) throw notFound("Story introuvable");
    // Une vidéo sort telle quelle : pas de floutage de plaque, pas de signature (décision de Damien, 09/11).
    if (story.mediaKind === "video") return { data: file, type: "video/mp4", name: "orasso-story.mp4" };
    // Lot R9f : une story reprise d'une photo d'album sort avec le crédit du média (« Photos : <média> »), sous la signature.
    const credit = await albumCreditLineOf(story.sourceAlbumPhotoId);
    const mention = [await commercialMention(story.commercialPartnerId), credit].filter(Boolean).join(" · ") || null;
    return {
      data: await signFile(file, { width: STORY_W, height: STORY_H }, mention),
      ...jpeg("story"),
    };
  },

  /** `GET /feed-posts/:id/export` : ma publication, en 4:5 signé (la première photo ; auteur seul). */
  async feedPost(v: Viewer, id: string): Promise<ExportedFile> {
    rateLimit("shareExport", v.user.id);
    const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, id));
    if (!post || post.deletedAt) throw notFound("Publication introuvable");
    // Les droits sur la page ne suffisent pas : le contenu doit aussi être visible (auteur banni, page hors règle : 404).
    await requireVisiblePost(v, id);
    // Une publication de page se repartage au nom de la page (droits de la page), jamais par le seul `author_id`.
    if (!(await canManagePost(v, post))) throw forbidden(shareLabels.errors.authorOnly);
    const [first] = await db
      .select()
      .from(feedPostPhotos)
      .where(eq(feedPostPhotos.postId, id))
      .orderBy(asc(feedPostPhotos.position))
      .limit(1);
    const photo = first ? await storage.get(first.storageKey) : null;
    if (!photo) throw notFound("Publication introuvable");
    return {
      data: await signFile(
        await toPortrait(photo),
        { width: CANVAS_W, height: CANVAS_H },
        await commercialMention(post.commercialPartnerId),
      ),
      ...jpeg("publication"),
    };
  },

  /**
   * `GET /me/share/export` : un contenu pas encore partagé (événement, voiture, souvenir, résultat de vote, ou ma publication),
   * en fichier 9:16 (carte sur fond flouté) ou 4:5, signé. Les règles de visibilité sont celles de `loadLinked`.
   */
  async linked(v: Viewer, type: StoryLinkType, id: string, format: ShareFileFormat): Promise<ExportedFile> {
    rateLimit("shareExport", v.user.id);
    const c = await loadLinked(v, type, id);
    // Une publication ne sort que de la main de son auteur (la sienne), et sa photo, pas une carte.
    if (c.type === "feed_post") {
      if (!c.mine) throw new AppError(403, "author_only", shareLabels.errors.authorOnly);
      return exportService.feedPost(v, c.id);
    }
    if (format === "post") {
      return {
        data: await signFile(await composeLinkedPost(c), { width: CANVAS_W, height: CANVAS_H }),
        ...jpeg("publication"),
      };
    }
    const story = await composeLinkedStory(c);
    return { data: await signFile(story.data, { width: story.width, height: story.height }), ...jpeg("story") };
  },

  /** `GET /me/share/card` : l'aperçu du composeur — la carte (PNG transparent) ou le fond (WebP 1080 × 1920). */
  async card(
    v: Viewer,
    type: StoryLinkType,
    id: string,
    part: "card" | "ground",
  ): Promise<{ data: Buffer; type: string }> {
    rateLimit("shareExport", v.user.id);
    const c = await loadLinked(v, type, id);
    if (part === "card") {
      // WebP à fond transparent : dix fois plus léger que le PNG pour un aperçu qui se charge à chaque ouverture.
      const png = await renderLinkedCard(c);
      return { data: await sharp(png).webp({ quality: 88, alphaQuality: 90 }).toBuffer(), type: "image/webp" };
    }
    const ground = await renderLinkedGround(c, STORY_H);
    return { data: await sharp(ground).webp({ quality: 70 }).toBuffer(), type: "image/webp" };
  },
};

/** Une photo du Fil en 4:5 (1080 × 1350) : recadrée si elle est déjà proche du portrait, posée sur son flou sinon. */
async function toPortrait(photo: Buffer): Promise<Buffer> {
  const meta = await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const ratio = (meta.width ?? 1) / (meta.height ?? 1);
  if (Math.abs(ratio - CANVAS_W / CANVAS_H) <= 0.02) {
    return sharp(photo).resize(CANVAS_W, CANVAS_H, { fit: "cover" }).png().toBuffer();
  }
  const ground = await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(CANVAS_W, CANVAS_H, { fit: "cover" })
    .blur(GROUND_BLUR)
    .modulate({ brightness: GROUND_BRIGHTNESS })
    .png()
    .toBuffer();
  const front = await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(CANVAS_W, CANVAS_H, { fit: "inside" })
    .png()
    .toBuffer();
  return sharp(ground)
    .composite([{ input: front, gravity: "centre" }])
    .png()
    .toBuffer();
}
