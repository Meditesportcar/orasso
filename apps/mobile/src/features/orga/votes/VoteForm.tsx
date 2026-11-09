// « Nouveau vote » (lot R7l2, maquette R7.15 `v-prep`, même feuille sur le site) : un titre (un modèle ou le sien), des
// candidats (tous les entrés, une origine ou des marques, une zone, à la main), une ouverture (dès les premières entrées,
// à une heure fixée, à lancer soi-même) et une durée. Écran de flux plein écran : ouvert depuis l'étape « Votes du
// public » de l'éditeur et depuis l'écran « Votes » pendant l'événement. Aucune règle ici : le brouillon, sa validation et
// le corps envoyé sont dans `@orasso/shared` (`votesOrga.ts`), l'API tranche.
import { Button, Chip, Icon, type IconName, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  ALL_CATEGORIES_TITLE,
  criteriaOrigins,
  emptyVoteDraft,
  voteOrgaLabels as L,
  type VoteDraft,
  type VoteManageItem,
  voteCandidateModeOptions,
  voteDraftBody,
  voteDraftOfItem,
  voteDraftProblem,
  voteDraftWithMode,
  voteDraftWithTemplate,
  voteDurationOptions,
  voteOpenModeOptions,
  voteTemplates,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { OrgaFailure } from "../OrgaGate";
import { Choices, DateTimeFields, Group, MultiChoices } from "../wizard/fields";
import { toggle } from "../wizard/types";
import { useVotesData } from "./useVotesData";

const { space1, space2, space3 } = tokens.spacing;

/** Un choix exclusif en grande ligne (icône, libellé, aide) : « Quels candidats ? », « Quand il ouvre ». */
function OptionRow({
  icon,
  label,
  hint,
  selected,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.option,
        { borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.surface : "transparent" },
      ]}
    >
      <Icon name={icon} size={20} color={selected ? c.accentText : c.ink} />
      <View style={styles.optionText}>
        <Text variant="bodyStrong" color={c.ink}>
          {label}
        </Text>
        <Muted variant="caption">{hint}</Muted>
      </View>
    </Pressable>
  );
}

