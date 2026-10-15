// « Retenu » : la bonne nouvelle arrive en feuille, avec le bandeau tamponné de la carte affiche, par-dessus l'écran
// courant. La demande d'autorisation des notifications se fait ici si elle n'a pas encore été faite.
import { Button, PosterCard } from "@orasso/design-system/native";
import { useRouter } from "expo-router";

import { useApplications } from "@/lib/applications";
import { formatDayHour } from "@/lib/format";
import { AppSheet } from "./AppSheet";
import { NotificationAsk } from "./NotificationAsk";

export function AnnouncementSheet() {
  const { announcement, dismissAnnouncement } = useApplications();
  const router = useRouter();
  const app = announcement;
  return (
    <AppSheet visible={Boolean(app)} onClose={dismissAnnouncement} accessibilityLabel="Tu es retenu">
      {app ? (
        <>
          <PosterCard
            label="Tu es retenu"
            title={app.event.title}
            facts={`${formatDayHour(app.event.startsAt)}${app.zone ? ` · Zone ${app.zone.code}` : ""}`}
            status="retained"
            reveal
            credit
          />
          <Button
            variant="primary"
            icon="qr"
            next
            onPress={() => {
              dismissAnnouncement();
              router.navigate("/acces");
            }}
          >
            Voir ma carte d'accès
          </Button>
          <NotificationAsk reason="Active les notifications pour être prévenu des changements : consignes, place libérée, annulation." />
          <Button variant="plate" icon="close" onPress={dismissAnnouncement}>
            Plus tard
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}
