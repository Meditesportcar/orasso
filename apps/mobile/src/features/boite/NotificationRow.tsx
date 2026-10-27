// Une notification dans « Tout » de la Boîte (lot C2a : l'ancien Journal de la cloche, fondu dans la Boîte comme dans
// l'artefact DA v2 `sh-inbox`). Même ligne `.cap` qu'un message : l'avatar de l'auteur, sinon une pastille d'icône ;
// le titre, le corps, la date. Le lien ouvre l'écran (demande d'équipe → Équipe de la structure, alerte → Administration).
// La suggestion météo garde son bouton « Passer en Incertain » (lot 28).
import { Button, Icon, Text, useTheme } from "@orasso/design-system/native";
import { eventInviteLabels, SET_OUTLOOK_UNCERTAIN_ACTION, weatherTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { InvitationMenu } from "@/features/event/invite/InviteParts";
import { adminLinkOf } from "@/lib/adminModel";
import { api, type NotificationItem } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { appLinkOf, teamRequestTarget } from "@/lib/links";
import { usePersona } from "@/lib/persona";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";

import { CapRow, Count } from "./CapRow";

type Actor = { userId?: string; pseudo?: string; avatarUrl?: string | null };
const actorOf = (n: NotificationItem): Actor | null => {
  const actor = n.data?.actor;
  return actor && typeof actor === "object" ? (actor as Actor) : null;
};

/** Lot R6c, tour 2 : les auteurs d'une invitation (`data.actors`, la plus récente d'abord ; sinon l'auteur seul). */
function invitationAuthors(n: NotificationItem, actor: Actor | null): { userId: string; pseudo: string }[] {
  const raw = n.data?.actors;
  const list = Array.isArray(raw)
    ? raw.filter(
        (a): a is { userId: string; pseudo: string } =>
          Boolean(a) && typeof a.userId === "string" && typeof a.pseudo === "string",
      )
    : [];
  if (list.length) return list;
  return actor?.userId ? [{ userId: actor.userId, pseudo: actor.pseudo ?? "" }] : [];
}

/** Les mots d'une invitation, déjà attribués par l'API (« Kenji_66 : « Viens ! » ») ; ancien format : `data.note`. */
function invitationNotes(n: NotificationItem): string[] {
  const raw = n.data?.notes;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return typeof n.data?.note === "string" && n.data.note ? [`« ${n.data.note} »`] : [];
}

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
  // Lot R6c (R6.6) : une invitation à un événement : « Voir la fiche » et « ⋯ » (couper, réglages, signaler).
  const invitation = n.type === "event_invited" && typeof actor?.userId === "string";
  // Tour 2 : tous les auteurs d'une invitation regroupée (le menu propose de couper chacun), et leurs mots attribués.
  const authors = invitation ? invitationAuthors(n, actor) : [];
  const notes = invitation ? invitationNotes(n) : [];
  const [menu, setMenu] = useState(false);
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
        // Lot R6c : une invitation montre sa date et son lieu ; son mot, en entier, passe en citation sous la ligne.
        lines={[invitation && n.body ? (n.body.split("\n")[0] ?? n.body) : n.body, formatDayHour(n.createdAt)]}
        trailing={!n.readAt ? <Count n={1} /> : null}
        onPress={open}
      />
      {invitation ? (
        <View style={styles.inviteRow}>
          {notes.map((line) => (
            <Text key={line} variant="caption" color={c.ink} style={styles.quote} testID="notif-invite-note">
              {line}
            </Text>
          ))}
          {open ? (
            <SmButton icon="next" onPress={open} testID="notif-invite-open">
              {eventInviteLabels.seeEvent}
            </SmButton>
          ) : null}
          <SmButton
            kind="g"
            icon="more"
            onPress={() => setMenu(true)}
            accessibilityLabel={eventInviteLabels.moreA11y}
            testID="notif-invite-more"
          />
          <InvitationMenu from={menu && authors.length ? authors : null} onClose={() => setMenu(false)} />
        </View>
      ) : null}
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
  inviteRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingTop: 8, paddingLeft: 56 },
  quote: { width: "100%", fontStyle: "italic" },
});