export function VoteForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { vote: editId } = useLocalSearchParams<{ vote?: string }>();
  const at = useNow(30_000);
  const { manage, event } = useVotesData(eventId, { organizer: true });
  const [draft, setDraft] = useState<VoteDraft>(emptyVoteDraft);
  const [restoreAll, setRestoreAll] = useState(false);
  const [makeQuery, setMakeQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedEdit = useRef(false);
  const allMakes = useMakesList();

  const items = manage.data?.items ?? [];
  const editing: VoteManageItem | undefined = editId ? items.find((v) => v.id === editId) : undefined;
  // Un vote existant se relit une seule fois dans le formulaire (jamais écrasé par un rechargement en cours de saisie).
  useEffect(() => {
    if (editing && !loadedEdit.current) {
      loadedEdit.current = true;
      setDraft(voteDraftOfItem(editing));
    }
  }, [editing]);

  const allCategoriesMissing =
    !editId && manage.data !== null && !items.some((v) => v.kind === "all_categories") && !manage.error;
  const zones = event.data?.zones ?? [];
  const endsAt = event.data ? new Date(event.data.endsAt) : null;
  const problem = restoreAll ? null : voteDraftProblem(draft, { now: at, eventEndsAt: endsAt });
  const loading = (!manage.data && !manage.error) || (!event.data && !event.error);
  const set = <K extends keyof VoteDraft>(key: K, value: VoteDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const found =
    makeQuery.trim().length < 2
      ? []
      : allMakes
          .filter((m) => m.name !== "Autre" && !draft.makeIds.includes(m.id))
          .filter((m) => m.name.toLowerCase().includes(makeQuery.trim().toLowerCase()))
          .slice(0, 8);
  const chosenMakes = allMakes.filter((m) => draft.makeIds.includes(m.id));

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/evenement/${eventId}/votes`));

  async function submit() {
    if (problem && !restoreAll) return;
    setBusy(true);
    setError(null);
    try {
      if (restoreAll) await api.voteRestoreAllCategories(eventId);
      else if (editId) await api.voteUpdate(eventId, editId, voteDraftBody(draft));
      else await api.voteCreate(eventId, voteDraftBody(draft));
      back();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const openOptions = voteOpenModeOptions.filter((o) => !(draft.mode === "hand" && o.mode === "first_entry"));

  return (
    <FlowScreen
      title={editId ? L.editTitle : L.newTitle}
      facts={event.data?.title}
      onClose={back}
      closeLabel={L.close}
      footer={
        <View style={styles.footer}>
          {problem ? (
            <Muted variant="caption" testID="vote-form-problem">
              {problem}
            </Muted>
          ) : null}
          <Button
            icon={editId ? "check" : "add"}
            loading={busy}
            disabled={busy || loading || Boolean(problem)}
            onPress={() => void submit()}
            fullWidth
            testID="vote-form-submit"
          >
            {editId ? L.submitSave : restoreAll ? L.addAllCategories : L.submitAdd}
          </Button>
        </View>
      }
    >
      <OrgaFailure error={manage.error ?? event.error} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <Muted variant="body">{L.loading}</Muted> : null}

      {!editId ? (
        <Group label={L.templates} testID="vote-templates">
          <View style={styles.wrap}>
            {allCategoriesMissing ? (
              <Chip
                selected={restoreAll}
                onPress={() => {
                  setRestoreAll(true);
                  setDraft((d) => ({ ...emptyVoteDraft(), title: ALL_CATEGORIES_TITLE, openMode: d.openMode }));
                }}
                accessibilityLabel={ALL_CATEGORIES_TITLE}
              >
                {ALL_CATEGORIES_TITLE}
              </Chip>
            ) : null}
            {voteTemplates.map((tpl) => (
              <Chip
                key={tpl.id}
                selected={!restoreAll && draft.title === tpl.title}
                onPress={() => {
                  setRestoreAll(false);
                  setDraft((d) => voteDraftWithTemplate(d, tpl));
                }}
                accessibilityLabel={tpl.title}
              >
                {tpl.title}
              </Chip>
            ))}
          </View>
        </Group>
      ) : null}

      <TextField
        label={L.titleField}
        value={draft.title}
        onChangeText={(v) => {
          setRestoreAll(false);
          set("title", v);
        }}
        maxLength={60}
        editable={!restoreAll}
        testID="vote-form-title"
      />

      {restoreAll ? (
        <Muted variant="caption">{L.stampNote}</Muted>
      ) : (
        <>
          <Group label={L.candidatesQuestion} testID="vote-form-modes">
            {voteCandidateModeOptions.map((o) => (
              <OptionRow
                key={o.mode}
                icon={o.icon}
                label={o.label}
                hint={o.hint}
                selected={draft.mode === o.mode}
                onPress={() => setDraft((d) => voteDraftWithMode(d, o.mode))}
                testID={`vote-mode-${o.mode}`}
              />
            ))}
          </Group>

          {draft.mode === "origins" ? (
            <>
              <MultiChoices
                label={L.originsQuestion}
                options={criteriaOrigins.map((o) => ({ value: o.code, label: o.chip }))}
                values={draft.countries}
                onToggle={(v) => set("countries", toggle(draft.countries, v))}
                testID="vote-origins"
              />
              <Group label={L.makesSearch}>
                <TextField
                  label={L.makesPlaceholder}
                  value={makeQuery}
                  onChangeText={setMakeQuery}
                  testID="vote-makes-search"
                />
                <View style={styles.wrap}>
                  {[...chosenMakes, ...found].map((m) => (
                    <Chip
                      key={m.id}
                      selected={draft.makeIds.includes(m.id)}
                      onPress={() => set("makeIds", toggle(draft.makeIds, m.id))}
                    >
                      {m.name}
                    </Chip>
                  ))}
                </View>
              </Group>
              <Muted variant="caption">{L.entersOnly}</Muted>
            </>
          ) : null}
          {draft.mode === "zone" ? (
            zones.length > 0 ? (
              <Choices
                label={L.zoneQuestion}
                options={zones.map((z) => ({ value: z.id, label: z.name }))}
                value={draft.zoneId}
                onChange={(v) => set("zoneId", v)}
                testID="vote-zones"
              />
            ) : (
              <Notice>{L.noZone}</Notice>
            )
          ) : null}
          {draft.mode === "hand" ? <Muted variant="caption">{L.handNote}</Muted> : null}

          <Group label={L.whenQuestion} testID="vote-form-open">
            {openOptions.map((o) => (
              <OptionRow
                key={o.mode}
                icon={o.icon}
                label={o.label}
                hint={o.hint}
                selected={draft.openMode === o.mode}
                onPress={() => set("openMode", o.mode)}
                testID={`vote-open-mode-${o.mode}`}
              />
            ))}
          </Group>
          {draft.openMode === "at" ? (
            <DateTimeFields
              dateLabel={`${L.openAtField} · date`}
              timeLabel="Heure"
              value={draft.opensAt}
              onChange={(v) => set("opensAt", v)}
              testID="vote-opens-at"
            />
          ) : null}

          <Group label={L.durationQuestion} testID="vote-form-duration">
            <View style={styles.wrap}>
              {voteDurationOptions.map((o) => {
                const key = o.value === null ? "end" : o.value === "custom" ? "custom" : String(o.value);
                return (
                  <Chip
                    key={key}
                    selected={draft.duration === key}
                    onPress={() => set("duration", key as VoteDraft["duration"])}
                    accessibilityLabel={o.label}
                  >
                    {o.label}
                  </Chip>
                );
              })}
            </View>
            {draft.duration === "custom" ? (
              <TextField
                label={L.customMinutes}
                value={draft.customMinutes}
                onChangeText={(v) => set("customMinutes", v.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={5}
                testID="vote-custom-minutes"
              />
            ) : null}
          </Group>
          <Muted variant="caption">{L.pointsNote}</Muted>
        </>
      )}
    </FlowScreen>
  );
}

/** Les marques du référentiel, lues une fois (pour chercher « Toyota »). */
function useMakesList() {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .makes()
      .then((m) => alive && setList(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
  },
  optionText: { flex: 1, gap: space1 / 2 },
  footer: { gap: space2 },
});
