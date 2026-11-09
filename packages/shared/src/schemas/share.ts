// Partager un contenu d'Orasso (lot R7f4) : les routes `/me/share/*`. Une destination fermée dit pourquoi (jamais un bouton
// principal grisé sans une ligne qui l'explique). Les règles de visibilité sont dans l'API : l'écran n'en applique aucune.
import { z } from "zod";
import { type StoryLinkType, storyLinkTypes } from "./stories";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide")
  .transform((v) => v.toLowerCase());

/** Un contenu à partager : son genre et son identifiant (événement, voiture, publication, événement du souvenir, vote). */
export const shareRefQuery = z.object({ type: z.enum(storyLinkTypes), id: uuid });
export type ShareRef = { type: StoryLinkType; id: string };

export const shareFileFormats = ["story", "post"] as const;
export type ShareFileFormat = (typeof shareFileFormats)[number];
export const shareExportQuery = shareRefQuery.extend({ format: z.enum(shareFileFormats).default("story") });
export const shareCardQuery = shareRefQuery.extend({ part: z.enum(["card", "ground"]).default("card") });

export type ShareDestination = "story" | "feed" | "message" | "external";

/** `GET /me/share/info` : de quoi tracer la feuille « Partager » et les destinations ouvertes. */
export type ShareInfo = {
  type: StoryLinkType;
  id: string;
  title: string;
  subtitle: string;
  /** Vignette de l'en-tête : photo masquée ou affiche (adresse publique) ; `null` : pas d'image. */
  imageUrl: string | null;
  /** Libellé du bouton de la carte touchable (« Voir l'événement »). */
  linkLabel: string;
  /** Adresse à coller dans un message (page publique ou, à défaut, l'accueil du site). */
  url: string;
  destinations: Record<ShareDestination, boolean>;
  /** Pourquoi une destination est fermée. */
  reasons: Partial<Record<ShareDestination, string>>;
  /** Événement seulement : l'organisateur sera-t-il prévenu (compte public, story pas de crew) ? `null` sinon. */
  organizerNotified: boolean | null;
  /** Formats de fichier proposés « Vers l'extérieur ». */
  formats: ShareFileFormat[];
};
