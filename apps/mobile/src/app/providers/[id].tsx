// Fiche publique d'un prestataire (DA v2, lot 54, prototype `s-vitrine` « Vue organisateur ») : la vitrine en lecture et
// les avis des organisateurs, pour l'organisateur qui trie et le passionné qui visite l'événement. Jamais le téléphone ni
// l'e-mail (l'API ne les envoie pas aux autres comptes).
import { departmentChoices, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proV2Labels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { VitrineView } from "@/features/provider/VitrineView";
import { ReportButton } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { initialsOf } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;

export default function ProviderPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useSession();
  const provider = useApi(() => api.providerPublic(id), [id, status], { enabled: status === "in" });
  const reviews = useApi(() => api.providerReviews(id), [id, status], { enabled: status === "in" });
  const p = provider.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  const place = p?.departments[0] ? departmentChoices.find((d) => d.code === p.departments[0])?.name : undefined;

  if (!p) {
    return (
      <FlowScreen title={proV2Labels.providerPage} onClose={close}>
        {provider.error ? (
          <Notice tone="error">
            {provider.error.status === 404 ? proV2Labels.providerMissing : provider.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      title={p.name}
      onClose={close}
      onRefresh={async () => void (await Promise.all([provider.reload(), reviews.reload()]))}
    >
      <View style={styles.identity} testID="provider-identity">
        <View style={[styles.logo, { backgroundColor: t.color.surfaceRaised, borderColor: t.color.line }]}>
          <Text variant="posterS" color={t.color.ink}>
            {initialsOf(p.name)}
          </Text>
        </View>
        <View style={styles.identityText}>
          <Text variant="posterM" color={t.color.ink}>
            {p.name}
          </Text>
          <Muted variant="caption">{proV2Labels.tradePlace(p.typeLabel, place ?? null)}</Muted>
        </View>
      </View>
      {p.description ? (
        <Text variant="body" color={t.color.ink}>
          {p.description}
        </Text>
      ) : null}
      <VitrineView vitrine={p} reviews={reviews.data} />
      {p.instagram || p.website || p.portfolioUrl ? (
        <View style={styles.links}>
          {[
            { label: p.instagram, url: p.instagram },
            { label: p.website, url: p.website },
            { label: p.portfolioUrl, url: p.portfolioUrl },
          ]
            .filter((l): l is { label: string; url: string } => Boolean(l.label && l.url))
            .map((l) => (
              <Text
                key={l.url}
                variant="body"
                color={t.color.ink}
                accessibilityRole="link"
                onPress={() =>
                  void Linking.openURL(/^https?:/.test(l.url) ? l.url : `https://${l.url}`).catch(() => undefined)
                }
              >
                {l.label}
              </Text>
            ))}
        </View>
      ) : null}
      {status === "in" ? <ReportButton look="link" type="provider" id={p.id} /> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space3 },
  identityText: { flex: 1, minWidth: 0, gap: space1 },
  logo: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  links: { gap: space1 },
});
