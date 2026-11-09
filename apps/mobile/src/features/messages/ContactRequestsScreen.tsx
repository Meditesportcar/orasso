// « Demandes de message » de Messages (lot R7c2, maquette R7.3 `mg:dem`) : les messages de personnes que tu ne suis pas, y
// compris une réponse à ta story (règle de contact de R6). Ils ne savent pas que tu as lu tant que tu n'acceptes pas ;
// accepter ouvre la conversation, refuser l'efface sans prévenir. Mêmes cartes que les Demandes de l'Activité.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { messagingLabels, type RequestItem } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { ContactRequest } from "@/features/activite/requests/contact";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export function ContactRequestsScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  // Les demandes de message reçues (route de la règle de contact, R6) : toutes, sans pagination à traverser.
  const contacts = useApi(() => api.contactRequests(), []);
  const items: RequestItem[] = (contacts.data?.items ?? [])
    .filter((r) => r.direction === "in")
    .map((r) => ({
      kind: "contact",
      id: r.id,
      from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
      at: r.createdAt,
      payload: { message: r.message, grade: r.person.grade },
    }));
  const summary = useApi(() => api.inboxSummary(), []);
  const reloadAll = useCallback(async () => {
    await Promise.all([contacts.reload(), summary.reload(), refreshMe()]);
  }, [contacts.reload, summary.reload, refreshMe]);
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "inbox.changed" || event.type === "notification") void reloadAll();
  });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/messages"));
  return (
    <FlowScreen
      title={messagingLabels.messageRequests}
      facts="De personnes qui ne te suivent pas"
      onClose={close}
      closeLabel="Retour aux messages"
      onRefresh={reloadAll}
    >
      <View style={styles.note}>
        <Icon name="lock" size={16} color={c.inkMuted} />
        <Text variant="caption" color={c.inkMuted} style={styles.noteText}>
          Ils ne savent pas que tu as lu tant que tu n'acceptes pas. Accepter ouvre la conversation ; refuser l'efface,
          sans prévenir.
        </Text>
      </View>
      {contacts.error && !contacts.data ? (
        <LoadError message={contacts.error.message} onRetry={() => void contacts.reload()} />
      ) : null}
      {items.map((item) => (
        <ContactRequest key={item.id} item={item} onDone={() => void reloadAll()} />
      ))}
      {contacts.data && items.length === 0 ? <Muted variant="body">{messagingLabels.noRequests}</Muted> : null}
      {!contacts.data && contacts.loading ? <Muted variant="body">Chargement…</Muted> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start", paddingBottom: space3 - space2 },
  noteText: { flex: 1 },
});
