// Carte « rendez-vous au spot » du Fil (lot R7i, maquette R7.6 et R7.9) : en tête pour les invités seulement (abonnés
// acceptés de l'auteur, ou membres du crew) ; l'API ne la sert à personne d'autre. Le lieu, l'heure, le mot, « Qui vient ? »
// et les deux réponses ; toucher la carte ouvre l'écran du rendez-vous (carte du lieu). Fini, la carte disparaît à la
// prochaine lecture du Fil ; ouverte entre-temps, elle dit « terminé » sans lieu.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { spotLabels as L, type SpotAnswer, type SpotMeetupView, spotTimeLabel, spotUntilLabel } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSpotAnswer } from "@/features/spot/useSpotAnswer";
import { useSpotOver } from "@/features/spot/useSpotOver";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { useCardRouter } from "../openFromCard";
import { CardShell } from "./CardShell";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

const { space2, space3 } = tokens.spacing;

export function SpotMeetupCard({ card, onMenu, faded }: CardProps<"spot_meetup">) {
  const { t } = useTheme();
  const c = t.color;
  const router = useCardRouter();
  const [meetup, setMeetup] = useState<SpotMeetupView>(card.payload.meetup);
  useEffect(() => setMeetup(card.payload.meetup), [card.payload.meetup]);
  const answer = useSpotAnswer(meetup, setMeetup);
  const over = useSpotOver(meetup);
  const start = new Date(meetup.startsAt);
  const open = () => router.push({ pathname: "/spot/[id]", params: { id: meetup.id } });
  const who = L.whoCome(
    meetup.yesPreview.map((p) => p.pseudo),
    meetup.yesCount,
    meetup.maybeCount,
  );
  return (
    <CardShell
      card={card}
      head={<Avatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={38} />}
      title={L.from(meetup.author.pseudo)}
      reason={reasonLine(card)}
      onMenu={onMenu}
      onTitle={open}
      faded={faded}
      testID="feed-card-spot_meetup"
    >
      <Pressable onPress={open} accessibilityRole="link" style={styles.body} testID="feed-spot-open">
        {over ? (
          <Muted variant="body">{L.ended}</Muted>
        ) : (
          <>
            <View style={styles.row}>
              <Icon name="place" size={18} color={c.accentText} />
              <Text variant="bodyStrong" color={c.ink} style={[styles.fill, styles.text]} testID="feed-spot-place">
                {meetup.place?.label ?? ""}
              </Text>
              <Tag tone="acc">{spotTimeLabel(start)}</Tag>
            </View>
            <Text variant="caption" color={c.inkMuted}>
              {spotUntilLabel(start, new Date(meetup.endsAt))}
            </Text>
            {meetup.note ? (
              <Text variant="body" color={c.ink} style={styles.text}>
                {`« ${meetup.note} »`}
              </Text>
            ) : null}
            <Text variant="caption" color={c.ink} testID="feed-spot-who">
              {`${L.who} ${who || L.nobodyYet}`}
            </Text>
          </>
        )}
      </Pressable>
      {over ? null : (
        <>
          <View style={styles.two}>
            {(["yes", "maybe"] as SpotAnswer[]).map((which) => (
              <View key={which} style={styles.fill}>
                <SmButton
                  kind="s"
                  style={meetup.myAnswer === which ? { borderWidth: 2, borderColor: c.accent } : undefined}
                  icon={which === "yes" ? "check" : "help"}
                  wide
                  disabled={answer.busy}
                  onPress={() => void answer.send(which)}
                  testID={`feed-spot-${which}`}
                >
                  {which === "yes" ? L.yes : L.maybe}
                </SmButton>
              </View>
            ))}
          </View>
          {answer.error ? <Notice tone="error">{answer.error}</Notice> : null}
        </>
      )}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  body: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  text: { fontSize: 14, lineHeight: 20 },
  two: { flexDirection: "row", gap: space2, marginTop: space3 - 8 },
});
