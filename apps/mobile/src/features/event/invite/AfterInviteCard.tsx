// Lot R6c (maquette R6.5) : juste après « Candidature envoyée », la carte « Invite du monde à venir » : trois visages
// proposés (mon crew d'abord, puis mon réseau), et « Inviter ». Fermée, elle ne revient pas pour cet événement (choix
// gardé dans le cache du compte, `kv.ts`) ; la fiche garde « Inviter du monde ».
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventInviteLabels as L } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { cacheGetJson, cacheSetJson } from "@/lib/kv";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";

const { space1 } = tokens.spacing;
const CLOSED_KEY = "invite-card-closed";
const CLOSED_MAX = 50;

export function AfterInviteCard({ eventId, onInvite }: { eventId: string; onInvite: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const [closed, setClosed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void cacheGetJson<string[]>(CLOSED_KEY).then((ids) => {
      if (alive) setClosed(Boolean(ids?.includes(eventId)));
    });
    return () => {
      alive = false;
    };
  }, [eventId]);
  const list = useApi(() => api.inviteCandidates(eventId), [eventId], { enabled: closed === false });
  const faces = (list.data?.people ?? []).filter((p) => p.state === "available").slice(0, 3);
  if (closed !== false || faces.length === 0) return null;
  const close = async () => {
    setClosed(true);
    const ids = (await cacheGetJson<string[]>(CLOSED_KEY)) ?? [];
    await cacheSetJson(CLOSED_KEY, [eventId, ...ids.filter((id) => id !== eventId)].slice(0, CLOSED_MAX));
  };
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="after-invite-card"
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
          <Icon name="crew" size={20} color={c.accentText} />
        </View>
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink}>
            {L.afterTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.afterText}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.afterClose}
          onPress={() => void close()}
          hitSlop={8}
          style={styles.x}
          testID="after-invite-close"
        >
          <Icon name="close" size={18} color={c.inkMuted} />
        </Pressable>
      </View>
      <View style={styles.faces}>
        {faces.map((p) => (
          <View key={p.userId} style={styles.faceCol}>
            <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
            <Text variant="meta" color={c.inkMuted} numberOfLines={1}>
              {p.pseudo}
            </Text>
          </View>
        ))}
      </View>
      <SmButton kind="s" big wide icon="send" onPress={onInvite} testID="after-invite-open">
        {L.afterButton}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 14, borderRadius: 18, alignSelf: "stretch" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  x: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  faces: { flexDirection: "row", gap: 18, paddingLeft: space1 },
  faceCol: { alignItems: "center", gap: space1 / 2, maxWidth: 72 },
});
