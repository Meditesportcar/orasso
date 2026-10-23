// Widgets de l'Accueil (lot 30, docs/02) : tous sur le même modèle (plaque graphite, titre en capitales), sans néon (le
// « Prochain accès » le porte), sans bouton principal (un seul par écran). Rien ici n'appelle un réseau : les données
// viennent de `GET /me/home`. Un nom (d'événement, de pro, de station) ne se tronque jamais.
import { Button, Chip, ChipRow, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  eventFormatLabels,
  type FuelStation,
  HOME_RADIUS,
  type HomeData,
  type HomeFavoriteGarage,
  type HomeNudgeKind,
  type HomeSponsored,
  homeLabels,
  homeNudges,
  homeWidgetTitles,
  type MyApplication,
  type NearbyPlace,
  proActivityLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDay, formatHour, formatShortDate } from "@/lib/format";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { Slider } from "@/ui/Slider";
import type { PositionState } from "../explorer/useMyPosition";

const { space1, space2, space3 } = tokens.spacing;

/** Ouvre une adresse web (http ou https seulement). */
function openWeb(url: string) {
  if (/^https?:\/\//i.test(url)) void Linking.openURL(url).catch(() => undefined);
}

const directionsUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;

// --- En attente --------------------------------------------------------------------------------------------------

export function PendingWidget({ items }: { items: MyApplication[] }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <>
      <SectionTitle>{homeWidgetTitles.pending}</SectionTitle>
      {items.length > 0 ? (
        <Plate style={styles.stack} testID="widget-pending">
          {items.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="link"
              accessibilityLabel={a.event.title}
              onPress={() => router.navigate("/acces")}
              style={styles.line}
            >
              <Text variant="meta" color={t.color.plateMuted} style={styles.date}>
                {formatShortDate(a.event.startsAt)}
              </Text>
              <View style={styles.fill}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {a.event.title}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {applicationStatusLabels[a.status]}
                  {a.status === "waitlisted" && a.waitlistRank ? ` · rang ${a.waitlistRank}` : ""}
                </Text>
              </View>
            </Pressable>
          ))}
        </Plate>
      ) : (
        <Muted variant="body">{homeLabels.pendingEmpty}</Muted>
      )}
    </>
  );
}

// --- Autour de moi -----------------------------------------------------------------------------------------------

