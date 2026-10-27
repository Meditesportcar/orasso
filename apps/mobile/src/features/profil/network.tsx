// Lot R4c (maquettes R4.6, R4.6b), refait au lot R6b (D37, maquette R6.2) : le réseau d'un passionné. Onglet Profil : trois
// compteurs (abonnés, abonnements, sorties), les deux premiers ouvrent leur liste ; « Mon profil public » et le crew
// côte à côte. Écran des listes (mode fiche) : segment abonnés / abonnements / demandes, recherche, un bouton « Suivre »
// par ligne, « Accepter » et ✕ pour les demandes, « Toi seul vois ces listes ». Tour 2 : dans Abonnés, le menu ⋯ d'une
// ligne propose « Retirer cet abonné », avec confirmation dans une feuille.
import { Button, departmentChoices, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FollowedPage,
  type FollowPerson,
  gradeLabels,
  networkLabels as N,
  type NetworkCounts,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { fitWordSize } from "@/features/home/fit";
import { CrewDot, Num, SmButton } from "@/features/passionne/kit";
import { FollowButton } from "@/features/social/FollowButton";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";

const { space1, space2, space3 } = tokens.spacing;

/** Les trois listes de « Ton réseau » (`?liste=`). */
export type NetworkTab = "abonnes" | "abonnements" | "demandes";
/** Ce que le compteur d'un nombre ouvre : une liste du réseau, ou l'écran des sorties. */
export type CounterTarget = "abonnes" | "abonnements" | "sorties";

/** « Pyrénées-Orientales (66) ». */
export function departmentCaption(code: string | undefined): string | null {
  if (!code) return null;
  const name = departmentChoices.find((d) => d.code === code)?.name;
  return name ? `${name} (${code})` : `Département ${code}`;
}

/** `.r4cnt` : trois compteurs (abonnés, abonnements, sorties), chacun ouvre son écran. */
export function NetworkCounters({
  counts,
  onOpen,
}: {
  counts: Pick<NetworkCounts, "followers" | "following" | "outings"> | null;
  onOpen: (target: CounterTarget) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const cells: [CounterTarget, number | null, (n: number) => string][] = [
    ["abonnes", counts?.followers ?? null, N.followers],
    ["abonnements", counts?.following ?? null, N.following],
    ["sorties", counts?.outings ?? null, N.outings],
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

/** Largeur sous laquelle la colonne du nom couperait un mot (« Rodage », « Volkswagen ») : deux fois `space-12`. */
const MIN_TEXT_WIDTH = tokens.spacing.space12 * 2;

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
  /** Les boutons sous le nom (demande d'abonnement, très grande police : toute la largeur au pseudo). */
  actionBelow?: boolean;
}) {
  const { t } = useTheme();
  const [w, setW] = useState(0);
  // Tour 2 : « Suivre en retour » et le menu ⋯ côte à côte laisseraient au pseudo et au véhicule une colonne où les mots
  // se couperaient ; sous `MIN_TEXT_WIDTH`, les boutons passent sous le nom, une fois pour toutes (pas d'aller-retour).
  const [narrow, setNarrow] = useState(false);
  const below = actionBelow || narrow;
  // Un pseudo long rapetisse (jusqu'à 11 px) au lieu de se couper à côté des boutons.
  const size = fitWordSize(name, w, 14, 11, 0.62);
  return (
    <View style={[styles.row, below && styles.rowBelow]} testID={testID}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={name}
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        {face}
        <View
          style={styles.rowText}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            setW(width);
            if (!below && action && width > 0 && width < MIN_TEXT_WIDTH) setNarrow(true);
          }}
        >
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

/** `.sug` : un groupe titré (Personnes, Organisateurs, Pros). */
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

function personCaption(p: FollowPerson): string {
  return p.vehicle ?? gradeLabels[p.grade];
}

/**
 * Lot R6b, tour 2 (relectures Opus 1, Codex 1) : le menu ⋯ d'un abonné. « Retirer cet abonné », puis la confirmation
 * dans la même feuille ; la personne n'est pas prévenue.
 */
function FollowerMenuSheet({
  person,
  onClose,
  onRemoved,
}: {
  person: FollowPerson | null;
  onClose: () => void;
  onRemoved: (p: FollowPerson) => void;
}) {
  const { t } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Une autre ligne : la feuille repart du menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: relancé à chaque changement de personne, sans la lire
  useEffect(() => {
    setConfirming(false);
    setError(null);
  }, [person?.userId]);
  const remove = async () => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeFollower(person.userId);
      onRemoved(person);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay>
      <AppSheet visible={person !== null} onClose={onClose} accessibilityLabel={person ? N.rowMenu(person.pseudo) : ""}>
        {person ? (
          <View style={styles.sheet} testID="net-follower-menu">
            <Text variant="posterM" color={t.color.ink}>
              {person.pseudo}
            </Text>
            {confirming ? (
              <View style={styles.sheet} testID="net-remove-confirm">
                <Text variant="bodyStrong" color={t.color.ink}>
                  {N.removeFollowerConfirm(person.pseudo)}
                </Text>
                <Muted variant="caption">{N.removeFollowerHint}</Muted>
                {error ? <Notice tone="error">{error}</Notice> : null}
                <Button
                  variant="alert"
                  icon="close"
                  loading={busy}
                  onPress={() => void remove()}
                  fullWidth
                  testID="net-remove-yes"
                >
                  {N.remove}
                </Button>
                <Button
                  variant="secondary"
                  icon="back"
                  onPress={() => setConfirming(false)}
                  fullWidth
                  testID="net-remove-keep"
                >
                  {N.keep}
                </Button>
              </View>
            ) : (
              <SmButton kind="s" big wide icon="close" onPress={() => setConfirming(true)} testID="net-remove">
                {N.removeFollower}
              </SmButton>
            )}
          </View>
        ) : null}
      </AppSheet>
    </Overlay>
  );
}

/** Liste paginée de personnes (abonnés, ou personnes suivies). */
export function PeopleList({
  pages,
  onMore,
  testID,
  title,
  onChanged,
  onRemove,
}: {
  pages: { items: FollowPerson[]; total: number; nextCursor: string | null };
  onMore: () => void;
  /** Après suivre, demander, ne plus suivre (les nombres se relisent). */
  onChanged?: () => void;
  /** Abonnés (tour 2) : le menu ⋯ de chaque ligne propose « Retirer cet abonné » ; appelé après le retrait. */
  onRemove?: (p: FollowPerson) => void;
  testID: string;
  title?: string;
}) {
  const router = useRouter();
  const { t } = useTheme();
  const [menuFor, setMenuFor] = useState<FollowPerson | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  return (
    <>
      {info ? (
        <View testID="net-remove-info">
          <Notice>{info}</Notice>
        </View>
      ) : null}
      <Group title={title} count={title ? pages.total : undefined} testID={testID}>
        {pages.items.map((p) => (
          <Row
            key={p.userId}
            face={<Face url={p.avatarUrl} name={p.pseudo} />}
            name={p.pseudo}
            caption={personCaption(p)}
            onPress={() => router.push(`/u/${p.pseudo}`)}
            action={
              <View style={styles.actions}>
                <FollowButton
                  size="small"
                  pseudo={p.pseudo}
                  mine={p.mine}
                  followsMe={p.followsMe}
                  canFollow={p.canFollow}
                  visibility={p.visibility}
                  onChanged={() => onChanged?.()}
                />
                {onRemove ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={N.rowMenu(p.pseudo)}
                    onPress={() => setMenuFor(p)}
                    hitSlop={space2}
                    style={({ pressed }) => [styles.dots, pressed && styles.pressed]}
                    testID="net-person-more"
                  >
                    <Icon name="more" size={20} color={t.color.inkMuted} />
                  </Pressable>
                ) : null}
              </View>
            }
            testID="net-person"
          />
        ))}
      </Group>
      {onRemove ? (
        <FollowerMenuSheet
          person={menuFor}
          onClose={() => setMenuFor(null)}
          onRemoved={(p) => {
            setMenuFor(null);
            setInfo(N.removed(p.pseudo));
            onRemove(p);
          }}
        />
      ) : null}
      {pages.nextCursor ? (
        <SmButton kind="s" icon="down" wide onPress={onMore} testID={`${testID}-more`}>
          {`${N.more} (${pages.total - pages.items.length})`}
        </SmButton>
      ) : null}
    </>
  );
}

