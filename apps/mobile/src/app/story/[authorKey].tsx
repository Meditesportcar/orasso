// La visionneuse de stories (lot R7f2, maquette R7.7), mode B : plein écran, fond noir, sans barre d'onglets. `authorKey` :
// `u:<compte>`, `s:<structure>` ou `p:<pro>` (celui de `GET /stories/bar`).
import { useLocalSearchParams } from "expo-router";

import { StoryViewer } from "@/features/stories/view/StoryViewer";

export default function Story() {
  const { authorKey } = useLocalSearchParams<{ authorKey: string }>();
  return <StoryViewer authorKey={String(authorKey ?? "")} />;
}
