// Fiche d'un pro dans l'appli (lot 29, docs/02 « Pages atteintes ») : activités, adresse ou zone, horaires, coordonnées,
// remises par grade, partenaires. Ce que la fiche montre suit `proVisibility` (fiche de base après le 21/06/2027 sans
// abonnement) : l'API ne renvoie ni remises ni publications dans ce cas. Ouverte sans compte ; suivre demande un compte.
import { Button, Chip, ChipRow, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerLabels, gradeLabels, grades, proActivityLabels, weekdayLabels, weekdays } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ReportButton } from "@/features/ReportSheet";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { errorMessage, request } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function ProPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status } = useSession();
  const pro = useApi(() => api.proBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const p = pro.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const viewed = useRef<string | null>(null);

  // Une vue comptée par fiche et par ouverture (jamais celle du pro : l'API l'ignore).
  useEffect(() => {
    if (!p || viewed.current === p.slug) return;
    viewed.current = p.slug;
    void request(`/api/pros/by-slug/${encodeURIComponent(p.slug)}/track`, {
      method: "POST",
      body: { kind: "view" },
    }).catch(() => undefined);
  }, [p]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  const track = (kind: "call" | "route") =>
    void request(`/api/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", body: { kind } }).catch(
      () => undefined,
    );

  if (!p) {
    return (
      <FlowScreen title="Pro" onClose={close}>
        {pro.error ? (
          <Notice tone="error">{pro.error.status === 404 ? explorerLabels.proMissing : pro.error.message}</Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  async function toggleFollow() {
    if (!p) return;
    if (status !== "in") {
      router.push({ pathname: "/auth", params: { mode: "signup", next: `/p/${slug}` } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (p.isFollowing) await api.unfollowPro(p.id);
      else await api.followPro(p.id);
      await pro.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const where = p.city
    ? [p.addressLine, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : p.interventionDepartments.length > 0
      ? `Intervient : ${p.interventionDepartments.join(", ")}`
      : "";
  const discounts = grades.filter((g) => p.discounts[g] !== undefined);
  const hours = weekdays.filter((d) => p.hours[d]);
  const hasPosition = p.lat !== null && p.lng !== null;
  return (
    <FlowScreen
      title={p.name}
      onClose={close}
      onRefresh={pro.reload}
      overlays={
        <PhotoViewer
          photos={p.photos.map((x, i) => ({
            id: x.id,
            url: x.url,
            position: i + 1,
            width: 4,
            height: 3,
            plateBlurred: false,
          }))}
          start={viewer}
          onClose={() => setViewer(null)}
        />
      }
    >
      <Plate style={styles.head} testID="pro-head" accessibilityLabel={`Pro ${p.name}`}>
        <View style={styles.headRow}>
          <Photo
            source={mediaSource(p.logoUrl)}
            placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
            cut="thumb"
            style={styles.logo}
          />
          <View style={styles.headText}>
            <Text variant="label" color={t.color.plateMuted}>
              {p.activities.map((a) => proActivityLabels[a]).join(" · ")}
            </Text>
            <Text variant="posterL" color={t.color.plateInk}>
              {p.name}
            </Text>
            {where ? (
              <Text variant="meta" color={t.color.plateMuted}>
                {where}
              </Text>
            ) : null}
          </View>
        </View>
        <ChipRow>
          {p.verified ? (
            <Chip variant="verified" surface="plate">
              {explorerLabels.verifiedPro}
            </Chip>
          ) : null}
          <Chip surface="plate">{`${p.followersCount} abonnés`}</Chip>
        </ChipRow>
        {p.description ? (
          <Text variant="body" color={t.color.plateInk}>
            {p.description}
          </Text>
        ) : null}
      </Plate>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.actions}>
        {p.isFollowing ? (
          <Button
            variant="secondary"
            icon="check"
            loading={busy}
            onPress={() => void toggleFollow()}
            fullWidth
            testID="follow-pro"
          >
            {explorerLabels.structureFollowing}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="add"
            loading={busy}
            onPress={() => void toggleFollow()}
            fullWidth
            testID="follow-pro"
          >
            {explorerLabels.structureFollow}
          </Button>
        )}
        <View style={styles.row}>
          {p.phone ? (
            <Button
              variant="secondary"
              icon="phone"
              onPress={() => {
                track("call");
                void Linking.openURL(`tel:${p.phone?.replace(/\s+/g, "")}`).catch(() => undefined);
              }}
            >
              Appeler
            </Button>
          ) : null}
          {hasPosition ? (
            <Button
              variant="secondary"
              icon="place"
              onPress={() => {
                track("route");
                void Linking.openURL(`https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lng}`).catch(
                  () => undefined,
                );
              }}
            >
              Itinéraire
            </Button>
          ) : null}
        </View>
      </View>

      {/* Lot 36 : les photos de réalisations, comme sur le site (elles n'étaient montrées qu'au pro). */}
      {p.photos.length > 0 ? (
        <>
          <SectionTitle>Réalisations</SectionTitle>
          <PhotoGrid
            photos={p.photos.map((x, i) => ({
              key: x.id,
              source: mediaSource(x.url),
              label: `Réalisation ${i + 1} en plein écran`,
            }))}
            onOpen={setViewer}
            testID="pro-public-photos"
          />
        </>
      ) : null}

      {discounts.length > 0 ? (
        <>
          <SectionTitle>Remises selon ton grade</SectionTitle>
          <Plate style={styles.block} testID="pro-discounts">
            {discounts.map((g) => (
              <Text key={g} variant="body" color={t.color.plateInk}>
                {`${gradeLabels[g]} : −${p.discounts[g]} %`}
              </Text>
            ))}
          </Plate>
        </>
      ) : null}

      {hours.length > 0 ? (
        <>
          <SectionTitle>Horaires</SectionTitle>
          <Plate style={styles.block}>
            {hours.map((d) => (
              <Text key={d} variant="body" color={t.color.plateInk}>
                {`${weekdayLabels[d]} : ${p.hours[d]}`}
              </Text>
            ))}
          </Plate>
        </>
      ) : null}

      {p.website || p.email ? (
        <>
          <SectionTitle>Contact</SectionTitle>
          <Plate style={styles.block}>
            {p.website ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(p.website as string).catch(() => undefined)}
              >
                <Text variant="body" color={t.color.plateInk}>
                  {p.website}
                </Text>
              </Pressable>
            ) : null}
            {p.email ? (
              <Text variant="body" color={t.color.plateInk}>
                {p.email}
              </Text>
            ) : null}
          </Plate>
        </>
      ) : null}

      {p.partners.length > 0 ? (
        <>
          <SectionTitle>Partenaire de</SectionTitle>
          {p.partners.map((o) => (
            <Pressable key={o.slug} accessibilityRole="link" onPress={() => router.push(`/o/${o.slug}`)}>
              <Plate style={styles.block}>
                <Text variant="posterS" color={t.color.plateInk}>
                  {o.name}
                </Text>
                {o.city ? (
                  <Text variant="meta" color={t.color.plateMuted}>
                    {o.city}
                  </Text>
                ) : null}
              </Plate>
            </Pressable>
          ))}
        </>
      ) : null}

      {p.posts && p.posts.length > 0 ? (
        <>
          <SectionTitle>Publications</SectionTitle>
          {p.posts.map((post) => (
            <Plate key={post.id} style={styles.block}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {post.title}
              </Text>
              <Text variant="body" color={t.color.plateInk}>
                {post.body}
              </Text>
            </Plate>
          ))}
        </>
      ) : null}
      {/* Signaler (lot 32) : la fiche d'un autre, connecté. */}
      {status === "in" && !p.isOwner ? <ReportButton look="link" type="pro" id={p.id} /> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space3, padding: space3 },
  headRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, gap: space1 },
  logo: { width: 64, height: 64, borderRadius: tokens.radius.radiusSm },
  actions: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  block: { gap: space1, padding: space3 },
});
