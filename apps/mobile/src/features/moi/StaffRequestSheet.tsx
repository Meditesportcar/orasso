// Moi > Devenir staff : recherche d'une structure vérifiée, puis demande à la rejoindre (`POST /structures/:id/staff-requests`,
// route du lot 24). Tant que cette route n'existe pas (404), la demande se fait sur la page de la structure, sur le site.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import type { StructureCard } from "@orasso/shared";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { filterStructures } from "@/lib/structureSearch";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";

const { space1, space2, space3 } = tokens.spacing;

type Outcome = { slug: string; tone: "ok" | "info" | "error"; text: string };

export function StaffRequestSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const list = useApi(() => api.verifiedStructures(), [visible], { enabled: visible });
  const [query, setQuery] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const shown = filterStructures(list.data?.items ?? [], query);

  async function request(structure: StructureCard) {
    setBusySlug(structure.slug);
    setOutcome(null);
    try {
      const full = await api.structureBySlug(structure.slug);
      await api.requestStaff(full.id);
      setOutcome({
        slug: structure.slug,
        tone: "ok",
        text: `Demande envoyée à ${structure.name}. Tu seras prévenu quand l'équipe organisatrice aura répondu.`,
      });
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 405)) {
        // La demande depuis l'appli n'existe pas encore : on ouvre la page de la structure sur le site.
        setOutcome({
          slug: structure.slug,
          tone: "info",
          text: "La demande se fait pour l'instant depuis la page de la structure sur le site.",
        });
        void Linking.openURL(siteUrl(`/o/${structure.slug}`)).catch(() => undefined);
      } else {
        setOutcome({ slug: structure.slug, tone: "error", text: errorMessage(e) });
      }
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Devenir staff" maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        Devenir staff
      </Text>
      <Text variant="body" color={t.color.ink}>
        Cherche l'association ou le club dont tu veux rejoindre l'équipe : l'équipe organisatrice reçoit ta demande et
        décide.
      </Text>
      <TextField label="Nom de la structure" value={query} onChangeText={setQuery} autoCorrect={false} />
      {list.loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
      ) : shown.length === 0 ? (
        <Text variant="body" color={t.color.inkMuted}>
          {list.error ? "Impossible de charger les structures hors ligne." : "Aucune structure vérifiée ne correspond."}
        </Text>
      ) : (
        shown.map((s) => (
          <Plate key={s.slug} style={styles.item} testID="staff-structure">
            <View style={styles.text}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {s.name}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {[s.city, s.department].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {outcome?.slug === s.slug ? (
              <Text
                variant="caption"
                color={outcome.tone === "error" ? t.color.winText : t.color.plateInk}
                accessibilityRole={outcome.tone === "error" ? "alert" : "text"}
              >
                {outcome.text}
              </Text>
            ) : null}
            <Button
              variant="plate"
              icon="staff"
              loading={busySlug === s.slug}
              onPress={() => void request(s)}
              fullWidth
            >
              Demander à rejoindre le staff
            </Button>
          </Plate>
        ))
      )}
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  item: { gap: space2, padding: space3 },
  text: { gap: space1 },
});
