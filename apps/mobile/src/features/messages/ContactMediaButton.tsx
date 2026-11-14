// « Contacter <média> » depuis « Tes photos » (lot R9i, partie 2) : ouvre (ou rouvre) la conversation de la page du média, montrée
// sous son nom et son logo : jamais le compte qui la tient. `useContactMedia` sert le bouton de l'en-tête et la rangée de la feuille
// d'une photo ; l'erreur (403 : plus identifié, 404 : page disparue) est rendue par l'écran, avec le libellé de l'API, qui ne dit
// rien de l'état du titulaire.
import { albumTagLabels as L, parseAuthorKey } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";

export function useContactMedia(mediaKey: string, onError: (message: string | null) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const open = async () => {
    const id = parseAuthorKey(mediaKey)?.id;
    if (!id || running.current) return;
    running.current = true;
    setBusy(true);
    onError(null);
    try {
      const { id: conversationId } = await api.contactMedia(id);
      router.push(`/messages/${conversationId}`);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, open };
}

export function ContactMediaButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <SmallButton icon="chat" disabled={busy} onPress={onPress} testID="my-photos-contact">
      {L.contact}
    </SmallButton>
  );
}
