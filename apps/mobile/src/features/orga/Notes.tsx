// Casquette Organisateur, notes internes (lot 35a, décision D20) : lecture, ajout, modification et suppression des
// notes de la structure sur une personne ; mêmes règles de visibilité que le site (privées, seuls le propriétaire et les
// co-organisateurs, jamais exportées, lecture seule pour une structure suspendue). `StructureNotes` sert dans la fiche
// de tri ; `NotesScreen` est l'écran « Notes internes » (recherche par pseudo).
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  afterEventLabels as A,
  orgaManageLabels as L,
  STRUCTURE_NOTE_MAX,
  type StructureNoteView,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { groupNotesByPerson, isSuspended } from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

/**
 * Les notes de la structure sur une personne : liste, ajout, modification, suppression (feuille de confirmation).
 * `modal` : le composant est déjà dans une feuille plein écran (fiche de tri) ; la confirmation s'y ouvre aussi.
 */
export function StructureNotes({
  structureId,
  pseudo,
  eventId,
  initial,
  writable = true,
  modal = false,
  onTwoFactor,
}: {
  structureId: string;
  pseudo: string;
  eventId?: string;
  initial: StructureNoteView[];
  writable?: boolean;
  modal?: boolean;
  onTwoFactor?: (error: unknown) => void;
}) {
  const { t } = useTheme();
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [deleting, setDeleting] = useState<StructureNoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(e: unknown) {
    if (isTwoFactorError(e) && onTwoFactor) onTwoFactor(e);
    else setError(errorMessage(e));
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createNote(structureId, {
        pseudo,
        ...(eventId ? { eventId } : {}),
        body: draft.trim(),
      });
      setNotes((cur) => [created, ...cur]);
      setDraft("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateNote(editing.id, editing.body.trim());
      setNotes((cur) => cur.map((n) => (n.id === updated.id ? updated : n)));
      setEditing(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteNote(deleting.id);
      setNotes((cur) => cur.filter((n) => n.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.list} testID="structure-notes">
      <Text variant="caption" color={t.color.plateMuted}>
        {A.notesPrivate}. {A.notesHelp}
      </Text>
      {notes.length === 0 ? (
        <Text variant="caption" color={t.color.plateMuted}>
          {A.notesEmpty}
        </Text>
      ) : (
        notes.map((n) => (
          <View key={n.id} style={styles.note} testID="structure-note">
            {editing?.id === n.id ? (
              <>
                <TextField
                  label={A.notesBody}
                  value={editing.body}
                  onChangeText={(v) => setEditing({ id: n.id, body: v })}
                  multiline
                  maxLength={STRUCTURE_NOTE_MAX}
                  testID="structure-note-edit"
                />
                <View style={styles.buttons}>
                  <Button
                    variant="plate"
                    icon="check"
                    loading={busy}
                    disabled={busy || editing.body.trim() === "" || editing.body.trim() === n.body}
                    onPress={() => void save()}
                    style={styles.grow}
                    testID="structure-note-save"
                  >
                    {A.notesSave}
                  </Button>
                  <Button
                    variant="plate"
                    icon="close"
                    disabled={busy}
                    onPress={() => setEditing(null)}
                    style={styles.grow}
                  >
                    Annuler
                  </Button>
                </View>
              </>
            ) : (
              <>
                <Text variant="body" color={t.color.plateInk}>
                  {n.body}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {formatDayHour(n.createdAt)} · {A.notesBy(n.authorPseudo)}
                  {n.eventTitle ? ` · ${L.notesEventTag(n.eventTitle)}` : ""}
                </Text>
                {writable ? (
                  <View style={styles.buttons}>
                    <Button
                      variant="plate"
                      icon="incident"
                      disabled={busy}
                      onPress={() => setEditing({ id: n.id, body: n.body })}
                      style={styles.grow}
                      testID="structure-note-edit-button"
                    >
                      {A.notesEdit}
                    </Button>
                    <Button
                      variant="plate"
                      tone="dashed"
                      icon="close"
                      disabled={busy}
                      onPress={() => {
                        setError(null);
                        setDeleting(n);
                      }}
                      style={styles.grow}
                      testID="structure-note-delete"
                    >
                      {A.notesDelete}
                    </Button>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ))
      )}
      {writable ? (
        <>
          <TextField
            label={A.notesAdd}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={STRUCTURE_NOTE_MAX}
            placeholder={L.notesPlaceholder}
            testID="structure-note-draft"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="plate"
            icon="add"
            loading={busy && editing === null && deleting === null}
            disabled={busy || draft.trim() === ""}
            onPress={() => void add()}
            fullWidth
            testID="structure-note-add"
          >
            {A.notesSave}
          </Button>
        </>
      ) : (
        <Text variant="caption" color={t.color.plateMuted}>
          {L.notesNoWrite}
        </Text>
      )}
      <ConfirmSheet
        visible={deleting !== null}
        modal={modal}
        title={L.notesDeleteTitle}
        body={L.notesDeleteBody}
        confirmLabel={A.notesDelete}
        confirmIcon="close"
        danger
        busy={busy}
        error={deleting ? error : null}
        onConfirm={() => void remove()}
        onClose={() => {
          setDeleting(null);
          setError(null);
        }}
      />
    </View>
  );
}

/** Écran « Notes internes » : les plus récentes, ou la recherche par pseudo. */
export function NotesScreen() {
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const notes = useApi(() => api.notes(structureId, { limit: 50, q: searched || undefined }), [structureId, searched]);
  const [error, setError] = useState<unknown>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(orga)/equipe"));
  const groups = groupNotesByPerson(notes.data?.items ?? []);
  const writable = !isSuspended(structure.data);

  return (
    <FlowScreen
      title={L.notesScreenTitle}
      facts={structureName}
      onClose={close}
      onRefresh={async () => {
        await notes.reload();
      }}
    >
      <OrgaFailure error={error ?? notes.error} />
      <Muted variant="caption">{A.notesIntro}</Muted>
      <Plate style={styles.block}>
        <TextField
          label={A.notesSearch}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          onSubmitEditing={() => setSearched(query.trim())}
          testID="notes-query"
        />
        <Button
          variant="plate"
          icon="search"
          loading={notes.loading}
          onPress={() => setSearched(query.trim())}
          fullWidth
          testID="notes-search"
        >
          {L.notesSearchButton}
        </Button>
      </Plate>
      {!writable ? <Notice tone="error">{L.notesNoWrite}</Notice> : null}

      {groups.length === 0 && !notes.loading ? (
        <Muted variant="body">{searched ? L.notesEmptySearch(searched) : A.notesEmpty}</Muted>
      ) : null}
      {/* Une note sur la personne cherchée, même si aucune note n'existe encore à son nom (ou seulement des pseudos voisins). */}
      {searched &&
      writable &&
      !notes.loading &&
      !groups.some((g) => g.pseudo.toLowerCase() === searched.toLowerCase()) ? (
        <View style={styles.group} testID="notes-new-person">
          <SectionTitle>{`${L.notesNew} · ${searched}`}</SectionTitle>
          <Plate style={styles.block}>
            <StructureNotes
              key={searched}
              structureId={structureId}
              pseudo={searched}
              initial={[]}
              writable={writable}
              onTwoFactor={setError}
            />
          </Plate>
        </View>
      ) : null}
      {groups.map((g) => (
        <View key={`${g.userId}-${notes.data?.items.length}`} style={styles.group} testID="notes-person">
          <SectionTitle>{`${g.pseudo} · ${A.notesCount(g.notes.length)}`}</SectionTitle>
          <Plate style={styles.block}>
            <StructureNotes
              structureId={structureId}
              pseudo={g.pseudo}
              initial={g.notes}
              writable={writable}
              onTwoFactor={setError}
            />
          </Plate>
        </View>
      ))}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  group: { gap: space1 },
  list: { gap: space2 },
  note: { gap: space1, paddingTop: space1 },
  buttons: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
