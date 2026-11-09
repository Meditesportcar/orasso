// « Personnaliser » l'Accueil (lot R7a2, maquette R7.5, décision D38 : un tableau de bord à son goût, jamais un fil) : les
// blocs affichés dans leur ordre, avec Monter / Descendre (pas de glisser-déposer : règle du lot 30, inchangée) et l'œil
// pour masquer ; « Prochaine sortie » grisée en tête (« Toujours en tête ») ; plus bas les blocs masqués avec « Ajouter » ;
// « Défis de la saison » grisé « Bientôt » (version 2) ; « Remettre par défaut ». Le réglage est gardé sur le compte, côté
// serveur (`PUT /me/home/widgets`) : le même sur le site et sur un autre téléphone. Rien ne part tant qu'on n'enregistre pas.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  addHomeWidget,
  defaultHomeWidgets,
  HOME_FIXED_WIDGET,
  type HomeWidgetId,
  type HomeWidgetsConfig,
  homeWidgetOffered,
  homePersonalizeLabels as L,
  moveVisibleHomeWidget,
  normalizeHomeWidgets,
  toggleHomeWidget,
  visibleHomeWidgets,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

/** Le pictogramme de chaque bloc. */
export const widgetIcons: Record<HomeWidgetId, IconName> = {
  next_access: "qr",
  live: "live",
  my_outings: "ticket",
  my_crew: "crew",
  friends_news: "feed",
  spot_meetup: "place",
  memories: "stamp",
  nearby: "explore",
  weather: "weatherClear",
  agenda: "calendar",
  favorite_garage: "wrench",
  pending: "wait",
  wash: "wash",
  fuel: "fuel",
};

export function PersonalizeScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const settings = useApi(() => api.settings(), [], { cacheKey: "account-settings-home" });
  const [draft, setDraft] = useState<HomeWidgetsConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le réglage enregistré sur le compte ; tant qu'on n'a rien touché, il suit la dernière réponse de l'API.
  const config: HomeWidgetsConfig = draft ?? normalizeHomeWidgets(settings.data?.homeWidgets ?? defaultHomeWidgets);
  const shown = visibleHomeWidgets(config).filter((id) => homeWidgetOffered(id));
  const hidden = config.hidden.filter((id) => homeWidgetOffered(id));
  const change = (next: HomeWidgetsConfig) => {
    setError(null);
    setDraft(next);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.setHomeWidgets(config);
      router.back();
    } catch (e) {
      setError(errorMessage(e) || L.saveFailed);
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.title}
      facts={L.subtitle}
      onClose={() => router.back()}
      closeLabel={L.close}
      footer={
        <SmButton kind="p" big wide icon="check" disabled={busy} onPress={() => void save()} testID="personalize-save">
          {busy ? L.saving : L.save}
        </SmButton>
      }
    >
      <Text variant="caption" color={c.inkMuted} testID="personalize-hint">
        {`${L.hint} ${L.hintEye}`}
      </Text>
      {error ? <Notice>{error}</Notice> : null}
      {settings.error && !settings.data ? (
        <Notice>{L.saveFailed.replace("non enregistré", "non chargé")}</Notice>
      ) : null}

      <View style={styles.list} testID="personalize-list">
        {shown.map((id, i) => {
          const fixed = id === HOME_FIXED_WIDGET;
          // Premier et dernier blocs affichés : « Monter » et « Descendre » s'éteignent (« Prochaine sortie » ne bouge pas).
          const first = i <= 1;
          const last = i === shown.length - 1;
          return (
            <Row
              key={id}
              id={id}
              fixed={fixed}
              canUp={!fixed && !first}
              canDown={!fixed && !last}
              onUp={() => change(moveVisibleHomeWidget(config, id, -1))}
              onDown={() => change(moveVisibleHomeWidget(config, id, 1))}
              onHide={() => change(toggleHomeWidget(config, id))}
            />
          );
        })}
      </View>

      <Text variant="label" color={c.inkMuted} style={styles.section}>
        {L.hiddenTitle.toUpperCase()}
      </Text>
      <View style={styles.list} testID="personalize-hidden">
        {hidden.length === 0 ? (
          <Text variant="caption" color={c.inkMuted}>
            {L.hiddenEmpty}
          </Text>
        ) : null}
        {hidden.map((id) => (
          <Row key={id} id={id} fixed={false} hiddenRow onAdd={() => change(addHomeWidget(config, id))} />
        ))}
        {/* « Défis de la saison » arrive avec la version 2 (D38) : grisé, sans action. */}
        <View
          style={[styles.soon, { borderColor: c.line }]}
          testID="personalize-soon"
          accessibilityState={{ disabled: true }}
        >
          <View style={[styles.tile, { backgroundColor: c.surfaceRaised }]}>
            <Icon name="trophy" size={20} color={c.inkFaint} />
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.inkFaint} style={styles.title}>
              {L.soonTitle}
            </Text>
            <Text variant="caption" color={c.inkFaint}>
              {L.soonHint}
            </Text>
          </View>
          <View style={[styles.soonTag, { borderColor: c.inkFaint }]}>
            <Text variant="label" color={c.inkMuted} style={styles.soonTagText}>
              {L.soon.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => change(defaultHomeWidgets)}
        accessibilityRole="button"
        accessibilityLabel={L.reset}
        style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
        testID="personalize-reset"
      >
        <Icon name="undo" size={16} color={c.accentText} />
        <Text variant="button" color={c.accentText}>
          {L.reset.toUpperCase()}
        </Text>
      </Pressable>
    </FlowScreen>
  );
}

