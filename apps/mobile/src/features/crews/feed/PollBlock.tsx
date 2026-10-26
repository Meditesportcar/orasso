// Sondage d'une publication du fil (lot R5c1) : une question, 2 à 6 réponses, un seul choix. Avant ta voix : les
// réponses à toucher ; ensuite (ou clos) : les résultats en barres, « Ton choix », le nombre de voix, jamais qui a voté
// quoi. Tant qu'il est ouvert, toucher une autre réponse change ta voix.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewPollView, crewFeedLabels, pollShare } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDayHour } from "@/lib/format";

export function PollBlock({
  poll,
  busy,
  onVote,
}: {
  poll: CrewPollView;
  busy: boolean;
  onVote: (optionId: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const showResults = poll.myOptionId !== null || !poll.open;
  return (
    <View style={styles.wrap} testID="crew-poll">
      <Text variant="title" color={c.ink} style={styles.question}>
        {poll.question}
      </Text>
      <View style={styles.options}>
        {poll.options.map((o) => {
          const mine = o.id === poll.myOptionId;
          const share = pollShare(o.votes, poll.totalVotes);
          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: mine, disabled: !poll.open || busy }}
              accessibilityLabel={
                showResults
                  ? `${o.label}, ${crewFeedLabels.pollVotes(o.votes)}${mine ? `, ${crewFeedLabels.pollYourChoice}` : ""}`
                  : crewFeedLabels.pollVoteFor(o.label)
              }
              disabled={!poll.open || busy || mine}
              onPress={() => onVote(o.id)}
              style={[styles.option, { borderColor: mine ? c.accentText : c.line, backgroundColor: c.surface }]}
              testID="crew-poll-option"
            >
              {showResults ? (
                <View
                  // Tour 2 : la réponse choisie en moutarde léger (un seul aplat moutarde fort par écran).
                  style={[styles.bar, { width: `${share}%`, backgroundColor: mine ? c.accentSoft : c.surfaceRaised }]}
                  pointerEvents="none"
                />
              ) : null}
              <View style={[styles.dot, { borderColor: mine ? c.accentText : c.inkMuted }]}>
                {mine ? <Icon name="check" size={12} color={c.accentText} /> : null}
              </View>
              <Text variant="bodyStrong" color={c.ink} style={styles.label}>
                {o.label}
              </Text>
              {showResults ? (
                <Text variant="caption" color={c.inkMuted} style={styles.votes}>
                  {`${share} %`}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text variant="caption" color={c.inkMuted}>
          {crewFeedLabels.pollVotes(poll.totalVotes)}
        </Text>
        {poll.myOptionId ? <Tag tone="line">{crewFeedLabels.pollYourChoice}</Tag> : null}
        {!poll.open ? (
          <Tag tone="line" testID="crew-poll-closed">
            {crewFeedLabels.pollClosed}
          </Tag>
        ) : poll.endsAt ? (
          <Text variant="caption" color={c.inkMuted}>
            {crewFeedLabels.pollEndsOn(formatDayHour(poll.endsAt))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.spacing.space2 + 2 },
  question: { fontSize: 16, lineHeight: 21 },
  options: { gap: tokens.spacing.space2 },
  option: {
    minHeight: 44,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
    paddingHorizontal: tokens.spacing.space3,
    paddingVertical: tokens.spacing.space2,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space2,
    overflow: "hidden",
  },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, minWidth: 0 },
  votes: { fontFamily: "Archivo-ExtraBold" },
  foot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.spacing.space2 },
});
