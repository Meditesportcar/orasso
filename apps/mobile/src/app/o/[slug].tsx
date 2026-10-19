// Page d'une structure (organisateur) dans l'appli (lot 29, docs/02 « Pages atteintes ») : fiche, note moyenne, événements
// à venir et passés, suivre, devenir staff. « Contacter » arrive avec la messagerie (lot 18) : visible, désactivé.
// Ouverte sans compte (lien partagé) ; suivre ou devenir staff demandent de se connecter.
import { Button, Chip, ChipRow, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerLabels, structureKindLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { EventRow } from "@/features/explorer/rows";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function StructurePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status } = useSession();
  const structure = useApi(() => api.structureBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const s = structure.data;
  const upcoming = useApi(() => api.exploreEvents({ structureId: s?.id, sort: "date", limit: 20 }), [s?.id], {
    enabled: Boolean(s),
  });
  const past = useApi(() => api.exploreEvents({ structureId: s?.id, scope: "past", limit: 5 }), [s?.id], {
    enabled: Boolean(s),
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  const needAccount = () => router.push({ pathname: "/auth", params: { mode: "signup", next: `/o/${slug}` } });

  if (!s) {
    return (
      <FlowScreen title="Organisateur" onClose={close}>
        {structure.error ? (
          <Notice tone="error">
            {structure.error.status === 404 ? explorerLabels.structureMissing : structure.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  async function toggleFollow() {
    if (!s) return;
    if (status !== "in") return needAccount();
    setBusy(true);
    setNote(null);
    try {
      if (s.isFollowing) await api.unfollowStructure(s.id);
      else await api.followStructure(s.id);
      await structure.reload();
    } catch (e) {
      setNote({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function becomeStaff() {
    if (!s) return;
    if (status !== "in") return needAccount();
    setBusy(true);
    setNote(null);
    try {
      await api.requestStaff(s.id);
      setNote({
        tone: "info",
        text: `Demande envoyée à ${s.name}. Tu seras prévenu quand l'équipe organisatrice aura répondu.`,
      });
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 405)) {
        // La demande depuis l'appli n'existe pas encore (lot 24) : la page de la structure du site la reçoit.
        setNote({
          tone: "info",
          text: "La demande se fait pour l'instant depuis la page de la structure sur le site.",
        });
        void Linking.openURL(siteUrl(`/o/${s.slug}`)).catch(() => undefined);
      } else {
        setNote({ tone: "error", text: errorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  const where = [s.postalCode, s.city].filter(Boolean).join(" ");
  const average = s.rating.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <FlowScreen title={s.name} onClose={close} onRefresh={structure.reload}>
      <Plate style={styles.head} testID="structure-head" accessibilityLabel={`Organisateur ${s.name}`}>
        <View style={styles.headRow}>
          <Photo
            source={mediaSource(s.logoUrl)}
            placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
            cut="thumb"
            style={styles.logo}
          />
          <View style={styles.headText}>
            <Text variant="label" color={t.color.plateMuted}>
              {structureKindLabels[s.kind]}
            </Text>
            <Text variant="posterL" color={t.color.plateInk}>
              {s.name}
            </Text>
            {where ? (
              <Text variant="meta" color={t.color.plateMuted}>
                {where}
              </Text>
            ) : null}
          </View>
        </View>
        <ChipRow>
          {s.verified ? (
            <Chip variant="verified" surface="plate">
              Structure vérifiée
            </Chip>
          ) : null}
          <Chip surface="plate">{explorerLabels.structureFollowers(s.followersCount)}</Chip>
          {average ? <Chip surface="plate">{`${average} / 3 · ${s.rating.count} avis`}</Chip> : null}
        </ChipRow>
        {s.description ? (
          <Text variant="body" color={t.color.plateInk}>
            {s.description}
          </Text>
        ) : null}
      </Plate>

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <View style={styles.actions}>
        {s.isFollowing ? (
          <Button
            variant="secondary"
            icon="check"
            loading={busy}
            onPress={() => void toggleFollow()}
            fullWidth
            testID="follow"
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
            testID="follow"
          >
            {explorerLabels.structureFollow}
          </Button>
        )}
        <View style={styles.row}>
          <Button
            variant="secondary"
            icon="staff"
            disabled={busy}
            onPress={() => void becomeStaff()}
            testID="become-staff"
          >
            {explorerLabels.structureBecomeStaff}
          </Button>
          {/* Messagerie (lot 18) : visible, désactivée jusque-là. */}
          <Button variant="secondary" icon="chat" disabled>
            {explorerLabels.structureContactSoon}
          </Button>
        </View>
      </View>

      <SectionTitle>{explorerLabels.structureEvents}</SectionTitle>
      {upcoming.data && upcoming.data.items.length === 0 ? (
        <Muted variant="body">{explorerLabels.structureNoEvents}</Muted>
      ) : null}
      {upcoming.data?.items.map((e) => (
        <EventRow key={e.id} event={e} hints={false} />
      ))}

      {past.data && past.data.items.length > 0 ? (
        <>
          <SectionTitle>{explorerLabels.structurePast}</SectionTitle>
          {past.data.items.map((e) => (
            <EventRow key={e.id} event={e} hints={false} />
          ))}
        </>
      ) : null}
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
});
