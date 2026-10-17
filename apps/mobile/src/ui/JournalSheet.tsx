// Le Journal, derrière la cloche : le fil d'actualité des amis et les notifications de l'utilisateur dans un seul fil
// chronologique (lot 17, ARCHITECTURE-SUITE § 2.4). Sept jours en arrière, sauf ce qui n'a pas été lu.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { SET_OUTLOOK_UNCERTAIN_ACTION, socialLabels, weatherTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { adminLinkOf } from "@/lib/adminModel";
import { api, type NotificationItem } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { appLinkOf, teamRequestTarget } from "@/lib/links";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "./AppSheet";
import { Avatar } from "./Avatar";

const { space1, space2 } = tokens.spacing;

type Actor = { pseudo?: string; avatarUrl?: string | null };
const actorOf = (n: NotificationItem): Actor | null => {
  const actor = n.data?.actor;
  return actor && typeof actor === "object" ? (actor as Actor) : null;
};

/** Suggestion météo (lot 28) : le bouton passe l'événement en Incertain sans quitter le Journal. */
function UncertainAction({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <Text variant="meta" color={t.color.plateMuted}>
        Passé en Incertain : les inscrits sont prévenus.
      </Text>
    );
  }
  return (
    <>
      <Button
        variant="plate"
        icon="wait"
        loading={state === "busy"}
        onPress={async () => {
          setState("busy");
          setError(null);
          try {
            await api.setOutlook(eventId, "uncertain");
            setState("done");
          } catch (e) {
            setState("idle");
            setError(
              e instanceof ApiRequestError && e.status === 403
                ? "Active la double authentification (Moi, Sécurité) pour modifier l'événement depuis l'appli."
                : e instanceof Error
                  ? e.message
                  : "Échec, réessaie.",
            );
          }
        }}
      >
        {weatherTexts.suggestionAction}
      </Button>
      {error ? (
        <Text variant="meta" color={t.color.plateMuted} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </>
  );
}

const asksUncertain = (n: NotificationItem) =>
  n.data?.action === SET_OUTLOOK_UNCERTAIN_ACTION && typeof n.data.eventId === "string";

export function JournalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const { choose } = usePersona();
  const list = useApi(() => api.notifications(), [visible], { enabled: visible });

  // Ouvrir le Journal, c'est lire : les pastilles de la cloche retombent.
  useEffect(() => {
    if (visible && list.data?.items.some((n) => !n.readAt)) void api.markNotificationsRead().catch(() => undefined);
  }, [visible, list.data]);

  return (
    <AppSheet visible={visible} onClose={onClose} from="top" accessibilityLabel="Journal">
      <Text variant="title" color={t.color.ink}>
        {socialLabels.journal}
      </Text>
      {list.loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
      ) : list.data && list.data.items.length > 0 ? (
        list.data.items.map((n) => {
          const actor = actorOf(n);
          const link = appLinkOf(n.data?.link);
          const team = teamRequestTarget(n.data);
          // Lot 35d : alerte de modération, demande d'aide d'une structure → écran de la casquette Administration.
          const admin = adminLinkOf(n.data?.link);
          return (
            <Pressable
              key={n.id}
              disabled={!link && !team && !admin}
              accessibilityRole={link || team || admin ? "link" : undefined}
              accessibilityLabel={n.title}
              testID="journal-item"
              onPress={() => {
                if (team) {
                  // Lot 35a : une demande pour devenir staff ouvre l'écran Équipe de la structure.
                  onClose();
                  choose({ kind: "organizer", structureId: team }, "/(orga)/staff");
                  return;
                }
                if (admin) {
                  onClose();
                  choose({ kind: "admin" }, admin);
                  return;
                }
                if (!link) return;
                onClose();
                router.push(link as never);
              }}
            >
              <Plate style={styles.item}>
                <View style={styles.head}>
                  {actor ? <Avatar url={actor.avatarUrl} pseudo={actor.pseudo} size={32} /> : null}
                  <Text variant="bodyStrong" color={t.color.plateInk} style={styles.title}>
                    {n.title}
                  </Text>
                  {!n.readAt ? <View style={[styles.dot, { backgroundColor: t.color.accent }]} /> : null}
                </View>
                {n.body ? (
                  <Text variant="body" color={t.color.plateMuted}>
                    {n.body}
                  </Text>
                ) : null}
                {asksUncertain(n) ? <UncertainAction eventId={String(n.data?.eventId)} /> : null}
                <Text variant="meta" color={t.color.plateMuted}>
                  {formatDayHour(n.createdAt)}
                </Text>
              </Plate>
            </Pressable>
          );
        })
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          {list.error ? "Le Journal est hors ligne." : socialLabels.journalEmpty}
        </Text>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  item: { padding: 12, gap: space1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
