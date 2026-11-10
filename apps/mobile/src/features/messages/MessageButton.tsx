// Bouton « Message » du profil d'un autre (lot 18) : conversation existante ou autorisée (D37) → elle s'ouvre ; sinon →
// feuille « Demande de contact ».
import { AppBarFlowAction, Button } from "@orasso/design-system/native";
import { messagingLabels, publicProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { SideIcon } from "@/features/profil/ProfileHead";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";

import { ContactRequestSheet } from "./ContactRequestSheet";

export function MessageButton({
  userId,
  pseudo,
  fullWidth = false,
  sheetInOverlay = false,
  asIcon = false,
  onError,
}: {
  userId: string;
  pseudo: string;
  /** Lot R8b1 : l'icône carrée « Message » de l'en-tête compact du profil d'un autre (au lieu du bouton). */
  asIcon?: boolean;
  /** Avec `asIcon` : l'erreur est rendue par l'écran (la colonne d'icônes est trop étroite pour la porter). */
  onError?: (message: string | null) => void;
  /** Lot R7b1 : le bouton remplit sa cellule (profil d'un autre : « Suivre » et « Message » côte à côte). */
  fullWidth?: boolean;
  /**
   * Lot R7b1, tour 2 (relecture Codex 1) : la feuille « Demande de contact » est posée dans la zone des feuilles de l'écran
   * (`<Overlay>`) : rendue dans la cellule du bouton, elle serait rognée à la largeur de la cellule.
   */
  sheetInOverlay?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const setError = (message: string | null) => {
    setErrorState(onError ? null : message);
    onError?.(message);
  };
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.openDirect(userId);
      router.push(`/messages/${id}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "not_friends") setContact(true);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {asIcon ? (
        <SideIcon
          icon="chat"
          label={messagingLabels.message}
          disabled={busy}
          onPress={() => void open()}
          testID="message-open"
        />
      ) : (
        <Button
          variant="secondary"
          icon="chat"
          loading={busy}
          fullWidth={fullWidth}
          testID="message-open"
          onPress={() => void open()}
        >
          {messagingLabels.message}
        </Button>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sheetInOverlay ? (
        <Overlay>
          <ContactRequestSheet pseudo={contact ? pseudo : null} onClose={() => setContact(false)} />
        </Overlay>
      ) : (
        <ContactRequestSheet pseudo={contact ? pseudo : null} onClose={() => setContact(false)} />
      )}
    </>
  );
}

/**
 * Lot R5b (maquette R5.6) : « Écrire » passe dans l'en-tête du profil d'un membre (carré à gauche du ✕). Même logique
 * que `MessageButton` : conversation autorisée, sinon la feuille « Demande de contact ». L'erreur est rendue à l'écran.
 */
export function WriteHeaderAction({
  userId,
  pseudo,
  onError,
}: {
  userId: string;
  pseudo: string;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState(false);
  return (
    <>
      <AppBarFlowAction
        icon="chat"
        label={publicProfileLabels.writeTo(pseudo)}
        testID="message-open"
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          onError(null);
          try {
            const { id } = await api.openDirect(userId);
            router.push(`/messages/${id}`);
          } catch (e) {
            if (e instanceof ApiRequestError && e.code === "not_friends") setContact(true);
            else onError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
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
            router.push(`/messages/${id}`);
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
