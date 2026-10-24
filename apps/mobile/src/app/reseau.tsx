// Lot R4c (maquette R4.6b) : « Ton réseau », plein écran en mode fiche. Trois onglets (abonnés, abonnements, amis) pour
// passer de l'un à l'autre sans revenir ; recherche dans la liste (côté serveur) ; 30 par page. Toi seul vois ces listes.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FollowedPage,
  type FollowersPage,
  type FollowPerson,
  type FriendItem,
  type FriendRequestView,
  networkLabels as N,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { FriendsList, type NetworkTab, PagesList, PeopleList } from "@/features/profil/network";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;
const TABS: NetworkTab[] = ["abonnes", "abonnements", "amis"];

type Paged<T> = { items: T[]; total: number; nextCursor: string | null };
type Lists = {
  followers?: Paged<FollowPerson>;
  people?: Paged<FollowPerson>;
  structures?: Paged<FollowedPage>;
  pros?: Paged<FollowedPage>;
  friends?: FriendItem[];
  requests?: FriendRequestView[];
};

export default function Reseau() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<NetworkTab>(
    TABS.includes(params.tab as NetworkTab) ? (params.tab as NetworkTab) : "abonnes",
  );
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState<Lists>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counts = useApi(() => api.network(), [], { cacheKey: "network" });

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const term = query || undefined;
    try {
      if (tab === "abonnes") {
        const followers = await api.followers(term);
        setLists((l) => ({ ...l, followers }));
      } else if (tab === "abonnements") {
        const [people, structures, pros] = await Promise.all([
          api.following("people", term),
          api.following("structures", term),
          api.following("pros", term),
        ]);
        setLists((l) => ({
          ...l,
          people: people as Paged<FollowPerson>,
          structures: structures as Paged<FollowedPage>,
          pros: pros as Paged<FollowedPage>,
        }));
      } else {
        const [friends, requests] = await Promise.all([
          api.friendsSearch(term),
          term ? Promise.resolve({ items: [] as FriendRequestView[] }) : api.friendRequests(),
        ]);
        setLists((l) => ({
          ...l,
          friends: friends.items,
          requests: requests.items.filter((r) => r.direction === "in"),
        }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const more = async (which: "followers" | "people" | "structures" | "pros") => {
    const current = lists[which];
    if (!current?.nextCursor) return;
    try {
      const page =
        which === "followers"
          ? await api.followers(query || undefined, current.nextCursor)
          : await api.following(which, query || undefined, current.nextCursor);
      setLists((l) => ({
        ...l,
        [which]: {
          items: [...(current.items as unknown[]), ...(page.items as unknown[])],
          total: page.total,
          nextCursor: page.nextCursor,
        },
      }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const n = counts.data;
  const tabLabel = (x: NetworkTab) => {
    const value = x === "abonnes" ? n?.followers : x === "abonnements" ? n?.following : n?.friends;
    const word = x === "abonnes" ? N.followers : x === "abonnements" ? N.following : N.friends;
    return value === undefined ? word(2) : `${value} ${word(value)}`;
  };

  const followers = lists.followers;
  const empty = (text: string) => (
    <Muted variant="body" testID="net-empty">
      {query ? N.emptySearch : text}
    </Muted>
  );

  return (
    <FlowScreen
      title={me?.profile.pseudo ?? N.title}
      facts={N.title}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/profil"))}
      closeLabel="Retour au profil"
      onRefresh={async () => {
        await Promise.all([load(), counts.reload()]);
      }}
    >
      <View style={[styles.seg, { backgroundColor: c.surfaceRaised }]} accessibilityRole="tablist" testID="net-tabs">
        {TABS.map((x) => {
          const on = x === tab;
          return (
            <Pressable
              key={x}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(x)}
              testID={`net-tab-${x}`}
              style={[styles.segBtn, on && { backgroundColor: c.ink }]}
            >
              <Text variant="bodyStrong" color={on ? c.ground : c.inkMuted} style={styles.segText}>
                {tabLabel(x)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.search, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
        <Icon name="search" size={18} color={c.inkMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={N.search}
          placeholderTextColor={c.inkMuted}
          accessibilityLabel={N.searchLabel}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: c.ink }]}
          testID="net-search"
        />
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !error ? <Muted variant="body">Chargement…</Muted> : null}

      {!loading && tab === "abonnes" && followers ? (
        followers.items.length ? (
          <PeopleList
            pages={followers as FollowersPage}
            onMore={() => void more("followers")}
            onError={setError}
            testID="net-followers"
          />
        ) : (
          empty(N.emptyFollowers)
        )
      ) : null}

      {!loading && tab === "abonnements" && lists.people && lists.structures && lists.pros ? (
        lists.people.total + lists.structures.total + lists.pros.total === 0 ? (
          empty(N.emptyFollowing)
        ) : (
          <>
            {lists.people.total ? (
              <PeopleList
                title={N.groupPeople}
                pages={lists.people}
                onMore={() => void more("people")}
                onError={setError}
                testID="net-people"
              />
            ) : null}
            <PagesList kind="structures" pages={lists.structures} onMore={() => void more("structures")} />
            <PagesList kind="pros" pages={lists.pros} onMore={() => void more("pros")} />
          </>
        )
      ) : null}

      {!loading && tab === "amis" && lists.friends && lists.requests ? (
        <>
          {lists.friends.length + lists.requests.length === 0 ? empty(N.emptyFriends) : null}
          <FriendsList
            requests={lists.requests}
            friends={lists.friends}
            onChanged={() => {
              void load();
              void counts.reload();
            }}
          />
          {/* Ajouter un ami (recherche, QR) : l'écran des amis, qui a quitté les réglages du profil. */}
          <SmButton kind="s" icon="add" wide onPress={() => router.push("/amis")} testID="net-add-friend">
            Ajouter un ami
          </SmButton>
        </>
      ) : null}

      <View style={[styles.note, { backgroundColor: c.surface }]} testID="net-privacy">
        <Icon name="lock" size={16} color={c.inkMuted} />
        <Text variant="caption" color={c.inkMuted} style={styles.noteText}>
          <Text variant="caption" color={c.ink} style={styles.noteStrong}>
            {N.privacyNoteStrong}
          </Text>{" "}
          {N.privacyNote}
        </Text>
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4 },
  segBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space1,
  },
  segText: { fontSize: 12, lineHeight: 14, textAlign: "center" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 48,
    paddingHorizontal: space3,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontFamily: "Archivo-Regular", fontSize: 15, minHeight: 44 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start", padding: space3, borderRadius: 14 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  noteStrong: { fontFamily: "Archivo-Bold", fontSize: 12.5 },
});
