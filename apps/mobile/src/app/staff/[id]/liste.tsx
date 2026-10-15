// Liste du staff (docs/02, prototype « Liste · Salon Argelès ») : participants retenus, recherche « pseudo, véhicule ou
// plaque », filtres Tous / Arrivés / Attendus / Sans scan, « Pointer », pointage rapide par plaque après coup (« Tape
// les 3 premiers caractères de la plaque, valide, suivant »), coordonnées pour le super staff seulement. Hors ligne.
import { AppBar, Button, Chip, Ground, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import type { AccessListEntry } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pointEntry } from "@/features/staff/actions";
import { clock } from "@/features/staff/result";
import { checkedInAt, counters, quickPlateMatch, type StaffState, searchLocal } from "@/lib/staff/model";
import { useStaffEvent } from "@/lib/staff/useStaff";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

type Filter = "all" | "in" | "out" | "noscan";
const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["in", "Arrivés"],
  ["out", "Attendus"],
  ["noscan", "Sans scan"],
];

/** Méthode d'entrée connue (serveur, sinon pointage local). */
function methodOf(state: StaffState, e: AccessListEntry): string | null {
  return e.checkinMethod ?? state.local.get(e.passId)?.method ?? null;
}

export default function StaffList() {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, rapide } = useLocalSearchParams<{ id: string; rapide?: string }>();
  const { userId, state } = useStaffEvent(id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [quick, setQuick] = useState(rapide === "1");
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const superStaff = state?.meta.myRoles.includes("super_staff") ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` (pointage) relance le filtre : la liste en mémoire change sans changer d'identité
  const rows = useMemo(() => {
    if (!state) return [];
    const base =
      query.trim().length >= 2
        ? searchLocal(state, query, 500).map((h) => h.entry)
        : [...state.entries.values()].sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr"));
    return base.filter((e) => {
      if (e.status !== "valid") return false;
      const inside = Boolean(checkedInAt(state, e));
      if (filter === "in") return inside;
      if (filter === "out") return !inside;
      if (filter === "noscan") return inside && methodOf(state, e) !== "scan";
      return true;
    });
  }, [state, query, filter, tick]);

  const count = state ? counters(state) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`));
  const point = (entry: AccessListEntry, kind: "manual" | "plate") => {
    if (!state || !userId) return;
    pointEntry(state, userId, entry, kind);
    refresh();
  };

  return (
    <Ground animated={false} style={styles.fill}>
      <AppBar
        kind="flow"
        title={state ? `Liste · ${state.meta.title}` : "Liste"}
        facts={count ? `${count.arrived} arrivés · ${count.expected - count.arrived} attendus` : undefined}
        onClose={close}
        safeTop={insets.top}
      />
      {state === null ? (
        <View style={styles.pad}>
          <Notice tone="error">La liste n'est pas sur ce téléphone : synchronise depuis l'écran du mode staff.</Notice>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(e) => e.passId}
          extraData={tick}
          contentContainerStyle={[styles.list, { paddingBottom: space3 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListHeaderComponent={
            <View style={styles.header}>
              {quick && state ? (
                <QuickPlate state={state} onPoint={(e) => point(e, "plate")} />
              ) : (
                <TextField
                  label="Pseudo, véhicule ou plaque"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  placeholder="Kenji, Supra, AB-…"
                />
              )}
              <View style={styles.chips}>
                {FILTERS.map(([key, label]) => (
                  <Chip key={key} selected={filter === key} onPress={() => setFilter(key)}>
                    {label}
                  </Chip>
                ))}
              </View>
              <Button variant="plate" icon="plate" onPress={() => setQuick((q) => !q)} fullWidth>
                {quick ? "Fin pointage plaque" : "Pointage rapide par plaque"}
              </Button>
              {superStaff ? null : (
                <Muted variant="meta">
                  Les coordonnées (téléphone, e-mail) ne sont visibles que par le super staff de l'événement.
                </Muted>
              )}
            </View>
          }
          ListEmptyComponent={<Muted variant="body">Personne dans ce filtre.</Muted>}
          renderItem={({ item }) => {
            const inside = state ? checkedInAt(state, item) : null;
            return (
              <Plate style={styles.row}>
                <View style={styles.text}>
                  <Text variant="bodyStrong" color={c.plateInk}>
                    {item.vehicleLabel ?? "Sans véhicule"} · {item.pseudo}
                  </Text>
                  <Text variant="meta" color={inside ? c.accent : c.plateMuted}>
                    {[
                      item.zoneCode ? `Zone ${item.zoneCode}` : "Sans zone",
                      item.plateHint ? `${item.plateHint}-…` : null,
                      inside ? `entré ${clock(inside)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {/* Coordonnées : rôle super staff courant seulement (une ancienne liste pourrait encore en avoir). */}
                  {item.contact && superStaff ? (
                    <Text variant="meta" color={c.plateMuted}>
                      {[
                        [item.contact.firstName, item.contact.lastName].filter(Boolean).join(" "),
                        item.contact.phone,
                        item.contact.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Button variant="plate" icon="check" disabled={Boolean(inside)} onPress={() => point(item, "manual")}>
                  {inside ? "Pointé" : "Pointer"}
                </Button>
              </Plate>
            );
          }}
        />
      )}
    </Ground>
  );
}

/** Pointage rapide : 3 premiers caractères (ou plaque entière), Entrée = pointer, champ vidé pour la suivante. */
function QuickPlate({ state, onPoint }: { state: StaffState; onPoint: (e: AccessListEntry) => void }) {
  const { t } = useTheme();
  const c = t.color;
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [choices, setChoices] = useState<AccessListEntry[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const submit = () => {
    const match = quickPlateMatch(state, text);
    setChoices([]);
    if (match.kind === "one") {
      const before = checkedInAt(state, match.entry);
      onPoint(match.entry);
      setDone(
        `${before ? "Déjà entré" : "Pointé"} : ${match.entry.vehicleLabel ?? "véhicule"} · ${match.entry.pseudo}${match.entry.zoneCode ? ` · Zone ${match.entry.zoneCode}` : ""}`,
      );
      setText("");
    } else if (match.kind === "many") {
      setChoices(match.entries);
      setDone(null);
    } else if (match.typed.length >= 3) {
      setUnmatched((u) => [match.typed, ...u.filter((x) => x !== match.typed)].slice(0, 30));
      setDone(`Non reconnue : ${match.typed}`);
      setText("");
    }
  };

  return (
    <Plate kind="note" style={styles.quick}>
      <Text variant="label" color={c.plateInk}>
        Pointage rapide · après coup
      </Text>
      <Text variant="body" color={c.plateInk}>
        Tape les 3 premiers caractères de la plaque, valide, suivant. Pour les entrées massives sans scan.
      </Text>
      <TextField
        label="Plaque"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        placeholder="AB-…"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={submit}
      />
      <Button icon="check" onPress={submit} disabled={text.trim().length < 3} fullWidth>
        Pointer
      </Button>
      {done ? (
        <Text variant="bodyStrong" color={c.plateInk}>
          {done}
        </Text>
      ) : null}
      {choices.map((e) => (
        <Button
          key={e.passId}
          variant="plate"
          icon="check"
          onPress={() => {
            onPoint(e);
            setChoices([]);
            setText("");
            setDone(`Pointé : ${e.vehicleLabel ?? "véhicule"} · ${e.pseudo}`);
          }}
          fullWidth
        >
          {`${e.plateHint ?? ""}-… · ${e.pseudo}`}
        </Button>
      ))}
      {unmatched.length > 0 ? (
        <Text variant="meta" color={c.plateInk} style={{ marginTop: space1 }}>
          Non reconnues : {unmatched.join(", ")}
        </Text>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: space3 },
  list: { paddingHorizontal: space3, paddingTop: space3, gap: space2 },
  header: { gap: space2, marginBottom: space1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  text: { flex: 1, gap: 2 },
  quick: { gap: space2, padding: space3 },
});
