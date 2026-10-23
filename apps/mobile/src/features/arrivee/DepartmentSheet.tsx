// « Choisir dans une liste » (lot M6, maquette 8.2, retour 03) : une feuille à 90 % de la hauteur, au-dessus de tout
// (voile), à la place de la liste dépliée sous la carte. En tête : « Tes départements » et ✕ (annuler sans rien changer,
// retour Android aussi) ; une recherche par nom ou numéro ; le compteur ; les départements déjà choisis en tête (le
// premier porte « favori »), puis tous les autres ; un seul bouton principal « Valider (n) ». Rien n'est appliqué avant
// « Valider ». C'est aussi le chemin du lecteur d'écran (la carte lui est masquée).
import { departmentChoices, departmentLabel, Icon, Sheet, Text, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels } from "@orasso/shared";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SmButton } from "@/features/passionne/kit";
import { departmentLimitReached, toggleDepartment } from "./model";

const { space2, space3 } = tokens.spacing;

/** Recherche sans accents ni casse : « pyrenees », « 66 », « 2a ». */
export const foldSearch = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Row = { kind: "sep"; label: string } | { kind: "dept"; code: string; name: string };

/** Les lignes de la feuille : sans recherche, les choisis à l'ouverture en tête puis tous les autres ; sinon le filtre. */
export function departmentRows(opening: readonly string[], query: string): Row[] {
  const q = foldSearch(query);
  if (q) {
    return departmentChoices
      .filter((d) => d.code.toLowerCase().startsWith(q) || foldSearch(d.name).includes(q))
      .map((d) => ({ kind: "dept" as const, code: d.code, name: d.name }));
  }
  const head = opening
    .map((code) => departmentChoices.find((d) => d.code === code))
    .filter((d): d is (typeof departmentChoices)[number] => Boolean(d));
  const rest = departmentChoices.filter((d) => !opening.includes(d.code));
  return [
    ...(head.length ? [{ kind: "sep" as const, label: arriveeLabels.list.chosenSection }] : []),
    ...head.map((d) => ({ kind: "dept" as const, code: d.code, name: d.name })),
    { kind: "sep" as const, label: arriveeLabels.list.allSection },
    ...rest.map((d) => ({ kind: "dept" as const, code: d.code, name: d.name })),
  ];
}

export function DepartmentSheet({
  visible,
  selected,
  onValidate,
  onCancel,
  favoriteTag = "favori",
}: {
  visible: boolean;
  selected: readonly string[];
  onValidate: (next: string[]) => void;
  onCancel: () => void;
  /** « favori » (exposant) ou « principal » (pro, média…). */
  favoriteTag?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<string[]>([...selected]);
  const [opening, setOpening] = useState<string[]>([...selected]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(false);
  // Chaque ouverture repart de la sélection en cours (✕ n'a rien changé).
  // biome-ignore lint/correctness/useExhaustiveDependencies: la sélection est lue à l'ouverture seulement
  useEffect(() => {
    if (!visible) return;
    setDraft([...selected]);
    setOpening([...selected]);
    setQuery("");
    setLimit(false);
  }, [visible]);
  const rows = useMemo(() => departmentRows(opening, query), [opening, query]);
  const toggle = (code: string) => {
    if (departmentLimitReached(draft, code)) return setLimit(true);
    setLimit(false);
    setDraft((d) => toggleDepartment(d, code));
  };
  const n = draft.length;

  return (
    <Sheet visible={visible} onClose={onCancel} accessibilityLabel={arriveeLabels.list.title}>
      <View style={[styles.box, { height: Math.round(height * 0.9) }]} testID="department-sheet">
        <View style={[styles.grab, { backgroundColor: c.plateLine }]} />
        <View style={styles.head}>
          <Text variant="posterM" color={c.ink} style={styles.title} accessibilityRole="header">
            {arriveeLabels.list.title}
          </Text>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={arriveeLabels.list.cancel}
            hitSlop={6}
            testID="department-sheet-cancel"
            style={({ pressed }) => [styles.closex, { backgroundColor: c.surface }, pressed ? styles.pressed : null]}
          >
            <Icon name="close" size={20} color={c.ink} />
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.plateLine }]}>
          <Icon name="search" size={20} color={c.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={arriveeLabels.list.search}
            placeholderTextColor={c.inkFaint}
            accessibilityLabel={arriveeLabels.list.searchAria}
            autoCorrect={false}
            style={[styles.input, { color: c.ink }]}
            testID="department-search"
          />
        </View>
        <View style={styles.counter}>
          <Text variant="label" color={c.inkMuted} testID="department-count">
            {arriveeLabels.list.count(n)}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {arriveeLabels.list.firstIsFavorite(favoriteTag)}
          </Text>
        </View>
        {limit ? (
          <Text variant="caption" color={c.winText} accessibilityRole="alert">
            {arriveeLabels.errors.tooMany}
          </Text>
        ) : null}
        <FlatList
          data={rows}
          style={styles.list}
          keyExtractor={(r) => (r.kind === "sep" ? `sep-${r.label}` : r.code)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          testID="department-list"
          renderItem={({ item }) => {
            if (item.kind === "sep")
              return (
                <Text variant="label" color={c.inkMuted} style={styles.sep}>
                  {item.label}
                </Text>
              );
            const on = draft.includes(item.code);
            const fav = draft[0] === item.code;
            return (
              <Pressable
                onPress={() => toggle(item.code)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${departmentLabel(item)}${fav ? ` · ${favoriteTag}` : ""}`}
                testID={`deptrow-${item.code}`}
                style={[styles.row, { borderBottomColor: c.plateLine }]}
              >
                <Text variant="numberNarrow" color={c.ink} style={styles.num}>
                  {item.code}
                </Text>
                <View style={styles.name}>
                  <Text variant="bodyStrong" color={c.ink}>
                    {item.name}
                  </Text>
                  {fav ? (
                    <View style={styles.fav}>
                      <Icon name="star" size={12} color={c.accentText} />
                      <Text variant="label" color={c.accentText} style={styles.favText}>
                        {favoriteTag}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.check,
                    { borderColor: on ? c.accent : c.plateLine, backgroundColor: on ? c.accent : "transparent" },
                  ]}
                >
                  {on ? <Icon name="check" size={16} strokeWidth={2.6} color={c.accentInk} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
        <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
          <SmButton kind="p" big wide icon="check" onPress={() => onValidate(draft)} testID="department-validate">
            {arriveeLabels.list.validate(n)}
          </SmButton>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { paddingTop: 0 },
  grab: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: space2, marginBottom: 14 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.97 }] },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  counter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  list: { flex: 1, marginTop: 2 },
  sep: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4, fontSize: 10.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  num: { fontSize: 22, lineHeight: 24, minWidth: 34, textAlign: "center" },
  name: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  fav: { flexDirection: "row", alignItems: "center", gap: 3 },
  favText: { fontSize: 11 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  foot: { paddingTop: 12 },
});
