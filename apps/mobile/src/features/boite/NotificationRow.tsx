// Une notification dans « Tout » de la Boîte (lot C2a : l'ancien Journal de la cloche, fondu dans la Boîte comme dans
// l'artefact DA v2 `sh-inbox`). Même ligne `.cap` qu'un message : l'avatar de l'auteur, sinon une pastille d'icône ;
// le titre, le corps, la date. Le lien ouvre l'écran (demande d'équipe → Équipe de la structure, alerte → Administration).
// La suggestion météo garde son bouton « Passer en Incertain » (lot 28).
import { Button, Icon, Text, useTheme } from "@orasso/design-system/native";
import { SET_OUTLOOK_UNCERTAIN_ACTION, weatherTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { adminLinkOf } from "@/lib/adminModel";
import { api, type NotificationItem } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { appLinkOf, teamRequestTarget } from "@/lib/links";
import { usePersona } from "@/lib/persona";
import { Avatar } from "@/ui/Avatar";

import { CapRow, Count } from "./CapRow";

type Actor = { pseudo?: string; avatarUrl?: string | null };
const actorOf = (n: NotificationItem): Actor | null => {
  const actor = n.data?.actor;
  return actor && typeof actor === "object" ? (actor as Actor) : null;
};

function UncertainAction({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <Text variant="caption" color={t.color.inkMuted}>
        Passé en Incertain : les inscrits sont prévenus.
      </Text>
    );
  }
  return (
    <>
      <Button
        variant="secondary"
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
        <Text variant="caption" color={t.color.inkMuted} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </>
  );
}

export function NotificationRow({ n, onLeave }: { n: NotificationItem; onLeave: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { choose } = usePersona();
  const actor = actorOf(n);
  const link = appLinkOf(n.data?.link);
  const team = teamRequestTarget(n.data);
  // Lot 35d : alerte de modération, demande d'aide d'une structure → écran de la casquette Administration.
  const admin = adminLinkOf(n.data?.link);
  const asksUncertain = n.data?.action === SET_OUTLOOK_UNCERTAIN_ACTION && typeof n.data.eventId === "string";
  const open =
    link || team || admin
      ? () => {
          onLeave();
          if (team) choose({ kind: "organizer", structureId: team }, "/(orga)/equipe");
          else if (admin) choose({ kind: "admin" }, admin);
          else if (link) router.push(link as never);
        }
      : undefined;
  return (
    <View testID="journal-item">
      <CapRow
        leading={
          actor ? (
            <Avatar url={actor.avatarUrl} pseudo={actor.pseudo} size={44} />
          ) : (
            <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
              <Icon name="bell" size={20} color={c.ink} />
            </View>
          )
        }
        title={n.title}
        lines={[n.body, formatDayHour(n.createdAt)]}
        trailing={!n.readAt ? <Count n={1} /> : null}
        onPress={open}
      />
      {asksUncertain ? (
        <View style={styles.action}>
          <UncertainAction eventId={String(n.data?.eventId)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  action: { paddingTop: 8, gap: 6 },
});
