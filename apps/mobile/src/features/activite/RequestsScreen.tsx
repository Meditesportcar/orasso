// « Demandes » de l'Activité (lot R7c2, maquette R7.2 `ac:dem`) : tout ce qui attend ta réponse (abonnement, crew,
// invitations à un événement, staff, transferts de plaque), une carte par demande, accepter ou refuser sur place. Les
// demandes de message ne sont pas ici : elles sont dans Messages. Tour 2 : d'anciens liens (e-mails et notifications déjà
// envoyés) mènent encore ici pour une demande de contact, d'où la ligne « Demandes de message · N » vers Messages.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { messagingLabels, requestCountSpoken, requestCountText, requestRowCounts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { InvitationMenu } from "@/features/event/invite/InviteParts";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { FlowScreen } from "@/ui/Screens";

import { RequestList, useRequestList } from "./RequestList";

const { space3 } = tokens.spacing;

export function RequestsScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const [menuFrom, setMenuFrom] = useState<{ userId: string; pseudo: string }[] | null>(null);
  const changed = useRef(false);
  // La feuille est-elle encore ouverte ? (la coupure répond parfois après sa fermeture : alors on relit tout de suite)
  const sheetOpen = useRef(false);
  const list = useRequestList((r) => r.kind !== "contact");
  const summary = useApi(() => api.inboxSummary(), []);
  const reloadAll = useCallback(async () => {
    await Promise.all([list.first.reload(), summary.reload(), refreshMe()]);
  }, [list.first.reload, summary.reload, refreshMe]);
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "inbox.changed" || event.type === "notification") void reloadAll();
  });
  // Résumé en panne : les nombres se lisent dans la liste (jamais « 0 » parce que le résumé manque).
  const { activityRequests, messageRequests, atLeast } = requestRowCounts(summary.data, list.first.data, {
    summary: Boolean(summary.error),
    list: Boolean(list.first.error),
  });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/activite"));
  return (
    <FlowScreen
      title="Demandes"
      facts={activityRequests ? `${requestCountText(activityRequests, atLeast)} en attente de ta réponse` : undefined}
      onClose={close}
      closeLabel="Retour à l'Activité"
      onRefresh={reloadAll}
      overlays={
        // Lot R7-fix-invite : « ⋯ » d'une invitation de passionnés. La liste se relit à la fermeture du menu (la carte
        // peut disparaître : plus aucune invitation) ; si la coupure n'aboutit qu'après la fermeture (tour 2), elle se
        // relit dès le succès.
        <InvitationMenu
          from={menuFrom}
          onClose={() => {
            sheetOpen.current = false;
            setMenuFrom(null);
            if (changed.current) {
              changed.current = false;
              void reloadAll();
            }
          }}
          onChanged={() => {
            if (sheetOpen.current) changed.current = true;
            else void reloadAll();
          }}
        />
      }
    >
      {messageRequests ? (
        <Pressable
          onPress={() => router.push("/messages")}
          accessibilityRole="link"
          accessibilityLabel={`${messagingLabels.messageRequests}, ${requestCountSpoken(messageRequests, atLeast)}`}
          style={[styles.row, { backgroundColor: c.surface }]}
          testID="requests-messages-row"
        >
          <View style={[styles.mail, { backgroundColor: c.surfaceRaised }]}>
            <Icon name="chat" size={20} color={c.ink} />
          </View>
          <Text variant="bodyStrong" color={c.ink} style={styles.text}>
            {`${messagingLabels.messageRequests} · ${requestCountText(messageRequests, atLeast)}`}
          </Text>
          <Icon name="next" size={20} color={c.ink} />
        </Pressable>
      ) : null}
      <RequestList
        list={list}
        empty={messagingLabels.noRequests}
        onChanged={() => void reloadAll()}
        onInviteMenu={(from) => {
          sheetOpen.current = true;
          setMenuFrom(from);
        }}
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  mail: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
});
