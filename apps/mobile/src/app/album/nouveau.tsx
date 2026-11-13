// « Nouvel album » (lot R9e) : les trois étapes. `?album=<id>` reprend un brouillon à l'étape des photos.
import { useLocalSearchParams } from "expo-router";

import { NewAlbumFlow } from "@/features/albums/NewAlbumFlow";

export default function NouvelAlbum() {
  const { album } = useLocalSearchParams<{ album?: string }>();
  return <NewAlbumFlow resumeId={typeof album === "string" ? album : undefined} />;
}
