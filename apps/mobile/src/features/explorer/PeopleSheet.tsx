// Feuille « Personnes et crews » d'Explorer (lot C2a, artefact DA v2 `sh-people`) : « Crews autour de toi » puis
// « Personnes », en lignes `.tz-it` (rond d'initiales ou logo 44 px, nom en gras, une ligne, une action à droite).
// Un champ texte en tête (pré-rempli par la recherche d'Explorer) et, repliés derrière « Filtres », les filtres de
// personnes de docs/01 (département, centre d'intérêt, grade). Sans texte ni filtre : mes crews d'abord, puis les crews et
// les passionnés de mon département. Les personnes se chargent par pages (« Voir plus ») ; une panne réseau s'affiche
// comme une erreur, avec « Réessayer », jamais comme une absence de résultat. « Écrire » ouvre la conversation.
import { Icon, Photo, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewCard, departments, gradeLabels, grades, type PersonCard, socialLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2 } = tokens.spacing;

const initialsOf = (name: string) =>
  name
    .replace(/[_\d]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

/** Rond de 44 px : l'image si elle existe (fichier de l'API), sinon les initiales. */
function Round({ url, name, mine }: { url: string | null; name: string; mine?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const source = mediaSource(url);
  return (
    <View style={[styles.round, { backgroundColor: mine ? c.accent : c.surfaceRaised }]}>
      {source ? (
        <Photo source={source} style={StyleSheet.absoluteFill as never} accessibilityLabel="" />
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

/** « Écrire » à un ami : la conversation directe s'ouvre (comme le bouton Message du profil). */
function WriteButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <SmallButton
      icon="chat"
      disabled={busy}
      testID="person-write"
      onPress={async () => {
        setBusy(true);
        try {
          const { id } = await api.openDirect(userId);
          router.push(`/boite/${id}`);
        } catch {
          // Plus amis entre-temps : le profil propose la demande de contact.
        } finally {
          setBusy(false);
        }
      }}
    >
      Écrire
    </SmallButton>
  );
}

export function PeopleSheetBody({ initialQ }: { initialQ: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const dept = useSession().me?.profile.departments[0] ?? "";
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories" });
  const [q, setQ] = useState(initialQ);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [department, setDepartment] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [grade, setGrade] = useState("");
  const text = q.trim();
  const filtered = Boolean(department || categoryId || grade);
  // Sans critère, ce qui est autour : le département du profil.
  const where = department || (text || filtered ? "" : dept);
  const mine = useApi(() => api.myCrews(), []);
  const [crews, setCrews] = useState<CrewCard[] | null>(null);
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const request = useRef(0);
  const filters = useCallback(
    (next?: string) => ({
      q: text || undefined,
      department: where || undefined,
      categoryId: categoryId || undefined,
      grade: grade || undefined,
      cursor: next,
    }),
    [text, where, categoryId, grade],
  );

  const load = useCallback(async () => {
    const id = ++request.current;
    setError(null);
    if (!text && !where && !categoryId && !grade) {
      setCrews([]);
      setPeople([]);
      setCursor(null);
      return;
    }
    try {
      const [crewPage, peoplePage] = await Promise.all([
        text || where ? api.searchCrews(text, text ? undefined : where) : Promise.resolve({ items: [] as CrewCard[] }),
        api.searchPeople(filters()),
      ]);
      if (id !== request.current) return;
      setCrews(crewPage.items);
      setPeople(peoplePage.items);
      setCursor(peoplePage.nextCursor ?? null);
    } catch (e) {
      // Les derniers résultats restent affichés ; l'échec se dit comme tel.
      if (id === request.current) setError(errorMessage(e));
    }
  }, [text, where, categoryId, grade, filters]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), text ? 300 : 0);
    return () => clearTimeout(timer);
  }, [text, load]);

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await api.searchPeople(filters(cursor));
      setPeople((prev) => [...(prev ?? []), ...page.items.filter((p) => !prev?.some((x) => x.userId === p.userId))]);
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  }

  const myIds = new Set((mine.data ?? []).map((x) => x.id));
  const crewList: (CrewCard & { mine: boolean })[] = [
    ...(text || filtered ? [] : (mine.data ?? []).map((x) => ({ ...x, mine: true }))),
    ...(crews ?? []).filter((x) => text || filtered || !myIds.has(x.id)).map((x) => ({ ...x, mine: myIds.has(x.id) })),
  ];
  const openCrew = (slug: string) => router.push(`/crew/${slug}`);
  const openPerson = (pseudo: string) => router.push(`/u/${encodeURIComponent(pseudo)}`);

  return (
    <View style={styles.col} testID="people-search">
      <View style={styles.searchRow}>
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
        <SmallButton
          icon="list"
          kind={filtersOpen || filtered ? "k" : "s"}
          onPress={() => setFiltersOpen((o) => !o)}
          testID="people-filters"
        >
          Filtres
        </SmallButton>
      </View>
      {filtersOpen ? (
        <View style={styles.filters} testID="people-filters-panel">
          <SelectField
            label={socialLabels.filterDepartment}
            value={department}
            onValueChange={setDepartment}
            options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
          <SelectField
            label={socialLabels.filterInterest}
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: "", label: "Tous" },
              ...(categories.data ?? []).map((x) => ({ value: x.id, label: x.label })),
            ]}
          />
          <SelectField
            label={socialLabels.filterGrade}
            value={grade}
            onValueChange={setGrade}
            options={[
              { value: "", label: socialLabels.filterAnyGrade },
              ...grades.map((g) => ({ value: g, label: gradeLabels[g] })),
            ]}
          />
        </View>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Notice tone="error">{error}</Notice>
          <SmallButton icon="undo" onPress={() => void load()} testID="people-retry">
            Réessayer
          </SmallButton>
        </View>
      ) : null}

      <Text variant="label" color={c.inkMuted}>
        {text || filtered ? "Crews" : "Crews autour de toi"}
      </Text>
      {crews === null && !error ? <Muted variant="caption">Chargement…</Muted> : null}
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
      {people === null && !error ? <Muted variant="caption">Chargement…</Muted> : null}
      {people !== null && people.length === 0 ? <Muted variant="caption">Personne trouvé.</Muted> : null}
      {(people ?? []).map((p) => (
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
              <WriteButton userId={p.userId} />
            ) : (
              <SmallButton icon="add" onPress={() => openPerson(p.pseudo)}>
                Voir
              </SmallButton>
            )
          }
        />
      ))}
      {cursor ? (
        <SmallButton icon="add" disabled={more} onPress={() => void loadMore()} testID="people-more">
          Voir plus
        </SmallButton>
      ) : null}
      <View style={styles.actions}>
        <SmallButton icon="add" onPress={() => router.push("/crew/nouveau")} testID="crew-new">
          Créer un crew
        </SmallButton>
        <SmallButton icon="profile" onPress={() => router.push("/amis")}>
          {socialLabels.myFriends}
        </SmallButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  search: {
    flex: 1,
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
  filters: { gap: 8 },
  error: { gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
