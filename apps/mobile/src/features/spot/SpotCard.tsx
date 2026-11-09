// La carte d'un rendez-vous au spot (maquette R7.9 `.r7spot`), commune à l'Accueil (bloc « Au spot »), à la carte du Fil et à
// l'onglet Spots du crew : l'auteur, l'heure, le lieu (nom seulement : la carte est dans l'écran du rendez-vous), le mot,
// « Qui vient ? » et les deux réponses. Le lieu n'est affiché que s'il est servi : fini, la carte dit « terminé » sans lieu.
// Les règles (qui voit, qui répond) sont dans l'API ; la carte n'affiche que ce qu'elle reçoit.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  agoLabel,
  spotLabels as L,
  type SpotAnswer,
  type SpotMeetupView,
  spotTimeLabel,
  spotUntilLabel,
} from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { useSpotAnswer } from "./useSpotAnswer";
import { useSpotOver } from "./useSpotOver";

const { space2, space3 } = tokens.spacing;

export function SpotCard({
  meetup,
  now,
  onChange,
  onOpen,
  testID = "spot-card",
}: {
  meetup: SpotMeetupView;
  now: Date;
  /** La vue à jour après une réponse (la liste qui porte la carte la remplace). */
  onChange?: (view: SpotMeetupView) => void;
  /** Ouvre l'écran du rendez-vous (carte du lieu, liste de ceux qui viennent). */
  onOpen: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const answer = useSpotAnswer(meetup, onChange);
  // Fini pour l'heure d'Orasso (même hors réseau, même fiche restée ouverte) : plus de lieu, de mot, de liste ni de réponse.
  const over = useSpotOver(meetup);
  const start = new Date(meetup.startsAt);
  const end = new Date(meetup.endsAt);
  const sub = over ? L.ended : `${agoLabel(meetup.createdAt, now)} · ${spotUntilLabel(start, end)}`;
  const who = L.whoCome(
    meetup.yesPreview.map((p) => p.pseudo),
    meetup.yesCount,
    meetup.maybeCount,
  );
  return (
    <View style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID={testID}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`${L.from(meetup.author.pseudo)}, ${sub}`}
        style={styles.head}
        testID={`${testID}-open`}
      >
        <Avatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={40} />
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={c.ink} style={styles.title}>
            {L.from(meetup.author.pseudo)}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {sub}
          </Text>
        </View>
        {over ? null : <Tag tone="acc">{spotTimeLabel(start)}</Tag>}
      </Pressable>
      {!over && meetup.place ? (
        <View style={styles.place} testID={`${testID}-place`}>
          <Icon name="place" size={18} color={c.accentText} />
          <Text variant="bodyStrong" color={c.ink} style={[styles.fill, styles.placeText]}>
            {meetup.place.label}
          </Text>
        </View>
      ) : null}
      {!over && meetup.note ? (
        <View style={[styles.quote, { borderColor: c.line }]}>
          <Text variant="body" color={c.ink} style={styles.quoteText}>
            {`« ${meetup.note} »`}
          </Text>
        </View>
      ) : null}
      {over ? (
        <Muted variant="caption">{L.endedHint}</Muted>
      ) : (
        <>
          <View style={styles.whoRow} testID={`${testID}-who`}>
            <Text variant="caption" color={c.inkMuted} style={styles.label}>
              {L.who}
            </Text>
            <Text variant="caption" color={c.ink} style={styles.fill}>
              {who || L.nobodyYet}
            </Text>
          </View>
          {meetup.mine ? (
            <SmButton kind="s" icon="next" wide onPress={onOpen} testID={`${testID}-mine`}>
              {L.open}
            </SmButton>
          ) : (
            <View style={styles.two}>
              <AnswerButton
                meetup={meetup}
                which="yes"
                icon="check"
                busy={answer.busy}
                onPress={answer.send}
                testID={testID}
              />
              <AnswerButton
                meetup={meetup}
                which="maybe"
                icon="help"
                busy={answer.busy}
                onPress={answer.send}
                testID={testID}
              />
            </View>
          )}
          {answer.error ? (
            <Notice tone="error" testID={`${testID}-error`}>
              {answer.error}
            </Notice>
          ) : null}
        </>
      )}
    </View>
  );
}

function AnswerButton({
  meetup,
  which,
  icon,
  busy,
  onPress,
  testID,
}: {
  meetup: SpotMeetupView;
  which: SpotAnswer;
  icon: "check" | "help";
  busy: boolean;
  onPress: (a: SpotAnswer) => void;
  testID: string;
}) {
  const { t } = useTheme();
  const chosen = meetup.myAnswer === which;
  // Dans une liste, jamais de bouton principal (le seul est sur l'écran du rendez-vous) : la réponse choisie se marque d'un
  // liseré d'accent.
  return (
    <View style={styles.fill}>
      <SmButton
        kind="s"
        style={chosen ? { borderWidth: 2, borderColor: t.color.accent } : undefined}
        icon={icon}
        wide
        disabled={busy}
        onPress={() => onPress(which)}
        accessibilityLabel={`${which === "yes" ? L.yes : L.maybe}${chosen ? " (choisi)" : ""}`}
        testID={`${testID}-${which}`}
      >
        {which === "yes" ? L.yes : L.maybe}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 14, gap: space3 },
  fill: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  title: { fontSize: 15, lineHeight: 20 },
  place: { flexDirection: "row", alignItems: "center", gap: space2 },
  placeText: { fontSize: 15, lineHeight: 20 },
  quote: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  quoteText: { fontSize: 14.5, lineHeight: 20 },
  whoRow: { gap: 2 },
  label: { textTransform: "uppercase", letterSpacing: 0.6, fontSize: 11 },
  two: { flexDirection: "row", gap: space2 },
});
