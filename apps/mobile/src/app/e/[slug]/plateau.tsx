// Le plateau en plein écran (lot R4b, maquette R4.3b validée par Damien le 24/10/2026), en mode fiche : retour,
// « Le plateau », l'événement et sa date ; pas de barre d'onglets. Le grand nombre (retenues avant la fin, présentes
// pointées à l'accueil après), deux onglets Voitures et Pros, les pastilles de catégorie (filtre côté serveur), deux
// colonnes avec le nom entier sous la photo, « Toi » sur ma voiture, « Voir les N autres » par 30.
// Toucher : un compte public ouvre son profil ; un compte privé (cadenas) n'ouvre que la fiche de sa voiture, en
// feuille, jamais son profil ; ma voiture ouvre sa fiche du garage ; un pro ouvre sa vitrine. Sans compte : ni pseudo
// ni toucher. La règle est rappelée en bas : tout le monde y apparaît dès son acceptation, plaques masquées.
import { Button, Chip, ChipRow, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type Grade,
  isMemberCar,
  lineupLabels as L,
  LINEUP_PAGE_SIZE,
  type LineupCar,
  type LineupCarMember,
  type OtherVehicle,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { CarTile, ProRow, useLineup } from "@/features/event/Lineup";
import { Seg } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;
const { radiusMd } = tokens.radius;

const weekday = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

type Tab = "cars" | "pros";

export default function LineupScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status, me } = useSession();
  const event = useApi(() => api.eventBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const e = event.data;
  const [tab, setTab] = useState<Tab>("cars");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const lineup = useLineup(e?.id ?? null, { category });
  const data = lineup.data;
  // « Voir les N autres » : les pages suivantes, ajoutées à la première ; remises à zéro quand la première change.
  const [extra, setExtra] = useState<{ cars: LineupCar[]; next: number | null } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [extraOf, setExtraOf] = useState(data);
  if (extraOf !== data) {
    setExtraOf(data);
    setExtra(null);
  }
  const cars = [...(data?.cars ?? []), ...(extra?.cars ?? [])];
  const next = extra ? extra.next : (data?.nextCursor ?? null);
  const [sheet, setSheet] = useState<LineupCarMember | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/e/${slug}`));
  const facts = e ? `${e.title} · ${weekday(e.startsAt)} ${formatShortDate(e.startsAt)}` : undefined;

  async function loadMore() {
    if (!e || next === null) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await api.eventLineup(e.id, { category, cursor: next, limit: LINEUP_PAGE_SIZE });
      setExtra((prev) => ({ cars: [...(prev?.cars ?? []), ...page.cars], next: page.nextCursor }));
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setMoreBusy(false);
    }
  }

  function openCar(car: LineupCar) {
    if (!isMemberCar(car)) return undefined;
    if (car.me) return () => router.push(`/vehicule/${car.vehicleId}`);
    if (car.private) return () => setSheet(car);
    return () => router.push(`/u/${encodeURIComponent(car.pseudo)}`);
  }

  const grade = (me?.profile.grade as Grade | undefined) ?? null;
  const remaining = data ? data.filtered - cars.length : 0;
  const rows: LineupCar[][] = [];
  for (let i = 0; i < cars.length; i += 2) rows.push(cars.slice(i, i + 2));

  return (
    <FlowScreen
      title={L.title}
      facts={facts}
      onClose={close}
      closeLabel={L.backToEvent}
      onRefresh={async () => {
        await lineup.reload();
      }}
      overlays={<PrivateCarSheet car={sheet} onClose={() => setSheet(null)} canAskFriend={status === "in"} />}
    >
      {lineup.error && !data ? (
        <Notice tone="error">
          {lineup.error.status === 404 ? "Ce plateau n'est pas visible." : lineup.error.message}
        </Notice>
      ) : null}
      {data && e ? (
        <>
          <View style={styles.head} testID="lineup-head">
            <Text variant="numberNarrow" color={c.ink} style={styles.headNum}>
              {data.counts.cars}
            </Text>
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.ink}>
                {L.cars(data.counts.cars, data.phase)}
              </Text>
              <Muted variant="caption">
                {data.phase === "present"
                  ? L.headPresent(`${weekday(e.startsAt)} ${formatShortDate(e.startsAt)}`)
                  : e.capacity
                    ? `${L.headAccepted} · ${L.places(e.capacity)}`
                    : L.headAccepted}
              </Muted>
            </View>
          </View>
          <Seg<Tab>
            testID="lineup-tabs"
            value={tab}
            onChange={setTab}
            items={[
              { id: "cars", label: L.tabCars(data.counts.cars), testID: "lineup-tab-cars" },
              { id: "pros", label: L.tabPros(data.counts.pros), testID: "lineup-tab-pros" },
            ]}
          />
          {tab === "cars" ? (
            <>
              {data.categories.length > 0 ? (
                <ChipRow>
                  <Chip selected={!category} onPress={() => setCategory(undefined)} accessibilityRole="radio">
                    {L.allCategories}
                  </Chip>
                  {data.categories.map((cat) => (
                    <Chip
                      key={cat.slug}
                      selected={category === cat.slug}
                      onPress={() => setCategory(category === cat.slug ? undefined : cat.slug)}
                      accessibilityRole="radio"
                    >
                      {cat.label}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
              {cars.length === 0 ? (
                <Muted variant="body" testID="lineup-empty">
                  {data.phase === "present" ? L.emptyPresent : L.empty}
                </Muted>
              ) : (
                <View style={styles.grid} testID="lineup-grid">
                  {rows.map((row) => (
                    <View
                      key={row.map((car, i) => (isMemberCar(car) ? car.vehicleId : i)).join("-")}
                      style={styles.row}
                    >
                      {row.map((car, i) => (
                        <CarTile key={isMemberCar(car) ? car.vehicleId : i} car={car} onPress={openCar(car)} />
                      ))}
                      {row.length === 1 ? <View style={styles.grow} /> : null}
                    </View>
                  ))}
                </View>
              )}
              {moreError ? <Notice tone="error">{moreError}</Notice> : null}
              {next !== null && remaining > 0 ? (
                <Button
                  variant="secondary"
                  icon="down"
                  fullWidth
                  loading={moreBusy}
                  onPress={() => void loadMore()}
                  testID="lineup-more"
                >
                  {L.more(remaining)}
                </Button>
              ) : null}
            </>
          ) : (
            <View style={styles.pros} testID="lineup-pros">
              {data.pros.length === 0 ? <Muted variant="body">{L.prosEmpty}</Muted> : null}
              {data.pros.map((p) => (
                <ProRow
                  key={`${p.kind}-${p.id}`}
                  pro={p}
                  grade={grade}
                  // La vitrine d'un prestataire est réservée aux connectés ; un média n'a pas de vitrine dans l'appli.
                  onPress={
                    p.kind === "provider" && status === "in" ? () => router.push(`/providers/${p.id}`) : undefined
                  }
                />
              ))}
              {data.pros.length > 0 ? <Muted variant="caption">{L.prosNote(e.structure.name)}</Muted> : null}
            </View>
          )}
          <View style={[styles.note, { backgroundColor: c.surface }]} testID="lineup-rule">
            <Icon name="lock" size={14} color={c.inkMuted} />
            <Muted variant="caption" style={styles.grow}>
              {L.rule}
            </Muted>
          </View>
        </>
      ) : null}
    </FlowScreen>
  );
}

/** La voiture d'un compte privé (R4.3b) : photo, nom, génération, catégories ; son profil reste fermé. */
function PrivateCarSheet({
  car,
  onClose,
  canAskFriend,
}: {
  car: LineupCarMember | null;
  onClose: () => void;
  canAskFriend: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const vehicle = useApi<OtherVehicle | null>(
    () => (car ? api.otherVehicle(car.vehicleId) : Promise.resolve(null)),
    [car?.vehicleId],
    { enabled: Boolean(car) },
  );
  const v = vehicle.data;
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (!car) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestFriend(car.pseudo, "profile");
      setSent(car.pseudo);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const details = v
    ? [v.generationName, L.plateMasked].filter(Boolean).join(" · ")
    : car
      ? [car.generationName, L.plateMasked].filter(Boolean).join(" · ")
      : "";
  return (
    <AppSheet visible={Boolean(car)} onClose={onClose} accessibilityLabel={car ? L.privateSheetTitle(car.pseudo) : ""}>
      {car ? (
        <View style={styles.sheet} testID="lineup-private-sheet">
          <Text variant="posterS" color={c.ink}>
            {L.privateSheetTitle(car.pseudo)}
          </Text>
          <View style={[styles.big, { backgroundColor: c.surfaceRaised }]}>
            <Photo
              source={mediaSource(v && "photoUrl" in v ? v.photoUrl : car.photoUrl)}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <View style={styles.col}>
            <Text variant="posterM" color={c.ink}>
              {car.label}
            </Text>
            <Muted variant="caption">{details}</Muted>
          </View>
          {v && v.categories.length > 0 ? (
            <ChipRow>
              {v.categories.map((cat) => (
                <Chip key={cat.id}>{cat.label}</Chip>
              ))}
            </ChipRow>
          ) : null}
          <View style={[styles.note, { backgroundColor: c.surface }]}>
            <Icon name="lock" size={14} color={c.inkMuted} />
            <Muted variant="caption" style={styles.grow}>
              {L.privateSheetNote(car.pseudo)}
            </Muted>
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {canAskFriend ? (
            <Button
              variant="secondary"
              icon={sent === car.pseudo ? "check" : "profile"}
              fullWidth
              loading={busy}
              disabled={sent === car.pseudo}
              onPress={() => void ask()}
              testID="lineup-ask-friend"
            >
              {sent === car.pseudo ? L.friendSent : L.askFriend}
            </Button>
          ) : null}
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  col: { gap: space1 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  headNum: { fontSize: 52, lineHeight: 56 },
  grid: { gap: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  pros: { gap: space2 },
  note: { flexDirection: "row", gap: space2, padding: space3, borderRadius: radiusMd, alignItems: "flex-start" },
  sheet: { gap: space3 },
  big: { aspectRatio: 1, borderRadius: radiusMd, overflow: "hidden" },
});
