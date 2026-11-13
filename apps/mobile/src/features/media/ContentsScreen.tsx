// Contenus, l'onglet du média (lot 55, prototype DA v2 `s-contenus`) : les vues apportées par Orasso et le nombre de
// contenus en grand, « Ajouter un contenu » (lien ou galerie de 30 photos au plus, sur un événement où l'on est
// accrédité), puis les contenus rangés par événement, avec « Mis en avant sur la page » quand l'organisation l'a décidé,
// les vues de chacun, modifier et supprimer. Publier, modifier et mettre en avant suivent les règles de l'API (lot 45).
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  OLoader,
  Photo,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  albumLabels,
  mediaAppLabels as L,
  type MediaContentView,
  type MediaPlatform,
  mediaPlatformLabels,
  mediaPlatforms,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { formatCount } from "@/lib/proPresta";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { DirBig } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { TabScreen } from "@/ui/Screens";
import { contentCaption, groupByEvent, guessPlatform, normalizeUrl, totalViews } from "./model";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

/**
 * Lot R9b : `embedded` pose l'écran **dans l'onglet « Contenus » de la Page du média** (T22) : ni bande, ni grand titre, ni zone qui
 * défile à lui (celle de la Page), ses feuilles vont dans la zone des feuilles de la Page (`Overlay`) ; `reloadToken` le relit
 * quand la Page est tirée pour recharger. Sans `embedded`, rien ne change.
 * Lot R9e : « Ajouter » ne crée que des liens (les galeries se publient dans « Nouvel album », une ligne y renvoie) ; `linksOnly` (dans l'onglet
 * « Albums », sous « Liens », T8) ne montre que les liens, sans les tuiles de vues, et « Ajouter un lien » y est un bouton secondaire (le seul
 * principal de l'onglet est « Nouvel album »).
 */
export function ContentsScreen({
  embedded = false,
  linksOnly = false,
  reloadToken = 0,
}: {
  embedded?: boolean;
  linksOnly?: boolean;
  reloadToken?: number;
} = {}) {
  const router = useRouter();
  const { t } = useTheme();
  const { goTab } = usePersona();
  const profile = useApi(async () => (await api.myMediaProfile()).profile, [], { cacheKey: "media-profile" });
  const contents = useApi(() => api.myMediaContents(), [], { cacheKey: "media-contents" });
  const accreditations = useApi(() => api.myAccreditations("all"), [], { cacheKey: "media-accreditations" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MediaContentView | null>(null);

  const all = contents.data ?? [];
  const list = all.filter((c) => !linksOnly || c.kind === "link");
  const groups = groupByEvent(list);
  // Les événements où l'on peut publier : ceux où l'accréditation est donnée (l'API refuse les autres).
  const accredited = (accreditations.data ?? []).filter((a) => a.status === "accepted");
  const reload = async () => void (await Promise.all([contents.reload(), accreditations.reload()]));
  const seenToken = useRef(reloadToken);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul un jeton neuf relit les listes
  useEffect(() => {
    if (seenToken.current === reloadToken) return;
    seenToken.current = reloadToken;
    void reload();
  }, [reloadToken]);

  const sheets = (
    <>
      <AddContentSheet
        visible={adding}
        events={accredited.map((a) => ({ id: a.event.id, title: a.event.title, startsAt: a.event.startsAt }))}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          void reload();
        }}
      />
      <EditContentSheet
        item={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          void reload();
        }}
      />
    </>
  );

  const body = (
    <>
      {/* Lot C4b (artefact `s-contenus`) : deux tuiles `.dir-big`, la première crème. */}
      {/* Les chiffres comptent tous les contenus (liens et albums), même quand seuls les liens sont listés. */}
      <DirBig
        testID="media-stats"
        items={[
          { value: formatCount(totalViews(all)), label: L.views },
          { value: formatCount(all.length), label: L.contents },
        ]}
      />

      <Button
        variant={linksOnly ? "secondary" : "primary"}
        icon="add"
        fullWidth
        onPress={() => setAdding(true)}
        testID="media-add"
      >
        {linksOnly ? albumLabels.addLink : L.addContent}
      </Button>
      {linksOnly ? null : (
        <Button
          variant="secondary"
          icon="gallery"
          fullWidth
          onPress={() => router.push("/album/nouveau" as never)}
          testID="media-new-album"
        >
          {albumLabels.newAlbumLine}
        </Button>
      )}

      {contents.error && !contents.data ? <Notice tone="error">{contents.error.message}</Notice> : null}
      {contents.loading && !contents.data ? <OLoader label="Chargement…" /> : null}
      {contents.data && list.length === 0 ? (
        <EmptyState title={L.noContents} text={accredited.length > 0 ? L.noContentsText : L.needAccreditation} />
      ) : null}
      {contents.data && list.length === 0 && accredited.length === 0 ? (
        <Button variant="secondary" icon="explore" fullWidth onPress={() => goTab("explorer")}>
          {L.pressSeeExplorer}
        </Button>
      ) : null}

      {groups.map((g) => (
        <View key={g.event.id} style={styles.group} testID="media-group">
          <View style={styles.groupHead}>
            <Text variant="title" color={t.color.ink} style={styles.fill}>
              {g.event.title}
            </Text>
            <Muted variant="caption">{g.featured.length > 0 ? L.featured : formatDay(g.event.startsAt)}</Muted>
          </View>
          {g.contents.map((c) => (
            <ContentRow key={c.id} c={c} onPress={() => setEditing(c)} />
          ))}
        </View>
      ))}
    </>
  );

  if (embedded)
    return (
      <View style={styles.embedded} testID="media-contents-embedded">
        <Overlay>{sheets}</Overlay>
        {body}
      </View>
    );
  return (
    <TabScreen title={L.contentsTitle} facts={profile.data?.name} onRefresh={reload} overlays={sheets}>
      {body}
    </TabScreen>
  );
}

