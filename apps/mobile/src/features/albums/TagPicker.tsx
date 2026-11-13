// Le plateau à choisir pour identifier une voiture, ou une personne par son pseudo (lot R9f, maquette R9.6 `plateauH`) : une feuille
// haute avec la recherche « Un nom, un pseudo, un numéro », les puces de catégorie, la grille des voitures (vignette à plaque masquée, « Toi »
// sur les miennes, nom jamais coupé, pseudo ou « compte privé »), et, à partir de deux caractères, l'onglet « Personnes ». Aucune règle ici :
// l'API ne propose que les voitures pointées (ou toutes les retenues quand l'événement n'a aucun pointage) et ne cherche une personne
// qu'à partir de deux caractères, parmi celles qui avaient une place ou une présence. Un passionné ne voit que ses voitures.
import { Button, Chip, ChipRow, Icon, Photo, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  ALBUM_TAG_SEARCH_MIN,
  type AlbumTagCreate,
  appendTaggablePage,
  albumTagLabels as L,
  showPeopleTab,
  type Taggable,
  type TaggablePerson,
  type TaggableVehicle,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;
const { radiusMd, radiusPill, radiusSm } = tokens.radius;

/** Le texte tapé, rendu à l'API après un court délai (une requête par pause, jamais une par lettre). */
function useDebounced(value: string, ms = 280): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export type PickResult = { target: AlbumTagCreate; label: string; pseudo: string | null; self: boolean };

export function TagPicker({
  visible,
  albumId,
  onClose,
  onPick,
}: {
  visible: boolean;
  albumId: string;
  onClose: () => void;
  /** Pose l'identification ; une erreur levée s'affiche dans la feuille. */
  onPick: (pick: PickResult) => Promise<void>;
}) {
  const { t } = useTheme();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [tab, setTab] = useState<"cars" | "people">("cars");
  const [data, setData] = useState<Taggable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(text.trim());
  const canSearchPeople = q.length >= ALBUM_TAG_SEARCH_MIN;
  const [loadingMore, setLoadingMore] = useState(false);
  // L'onglet « Personnes » : dès deux caractères, ou dès que l'API rend « moi » sans recherche (identifiable par mon seul pseudo).
  const peopleTab = showPeopleTab(canSearchPeople, data?.people.length ?? 0);

  // Une feuille rouverte repart de zéro (aucune recherche ni aucun choix gardé d'une photo à l'autre).
  useEffect(() => {
    if (visible) return;
    setText("");
    setCategory(null);
    setTab("cars");
    setError(null);
    setBusy(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoadError(null);
    api
      .albumTaggable(albumId, { q: q || undefined, category: category ?? undefined })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((e) => {
        if (alive) setLoadError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [visible, albumId, q, category]);

  useEffect(() => {
    if (!peopleTab && tab === "people") setTab("cars");
    // Aucune voiture à proposer mais mon pseudo oui : l'onglet « Personnes » s'ouvre tout seul.
    if (data && data.vehicles.length === 0 && data.people.length > 0 && !q && !category) setTab("people");
  }, [peopleTab, tab, data, q, category]);

  /** « Voir plus » : la page suivante du plateau (60 voitures par page), ajoutée à celles déjà lues. */
  async function more() {
    if (!data || data.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.albumTaggable(albumId, {
        q: q || undefined,
        category: category ?? undefined,
        cursor: data.nextCursor,
      });
      setData((cur) => (cur ? appendTaggablePage(cur, next) : next));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function pick(key: string, result: PickResult) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await onPick(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const owner = data?.role === "owner";
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.identifyCar} maxHeight={0.92}>
      <Text variant="title" color={t.color.ink} accessibilityRole="header">
        {L.identifyCar}
      </Text>
      <TextField
        label={L.searchPlaceholder}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        testID="tag-picker-search"
      />
      {owner ? (
        <Muted variant="caption" testID="tag-picker-own-only">
          {L.ownCarsOnly}
        </Muted>
      ) : null}
      {data?.fallback ? <Notice testID="tag-picker-fallback">{L.noCheckinLineup}</Notice> : null}
      {data && data.categories.length > 1 ? (
        <ChipRow accessibilityRole="radiogroup">
          <Chip selected={category === null} accessibilityRole="radio" onPress={() => setCategory(null)}>
            {L.all}
          </Chip>
          {data.categories.map((c) => (
            <Chip
              key={c.slug}
              selected={category === c.slug}
              accessibilityRole="radio"
              onPress={() => setCategory(category === c.slug ? null : c.slug)}
            >
              {`${c.label} · ${c.count}`}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      {peopleTab ? (
        <ChipRow accessibilityRole="tablist">
          <Chip selected={tab === "cars"} accessibilityRole="tab" onPress={() => setTab("cars")}>
            {L.screens.tabCars}
          </Chip>
          <Chip selected={tab === "people"} accessibilityRole="tab" onPress={() => setTab("people")}>
            {L.people}
          </Chip>
        </ChipRow>
      ) : null}
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {error ? (
        <Notice tone="error" testID="tag-picker-error">
          {error}
        </Notice>
      ) : null}
      {data && tab === "cars" ? (
        data.vehicles.length === 0 ? (
          <Muted variant="body" testID="tag-picker-empty">
            {L.screens.noMatch}
          </Muted>
        ) : (
          <>
            <View style={styles.grid} testID="tag-picker-grid">
              {data.vehicles.map((v) => (
                <PickTile
                  key={v.vehicleId}
                  car={v}
                  busy={busy === v.vehicleId}
                  disabled={busy !== null}
                  onPress={() =>
                    void pick(v.vehicleId, {
                      target: { vehicleId: v.vehicleId },
                      label: v.label,
                      pseudo: v.pseudo,
                      self: v.mine,
                    })
                  }
                />
              ))}
            </View>
            {data.nextCursor !== null ? (
              <Button
                variant="secondary"
                icon="down"
                fullWidth
                loading={loadingMore}
                onPress={() => void more()}
                testID="tag-picker-more"
              >
                {L.screens.moreCars}
              </Button>
            ) : null}
          </>
        )
      ) : null}
      {data && tab === "people" ? (
        data.people.length === 0 ? (
          <Muted variant="body" testID="tag-picker-no-person">
            {L.screens.noPerson}
          </Muted>
        ) : (
          <View style={styles.people} testID="tag-picker-people">
            {data.people.map((p) => (
              <PersonRow
                key={p.userId}
                person={p}
                busy={busy === p.userId}
                disabled={busy !== null}
                onPress={() =>
                  void pick(p.userId, { target: { userId: p.userId }, label: p.pseudo, pseudo: p.pseudo, self: p.mine })
                }
              />
            ))}
          </View>
        )
      ) : null}
      {!canSearchPeople && text.trim().length > 0 ? <Muted variant="caption">{L.screens.searchHint}</Muted> : null}
      <Button variant="plate" icon="close" fullWidth onPress={onClose} testID="tag-picker-close">
        {L.screens.closePicker}
      </Button>
    </AppSheet>
  );
}

/** Une voiture du plateau à choisir : photo carrée à plaque masquée, nom entier, pseudo (ou « compte privé »), « Toi ». */
function PickTile({
  car,
  busy,
  disabled,
  onPress,
}: {
  car: TaggableVehicle;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[car.label, car.pseudo ?? L.privateAccount, car.mine ? L.you : null]
        .filter(Boolean)
        .join(", ")}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        car.mine ? { borderColor: c.accent, borderWidth: 2.5 } : null,
        disabled && !busy ? styles.dim : null,
      ]}
      testID={car.mine ? "tag-pick-car-me" : "tag-pick-car"}
    >
      <View style={styles.photo}>
        <Photo
          source={mediaSource(car.photoUrl)}
          placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
          style={StyleSheet.absoluteFill}
        />
        {car.photoUrl ? null : (
          <View style={styles.silhouette} pointerEvents="none">
            <Icon name="vehicle" size={36} color={c.inkMuted} />
          </View>
        )}
        {car.mine ? (
          <View style={[styles.me, { backgroundColor: c.accent }]}>
            <Text variant="label" color={c.accentInk} style={styles.meText}>
              {L.you}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileText}>
        {/* Nom entier, jamais coupé : il passe à la ligne. */}
        <Text variant="posterS" color={c.ink} style={styles.name} testID="tag-pick-car-name">
          {car.label}
        </Text>
        <View style={styles.who}>
          {car.private ? <Icon name="lock" size={13} color={c.ink} /> : null}
          <Text variant="caption" color={c.inkMuted} style={styles.whoText}>
            {busy ? L.screens.identifying : (car.pseudo ?? L.privateAccount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PersonRow({
  person,
  busy,
  disabled,
  onPress,
}: {
  person: TaggablePerson;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={person.pseudo}
      disabled={disabled}
      onPress={onPress}
      style={[styles.person, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
      testID="tag-pick-person"
    >
      <Avatar url={person.avatarUrl} pseudo={person.pseudo} size={36} />
      <Text variant="bodyStrong" color={t.color.ink} style={styles.grow}>
        {busy ? L.screens.identifying : person.pseudo}
      </Text>
      {person.mine ? (
        <Text variant="caption" color={t.color.accentText}>
          {L.you}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { width: "48.5%", borderRadius: radiusMd, overflow: "hidden" },
  dim: { opacity: 0.6 },
  photo: { width: "100%", aspectRatio: 1 },
  silhouette: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  me: {
    position: "absolute",
    top: space1,
    left: space1,
    borderRadius: radiusPill,
    paddingHorizontal: space2,
    paddingVertical: 2,
  },
  meText: { fontSize: 11, lineHeight: 14 },
  tileText: { padding: space2, gap: 2 },
  name: { flexShrink: 1 },
  who: { flexDirection: "row", alignItems: "center", gap: space1 },
  whoText: { flexShrink: 1 },
  people: { gap: space2 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2,
    borderWidth: 1,
    borderRadius: radiusSm,
  },
  grow: { flex: 1 },
});
