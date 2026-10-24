// Lot R4c (maquettes R4.6, R4.6b, R4.6c) : le réseau d'un passionné. En-tête du profil : trois compteurs (abonnés,
// abonnements, amis), chacun ouvre sa liste ; « Mon profil public » et le crew côte à côte. Écran des listes (mode
// fiche) : trois onglets, recherche, « Suivre aussi » / « Suivi », demandes d'amis en tête des amis, « Toi seul vois ces
// listes ». En-tête compact d'un profil public (le sien en aperçu, ou celui d'un autre) : avatar à gauche, compteurs sur
// une ligne, « Ajouter en ami » principal, « Suivre » secondaire, ✉ en icône.
import { Button, departmentChoices, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FollowedPage,
  type FollowPerson,
  type FriendItem,
  type FriendRequestView,
  gradeLabels,
  networkLabels as N,
  type NetworkCounts,
  type UserProfileView,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fitWordSize, WIDE_EM } from "@/features/home/fit";
import { CrewDot, Num, SmButton, TagWin } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export type NetworkTab = "abonnes" | "abonnements" | "amis";

/** « Pyrénées-Orientales (66) ». */
export function departmentCaption(code: string | undefined): string | null {
  if (!code) return null;
  const name = departmentChoices.find((d) => d.code === code)?.name;
  return name ? `${name} (${code})` : `Département ${code}`;
}