export function NearbyWidget({
  nearby,
  position,
  onRadius,
}: {
  nearby: NonNullable<HomeData["nearby"]>;
  position: PositionState;
  /** Rayon choisi au curseur (enregistré dans le profil par l'API). */
  onRadius: (km: number) => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  // `radiusKm: null` = « Partout en France » (réglé dans « Tes préférences ») : le curseur part de sa butée.
  const [shown, setShown] = useState<number>(nearby.radiusKm ?? HOME_RADIUS.max);
  useEffect(() => setShown(nearby.radiusKm ?? HOME_RADIUS.max), [nearby.radiusKm]);
  return (
    <>
      <SectionTitle>{homeWidgetTitles.nearby}</SectionTitle>
      <Plate style={styles.stack} testID="widget-nearby">
        <Text variant="meta" color={t.color.plateMuted} testID="nearby-radius">
          {homeLabels.radius(nearby.radiusKm === null && shown === HOME_RADIUS.max ? null : shown)}
        </Text>
        <Slider
          value={shown}
          onChange={setShown}
          onCommit={onRadius}
          min={HOME_RADIUS.min}
          max={HOME_RADIUS.max}
          step={HOME_RADIUS.step}
          label={homeLabels.radiusLabel}
          format={(km) => `${km} km`}
        />
        {nearby.events.length > 0 ? (
          nearby.events.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="link"
              accessibilityLabel={e.title}
              onPress={() => router.push(`/e/${e.slug}`)}
              style={styles.line}
              testID="nearby-event"
            >
              <Text variant="meta" color={t.color.plateMuted} style={styles.date}>
                {formatShortDate(e.startsAt)}
              </Text>
              <View style={styles.fill}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {e.title}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {eventFormatLabels[e.format]} · {formatDay(e.startsAt)} · {formatHour(e.startsAt)}
                  {e.city ? ` · ${e.city}` : ""}
                  {typeof e.distanceKm === "number" ? ` · ${homeLabels.distance(e.distanceKm)}` : ""}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text variant="body" color={t.color.plateMuted}>
            {nearby.source === null
              ? homeLabels.nearbyNoPlace
              : homeLabels.nearbyEmpty(nearby.radiusKm === null ? null : shown)}
          </Text>
        )}
        {position.position ? (
          <>
            <Text variant="caption" color={t.color.plateMuted}>
              {homeLabels.usingPosition}
            </Text>
            <Button variant="plate" icon="close" onPress={position.clear} fullWidth>
              {homeLabels.stopPosition}
            </Button>
          </>
        ) : (
          <Button
            variant="plate"
            icon="place"
            loading={position.status === "asking"}
            onPress={() => void position.request()}
            fullWidth
            testID="use-position"
          >
            {homeLabels.usePosition}
          </Button>
        )}
        {position.status === "denied" ? <Notice>{homeLabels.positionDenied}</Notice> : null}
      </Plate>
    </>
  );
}

// --- Agenda ------------------------------------------------------------------------------------------------------

export function AgendaWidget({ items }: { items: MyApplication[] }) {
  const { t } = useTheme();
  return (
    <>
      <SectionTitle>{homeWidgetTitles.agenda}</SectionTitle>
      {items.length > 0 ? (
        <Plate style={styles.stack} testID="widget-agenda">
          {items.slice(0, 6).map((a) => (
            <View key={a.id} style={styles.line}>
              <Text
                variant="meta"
                color={a.status === "accepted" ? t.color.accent : t.color.plateMuted}
                style={styles.date}
              >
                {formatShortDate(a.event.startsAt)}
              </Text>
              <Text variant="body" color={t.color.plateInk} style={styles.fill}>
                {a.event.title} · {applicationStatusLabels[a.status].toLowerCase()}
              </Text>
            </View>
          ))}
        </Plate>
      ) : (
        <Muted variant="body">{homeLabels.agendaEmpty}</Muted>
      )}
    </>
  );
}

// --- Garage favori -----------------------------------------------------------------------------------------------

export function FavoriteGarageWidget({ garage }: { garage: HomeFavoriteGarage | null }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <>
      <SectionTitle>{homeWidgetTitles.favorite_garage}</SectionTitle>
      {garage ? (
        <Plate style={styles.stack} testID="widget-garage">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={garage.name}
            onPress={() => router.push(`/p/${garage.slug}`)}
            style={styles.stack}
          >
            <Text variant="posterM" color={t.color.plateInk}>
              {garage.name}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {garage.activities.map((a) => proActivityLabels[a]).join(" · ")}
              {garage.city ? ` · ${garage.city}` : ""}
            </Text>
          </Pressable>
          <View style={styles.row}>
            {garage.phone ? (
              <Button
                variant="plate"
                icon="phone"
                onPress={() => {
                  void api.trackPro(garage.slug, "call").catch(() => undefined);
                  void Linking.openURL(`tel:${garage.phone?.replace(/\s+/g, "")}`).catch(() => undefined);
                }}
                testID="garage-call"
              >
                {homeLabels.call}
              </Button>
            ) : null}
            {garage.lat !== null && garage.lng !== null ? (
              <Button
                variant="plate"
                icon="place"
                onPress={() => {
                  void api.trackPro(garage.slug, "route").catch(() => undefined);
                  openWeb(directionsUrl(garage.lat as number, garage.lng as number));
                }}
                testID="garage-route"
              >
                {homeLabels.route}
              </Button>
            ) : null}
          </View>
        </Plate>
      ) : (
        <Muted variant="body">{homeLabels.garageEmpty}</Muted>
      )}
    </>
  );
}

// --- Lavage et carburant -----------------------------------------------------------------------------------------

function PlaceLine({ place, children }: { place: NearbyPlace; children?: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={styles.place} testID="place-line">
      <View style={styles.row}>
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {place.name}
          </Text>
          {place.address ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {place.address}
            </Text>
          ) : null}
        </View>
        <Text variant="meta" color={t.color.plateMuted}>
          {homeLabels.distance(place.distanceKm)}
        </Text>
      </View>
      {children}
      <Button
        variant="plate"
        icon="place"
        onPress={() => openWeb(directionsUrl(place.lat, place.lng))}
        accessibilityLabel={`${homeLabels.route} : ${place.name}`}
      >
        {homeLabels.route}
      </Button>
    </View>
  );
}

