// Les actions de l'organisateur sur une photo d'album (lot R9g, maquette R9.8 `ossheetH`) : « Reprendre dans le journal de l'événement »
// (feuille de reprise, crédit du média conservé) et « Choisir cet album comme « officiel » » / « Retirer « officiel » ». Elles sont proposées
// dans la visionneuse (registre `registry.ts`, rôle `organizer`) à la seule casquette organisateur de l'événement.
//
// La visionneuse est un `Modal` natif : la feuille de reprise s'ouvre **après** sa fermeture (`leaveViewer`, comme « Signaler »). Les actions
// du registre n'ont pas d'interface : elles passent par `OrganizerHost`, monté par l'écran de l'album, qui tient les feuilles.
import { Button, tokens } from "@orasso/design-system/native";
import { type AlbumPhotoView, type AlbumView, eventPhotosLabels as L, repostWindowOpen } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { RepostSheet } from "../RepostSheet";
import type { AlbumViewerAction, AlbumViewerActionContext } from "./registry";

const { space3 } = tokens.spacing;

type Request = { kind: "repost" | "official"; ctx: AlbumViewerActionContext };
/**
 * Un hôte par écran d'album monté. Les actions du registre (module) parlent à **l'hôte du dessus** (le dernier monté encore là) : avec deux
 * albums dans la pile, le démontage du second laisse le premier intact (un `listener` unique serait remis à `null`).
 */
type Host = {
  listener: (r: Request) => void;
  /** L'album de l'hôte est-il déjà l'officiel ? Lu au rendu de la visionneuse (« Choisir… » ou « Retirer… »). */
  official: boolean;
  /** La reprise est-elle encore permise (30 jours après la publication de l'album) ? Sinon l'action n'est pas proposée. */
  repostOpen: boolean;
};
const hosts: Host[] = [];
const topHost = (): Host | null => hosts[hosts.length - 1] ?? null;

/** La casquette courante est l'organisateur de l'événement de l'album ? (lit la fiche de l'événement, déjà en cache de l'écran). */
export function useIsEventOrganizer(album: AlbumView | null): boolean {
  const { persona } = usePersona();
  const wanted = persona.kind === "organizer" && album !== null && album.status === "published";
  const event = useApi(() => api.eventBySlug(album?.event.slug ?? ""), [album?.event.slug], { enabled: wanted });
  return wanted && persona.kind === "organizer" && event.data?.structure.id === persona.structureId;
}

/** Les deux lignes du registre : une par action (l'étiquette de la seconde suit l'état de l'album). */
export const organizerActions: AlbumViewerAction[] = [
  {
    id: "repost",
    label: L.repostAction,
    icon: "send",
    get roles() {
      return topHost()?.repostOpen ? (["organizer"] as const) : ([] as const);
    },
    run: (ctx) => topHost()?.listener({ kind: "repost", ctx }),
  },
  {
    id: "official",
    get label() {
      return topHost()?.official ? L.removeOfficial : L.makeOfficial;
    },
    icon: "star",
    roles: ["organizer"],
    run: (ctx) => topHost()?.listener({ kind: "official", ctx }),
  },
];

/**
 * Les feuilles des actions de l'organisateur. `leaveViewer(then)` ferme la visionneuse puis lance `then` ; `onChanged` recharge l'album
 * (l'étoile a bougé).
 */
export function OrganizerHost({
  album,
  leaveViewer,
  onChanged,
}: {
  album: AlbumView | null;
  leaveViewer: (then: () => void) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [repost, setRepost] = useState<{ album: AlbumView; photo: AlbumPhotoView } | null>(null);
  const [done, setDone] = useState<{ structure: string; media: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const host = useRef<Host>({ listener: () => undefined, official: false, repostOpen: false }).current;
  host.official = album?.official ?? false;
  host.repostOpen = repostWindowOpen(album?.publishedAt, now());
  // Monté une fois : l'ordre de la pile est celui des écrans ; le démontage retire cet hôte-là seulement.
  useEffect(() => {
    hosts.push(host);
    return () => {
      const i = hosts.indexOf(host);
      if (i >= 0) hosts.splice(i, 1);
    };
  }, [host]);
  useEffect(() => {
    host.listener = (r) => {
      if (r.kind === "repost") {
        leaveViewer(() => setRepost({ album: r.ctx.album, photo: r.ctx.photo }));
        return;
      }
      void (async () => {
        try {
          await api.setAlbumOfficial(r.ctx.album.event.id, r.ctx.album.id, !r.ctx.album.official);
          leaveViewer(onChanged);
        } catch (e) {
          leaveViewer(() => setFailure(errorMessage(e)));
        }
      })();
    };
  }, [host, leaveViewer, onChanged]);
  return (
    <>
      <RepostSheet
        target={repost}
        onClose={() => setRepost(null)}
        onDone={(structure, media) => {
          setRepost(null);
          setDone({ structure, media });
        }}
      />
      <AppSheet visible={done !== null} onClose={() => setDone(null)} accessibilityLabel={L.repostTitle}>
        {done ? (
          <View style={styles.col} testID="repost-done">
            <Muted variant="body">{L.repostDone(done.structure, done.media)}</Muted>
            <Button
              variant="secondary"
              icon="next"
              fullWidth
              onPress={() => {
                const slug = album?.event.slug;
                setDone(null);
                if (slug) router.dismissTo(`/e/${slug}` as never); // revient à la fiche déjà dans la pile (sinon l'empile) : pas de deuxième fiche
              }}
              testID="repost-see-journal"
            >
              {L.seeJournal}
            </Button>
          </View>
        ) : null}
      </AppSheet>
      <AppSheet visible={failure !== null} onClose={() => setFailure(null)} accessibilityLabel={L.officialFailed}>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
      </AppSheet>
    </>
  );
}

const styles = StyleSheet.create({ col: { gap: space3 } });
