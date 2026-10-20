// Tri, segment Prestataires (DA v2, lot 52) : les missions de l'événement (« Food truck · 1 place sur 2 »), avec ce qui
// reste à trier pour chacune, au-dessus de la file par glissement. « Emplacements » ouvre les missions avec leurs
// retenus : on attribue un emplacement à un prestataire retenu (`PATCH …/spot`) ; il est prévenu par l'API.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { type ApplicationForTriage, orgaV2Labels as L, type NeedRetainedProvider } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { missionGroups } from "@/lib/orgaV2";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { ScreenSheet } from "./ScreenSheet";

const { space1, space2, space3 } = tokens.spacing;

/** Une ligne de retenu : son nom, son emplacement, le bouton pour l'attribuer. */
function SpotRow({ p, onEdit }: { p: NeedRetainedProvider; onEdit: (p: NeedRetainedProvider) => void }) {
  const { t } = useTheme();
  return (
    <Plate style={styles.row} testID="triage-spot-row">
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {p.providerName}
        </Text>
        {p.spot ? (
          <Text variant="caption" color={t.color.plateMuted}>
            {L.spotAssigned(p.spot.label)}
          </Text>
        ) : null}
      </View>
      <Button
        variant="plate"
        icon="place"
        onPress={() => onEdit(p)}
        accessibilityLabel={`${L.spotAssign} : ${p.providerName}`}
        testID="triage-spot-edit"
      >
        {p.spot ? p.spot.label : L.spotAssign}
      </Button>
    </Plate>
  );
}

export function MissionsPanel({
  eventId,
  pending,
  reloadKey,
}: {
  eventId: string;
  /** Les prestataires encore à trier (pour compter ce qui attend par mission). */
  pending: readonly ApplicationForTriage[];
  /** Change quand une décision part : les places prises se relisent. */
  reloadKey: number;
}) {
  const { t } = useTheme();
  const needs = useApi(() => api.eventNeeds(eventId), [eventId, reloadKey], { refreshMs: 60_000 });
  // Les retenus sans mission précise reçoivent aussi un emplacement.
  const accepted = useApi(
    () => api.triagePage(eventId, { kind: "provider", status: "accepted", sort: "created_at", limit: 100 }),
    [eventId, reloadKey],
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NeedRetainedProvider | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = needs.data ?? [];
  const groups = missionGroups(pending, list);
  const loose: NeedRetainedProvider[] = (accepted.data?.items ?? [])
    .filter((i) => i.provider && !i.provider.need)
    .map((i) => ({
      applicationId: i.id,
      providerId: i.provider?.id ?? i.id,
      providerName: i.provider?.name ?? "",
      spot: i.provider?.spot ?? null,
      reviewed: false,
    }));
  const retainedCount = list.reduce((n, need) => n + need.retained.length, 0) + loose.length;
  if (list.length === 0 && pending.length === 0) return null;

  function edit(p: NeedRetainedProvider) {
    setEditing(p);
    setLabel(p.spot?.label ?? "");
    setNote(p.spot?.note ?? "");
    setError(null);
  }

  async function save(clear: boolean) {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.setProviderSpot(eventId, editing.applicationId, {
        spotLabel: clear ? null : label.trim() || null,
        spotNote: clear ? null : note.trim() || null,
      });
      setEditing(null);
      setNotice(L.spotSaved);
      await needs.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap} testID="triage-missions">
      <View style={styles.chips}>
        {groups.map((g) => (
          <Chip key={g.key} accessibilityLabel={g.label}>
            {g.items.length > 0 ? `${g.label} · ${L.missionPending(g.items.length)}` : g.label}
          </Chip>
        ))}
      </View>
      {retainedCount > 0 ? (
        <Button
          variant="plate"
          icon="place"
          onPress={() => {
            setNotice(null);
            setOpen(true);
          }}
          fullWidth
          testID="triage-spots-open"
        >
          {L.spotsOpen}
        </Button>
      ) : null}

      <ScreenSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel={L.spotTitle} maxHeight={0.9}>
        <Text variant="title" color={t.color.ink}>
          {editing ? L.spotTitle : L.providersRetained}
        </Text>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {editing ? (
          <>
            <Text variant="bodyStrong" color={t.color.ink}>
              {editing.providerName}
            </Text>
            <Muted variant="caption">{L.spotHint}</Muted>
            <TextField
              label={L.spotLabel}
              value={label}
              onChangeText={setLabel}
              maxLength={12}
              autoCapitalize="characters"
              testID="triage-spot-label"
            />
            <TextField
              label={L.spotNote}
              value={note}
              onChangeText={setNote}
              maxLength={200}
              multiline
              testID="triage-spot-note"
            />
            <Button
              variant="plate"
              icon="check"
              loading={busy}
              disabled={busy || label.trim() === ""}
              onPress={() => void save(false)}
              fullWidth
              testID="triage-spot-save"
            >
              {L.spotSave}
            </Button>
            {editing.spot ? (
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                disabled={busy}
                onPress={() => void save(true)}
                fullWidth
              >
                {L.spotClear}
              </Button>
            ) : null}
            <Button variant="plate" icon="back" onPress={() => setEditing(null)} fullWidth>
              {L.back}
            </Button>
          </>
        ) : (
          <>
            {list
              .filter((need) => need.retained.length > 0)
              .map((need) => (
                <View key={need.id} style={styles.group}>
                  <Muted variant="label">{L.missionPlaces(need.tradeLabel, need.filled, need.quantity)}</Muted>
                  {need.retained.map((p) => (
                    <SpotRow key={p.applicationId} p={p} onEdit={edit} />
                  ))}
                </View>
              ))}
            {loose.length > 0 ? (
              <View style={styles.group}>
                <Muted variant="label">{L.missionFree}</Muted>
                {loose.map((p) => (
                  <SpotRow key={p.applicationId} p={p} onEdit={edit} />
                ))}
              </View>
            ) : null}
            <Button variant="plate" icon="close" onPress={() => setOpen(false)} fullWidth>
              {L.close}
            </Button>
          </>
        )}
      </ScreenSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  group: { gap: space1 },
  row: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  grow: { flex: 1 },
});
