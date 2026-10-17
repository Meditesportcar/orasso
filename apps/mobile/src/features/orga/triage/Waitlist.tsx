// Liste d'attente (lot 23, docs/01) : l'ordre se change en glissant la poignée d'une ligne (ou par Monter / Descendre,
// l'alternative accessible), enregistré tout de suite par `PUT /events/:id/waitlist/order` ; « Retenir » prend la place
// (l'API vérifie la capacité). Les offres de place en cours sont rappelées sous la liste. Les prestataires n'ont pas de
// rang : leur liste d'attente manuelle se gère depuis le mode liste.
import { Button, Icon, Plate, StatusBadge, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ApplicationForTriage, triageAppLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useChannel } from "@/lib/realtime";
import { dragTargetIndex, moveItem, waitlistIds } from "@/lib/triage";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { titleOf } from "./CandidateCard";

const { space1, space2, space3 } = tokens.spacing;

/** Toutes les pages d'un statut (la liste d'attente se réordonne en entier : l'API veut chaque candidature une fois). */
async function loadAll(eventId: string, status: "waitlisted" | "offered") {
  const out: ApplicationForTriage[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await api.triagePage(eventId, {
      kind: "vehicle",
      status,
      sort: status === "waitlisted" ? "waitlist_rank" : "created_at",
      limit: 100,
      cursor,
    });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

function Handle({
  label,
  onStart,
  onMove,
  onEnd,
}: {
  label: string;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
}) {
  const { t } = useTheme();
  const cb = useRef({ onStart, onMove, onEnd });
  cb.current = { onStart, onMove, onEnd };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => cb.current.onStart(),
      onPanResponderMove: (_, g) => cb.current.onMove(g.dy),
      onPanResponderRelease: (_, g) => cb.current.onEnd(g.dy),
      onPanResponderTerminate: (_, g) => cb.current.onEnd(g.dy),
    }),
  ).current;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={styles.handle}
      testID="waitlist-handle"
    >
      <Icon name="list" size={22} color={t.color.plateMuted} />
    </View>
  );
}

