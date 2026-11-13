// « Tes photos » d'un album (lot R9f, maquette R9.7) : les photos où je suis identifié (la notification, la fiche de la voiture, la sortie, le souvenir y mènent).
import { useLocalSearchParams } from "expo-router";

import { MyPhotosScreen } from "@/features/albums/MyPhotosScreen";

export default function MyPhotosRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MyPhotosScreen id={String(id)} />;
}
