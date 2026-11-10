// Le bouton « En story » d'un souvenir (lot R7f4) : ouvre la feuille « Partager » (story, message, vers l'extérieur ; un souvenir
// est personnel : pas dans le Fil, l'API le dit). La photo du souvenir a déjà passé la règle des plaques côté API.
import type { MemoryItem } from "@orasso/shared";
import { shareLabels } from "@orasso/shared";
import { useState } from "react";

import { SmButton } from "@/features/passionne/kit";
import { ShareSheet } from "./ShareSheet";

export function MemoryShareButton({ memory }: { memory: MemoryItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SmButton kind="s" icon="share" onPress={() => setOpen(true)} testID="memory-share">
        {shareLabels.story}
      </SmButton>
      <ShareSheet visible={open} onClose={() => setOpen(false)} target={{ type: "memory", id: memory.eventId }} />
    </>
  );
}
