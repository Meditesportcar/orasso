// Mes amis (lot 17), depuis Moi : demandes reçues et envoyées, liste des amis, retrait, scan du QR d'un ami.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, socialLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FriendQrScanner } from "@/features/FriendQrScanner";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function Amis() {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const friends = useApi(() => api.friends(), [], { cacheKey: "friends" });
  const requests = useApi(() => api.friendRequests(), []);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    await Promise.all([friends.reload(), requests.reload()]);
  };
  const incoming = requests.data?.items.filter((r) => r.direction === "in") ?? [];
  const outgoing = requests.data?.items.filter((r) => r.direction === "out") ?? [];

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      await reload();
    }
  }

  const open = (pseudo: string) => router.push(`/u/${encodeURIComponent(pseudo)}`);
  return (
    <FlowScreen
      title={socialLabels.myFriends}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onRefresh={reload}
      overlays={<FriendQrScanner visible={scan} onClose={() => setScan(false)} onDone={() => void reload()} />}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button variant="secondary" icon="qr" onPress={() => setScan(true)} fullWidth testID="friend-scan-open">
        {socialLabels.scanFriend}
      </Button>

      {incoming.length > 0 ? (
        <>
          <SectionTitle>{`${socialLabels.friendRequestsIn} · ${incoming.length}`}</SectionTitle>
          {incoming.map((r) => (
            <Plate key={r.id} style={styles.card} testID="request-in">
              <Pressable style={styles.head} onPress={() => open(r.person.pseudo)} accessibilityRole="link">
                <Avatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={44} />
                <View style={styles.text}>
                  <Text variant="posterS" color={t.color.plateInk}>
                    {r.person.pseudo}
                  </Text>
                  {r.message ? (
                    <Text variant="body" color={t.color.plateMuted}>
                      {r.message}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  icon="check"
                  loading={busy === r.id}
                  onPress={() => void run(r.id, () => api.acceptFriend(r.id))}
                >
                  {socialLabels.accept}
                </Button>
                <Button
                  variant="secondary"
                  icon="close"
                  loading={busy === r.id}
                  onPress={() => void run(r.id, () => api.declineFriend(r.id))}
                >
                  {socialLabels.decline}
                </Button>
              </View>
            </Plate>
          ))}
        </>
      ) : null}

      <SectionTitle>{`${socialLabels.myFriends} · ${friends.data?.items.length ?? 0}`}</SectionTitle>
      {friends.data && friends.data.items.length === 0 ? <Muted variant="body">{socialLabels.noFriends}</Muted> : null}
      {friends.data?.items.map((f) => (
        <Plate key={f.userId} style={styles.card} testID="friend-row">
          <Pressable style={styles.head} onPress={() => open(f.pseudo)} accessibilityRole="link">
            <Avatar url={f.avatarUrl} pseudo={f.pseudo} size={44} />
            <View style={styles.text}>
              <Text variant="posterS" color={t.color.plateInk}>
                {f.pseudo}
              </Text>
              <Chip surface="plate">{gradeLabels[f.grade]}</Chip>
            </View>
          </Pressable>
          <Button
            variant="plate"
            icon="close"
            loading={busy === f.userId}
            onPress={() => void run(f.userId, () => api.removeFriend(f.userId))}
          >
            {socialLabels.removeFriend}
          </Button>
        </Plate>
      ))}

      {outgoing.length > 0 ? (
        <>
          <SectionTitle>{socialLabels.friendRequestsOut}</SectionTitle>
          {outgoing.map((r) => (
            <Plate key={r.id} style={styles.card} testID="request-out">
              <Pressable style={styles.head} onPress={() => open(r.person.pseudo)} accessibilityRole="link">
                <Avatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={44} />
                <View style={styles.text}>
                  <Text variant="posterS" color={t.color.plateInk}>
                    {r.person.pseudo}
                  </Text>
                  <Text variant="meta" color={t.color.plateMuted}>
                    {socialLabels.requestSent}
                  </Text>
                </View>
              </Pressable>
              <Button
                variant="plate"
                icon="undo"
                loading={busy === r.id}
                onPress={() => void run(r.id, () => api.removeFriend(r.person.userId))}
              >
                Annuler
              </Button>
            </Plate>
          ))}
        </>
      ) : null}

      <Button variant="plate" icon="search" onPress={() => goTab("explorer")} fullWidth>
        {socialLabels.searchPeople}
      </Button>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: space1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