export function Waitlist({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { t } = useTheme();
  const focused = useIsFocused();
  const [rows, setRows] = useState<ApplicationForTriage[] | null>(null);
  const [offers, setOffers] = useState<ApplicationForTriage[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; dy: number } | null>(null);
  const heights = useRef(new Map<string, number>());
  const saving = useRef(false);
  const alive = useRef(true);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [w, o] = await Promise.all([loadAll(eventId, "waitlisted"), loadAll(eventId, "offered")]);
      if (!alive.current) return;
      setRows(w);
      setOffers(o);
    } catch (e) {
      if (alive.current) setMessage({ kind: "error", text: errorMessage(e) });
      if (alive.current) setRows((cur) => cur ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changements venus d'ailleurs (autre organisateur, désistement, offre) : rechargés, sauf pendant un geste.
  useChannel(focused ? `event:${eventId}:triage` : null, (event) => {
    if (event.type !== "application.changed" && event.type !== "waitlist.reordered") return;
    if (saving.current || drag) return;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void load(), 500);
  });

  async function persist(next: ApplicationForTriage[]) {
    setRows(next);
    saving.current = true;
    try {
      await api.triageWaitlistOrder(eventId, waitlistIds(next));
    } catch (e) {
      setMessage({ kind: "error", text: `${triageAppLabels.waitlistReorderFailed} ${errorMessage(e)}` });
      await load();
    } finally {
      saving.current = false;
    }
  }

  function move(index: number, delta: -1 | 1) {
    if (!rows) return;
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    void persist(moveItem(rows, index, to));
  }

  async function keep(row: ApplicationForTriage) {
    if (busy) return;
    setBusy(row.id);
    setMessage(null);
    try {
      await api.triageDecide(eventId, row.id, { decision: "accept", sendReasons: true });
      setMessage({ kind: "ok", text: triageAppLabels.waitlistKept(row.applicant.pseudo) });
      onChanged();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
      await load();
    }
  }

  const order = rows ?? [];
  const sizes = order.map((r) => heights.current.get(r.id) ?? 110);
  const target = drag ? dragTargetIndex(sizes, drag.from, drag.dy) : -1;

  /** Décalage d'une ligne qui n'est pas tirée : elle s'écarte pour faire place à la ligne tirée. */
  function shiftOf(index: number): number {
    if (!drag || index === drag.from) return 0;
    const own = sizes[drag.from] ?? 0;
    if (drag.from < target && index > drag.from && index <= target) return -own;
    if (drag.from > target && index < drag.from && index >= target) return own;
    return 0;
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      scrollEnabled={!drag}
      keyboardShouldPersistTaps="handled"
      testID="waitlist"
    >
      {message ? <Notice tone={message.kind === "error" ? "error" : "info"}>{message.text}</Notice> : null}
      <Text variant="label" color={t.color.ink} accessibilityRole="header">
        {triageAppLabels.waitlistTitle(order.length)}
      </Text>
      {rows === null ? <Muted variant="body">{triageAppLabels.loading}</Muted> : null}
      {rows && order.length === 0 ? <Muted variant="body">{triageAppLabels.waitlistEmpty}</Muted> : null}
      {order.length > 1 ? <Muted variant="caption">{triageAppLabels.waitlistHint}</Muted> : null}
      {order.map((row, i) => {
        const dragged = drag?.id === row.id;
        return (
          <Plate
            key={row.id}
            onLayout={(e: LayoutChangeEvent) => heights.current.set(row.id, e.nativeEvent.layout.height + space2)}
            style={[
              styles.row,
              {
                transform: [{ translateY: dragged ? (drag?.dy ?? 0) : shiftOf(i) }],
                zIndex: dragged ? 2 : 0,
              },
            ]}
            testID="waitlist-row"
          >
            <View style={styles.head}>
              <Handle
                label={triageAppLabels.waitlistHandle}
                onStart={() => setDrag({ id: row.id, from: i, dy: 0 })}
                onMove={(dy) => setDrag((cur) => (cur ? { ...cur, dy } : cur))}
                onEnd={(dy) => {
                  const to = dragTargetIndex(sizes, i, dy);
                  setDrag(null);
                  if (to !== i) void persist(moveItem(order, i, to));
                }}
              />
              <StatusBadge status="waitlist" rank={i + 1} onPlate animated={false} />
              <View style={styles.name}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {row.applicant.pseudo}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {titleOf(row)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                variant="plate"
                icon="back"
                disabled={i === 0}
                onPress={() => move(i, -1)}
                style={styles.grow}
                accessibilityLabel={`${triageAppLabels.waitlistMoveUp} ${row.applicant.pseudo}`}
              >
                {triageAppLabels.waitlistMoveUp}
              </Button>
              <Button
                variant="plate"
                icon="next"
                disabled={i === order.length - 1}
                onPress={() => move(i, 1)}
                style={styles.grow}
                accessibilityLabel={`${triageAppLabels.waitlistMoveDown} ${row.applicant.pseudo}`}
              >
                {triageAppLabels.waitlistMoveDown}
              </Button>
              <Button
                variant="plate"
                icon="check"
                loading={busy === row.id}
                disabled={busy !== null}
                onPress={() => void keep(row)}
                style={styles.grow}
                testID="waitlist-keep"
              >
                {triageAppLabels.waitlistKeep}
              </Button>
            </View>
          </Plate>
        );
      })}
      {offers.length > 0 ? (
        <>
          <Text variant="label" color={t.color.ink} accessibilityRole="header">
            {triageAppLabels.offers}
          </Text>
          {offers.map((o) => (
            <Plate key={o.id} kind="note">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {o.applicant.pseudo} · {titleOf(o)}
              </Text>
              {o.offerExpiresAt ? (
                <Text variant="caption" color={t.color.plateMuted}>
                  {triageAppLabels.offerUntil(formatDayHour(o.offerExpiresAt))}
                </Text>
              ) : null}
            </Plate>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: space2, paddingBottom: space3 * 2 },
  row: { gap: space2 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  handle: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, gap: space1 },
  actions: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
