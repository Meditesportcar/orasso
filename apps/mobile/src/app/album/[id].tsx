// L'album ouvert (lot R9e, maquette R9.5) : couverture, titre, tags, ligne de l'événement, grille de photos, visionneuse.
import { useLocalSearchParams } from "expo-router";

import { AlbumScreen } from "@/features/albums/AlbumScreen";

export default function AlbumRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AlbumScreen id={String(id)} />;
}
