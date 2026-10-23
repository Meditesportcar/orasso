// Ce qui alimente le bandeau d'annonce unique (lot M6, maquette 9.1) :
// - « Retenue ! » : une candidature passée « retenue » et pas encore annoncée sur cet appareil (`useApplications`, une
//   seule fois par candidature ; remplace la feuille « Tu es retenu » et ses deux boutons empilés, retour 25) ; le ticket
//   pulse dans Sorties ; toucher le bandeau ouvre Sorties ;
// - toute notification reçue pendant l'utilisation (canal temps réel `user:<id>`) : liste d'attente, refus, place
//   libérée, message, demande, accréditation, certification… ; toucher ouvre son écran (même chemin que la notification
//   du système). Hors de l'appli, le push du système reste ; dans l'appli, plus de bannière du système en double.
import { announceToneOf, notificationAnnounced, pushIsForAccount } from "@orasso/shared";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useApplications } from "@/lib/applications";
import { formatDay } from "@/lib/format";
import { appLinkOf } from "@/lib/links";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { announce, pulseTicket } from "./Announce";

type NotificationEvent = {
  /** Tour 2 : le serveur dit si la notification est livrée (type ou famille coupés : pas de bandeau). */
  delivered?: boolean;
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

  // Une notification reçue appli ouverte (temps réel ou push) : un bandeau, une seule fois par notification.
  const announceNotification = (n: NotificationEvent) => {
    if (!n?.id || !notificationAnnounced(n.type, { screen: n.data?.screen, delivered: n.delivered })) return;
    // Déjà sur l'écran que la notification ouvrirait (la conversation d'un message) : rien à annoncer.
    const link = appLinkOf(n.data?.link);
    if (link && link === pathname) return;
    const applicationId = typeof n.data?.applicationId === "string" ? n.data.applicationId : null;
    const passionate = n.data?.screen !== "provider_applications";
    if (applicationId && passionate) pulseTicket(applicationId);
    announce({
      id: `notification-${n.id}`,
      tone: announceToneOf(n.type),
      title: n.title,
      text: n.body ?? undefined,
      icon: n.type.startsWith("message") || n.type === "contact_request" ? "chat" : "bell",
      // Une décision ou une place proposée : Sorties, où le ticket concerné pulse ; le reste (prestataire compris) suit
      // le lien de la notification.
      onOpen: () => {
        if (passionate && (n.type.startsWith("application_") || n.type.startsWith("offer_"))) {
          if (applicationId) pulseTicket(applicationId);
          router.navigate("/acces");
        } else onOpenNotification(n.data);
      },
    });
  };
  const latest = useRef(announceNotification);
  latest.current = announceNotification;
  const userIdRef = useRef(me?.user.id);
  userIdRef.current = me?.user.id;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    // Une décision du tri : les candidatures se rechargent tout de suite (le « Retenue ! » part de là).
    if (event.type === "application.changed") {
      void reload();
      return;
    }
    if (event.type === "notification") announceNotification(event.payload as NotificationEvent);
  });

  // Tour 2 (point 3) : le temps réel coupé, un push reçu appli ouverte s'annonce quand même, avec la même clé.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationReceivedListener((received) => {
      const content = received.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const id = typeof data.notificationId === "string" ? data.notificationId : received.request.identifier;
      const type = typeof data.notificationType === "string" ? data.notificationType : "";
      // Tour 3 (vie privée) : un push n'est annoncé que pour le compte ouvert (destinataire opaque, recipient).
      if (!type || !pushIsForAccount(data.recipient, userIdRef.current)) return;
      // Tour 3 (point 4) : une décision du tri (« Retenue » compris) recharge les candidatures, comme le temps réel ;
      // « Retenue ! » s'annonce alors une seule fois (candidatures déjà annoncées gardées sur l'appareil).
      if (type.startsWith("application_") || type.startsWith("offer_")) void reloadRef.current();
      latest.current({ id, type, title: content.title ?? "", body: content.body ?? null, data });
    });
    return () => sub.remove();
  }, []);

  return null;
}
