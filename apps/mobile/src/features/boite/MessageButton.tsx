// Bouton « Message » du profil d'un autre (lot 18) : conversation existante ou entre amis → elle s'ouvre ; pas amis →
// feuille « Demande de contact ».
import { Button } from "@orasso/design-system/native";
import { messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { Notice } from "@/ui/Notice";

import { ContactRequestSheet } from "./ContactRequestSheet";

export function MessageButton({ userId, pseudo }: { userId: string; pseudo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        icon="chat"
        loading={busy}
        testID="message-open"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const { id } = await api.openDirect(userId);
            router.push(`/boite/${id}`);
          } catch (e) {
            if (e instanceof ApiRequestError && e.code === "not_friends") setContact(true);
            else setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {messagingLabels.message}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <ContactRequestSheet pseudo={contact ? pseudo : null} onClose={() => setContact(false)} />
    </>
  );
}

/** « Contacter l'organisateur » (page événement, et page structure quand l'appli en aura une). */
export function ContactOrganizerButton({ structureId }: { structureId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        icon="chat"
        loading={busy}
        fullWidth
        testID="contact-organizer"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const { id } = await api.contactStructure(structureId);
            router.push(`/boite/${id}`);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {messagingLabels.contactOrganizer}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </>
  );
}