/** Au-delà de cette échelle de police du système, « Accepter » et ✕ passent sous le pseudo. */
const BELOW_FONT_SCALE = 1.3;

/** Demandes d'abonnement reçues (compte privé) : « Accepter » et ✕ ; la ligne disparaît et une ligne d'info le dit. */
export function RequestsList({
  pages,
  onMore,
  onChanged,
}: {
  pages: { items: FollowPerson[]; total: number; nextCursor: string | null };
  onMore: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (p: FollowPerson, accept: boolean) => {
    setBusy(p.userId);
    setError(null);
    try {
      if (accept) await api.acceptFollow(p.userId);
      else await api.declineFollow(p.userId);
      setDone((d) => ({ ...d, [p.userId]: p.pseudo }));
      setInfo(accept ? N.accepted(p.pseudo) : N.declined);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const items = pages.items.filter((p) => !done[p.userId]);
  return (
    <>
      {info ? (
        <View testID="net-request-info">
          <Notice>{info}</Notice>
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {items.length ? (
        <Group testID="net-requests">
          {items.map((p) => (
            <Row
              key={p.userId}
              face={<Face url={p.avatarUrl} name={p.pseudo} />}
              name={p.pseudo}
              caption={personCaption(p)}
              onPress={() => router.push(`/u/${encodeURIComponent(p.pseudo)}`)}
              action={
                <View style={styles.actions}>
                  <SmButton
                    kind="s"
                    icon="check"
                    disabled={busy !== null}
                    accessibilityLabel={`${N.accept} ${p.pseudo}`}
                    onPress={() => void run(p, true)}
                    testID="net-request-accept"
                  >
                    {N.accept}
                  </SmButton>
                  <SmButton
                    kind="g"
                    icon="close"
                    disabled={busy !== null}
                    accessibilityLabel={N.decline(p.pseudo)}
                    onPress={() => void run(p, false)}
                    testID="net-request-decline"
                  />
                </View>
              }
              testID="net-request"
              actionBelow={fontScale >= BELOW_FONT_SCALE}
            />
          ))}
        </Group>
      ) : null}
      {pages.nextCursor ? (
        <SmButton kind="s" icon="down" wide onPress={onMore} testID="net-requests-more">
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

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
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
  // Lot R5b (titres « SON ») : le titre prend la place restante, le nombre passe dessous au besoin.
  groupHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space2,
  },
  groupTitle: { fontSize: 15, flexGrow: 1, flexShrink: 1 },
  groupBody: { borderRadius: 16, paddingHorizontal: space3, paddingVertical: space1 },
  row: { flexDirection: "row", alignItems: "center", gap: space2, paddingVertical: space2 },
  rowBelow: { flexDirection: "column", alignItems: "flex-end" },
  rowMain: { flex: 1, minWidth: 0, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space3 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14 },
  rowCaption: { fontSize: 12, lineHeight: 15 },
  actions: { flexDirection: "row", alignItems: "center", gap: space1 },
  // `.r5dots` de la maquette : petite pastille sans fond ; `hitSlop` porte la cible à la taille tactile (48).
  dots: {
    width: tokens.spacing.space8,
    height: tokens.spacing.space8,
    borderRadius: tokens.radius.radiusChip,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: { gap: space3 },
  followedTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space1 },
});