export function PlacesWidget({ kind, places }: { kind: "wash" | "fuel"; places: NearbyPlace[] | FuelStation[] }) {
  const { t } = useTheme();
  return (
    <>
      <SectionTitle>{homeWidgetTitles[kind]}</SectionTitle>
      {places.length > 0 ? (
        <Plate style={styles.stack} testID={`widget-${kind}`}>
          {places.map((p) => (
            <PlaceLine key={`${p.lat},${p.lng},${p.name}`} place={p}>
              {kind === "fuel" && "prices" in p ? <FuelPrices station={p} /> : null}
            </PlaceLine>
          ))}
          <Text variant="caption" color={t.color.plateMuted}>
            {kind === "wash" ? homeLabels.washAttribution : homeLabels.fuelAttribution}
          </Text>
        </Plate>
      ) : (
        <Muted variant="body">{homeLabels.placesEmpty}</Muted>
      )}
    </>
  );
}

function FuelPrices({ station }: { station: FuelStation }) {
  const entries = (Object.keys(homeLabels.fuelNames) as (keyof typeof homeLabels.fuelNames)[]).flatMap((k) => {
    const price = station.prices[k];
    return price === null || price === undefined ? [] : [{ key: k, price }];
  });
  return (
    <ChipRow>
      {entries.map((e) => (
        <Chip key={e.key} surface="plate">
          {`${homeLabels.fuelNames[e.key]} ${e.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${homeLabels.priceUnit}`}
        </Chip>
      ))}
    </ChipRow>
  );
}

// --- Emplacement sponsorisé --------------------------------------------------------------------------------------

export function SponsoredCard({ sponsored }: { sponsored: HomeSponsored }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <>
      <SectionTitle>{homeLabels.sponsored}</SectionTitle>
      <Plate style={styles.stack} testID="sponsored-card">
        <Text variant="posterM" color={t.color.plateInk}>
          {sponsored.title}
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {sponsored.body}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={sponsored.pro.name}
          onPress={() => router.push(`/p/${sponsored.pro.slug}`)}
        >
          <Text variant="meta" color={t.color.plateMuted}>
            {sponsored.pro.name}
          </Text>
        </Pressable>
        <Button
          variant="plate"
          icon="next"
          onPress={() => {
            void api.sponsoredClick(sponsored.id).catch(() => undefined);
            openWeb(sponsored.linkUrl);
          }}
          testID="sponsored-open"
        >
          {homeLabels.moreInfo}
        </Button>
      </Plate>
    </>
  );
}

// --- Une incitation à la fois ------------------------------------------------------------------------------------

const NUDGE_ICON: Record<HomeNudgeKind, "add" | "check" | "profile" | "crew"> = {
  verify_email: "check",
  enable_2fa: "profile",
  add_vehicle: "add",
  create_crew: "crew",
};

export function NudgeCard({
  kind,
  primary,
  onAction,
}: {
  kind: HomeNudgeKind;
  /** Vrai quand aucun « Prochain accès » ne porte déjà le bouton principal de l'écran. */
  primary: boolean;
  onAction: () => void;
}) {
  const { t } = useTheme();
  const copy = homeNudges[kind];
  return (
    <Plate style={styles.stack} testID="home-nudge">
      <Icon name={NUDGE_ICON[kind]} size={22} color={t.color.plateInk} />
      <Text variant="posterM" color={t.color.plateInk}>
        {copy.title}
      </Text>
      <Text variant="body" color={t.color.plateMuted}>
        {copy.body}
      </Text>
      <Button variant={primary ? "primary" : "secondary"} icon={NUDGE_ICON[kind]} onPress={onAction} fullWidth>
        {copy.action}
      </Button>
    </Plate>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space2, padding: space3 },
  line: { flexDirection: "row", gap: space3, alignItems: "baseline", paddingVertical: space1 },
  place: { gap: space2, paddingVertical: space1 },
  row: { flexDirection: "row", gap: space2, alignItems: "flex-start", flexWrap: "wrap" },
  fill: { flex: 1 },
  date: { width: 56 },
});