function Row({
  id,
  fixed,
  hiddenRow,
  canUp,
  canDown,
  onUp,
  onDown,
  onHide,
  onAdd,
}: {
  id: HomeWidgetId;
  fixed: boolean;
  hiddenRow?: boolean;
  canUp?: boolean;
  canDown?: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onHide?: () => void;
  onAdd?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const w = L.widgets[id];
  return (
    <View
      style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }, fixed && styles.fixed]}
      testID={`personalize-row-${id}`}
    >
      {fixed ? (
        <View style={styles.handle}>
          <Icon name="lock" size={18} color={c.inkMuted} />
        </View>
      ) : hiddenRow ? null : (
        <View style={styles.handle}>
          <Arrow dir="up" disabled={!canUp} label={`${L.moveUp} ${w.title}`} onPress={onUp} id={id} />
          <Arrow dir="down" disabled={!canDown} label={`${L.moveDown} ${w.title}`} onPress={onDown} id={id} />
        </View>
      )}
      <View style={[styles.tile, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={widgetIcons[id]} size={20} color={c.ink} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink} style={styles.title}>
          {w.title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {fixed ? L.fixedHint : w.hint}
        </Text>
      </View>
      {hiddenRow ? (
        <SmButton
          kind="s"
          icon="add"
          onPress={onAdd}
          testID={`personalize-add-${id}`}
          accessibilityLabel={`${L.add} ${w.title}`}
        >
          {L.add}
        </SmButton>
      ) : !fixed ? (
        <Pressable
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel={`${L.hide} ${w.title}`}
          style={({ pressed }) => [styles.eye, { borderColor: c.barControlEdge }, pressed && styles.pressed]}
          testID={`personalize-hide-${id}`}
        >
          <Icon name="eye" size={20} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Arrow({
  dir,
  disabled,
  label,
  onPress,
  id,
}: {
  dir: "up" | "down";
  disabled: boolean;
  label: string;
  onPress?: () => void;
  id: HomeWidgetId;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed, disabled && styles.arrowOff]}
      testID={`personalize-${dir}-${id}`}
    >
      <Icon name={dir} size={18} color={t.color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  section: { marginTop: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: 10, borderRadius: 16 },
  fixed: { opacity: 0.8 },
  handle: { width: 28, alignItems: "center", justifyContent: "center", gap: 2 },
  arrow: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  arrowOff: { opacity: 0.3 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  // Un titre ne se coupe jamais au milieu d'un mot : il passe à la ligne, la phrase dessous suit.
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 19 },
  eye: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
  soon: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  soonTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  soonTagText: { fontSize: 10, lineHeight: 12 },
  reset: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48 },
});
