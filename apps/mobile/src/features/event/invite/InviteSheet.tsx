// Lot R6c (maquette R6.4) : la feuille « Inviter à <événement> ». Mon crew en tête (« Tout Roussillon Drift » coche ses
// membres qu'on peut inviter), puis mon réseau (abonnés, abonnements) avec une recherche ; les personnes qui y vont
// déjà, ou que j'ai déjà invitées, sont grisées avec la raison. Un mot facultatif (140), puis « Inviter N personnes ».
// L'API décide de tout (réseau, doublon, 30 par jour, personne qui a coupé) ; la feuille dit le résultat.
import { Icon, initialsOf, Photo, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  EVENT_INVITE_NOTE_MAX,
  type EventInviteResult,
  type InviteCandidate,
  type InviteCandidatesPage,
  type InviteCrew,
  inviteResultText,
  inviteSendLabel,
  eventInviteLabels as L,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { mediaSource } from "@/lib/media";
import { createRequestGate } from "@/lib/requestGate";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { CheckBox, CrewDot, SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

type State = { crews: InviteCrew[]; people: InviteCandidate[]; nextCursor: string | null; remaining: number };

function Row({
  on,
  disabled,
  lead,
  title,
  caption,
  onPress,
  testID,
}: {
  on: boolean;
  disabled?: boolean;
  lead: React.ReactNode;
  title: string;
  caption: string;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      accessibilityLabel={`${title}, ${caption}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: c.surface, borderColor: on ? c.accent : c.line, borderWidth: on ? 2 : 1.5 },
        disabled && styles.dim,
      ]}
      testID={testID}
    >
      {lead}
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {caption}
        </Text>
      </View>
      {disabled ? <View style={styles.box} /> : <CheckBox on={on} />}
    </Pressable>
  );
}

export function InviteSheet({
  event,
  visible,
  onClose,
  onSent,
}: {
  event: { id: string; title: string };
  visible: boolean;
  onClose: () => void;
  onSent?: (r: EventInviteResult) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const gate = useRef(createRequestGate(cacheScope)).current;

  // Frappe : la recherche part 250 ms après la dernière lettre.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` relance la lecture après un envoi.
  useEffect(() => {
    if (!visible) return;
    const ticket = gate.start();
    setLoadError(null);
    api
      .inviteCandidates(event.id, query || undefined)
      .then((page: InviteCandidatesPage) => {
        if (!ticket.current()) return;
        setList((prev) => ({
          // Les crews ne viennent qu'avec la première page sans recherche : on les garde pendant une recherche.
          crews: query ? (prev?.crews ?? []) : page.crews,
          people: page.people,
          nextCursor: page.nextCursor,
          remaining: page.remainingToday,
        }));
      })
      .catch((e: unknown) => {
        if (ticket.current()) setLoadError(errorMessage(e));
      });
  }, [visible, event.id, query, gate, tick]);

  async function more() {
    if (!list?.nextCursor) return;
    const ticket = gate.follow();
    try {
      const page = await api.inviteCandidates(event.id, query || undefined, list.nextCursor);
      if (!ticket.current()) return;
      setList((prev) =>
        prev
          ? {
              ...prev,
              people: [...prev.people, ...page.people.filter((p) => !prev.people.some((x) => x.userId === p.userId))],
              nextCursor: page.nextCursor,
            }
          : prev,
      );
    } catch (e) {
      if (ticket.current()) setLoadError(errorMessage(e));
    }
  }

  const close = () => {
    setQ("");
    setQuery("");
    setSelected(new Set());
    setNote("");
    setError(null);
    setResult(null);
    setList(null);
    onClose();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const crewOn = (crew: InviteCrew) => crew.invitable.length > 0 && crew.invitable.every((id) => selected.has(id));
  const toggleCrew = (crew: InviteCrew) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const on = crew.invitable.length > 0 && crew.invitable.every((id) => prev.has(id));
      for (const id of crew.invitable) {
        if (on) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const n = selected.size;
  const remaining = list?.remaining ?? null;
  const overQuota = remaining !== null && n > remaining;
  const missing = n === 0 ? L.chooseHint : overQuota ? L.perDay(remaining ?? 0) : null;

  async function send() {
    if (!n || overQuota) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.sendInvites(event.id, [...selected], note.trim() || null);
      setResult(`${inviteResultText(r)} ${L.remaining(r.remainingToday)}`);
      setSelected(new Set());
      setTick((x) => x + 1);
      onSent?.(r);
    } catch (e) {
      setError(e instanceof ApiRequestError && e.status === 429 && e.message ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const people = list?.people ?? [];
  const crews = list?.crews ?? [];
  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel={L.sheetTitle(event.title)} maxHeight={0.88}>
      <View style={styles.head}>
        <Text variant="posterM" color={c.ink} style={styles.grow}>
          {L.sheetTitle(event.title)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={close}
          style={[styles.closex, { backgroundColor: c.surface }]}
          testID="invite-close"
        >
          <Icon name="close" size={20} color={c.ink} />
        </Pressable>
      </View>
      <View style={styles.col} testID="invite-sheet">
        <TextField
          label={L.searchA11y}
          placeholder={L.search}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          testID="invite-search"
        />
        {loadError ? <Notice tone="error">{`${L.loadError} ${loadError}`}</Notice> : null}
        {loadError ? (
          <SmButton kind="s" icon="undo" onPress={() => setTick((x) => x + 1)} testID="invite-retry">
            {L.retry}
          </SmButton>
        ) : null}
        {crews.length > 0 ? (
          <>
            <Text variant="label" color={c.inkMuted}>
              {L.yourCrews}
            </Text>
            {crews.map((crew) => (
              <Row
                key={crew.id}
                on={crewOn(crew)}
                disabled={crew.invitable.length === 0}
                lead={
                  crew.logoUrl ? (
                    <View style={styles.logo}>
                      <Photo source={mediaSource(crew.logoUrl)} style={StyleSheet.absoluteFill} />
                    </View>
                  ) : (
                    <CrewDot initials={initialsOf(crew.name).slice(0, 2)} size={40} />
                  )
                }
                title={L.allCrew(crew.name)}
                caption={L.crewCaption(crew.membersCount, crew.going)}
                onPress={() => toggleCrew(crew)}
                testID={`invite-crew-${crew.id}`}
              />
            ))}
          </>
        ) : null}
        {list ? (
          <Text variant="label" color={c.inkMuted}>
            {L.network}
          </Text>
        ) : null}
        {list && people.length === 0 ? (
          <Text variant="caption" color={c.inkMuted} testID="invite-empty">
            {query ? L.noMatch : L.empty}
          </Text>
        ) : null}
        {people.map((p) => (
          <Row
            key={p.userId}
            on={selected.has(p.userId)}
            disabled={p.state !== "available"}
            lead={<Avatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />}
            title={p.pseudo}
            caption={p.caption}
            onPress={() => toggle(p.userId)}
            testID={`invite-person-${p.pseudo}`}
          />
        ))}
        {list?.nextCursor ? (
          <SmButton kind="g" icon="down" onPress={() => void more()} testID="invite-more">
            {L.more}
          </SmButton>
        ) : null}
        <TextField
          label={`${L.note} (${L.noteOptional})`}
          placeholder={L.notePlaceholder}
          value={note}
          onChangeText={(v) => setNote(v.slice(0, EVENT_INVITE_NOTE_MAX))}
          maxLength={EVENT_INVITE_NOTE_MAX}
          testID="invite-note"
        />
        {error ? (
          <Notice tone="error" testID="invite-error">
            {error}
          </Notice>
        ) : null}
        {result ? <Notice testID="invite-result">{result}</Notice> : null}
        <SmButton
          kind="p"
          big
          wide
          icon="send"
          disabled={busy || Boolean(missing)}
          onPress={() => void send()}
          testID="invite-send"
        >
          {inviteSendLabel(n)}
        </SmButton>
        {missing ? (
          <Text variant="caption" color={c.inkMuted} style={styles.center} testID="invite-why">
            {missing}
          </Text>
        ) : null}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space2, marginBottom: space2 },
  closex: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
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
  box: { width: 26, height: 26 },
  logo: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  center: { textAlign: "center", marginTop: -space1 },
});