function ContentRow({ c, onPress }: { c: MediaContentView; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${L.kindOf(c)}, ${c.title}, ${contentCaption(c)}`}
      onPress={onPress}
      testID="media-content"
    >
      <Plate style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowText}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {`${L.kindOf(c)} · ${c.title}`}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {contentCaption(c)}
            </Text>
          </View>
          {c.featured ? (
            <Chip surface="plate" selected>
              {L.eventFeatured}
            </Chip>
          ) : null}
        </View>
        {c.kind === "gallery" && c.photos.length > 0 ? (
          <View style={styles.thumbs}>
            {c.photos.slice(0, 3).map((p) => (
              <Photo key={p.key} source={mediaSource(p.url)} style={styles.thumb} />
            ))}
          </View>
        ) : null}
      </Plate>
    </Pressable>
  );
}

// --- Ajouter ------------------------------------------------------------------------------------------------------------------

type EventChoice = { id: string; title: string; startsAt: string };

/** Lot R9e : « Ajouter » ne propose plus de galerie (elles se publient dans « Nouvel album », avec leur floutage photo par photo) : un lien seulement. */
function AddContentSheet({
  visible,
  events,
  onClose,
  onDone,
}: {
  visible: boolean;
  events: EventChoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [eventId, setEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<MediaPlatform>("website");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Par défaut : le dernier événement commencé (on publie après coup), sinon le premier.
  const byRecent = [...events].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const latest = byRecent.find((e) => new Date(e.startsAt).getTime() <= nowMs()) ?? byRecent[0];
  const chosen = eventId ?? latest?.id ?? null;
  const ready = chosen !== null && title.trim().length >= 2 && Boolean(url.trim());

  function reset() {
    setEventId(null);
    setTitle("");
    setUrl("");
    setPlatform("website");
    setError(null);
  }

  async function publish() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api.createMediaContent({
        eventId: chosen,
        kind: "link",
        title: title.trim(),
        url: normalizeUrl(url),
        platform,
        photoKeys: [],
      });
      reset();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.addTitle} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {L.addTitle}
      </Text>
      {events.length === 0 ? (
        <Notice testID="media-add-blocked">{L.needAccreditation}</Notice>
      ) : (
        <>
          <Muted variant="label">{L.addEvent}</Muted>
          <ChipRow>
            {byRecent.map((e) => (
              <Chip key={e.id} selected={chosen === e.id} onPress={() => setEventId(e.id)}>
                {e.title}
              </Chip>
            ))}
          </ChipRow>
          <Notice testID="media-add-albums-note">{albumLabels.linkOnlyNote}</Notice>
          <TextField
            label={L.addTitleField}
            help={L.addTitleHelp}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <TextField
            label={L.addUrl}
            help={L.addUrlHelp}
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setPlatform(guessPlatform(v));
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="media-url"
          />
          <Muted variant="label">{L.addPlatform}</Muted>
          <ChipRow>
            {mediaPlatforms.map((p) => (
              <Chip key={p} selected={platform === p} onPress={() => setPlatform(p)}>
                {mediaPlatformLabels[p]}
              </Chip>
            ))}
          </ChipRow>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="primary"
            icon="check"
            loading={busy}
            disabled={!ready || busy}
            fullWidth
            onPress={() => void publish()}
            testID="media-publish"
          >
            {L.addPublish}
          </Button>
        </>
      )}
    </AppSheet>
  );
}

// --- Modifier -----------------------------------------------------------------------------------------------------------------

function EditContentSheet({
  item,
  onClose,
  onDone,
}: {
  item: MediaContentView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <AppSheet visible={item !== null} onClose={onClose} accessibilityLabel={L.editTitle} maxHeight={0.9}>
      {item ? <EditBody key={item.id} item={item} onClose={onClose} onDone={onDone} /> : null}
    </AppSheet>
  );
}

function EditBody({ item, onClose, onDone }: { item: MediaContentView; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? "");
  const [platform, setPlatform] = useState<MediaPlatform>(item.platform);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateMediaContent(item.id, {
        title: title.trim(),
        ...(item.kind === "link" ? { url: normalizeUrl(url), platform } : {}),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMediaContent(item.id);
      setConfirm(false);
      onDone();
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="title" color={t.color.ink}>
        {L.editTitle}
      </Text>
      <Muted variant="body">{`${item.event.title} · ${L.kindOf(item)}`}</Muted>
      <TextField label={L.addTitleField} value={title} onChangeText={setTitle} maxLength={80} />
      {item.kind === "link" ? (
        <>
          <TextField
            label={L.addUrl}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <ChipRow>
            {mediaPlatforms.map((p) => (
              <Chip key={p} selected={platform === p} onPress={() => setPlatform(p)}>
                {mediaPlatformLabels[p]}
              </Chip>
            ))}
          </ChipRow>
          {item.url ? (
            <Button
              variant="plate"
              icon="next"
              onPress={() => void Linking.openURL(item.url ?? "").catch(() => undefined)}
            >
              {L.openContent}
            </Button>
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="check"
        loading={busy}
        disabled={busy || title.trim().length < 2}
        fullWidth
        onPress={() => void save()}
        testID="media-edit-save"
      >
        {L.editSave}
      </Button>
      <Button
        variant="plate"
        tone="dashed"
        icon="close"
        disabled={busy}
        fullWidth
        onPress={() => setConfirm(true)}
        testID="media-delete"
      >
        {L.deleteContent}
      </Button>
      <Button variant="plate" icon="back" fullWidth onPress={onClose}>
        Fermer
      </Button>
      <ConfirmSheet
        modal
        visible={confirm}
        title={L.deleteConfirm}
        body={L.deleteText}
        confirmLabel={L.deleteYes}
        confirmIcon="close"
        cancelLabel={L.deleteNo}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Lot R9b : le même espacement que la zone qui défile de l'onglet (`TabScreen`) quand l'écran est posé dans la Page.
  embedded: { gap: space3 },
  group: { gap: space2, marginTop: space2 },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  row: { gap: space2, padding: space3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space2 },
  rowText: { flex: 1, gap: space1 },
  thumbs: { flexDirection: "row", gap: space2 },
  thumb: { width: space12 + space6, height: space12, borderRadius: tokens.radius.radiusSm },
});
