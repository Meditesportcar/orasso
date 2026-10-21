// Feuille « Personnes et crews » d'Explorer (lot C2a, artefact DA v2 `sh-people`) : « Crews autour de toi » puis
// « Personnes », en lignes `.tz-it` (rond d'initiales ou logo 44 px, nom en gras, une ligne, une action à droite). Sans
// texte : mes crews d'abord, puis les crews et les passionnés de mon département. Avec un texte (le champ en tête de
// feuille, pré-rempli par la recherche d'Explorer) : les crews et les personnes trouvés. Remplace l'ancien formulaire
// (département, centre d'intérêt, grade) : la feuille montre ce qui est autour, la recherche se fait au texte.
import { Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewCard, gradeLabels, type PersonCard } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";

const { space2 } = tokens.spacing;
const MAX = 6;

const initialsOf = (name: string) =>
  name
    .replace(/[_\d]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

/** Rond de 44 px : l'image si elle existe, sinon les initiales. */
function Round({ url, name, mine }: { url: string | null; name: string; mine?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.round, { backgroundColor: mine ? c.accent : c.surfaceRaised }]}>
      {url ? (
        <Photo source={{ uri: url }} style={StyleSheet.absoluteFill as never} accessibilityLabel="" />
      ) : (
        <Text variant="label" color={mine ? c.accentInk : c.ink} style={styles.roundText}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

/** Ligne `.tz-it`. */
function Row({
  lead,
  title,
  caption,
  trailing,
  onPress,
  testID,
}: {
  lead: ReactNode;
  title: string;
  caption: string;
  trailing: ReactNode;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]} testID={testID}>
      <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={title} style={styles.rowMain}>
        {lead}
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink} style={styles.rowTitle}>
            {title}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.rowCap}>
            {caption}
          </Text>
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

export function PeopleSheetBody({ initialQ }: { initialQ: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const dept = useSession().me?.profile.departments[0] ?? "";
  const [q, setQ] = useState(initialQ);
  const text = q.trim();
  const mine = useApi(() => api.myCrews(), []);
  const [crews, setCrews] = useState<CrewCard[] | null>(null);
  const [people, setPeople] = useState<PersonCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        if (!text && !dept) {
          setCrews([]);
          setPeople([]);
          return;
        }
        api
          .searchCrews(text, text ? undefined : dept)
          .then((page) => alive && setCrews(page.items))
          .catch(() => alive && setCrews([]));
        api
          .searchPeople({ q: text || undefined, department: text ? undefined : dept })
          .then((page) => alive && setPeople(page.items))
          .catch(() => alive && setPeople([]));
      },
      text ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text, dept]);

  const myIds = new Set((mine.data ?? []).map((x) => x.id));
  const crewList: (CrewCard & { mine: boolean })[] = [
    ...(text ? [] : (mine.data ?? []).map((x) => ({ ...x, mine: true }))),
    ...(crews ?? []).filter((x) => text || !myIds.has(x.id)).map((x) => ({ ...x, mine: myIds.has(x.id) })),
  ].slice(0, MAX);
  const openCrew = (slug: string) => router.push(`/crew/${slug}`);
  const openPerson = (pseudo: string) => router.push(`/u/${encodeURIComponent(pseudo)}`);

  return (
    <View style={styles.col} testID="people-search">
      <View style={[styles.search, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
        <Icon name="search" size={18} color={c.inkMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Pseudo, véhicule ou crew"
          placeholderTextColor={c.inkFaint}
          accessibilityLabel="Rechercher une personne ou un crew"
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.input, { color: c.ink }]}
          testID="people-q"
        />
      </View>

      <Text variant="label" color={c.inkMuted}>
        {text ? "Crews" : "Crews autour de toi"}
      </Text>
      {crews === null ? <Muted variant="caption">Chargement…</Muted> : null}
      {crews !== null && crewList.length === 0 ? <Muted variant="caption">Aucun crew trouvé.</Muted> : null}
      {crewList.map((x) => (
        <Row
          key={x.id}
          testID="crew-row"
          lead={<Round url={x.logoUrl} name={x.name} mine={x.mine} />}
          title={x.name}
          caption={`${x.department} · ${x.membersCount} membre${x.membersCount > 1 ? "s" : ""}${x.mine ? " · ton crew" : ""}`}
          onPress={() => openCrew(x.slug)}
          trailing={
            x.mine ? (
              <Icon name="next" size={20} color={c.ink} />
            ) : (
              <SmallButton icon="add" onPress={() => openCrew(x.slug)}>
                Rejoindre
              </SmallButton>
            )
          }
        />
      ))}

      <Text variant="label" color={c.inkMuted}>
        Personnes
      </Text>
      {people === null ? <Muted variant="caption">Chargement…</Muted> : null}
      {people !== null && people.length === 0 ? <Muted variant="caption">Personne trouvé.</Muted> : null}
      {(people ?? []).slice(0, MAX).map((p) => (
        <Row
          key={p.userId}
          testID="person-row"
          lead={<Round url={p.avatarUrl} name={p.pseudo} />}
          title={p.pseudo}
          caption={[p.vehicles[0]?.label, `grade ${gradeLabels[p.grade]}`, p.friendship === "friends" ? "ami" : null]
            .filter(Boolean)
            .join(" · ")}
          onPress={() => openPerson(p.pseudo)}
          trailing={
            p.friendship === "friends" ? (
              <SmallButton icon="chat" onPress={() => openPerson(p.pseudo)}>
                Écrire
              </SmallButton>
            ) : (
              <SmallButton icon="add" onPress={() => openPerson(p.pseudo)}>
                Voir
              </SmallButton>
            )
          }
        />
      ))}
      <SmallButton icon="add" onPress={() => router.push("/crew/nouveau")} testID="crew-new">
        Créer un crew
      </SmallButton>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    height: 44,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  input: { flex: 1, minWidth: 0, minHeight: 40, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 16 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: "800" },
  rowCap: { fontSize: 12.5, lineHeight: 16 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  roundText: { fontSize: 13, fontWeight: "900" },
});
