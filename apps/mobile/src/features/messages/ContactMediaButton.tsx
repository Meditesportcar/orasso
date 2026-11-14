// « Contacter <média> » depuis « Tes photos » (lot R9i, partie 2) : ouvre (ou rouvre) la conversation de la page du média, montrée
// sous son nom et son logo : jamais le compte qui la tient. `useContactMedia` sert le bouton de l'en-tête et la rangée de la feuille
// d'une photo ; l'erreur (403 : plus identifié, 404 : page disparue) est rendue par l'écran, avec le libellé de l'API, qui ne dit
// rien de l'état du titulaire.
import { createContactMediaFlow, albumTagLabels as L, parseAuthorKey } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";

export function useContactMedia(mediaKey: string, onError: (message: string | null) => void) {
  const router = useRouter();
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  // Une opération à la fois, périmée au démontage, à la perte de focus (`cancel`) et au changement de compte : sa réponse tardive
  // n'ouvre aucune conversation et ne dit aucune erreur.
  const flow = useRef(createContactMediaFlow());
  const cancel = useCallback(() => flow.current.cancel(setBusy), []);
  const accountId = me?.user.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement quand le compte (ou le média) change
  useEffect(() => cancel, [accountId, mediaKey, cancel]);
  const open = () => {
    const id = parseAuthorKey(mediaKey)?.id;
    if (!id) return;
    void flow.current.open(
      async () => {
        try {
          const { id: conversationId } = await api.contactMedia(id);
          return { ok: true, conversationId };
        } catch (e) {
          return { ok: false, message: errorMessage(e) };
        }
      },
      { setBusy, onError, navigate: (conversationId) => router.push(`/messages/${conversationId}`) },
    );
  };
  return { busy, open, cancel };
}

export function ContactMediaButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <SmallButton icon="chat" disabled={busy} onPress={onPress} testID="my-photos-contact">
      {L.contact}
    </SmallButton>
  );
}
