// Ce qui alimente le bandeau d'annonce unique (lot M6, maquette 9.1) :
// - « Retenue ! » : une candidature passée « retenue » et pas encore annoncée sur cet appareil (`useApplications`, une
//   seule fois par candidature ; remplace la feuille « Tu es retenu » et ses deux boutons empilés, retour 25) ; le ticket
//   pulse dans Sorties ; toucher le bandeau ouvre Sorties ;
// - toute notification reçue pendant l'utilisation (canal temps réel `user:<id>`) : liste d'attente, refus, place
//   libérée, message, demande, accréditation, certification… ; toucher ouvre son écran (même chemin que la notification
//   du système). Hors de l'appli, le push du système reste ; dans l'appli, plus de bannière du système en double.
import { announceToneOf, notificationAnnounced } from "@orasso/shared";
import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { useApplications } from "@/lib/applications";
import { formatDay } from "@/lib/format";
import { appLinkOf } from "@/lib/links";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { announce, pulseTicket } from "./Announce";

type NotificationEvent = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data?: Record<string, unknown>;
};

export function AnnouncementsBridge({
  onOpenNotification,
}: {
  onOpenNotification: (data: Record<string, unknown> | undefined) => void;
}) {
  const { me } = useSession();
  const { announcement, dismissAnnouncement, reload } = useApplications();
  const router = useRouter();
  const pathname = usePathname();

  // « Retenue ! » : annoncée une fois, la candidature est aussitôt notée comme annoncée.
  useEffect(() => {
    const app = announcement;
    if (!app) return;
    const vehicle = app.vehicle?.label;
    announce({
      id: `application-${app.id}`,
      tone: "good",
      title: "Retenue !",
      text: [app.event.title, formatDay(app.event.startsAt), vehicle ? `ta ${vehicle} est attendue` : null]
        .filter(Boolean)
        .join(" · "),
      onOpen: () => {
        pulseTicket(app.id);
        router.navigate("/acces");
      },
    });
    pulseTicket(app.id);
    dismissAnnouncement();
  }, [announcement, dismissAnnouncement, router]);

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    // Une décision du tri : les candidatures se rechargent tout de suite (le « Retenue ! » part de là).
    if (event.type === "application.changed") {
      void reload();
      return;
    }
    if (event.type !== "notification") return;
    const n = event.payload as NotificationEvent;
    if (!n?.id || !notificationAnnounced(n.type)) return;
    // Déjà sur l'écran que la notification ouvrirait (la conversation d'un message) : rien à annoncer.
    const link = appLinkOf(n.data?.link);
    if (link && link === pathname) return;
    const applicationId = typeof n.data?.applicationId === "string" ? n.data.applicationId : null;
    if (applicationId) pulseTicket(applicationId);
    announce({
      id: `notification-${n.id}`,
      tone: announceToneOf(n.type),
      title: n.title,
      text: n.body ?? undefined,
      icon: n.type.startsWith("message") || n.type === "contact_request" ? "chat" : "bell",
      onOpen: () => onOpenNotification(n.data),
    });
  });

  return null;
}
