// Les actions de la visionneuse d'un album (lot R9e, partie 2) : **vide**. R9f (« Identifier une voiture », « Retirer mon identification »)
// et R9g (« Reprendre dans le journal », « Album officiel ») y ajoutent chacun une ligne, par rôle de la personne qui regarde ; la
// visionneuse (`AlbumPhotoViewer`) les rend dans son emplacement `actions`. « Signaler » est un geste de la visionneuse elle-même.
import type { IconName } from "@orasso/design-system/native";
import type { AlbumPhotoView, AlbumView } from "@orasso/shared";

/** Qui regarde : le média auteur, l'organisateur de l'événement, la personne identifiée, ou tout autre membre. */
export type AlbumViewerRole = "media" | "organizer" | "tagged" | "member";

export type AlbumViewerActionContext = { album: AlbumView; photo: AlbumPhotoView; role: AlbumViewerRole };

export type AlbumViewerAction = {
  id: string;
  label: string;
  icon: IconName;
  /** Les rôles à qui l'action est proposée. */
  roles: readonly AlbumViewerRole[];
  run: (ctx: AlbumViewerActionContext) => void | Promise<void>;
};

/** La liste des actions (une ligne par lot). */
export const albumViewerActions: AlbumViewerAction[] = [];

/** Les actions proposées à ce rôle. */
export const actionsFor = (role: AlbumViewerRole): AlbumViewerAction[] =>
  albumViewerActions.filter((a) => a.roles.includes(role));
