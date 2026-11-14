// Une photo d'album lue avec le jeton de session (lot R9e) : `GET /api/albums/:id/photos/:nom` exige un membre connecté. Même mécanisme
// que les photos du fil d'un crew (`CrewPhotoImage` : en mémoire, jamais dans le cache disque du téléphone).
import type { AlbumPhotoView } from "@orasso/shared";
import type { ImageStyle, StyleProp } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";

export function AlbumPhoto({
  photo,
  style,
  label,
  cover = false,
}: {
  photo: Pick<AlbumPhotoView, "url">;
  style: StyleProp<ImageStyle>;
  label?: string;
  /** Remplit son cadre (vignette, mosaïque) ; sinon la photo entière (visionneuse). */
  cover?: boolean;
}) {
  return (
    <CrewPhotoImage url={photo.url} style={style} accessibilityLabel={label} resizeMode={cover ? "cover" : "contain"} />
  );
}