/** `.r4cnt` : trois compteurs, chacun ouvre sa liste. */
export function NetworkCounters({
  counts,
  onOpen,
}: {
  counts: Pick<NetworkCounts, "followers" | "following" | "friends"> | null;
  onOpen: (tab: NetworkTab) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const cells: [NetworkTab, number | null, (n: number) => string][] = [
    ["abonnes", counts?.followers ?? null, N.followers],
    ["abonnements", counts?.following ?? null, N.following],
    ["amis", counts?.friends ?? null, N.friends],
  ];
  return (
    <View
      style={[styles.counts, { backgroundColor: c.ground }]}
      accessibilityRole="summary"
      accessibilityLabel={N.countsGroup}
      testID="profil-counters"
    >
      {cells.map(([tab, n, label], i) => (
        <Pressable
          key={tab}
          accessibilityRole="button"
          accessibilityLabel={n === null ? label(2) : `${n} ${label(n)}`}
          onPress={() => onOpen(tab)}
          testID={`profil-count-${tab}`}
          style={({ pressed }) => [
            styles.count,
            i > 0 && { borderLeftWidth: 1, borderLeftColor: c.line },
            pressed && styles.pressed,
          ]}
        >
          <Num size={28}>{n === null ? "—" : String(n)}</Num>
          <Text variant="caption" color={c.inkMuted} style={styles.countLabel}>
            {label(n ?? 2)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** `.r4lk` : deux accès côte à côte. */
export function ProfileLinks({
  crew,
  onPublic,
  onCrew,
}: {
  crew: { name: string; caption: string } | null;
  onPublic: () => void;
  onCrew: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const tile = (lead: ReactNode, title: string, caption: string, onPress: () => void, testID: string, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.link, { backgroundColor: c.ground }, pressed && styles.pressed]}
    >
      {lead}
      <View style={styles.linkText}>
        <Text variant="bodyStrong" color={c.ink} style={styles.linkTitle}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.linkCaption}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
  return (
    <View style={styles.links}>
      {tile(
        <View style={[styles.linkIcon, { backgroundColor: c.surfaceRaised }]}>
          <Icon name="eye" size={18} color={c.ink} />
        </View>,
        "Mon profil public",
        "Comme te voient les autres",
        onPublic,
        "profil-public",
        "Mon profil public, comme te voient les autres",
      )}
      {tile(
        <CrewDot initials={crew ? crew.name.slice(0, 2).toUpperCase() : "+"} size={34} />,
        crew ? crew.name : "Un crew ?",
        crew ? crew.caption : "Rejoins ou crée un crew",
        onCrew,
        "profil-crew",
        crew ? `Mon crew, ${crew.name}` : "Mon crew, rejoins ou crée un crew",
      )}
    </View>
  );
}

/** Rond de la personne (photo ou initiale). */
function Face({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View
      style={[
        styles.face,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.color.surfaceRaised },
      ]}
    >
      {source ? (
        <Photo source={source} style={StyleSheet.absoluteFill} />
      ) : (
        <Text variant="bodyStrong" color={t.color.ink}>
          {name.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** `.prow` : une personne, un organisateur ou un pro, avec son action à droite. */
function Row({
  face,
  name,
  caption,
  action,
  onPress,
  testID,
  actionBelow,
}: {
  face: ReactNode;
  name: string;
  caption: string | null;
  action?: ReactNode;
  onPress: () => void;
  testID: string;
  /** Les boutons sous le nom (demande d'ami : « Accepter » et ✕ laissent toute la largeur au pseudo). */
  actionBelow?: boolean;
}) {
  const { t } = useTheme();
  const [w, setW] = useState(0);
  // Un pseudo long rapetisse (jusqu'à 11 px) au lieu de se couper à côté des boutons.
  const size = fitWordSize(name, w, 14, 11, 0.62);
  return (
    <View style={[styles.row, actionBelow && styles.rowBelow]} testID={testID}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={name}
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        {face}
        <View style={styles.rowText} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          <Text variant="bodyStrong" color={t.color.ink} style={[styles.rowName, { fontSize: size }]}>
            {name}
          </Text>
          {caption ? (
            <Text variant="caption" color={t.color.inkMuted} style={styles.rowCaption}>
              {caption}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {action}
    </View>
  );
}

/** `.sug` : un groupe titré (Personnes, Organisateurs, Pros, Demandes reçues, Tes amis). */
function Group({
  title,
  count,
  children,
  testID,
}: {
  title?: string;
  count?: number;
  children: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      {title ? (
        <View style={styles.groupHead}>
          <Text variant="posterS" color={t.color.ink} accessibilityRole="header" style={styles.groupTitle}>
            {title}
          </Text>
          {count !== undefined ? (
            <Text variant="caption" color={t.color.inkMuted}>
              {String(count)}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.groupBody, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
        {children}
      </View>
    </View>
  );
}

/** « Suivre aussi » / « Suivi » d'une personne (toucher « Suivi » ne la suit plus). */
function FollowToggle({
  person,
  onError,
  onChanged,
}: {
  person: FollowPerson;
  onError: (m: string) => void;
  onChanged?: () => void;
}) {
  const [following, setFollowing] = useState(person.following);
  const [busy, setBusy] = useState(false);
  if (!following && !person.canFollow) return null;
  return (
    <SmButton
      kind={following ? "g" : "s"}
      icon={following ? "check" : "add"}
      disabled={busy}
      accessibilityLabel={following ? `${N.unfollow} ${person.pseudo}` : `${N.followBack} ${person.pseudo}`}
      testID={following ? "net-followed" : "net-follow"}
      onPress={async () => {
        setBusy(true);
        try {
          const r = following ? await api.unfollow(person.pseudo) : await api.follow(person.pseudo);
          setFollowing(r.following);
          onChanged?.();
        } catch (e) {
          onError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {following ? N.followed : N.followBack}
    </SmButton>
  );
}

function personCaption(p: FollowPerson): string {
  return [p.vehicle ?? gradeLabels[p.grade], p.friend ? N.yourFriend : null].filter(Boolean).join(" · ");
}

/** Liste paginée de personnes (abonnés, ou personnes suivies). */
export function PeopleList({
  pages,
  onMore,
  onError,
  testID,
  title,
  onChanged,
}: {
  pages: { items: FollowPerson[]; total: number; nextCursor: string | null };
  onMore: () => void;
  onError: (m: string) => void;
  /** Tour 2 : après suivre / ne plus suivre (les nombres se relisent). */
  onChanged?: () => void;
  testID: string;
  title?: string;
}) {
  const router = useRouter();
  return (
    <>
      <Group title={title} count={title ? pages.total : undefined} testID={testID}>
        {pages.items.map((p) => (
          <Row
            key={p.userId}
            face={<Face url={p.avatarUrl} name={p.pseudo} />}
            name={p.pseudo}
            caption={personCaption(p)}
            onPress={() => router.push(`/u/${p.pseudo}`)}
            action={<FollowToggle person={p} onError={onError} onChanged={onChanged} />}
            testID="net-person"
          />
        ))}
      </Group>
      {pages.nextCursor ? (
        <SmButton kind="s" icon="down" wide onPress={onMore} testID={`${testID}-more`}>
          {`${N.more} (${pages.total - pages.items.length})`}
        </SmButton>
      ) : null}
    </>
  );
}

/** Organisateurs ou pros suivis. */
export function PagesList({
  kind,
  pages,
  onMore,
}: {
  kind: "structures" | "pros";
  pages: { items: FollowedPage[]; total: number; nextCursor: string | null };
  onMore: () => void;
}) {
  const router = useRouter();
  const { t } = useTheme();
  if (pages.total === 0) return null;
  return (
    <>
      <Group title={kind === "structures" ? N.groupStructures : N.groupPros} count={pages.total} testID={`net-${kind}`}>
        {pages.items.map((p) => (
          <Row
            key={p.id}
            face={
              <View
                style={[
                  styles.logo,
                  kind === "pros" ? styles.logoPro : null,
                  { backgroundColor: t.color.surfaceRaised },
                ]}
              >
                {p.logoUrl ? (
                  <Photo source={mediaSource(p.logoUrl)} style={StyleSheet.absoluteFill} />
                ) : (
                  <Text variant="label" color={t.color.ink}>
                    {p.name.slice(0, 3).toUpperCase()}
                  </Text>
                )}
              </View>
            }
            name={p.name}
            caption={p.caption}
            onPress={() => router.push(kind === "structures" ? `/o/${p.slug}` : `/p/${p.slug}`)}
            action={
              <View style={styles.followedTag}>
                <Icon name="check" size={14} color={t.color.inkMuted} />
                <Text variant="caption" color={t.color.inkMuted}>
                  {N.followed}
                </Text>
              </View>
            }
            testID="net-page"
          />
        ))}
      </Group>
      {pages.nextCursor ? (
        <SmButton kind="s" icon="down" wide onPress={onMore} testID={`net-${kind}-more`}>
          {`${N.more} (${pages.total - pages.items.length})`}
        </SmButton>
      ) : null}
    </>
  );
}

/** Onglet Amis : demandes reçues en tête, puis les amis avec ✉. */
export function FriendsList({
  requests,
  friends,
  onChanged,
}: {
  requests: FriendRequestView[];
  friends: FriendItem[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {requests.length ? (
        <Group title={N.requestsIn} count={requests.length} testID="net-requests">
          {requests.map((r) => (
            <Row
              key={r.id}
              face={<Face url={r.person.avatarUrl} name={r.person.pseudo} />}
              name={r.person.pseudo}
              caption={r.message ?? gradeLabels[r.person.grade]}
              onPress={() => router.push(`/u/${r.person.pseudo}`)}
              action={
                <View style={styles.actions}>
                  <SmButton kind="s" icon="check" onPress={() => run(() => api.acceptFriend(r.id))} testID="net-accept">
                    Accepter
                  </SmButton>
                  <SmButton
                    kind="g"
                    icon="close"
                    accessibilityLabel={`Refuser ${r.person.pseudo}`}
                    onPress={() => run(() => api.declineFriend(r.id))}
                    testID="net-decline"
                  />
                </View>
              }
              testID="net-request"
              actionBelow
            />
          ))}
        </Group>
      ) : null}
      {friends.length ? (
        <Group title={N.myFriends} count={friends.length} testID="net-friends">
          {friends.map((f) => (
            <Row
              key={f.userId}
              face={<Face url={f.avatarUrl} name={f.pseudo} />}
              name={f.pseudo}
              caption={gradeLabels[f.grade]}
              onPress={() => router.push(`/u/${f.pseudo}`)}
              action={
                <SmButton
                  kind="s"
                  icon="chat"
                  accessibilityLabel={N.write(f.pseudo)}
                  onPress={() =>
                    run(async () => {
                      const { id } = await api.openDirect(f.userId);
                      router.push(`/boite/${id}`);
                    })
                  }
                  testID="net-write"
                />
              }
              testID="net-friend"
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

/** « Suivre » (secondaire) d'un profil public ; « Suivi » ne suit plus. Seulement vers un compte public (API). */
export function FollowButton({
  pseudo,
  following,
  onChanged,
}: {
  pseudo: string;
  following: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.followCol}>
      <Button
        variant="secondary"
        icon={following ? "check" : "add"}
        loading={busy}
        accessibilityLabel={following ? `${N.unfollow} ${pseudo}` : `${N.follow} ${pseudo}`}
        testID={following ? "profile-followed" : "profile-follow"}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await (following ? api.unfollow(pseudo) : api.follow(pseudo));
            onChanged();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {following ? N.followed : N.follow}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

/**
 * En-tête compact d'un profil public (R4.6c ; correction de Damien : l'en-tête de 10.2 prenait 40 % de l'écran) :
 * avatar à gauche, pseudo, grade, département et crew (ou « Compte privé »), compteurs sur une ligne, puis les actions.
 */
export function PublicHead({ p, actions }: { p: UserProfileView; actions: ReactNode }) {
  const { t } = useTheme();
  const c = t.color;
  const [textW, setTextW] = useState(0);
  const size = fitWordSize(p.pseudo, textW, 24, 14, WIDE_EM);
  const privateView = p.audience === "public_limited";
  const crew = p.crews?.[0]?.name;
  const place = [departmentCaption(p.departments?.[0]), crew ? `crew ${crew}` : null].filter(Boolean).join(" · ");
  const counts: [number | null, (n: number) => string][] = [
    [p.followersCount, N.followers],
    [p.followingCount, N.following],
    [p.friendsCount, N.friends],
    [p.pastEvents ? p.pastEvents.count + (p.upcomingEvents?.length ?? 0) : null, N.outings],
  ];
  const shown = counts.filter(([n]) => n !== null) as [number, (n: number) => string][];
  return (
    <View style={styles.pubHead} testID="public-head">
      <View style={styles.pubTop}>
        <Face url={p.avatarUrl} name={p.pseudo} size={64} />
        <View style={styles.pubText} onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>
          <Text variant="posterL" color={c.ink} style={[styles.pubPseudo, { fontSize: size, lineHeight: size + 1 }]}>
            {p.pseudo}
          </Text>
          <View style={styles.pubTags}>
            <TagWin>{gradeLabels[p.grade]}</TagWin>
            {privateView ? (
              <View style={styles.privateCap}>
                <Icon name="lock" size={13} color={c.inkMuted} />
                <Text variant="caption" color={c.inkMuted}>
                  Compte privé
                </Text>
              </View>
            ) : place ? (
              <Text variant="caption" color={c.inkMuted} style={styles.pubCaption}>
                {place}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {shown.length ? (
        <View style={styles.pubCounts} testID="public-counts">
          {shown.map(([n, label]) => (
            <Text key={label(2)} variant="caption" color={c.inkMuted} style={styles.pubCount}>
              <Text variant="bodyStrong" color={c.ink} style={styles.pubCountN}>
                {String(n)}
              </Text>{" "}
              {label(n)}
            </Text>
          ))}
        </View>
      ) : null}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  followCol: { gap: space2 },
  counts: { flexDirection: "row", borderRadius: 14, overflow: "hidden" },
  count: { flex: 1, alignItems: "center", paddingVertical: space2, paddingHorizontal: space1, gap: 1 },
  countLabel: { fontSize: 12, fontFamily: "Archivo-ExtraBold" },
  links: { flexDirection: "row", gap: space2 },
  link: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space2,
    borderRadius: 14,
  },
  linkIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  linkText: { flex: 1, minWidth: 0 },
  linkTitle: { fontSize: 13, lineHeight: 15 },
  linkCaption: { fontSize: 11.5, lineHeight: 14 },
  face: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoPro: { borderRadius: 12 },
  group: { gap: space2 },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  groupTitle: { fontSize: 15 },
  groupBody: { borderRadius: 16, paddingHorizontal: space3, paddingVertical: space1 },
  row: { flexDirection: "row", alignItems: "center", gap: space2, paddingVertical: space2 },
  rowBelow: { flexDirection: "column", alignItems: "flex-end" },
  rowMain: { flex: 1, minWidth: 0, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space3 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14 },
  rowCaption: { fontSize: 12, lineHeight: 15 },
  actions: { flexDirection: "row", gap: space1 },
  followedTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space1 },
  pubHead: { gap: space3 },
  pubTop: { flexDirection: "row", alignItems: "center", gap: space3 },
  pubText: { flex: 1, minWidth: 0, gap: 5 },
  pubPseudo: { fontSize: 24, lineHeight: 25 },
  pubTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  pubCaption: { flexShrink: 1 },
  privateCap: { flexDirection: "row", alignItems: "center", gap: 4 },
  pubCounts: { flexDirection: "row", flexWrap: "wrap", columnGap: space3 + 4, rowGap: space1 },
  pubCount: { fontSize: 13 },
  pubCountN: { fontSize: 13 },
});
