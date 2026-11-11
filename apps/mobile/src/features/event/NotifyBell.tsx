// La cloche de la fiche d'un événement (lot R8n2, maquette R8.11, vue « fiche ») : visible seulement quand la personne a
// une place (`hasPlace`, lue avec la fiche quand elle est connectée). Elle ouvre « Notifications de cet événement ».
import { Icon, tokens, useTheme } from "@orasso/design-system/native";
import { eventNotifyLabels as L } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Overlay } from "@/ui/Overlay";
import { NotifyPrefsSheet } from "./NotifyPrefsSheet";

const { radiusMd } = tokens.radius;

export function NotifyBell({ eventId, signedIn, stamp }: { eventId: string; signedIn: boolean; stamp?: string }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [lost, setLost] = useState(false);
  // Place perdue : le message reste lisible dans la feuille ouverte, la cloche disparaît à sa fermeture.
  const [gone, setGone] = useState(false);
  // `stamp` : l'état des candidatures de la fiche ; il change à l'envoi d'une candidature ou à un retrait, la place est relue.
  // Une nouvelle candidature (l'état des candidatures change) rend la cloche : la place est relue.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` relance la remise à zéro, il n'est pas lu.
  useEffect(() => {
    setLost(false);
    setGone(false);
  }, [stamp]);
  const prefs = useApi(() => api.eventNotificationPrefs(eventId), [eventId, signedIn, stamp], { enabled: signedIn });
  const data = prefs.data;
  if (!signedIn || !data?.hasPlace || lost) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L.bellLabel}
        onPress={() => setOpen(true)}
        style={[styles.bell, { backgroundColor: `${t.color.night}8c` }]}
        testID="notify-bell"
      >
        <Icon name="bell" size={20} color={t.color.nightInk} />
      </Pressable>
      {/* La feuille couvre l'écran : elle se pose dans la zone des feuilles de la fiche, pas dans l'affiche. */}
      <Overlay>
        <NotifyPrefsSheet
          eventId={eventId}
          visible={open}
          initialNews={data.news}
          onClose={() => {
            setOpen(false);
            if (gone) setLost(true);
            else void prefs.reload();
          }}
          onLost={() => setGone(true)}
        />
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    marginLeft: "auto",
    width: 44,
    height: 44,
    borderRadius: radiusMd,
    alignItems: "center",
    justifyContent: "center",
  },
});
