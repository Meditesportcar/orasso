// Étape 1 de « Nouvel album » (lot R9e, maquette `albumH` e1) : « Choisis l'événement ». Seulement les événements où le média est accrédité ;
// une accréditation en attente est grisée « accréditation en attente ». « Continuer » crée le brouillon (ou, s'il en existe un pour cet
// événement, le reprend : « Reprendre l'album »).
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { albumLabels as L, type MediaAccreditationView } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDay } from "@/lib/format";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export type EventChoice = { id: string; title: string; startsAt: string; state: "accredited" | "pending" };

/** Les événements proposés : les accréditations retenues d'abord (les plus récentes en tête), puis celles en attente (grisées). */
export function eventChoices(list: readonly MediaAccreditationView[]): EventChoice[] {
  const pick = (status: MediaAccreditationView["status"], state: EventChoice["state"]) =>
    list
      .filter((a) => a.status === status)
      .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt))
      .map((a) => ({ id: a.event.id, title: a.event.title, startsAt: a.event.startsAt, state }));
  return [...pick("accepted", "accredited"), ...pick("pending", "pending")];
}

export function AlbumStep1Event({
  choices,
  chosen,
  onChoose,
  drafts,
  busy,
  error,
  onContinue,
}: {
  choices: EventChoice[];
  chosen: string | null;
  onChoose: (id: string) => void;
  /** Événements qui ont déjà un brouillon (identifiants). */
  drafts: ReadonlySet<string>;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  const { t } = useTheme();
  const available = choices.filter((c) => c.state === "accredited");
  return (
    <View style={styles.block}>
      <Muted variant="label">{L.chooseEvent}</Muted>
      {choices.length === 0 ? (
        <Notice testID="album-no-event">{`${L.noEvent} ${L.noEventHint}`}</Notice>
      ) : (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={L.chooseEvent}>
          {choices.map((c) => {
            const off = c.state === "pending";
            const on = chosen === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: off }}
                disabled={off}
                onPress={() => onChoose(c.id)}
                style={[
                  styles.option,
                  {
                    borderColor: on ? t.color.accent : t.color.line,
                    backgroundColor: t.color.surface,
                    opacity: off ? 0.55 : 1,
                  },
                ]}
                testID={off ? "album-event-pending" : "album-event"}
              >
                <Icon name={off ? "wait" : "camera"} size={20} color={on ? t.color.accentText : t.color.inkMuted} />
                <View style={styles.optionText}>
                  <Text variant="bodyStrong" color={t.color.ink}>
                    {c.title}
                  </Text>
                  <Muted variant="caption">{L.eventOption(formatDay(c.startsAt), c.state)}</Muted>
                </View>
                {on ? <Icon name="check" size={18} color={t.color.accentText} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
      <Notice testID="album-events-note">{L.eventsNote}</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="next"
        fullWidth
        loading={busy}
        disabled={busy || !chosen || available.length === 0}
        onPress={onContinue}
        testID="album-step1-continue"
      >
        {chosen && drafts.has(chosen) ? L.resume : L.continue}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3 },
  list: { gap: space2 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    borderWidth: 1,
    borderRadius: tokens.radius.radiusMd,
    padding: space3,
  },
  optionText: { flex: 1, gap: space1 },
});
