// Lot R6c (maquette R6.7) : la feuille « Inviter dans <crew> », pour tout membre actif. Mon réseau (abonnés,
// abonnements) avec une recherche ; « Inviter » sur chaque ligne ; une invitation ou une demande en cours est grisée avec
// la raison. Si la personne accepte l'invitation d'un membre, le chef confirme son arrivée ; celle du chef la fait
// entrer tout de suite. Le chef garde l'invitation par pseudo (lot 19).
import { Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { crewInviteLabels as CL, type CrewInviteCandidate, crewLabels, eventInviteLabels } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export function CrewInviteSheet({
  crew,
  leader,
  onClose,
  onSent,
}: {
  crew: { id: string; name: string; leaderPseudo: string | null } | null;
  /** Je suis le chef : l'invitation fait entrer tout de suite, et l'invitation par pseudo reste. */
  leader: boolean;
  onClose: () => void;
  onSent: (pseudo: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<CrewInviteCandidate[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const visible = Boolean(crew);
  const crewId = crew?.id ?? "";

  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` relance la lecture après un envoi.
  useEffect(() => {
    if (!visible) return;
    const ticket = gate.start();
    setError(null);
    api
      .crewInviteCandidates(crewId, query || undefined)
      .then((page) => {
        if (!ticket.current()) return;
        setPeople(page.people);
        setCursor(page.nextCursor);
      })
      .catch((e: unknown) => {
        if (ticket.current()) setError(errorMessage(e));
      });
  }, [visible, crewId, query, gate, tick]);

  async function more() {
    if (!cursor) return;
    const ticket = gate.follow();
    try {
      const page = await api.crewInviteCandidates(crewId, query || undefined, cursor);
      if (!ticket.current()) return;
      setPeople((prev) => [...(prev ?? []), ...page.people]);
      setCursor(page.nextCursor);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    }
  }

  async function invite(who: string) {
    setBusy(true);
    setError(null);
    try {
      await api.inviteToCrew(crewId, who);
      setPseudo("");
      setTick((x) => x + 1);
      onSent(who);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setQ("");
    setQuery("");
    setPeople(null);
    setError(null);
    onClose();
  };
  const leaderName = crew?.leaderPseudo ?? CL.leaderFallback;
  return (
    <AppSheet
      visible={visible}
      onClose={close}
      accessibilityLabel={crew ? CL.sheetTitle(crew.name) : ""}
      maxHeight={0.86}
    >
      {crew ? (
        <View style={styles.col} testID="crew-invite-sheet">
          <Text variant="posterM" color={c.ink}>
            {CL.sheetTitle(crew.name)}
          </Text>
          <TextField
            label={eventInviteLabels.searchA11y}
            placeholder={CL.search}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            testID="crew-invite-search"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          {people && people.length === 0 ? (
            <Text variant="caption" color={c.inkMuted} testID="crew-invite-empty">
              {query ? CL.noMatch : CL.empty}
            </Text>
          ) : null}
          {(people ?? []).map((p) => (
            <View
              key={p.userId}
              style={[styles.row, { backgroundColor: c.surface }, p.state !== "available" && styles.dim]}
              testID={`crew-invite-row-${p.pseudo}`}
            >
              <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
              <View style={styles.grow}>
                <Text variant="bodyStrong" color={c.ink}>
                  {p.pseudo}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {p.caption}
                </Text>
              </View>
              {p.state === "available" ? (
                <SmButton
                  icon="add"
                  disabled={busy}
                  onPress={() => void invite(p.pseudo)}
                  accessibilityLabel={CL.inviteA11y(p.pseudo)}
                  testID={`crew-invite-${p.pseudo}`}
                >
                  {CL.invite}
                </SmButton>
              ) : null}
            </View>
          ))}
          {cursor ? (
            <SmButton kind="g" icon="down" onPress={() => void more()} testID="crew-invite-more">
              {eventInviteLabels.more}
            </SmButton>
          ) : null}
          {leader ? (
            <>
              <Text variant="label" color={c.inkMuted}>
                {CL.byPseudo}
              </Text>
              <TextField
                label={crewLabels.invitePseudo}
                value={pseudo}
                onChangeText={setPseudo}
                autoCapitalize="none"
              />
              <SmButton
                kind="s"
                big
                wide
                icon="send"
                disabled={busy || !pseudo.trim()}
                onPress={() => void invite(pseudo.trim())}
                testID="crew-invite-send"
              >
                {crewLabels.invite}
              </SmButton>
            </>
          ) : null}
          <View style={styles.note}>
            <Text variant="caption" color={c.inkMuted}>
              {leader ? CL.leaderDirect : CL.leaderConfirms(leaderName)}
            </Text>
          </View>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  col: { gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  dim: { opacity: 0.55 },
  note: { paddingTop: space1 },
});
