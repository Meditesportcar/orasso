// La feuille « Partager » (lot R7f4, maquette R7.23 `sg_sheet` et R7.24) : un contenu d'Orasso (événement, voiture du garage,
// publication du Fil, souvenir, résultat de vote) se partage en story, dans le Fil, en message ou vers l'extérieur. Aucune
// règle ici : l'API dit quelles destinations sont ouvertes et pourquoi une autre est fermée (`GET /me/share/info`) ; une
// destination fermée est grisée avec sa raison sous la ligne, jamais un bouton muet.
//  · En story → l'écran de composition `/partager/story` (carte sur fond 9:16, déplaçable et pinçable).
//  · Dans le Fil → une publication 4:5 (événement ou voiture) rendue par l'API, avec une légende facultative.
//  · En message → le lien de la page dans une conversation existante.
//  · Vers l'extérieur → le fichier rendu par le serveur (plaques floutées, signature « orasso.fr »), par le partage du
//    téléphone ; pour une voiture, l'affiche à trois styles du lot 50 (`PosterBody`).
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  addShareTargets,
  type ConversationSummary,
  shareLabels as L,
  noShareTargets,
  retryIds,
  type ShareDestination,
  type ShareFileFormat,
  type ShareInfo,
  STORY_CAPTION_MAX,
  type StoryLinkType,
  shareTargetsEmpty,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { Label, Option } from "@/features/stories/publish/parts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import {
  type PreparedShare,
  postExportPath,
  prepareExport,
  releasePrepared,
  sendShareImage,
  shareExportPath,
  storyExportPath,
} from "@/lib/share";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

/** Ce qu'on partage : un contenu d'Orasso, ou ma propre story (« ⋯ » → Vers l'extérieur). */
export type ShareTarget = { type: StoryLinkType; id: string } | { story: string; mediaKind: "photo" | "video" };

type Step = "choose" | "feed" | "message" | "external";

export function ShareSheet({
  visible,
  onClose,
  target,
  onPoster,
}: {
  visible: boolean;
  onClose: () => void;
  target: ShareTarget;
  /** Voiture : « Vers l'extérieur » ouvre l'affiche à trois styles du lot 50 (le site et l'appli la gardent). */
  onPoster?: () => void;
}) {
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.title}>
      {visible ? <ShareBody target={target} onClose={onClose} onPoster={onPoster} sheet /> : null}
    </AppSheet>
  );
}

const isContent = (t: ShareTarget): t is { type: StoryLinkType; id: string } => "type" in t;

export function ShareBody({
  target,
  onClose,
  onPoster,
  sheet,
}: {
  target: ShareTarget;
  onClose: () => void;
  onPoster?: () => void;
  sheet?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const content = isContent(target);
  const info = useApi<ShareInfo | null>(
    () => (content ? api.shareInfo(target.type, target.id) : Promise.resolve(null)),
    [content ? target.type : "story", content ? target.id : (target as { story: string }).story],
    { enabled: content },
  );

  // Ma propre story (« ⋯ » → Vers l'extérieur) : directement le fichier.
  if (!content) {
    return (
      <External
        title={L.menuExternal}
        formats={[]}
        story={{ id: target.story, mediaKind: target.mediaKind }}
        onBack={onClose}
        onClose={onClose}
        sheet={sheet}
      />
    );
  }

  const data = info.data;
  if (info.error && !data) {
    return (
      <View style={styles.stack}>
        <Header title={L.title} sheet={sheet} onClose={onClose} />
        <Notice tone="error" testID="share-error">
          {errorMessage(info.error)}
        </Notice>
        <SmButton kind="s" icon="undo" onPress={() => void info.reload()} testID="share-retry">
          Réessayer
        </SmButton>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.stack}>
        <Header title={L.title} sheet={sheet} onClose={onClose} />
        <Muted variant="body">Chargement…</Muted>
      </View>
    );
  }

  const open = (d: ShareDestination) => data.destinations[d];
  const reason = (d: ShareDestination) => data.reasons[d];
  const row = (d: ShareDestination, icon: "smartphone" | "feed" | "chat" | "export", title: string, hint: string) => (
    <View key={d} style={styles.row}>
      <Option
        icon={icon}
        title={title}
        hint={hint}
        selected={d === "story" && open("story")}
        disabled={!open(d)}
        role="button"
        testID={`share-dest-${d}`}
        onPress={() => {
          if (!open(d)) return;
          if (d === "story") {
            onClose();
            router.push({ pathname: "/partager/story", params: { type: data.type, id: data.id } });
          } else if (d === "external" && data.type === "vehicle" && onPoster) {
            onClose();
            onPoster();
          } else setStep(d);
        }}
      />
      {!open(d) && reason(d) ? (
        <Muted variant="caption" style={styles.reason} testID={`share-reason-${d}`}>
          {reason(d)}
        </Muted>
      ) : null}
    </View>
  );

  if (step === "feed") return <ToFeed info={data} onBack={() => setStep("choose")} onClose={onClose} sheet={sheet} />;
  if (step === "message") {
    return <ToMessage info={data} onBack={() => setStep("choose")} onClose={onClose} sheet={sheet} />;
  }
  if (step === "external") {
    return (
      <External
        title={data.title || L.external}
        formats={data.formats}
        content={{ type: data.type, id: data.id }}
        onBack={() => setStep("choose")}
        onClose={onClose}
        sheet={sheet}
      />
    );
  }
  const thumb = mediaSource(data.imageUrl);
  return (
    <View style={styles.stack} testID="share-sheet">
      <Header title={L.title} sheet={sheet} onClose={onClose} />
      <View style={[styles.head, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
        {thumb ? (
          <Image source={thumb} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: c.night }]}>
            <Icon name={data.type === "vehicle" ? "vehicle" : "ticket"} size={26} color={c.nightInk} />
          </View>
        )}
        <View style={styles.headText}>
          <Text variant="bodyStrong" color={c.ink} testID="share-title">
            {data.title}
          </Text>
          <Muted variant="caption">{data.subtitle}</Muted>
        </View>
      </View>
      <Label>{L.sectionTitle.toUpperCase()}</Label>
      {row("story", "smartphone", L.story, L.storyHint(data.linkLabel))}
      {row("feed", "feed", L.feed, L.feedHint)}
      {row("message", "chat", L.message, L.messageHint)}
      {row("external", "export", L.external, L.externalHint)}
    </View>
  );
}

function Header({
  title,
  sheet,
  onClose,
  onBack,
}: {
  title: string;
  sheet?: boolean;
  onClose: () => void;
  onBack?: () => void;
}) {
  const { t } = useTheme();
  if (!sheet && !onBack) return null;
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={6}
          style={[styles.closex, { backgroundColor: t.color.surface }]}
          testID="share-back"
        >
          <Icon name="back" size={20} color={t.color.ink} />
        </Pressable>
      ) : null}
      <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {sheet ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={L.close}
          hitSlop={6}
          style={[styles.closex, { backgroundColor: t.color.surface }]}
          testID="share-close"
        >
          <Icon name="close" size={20} color={t.color.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

// --- Dans le Fil --------------------------------------------------------------------------------------------------------

function ToFeed({
  info,
  onBack,
  onClose,
  sheet,
}: {
  info: ShareInfo;
  onBack: () => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Un seul envoi par ouverture : une reprise après une réponse perdue rend la même publication.
  const clientId = useRef(randomUUID()).current;
  const type = info.type === "vehicle" ? "vehicle" : "event";
  const publish = () => {
    setBusy(true);
    setError(null);
    api
      .shareToFeed({ linked: { type, id: info.id }, clientId, caption: caption.trim() || null })
      .then(() => setDone(true))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };
  return (
    <View style={styles.stack} testID="share-feed">
      <Header title={L.feed} sheet={sheet} onClose={onClose} onBack={onBack} />
      {done ? (
        <>
          <Notice testID="share-feed-done">{L.feedDone}</Notice>
          <SmButton kind="s" icon="check" onPress={onClose} testID="share-feed-ok">
            {L.close}
          </SmButton>
        </>
      ) : (
        <>
          <Muted variant="body">{L.feedHint}</Muted>
          <TextField
            label={L.caption}
            value={caption}
            onChangeText={setCaption}
            placeholder={L.captionPlaceholder}
            maxLength={STORY_CAPTION_MAX}
            multiline
            testID="share-feed-caption"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <SmButton kind="p" big wide icon="send" disabled={busy} onPress={publish} testID="share-feed-publish">
            {busy ? L.feedPublishing : "Publier dans le Fil"}
          </SmButton>
        </>
      )}
    </View>
  );
}

// --- En message ---------------------------------------------------------------------------------------------------------

function ToMessage({
  info,
  onBack,
  onClose,
  sheet,
}: {
  info: ShareInfo;
  onBack: () => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  // Les conversations se lisent page par page (« Voir plus ») : « Aucune conversation » seulement si tout est lu et vide.
  const [targets, setTargets] = useState(noShareTargets);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Un identifiant par conversation, gardé tant que l'envoi n'a pas abouti : une réponse perdue puis une reprise ne
  // créent pas deux messages.
  const ids = useRef(retryIds(randomUUID)).current;
  const read = (cursor?: string) => {
    setReading(true);
    setReadError(null);
    api
      .conversations(cursor)
      .then((page) => setTargets((s) => addShareTargets(cursor ? s : noShareTargets, page)))
      .catch((e) => setReadError(errorMessage(e)))
      .finally(() => setReading(false));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: première page à l'ouverture seulement.
  useEffect(() => read(), []);
  const items = targets.items;
  const send = (conv: ConversationSummary) => {
    setSending(conv.id);
    setError(null);
    api
      .sendMessage(conv.id, { clientId: ids.get(conv.id), body: L.messageBody(info.title || L.title, info.url) })
      .then(() => {
        ids.done(conv.id);
        setSent(conv.title);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setSending(null));
  };
  const { t } = useTheme();
  return (
    <View style={styles.stack} testID="share-message">
      <Header title={L.messageTitle} sheet={sheet} onClose={onClose} onBack={onBack} />
      {sent ? (
        <>
          <Notice testID="share-message-done">{`${L.messageSent} (${sent})`}</Notice>
          <SmButton kind="s" icon="check" onPress={onClose}>
            {L.close}
          </SmButton>
        </>
      ) : (
        <>
          {reading && !targets.loaded ? <Muted variant="body">Chargement…</Muted> : null}
          {readError ? (
            <>
              <Notice tone="error">{readError}</Notice>
              <SmButton kind="s" icon="undo" onPress={() => read(targets.next ?? undefined)} testID="share-conv-retry">
                Réessayer
              </SmButton>
            </>
          ) : null}
          {shareTargetsEmpty(targets) ? <Muted variant="body">{L.messageEmpty}</Muted> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {items.map((conv: ConversationSummary) => (
            <Pressable
              key={conv.id}
              accessibilityRole="button"
              accessibilityLabel={`${L.message} : ${conv.title}`}
              disabled={sending !== null}
              onPress={() => send(conv)}
              style={[styles.conv, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
              testID={`share-conv-${conv.id}`}
            >
              <Icon name={conv.kind === "crew" ? "crew" : "profile"} size={20} color={t.color.inkMuted} />
              <Text variant="bodyStrong" color={t.color.ink} style={styles.convName}>
                {conv.title}
              </Text>
              <Icon name="send" size={18} color={t.color.inkMuted} />
            </Pressable>
          ))}
          {targets.next && !readError ? (
            <SmButton
              kind="s"
              icon="next"
              disabled={reading}
              onPress={() => read(targets.next ?? undefined)}
              testID="share-conv-more"
            >
              {reading ? "Chargement…" : L.messageMore}
            </SmButton>
          ) : null}
        </>
      )}
    </View>
  );
}

// --- Vers l'extérieur ---------------------------------------------------------------------------------------------------

function External({
  title,
  formats,
  content,
  story,
  onBack,
  onClose,
  sheet,
}: {
  title: string;
  formats: ShareFileFormat[];
  content?: { type: StoryLinkType; id: string };
  /** Ma story (auteur seul) : le fichier de la story, une vidéo telle quelle. */
  story?: { id: string; mediaKind: "photo" | "video" };
  onBack: () => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const kept = useRef<PreparedShare[]>([]);
  useEffect(
    () => () => {
      for (const p of kept.current) releasePrepared(p);
    },
    [],
  );
  const send = async (key: string, path: string, fileName: string) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const file = await prepareExport(path, fileName, key, story?.mediaKind ?? "photo");
      kept.current.push(file);
      const outcome = await sendShareImage(file, "share", file.mime);
      setNote(
        outcome === "saved"
          ? L.externalSaved
          : outcome === "unavailable"
            ? "Le partage n'est pas disponible sur cet appareil."
            : null,
      );
    } catch (e) {
      setError(errorMessage(e) || L.externalFailed);
    } finally {
      setBusy(null);
    }
  };
  const options: { key: string; label: string; file: string; path: string }[] = story
    ? [
        {
          key: `story-${story.id}`,
          label: L.externalStory,
          file: story.mediaKind === "video" ? L.externalStoryFile.replace("1080 × 1920", "vidéo") : L.externalStoryFile,
          path: storyExportPath(story.id),
        },
      ]
    : content
      ? content.type === "feed_post"
        ? [
            {
              key: `post-${content.id}`,
              label: L.externalPost,
              file: L.externalPostFile,
              path: postExportPath(content.id),
            },
          ]
        : formats.map((f) => ({
            key: `${content.type}-${content.id}-${f}`,
            label: f === "story" ? L.externalStory : L.externalPost,
            file: f === "story" ? L.externalStoryFile : L.externalPostFile,
            path: shareExportPath(content.type, content.id, f),
          }))
      : [];
  return (
    <View style={styles.stack} testID="share-external">
      <Header title={title} sheet={sheet} onClose={onClose} onBack={story ? undefined : onBack} />
      <Muted variant="body">{`${L.externalTitle} · ${L.externalSub}`}</Muted>
      {options.map((o) => (
        <View key={o.key} style={styles.row}>
          <Option
            icon="export"
            title={o.label}
            hint={o.file}
            selected={false}
            disabled={busy !== null}
            role="button"
            testID={`share-file-${o.key.split("-").pop()}`}
            onPress={() =>
              void send(o.key, o.path, `orasso-${o.label === L.externalStory ? "story" : "publication"}.jpg`)
            }
          />
        </View>
      ))}
      {busy ? <Muted variant="caption">Préparation du fichier…</Muted> : null}
      {note ? <Notice testID="share-external-note">{note}</Notice> : null}
      {error ? (
        <Notice tone="error" testID="share-external-error">
          {error}
        </Notice>
      ) : null}
      <Muted variant="caption">{L.externalNote1}</Muted>
      <Muted variant="caption">{L.externalNote2}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space2 },
  header: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: tokens.radius.radiusLg,
  },
  thumb: { width: 64, height: 64, borderRadius: 14 },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  headText: { flex: 1, gap: space1 },
  row: { gap: space1 },
  reason: { paddingHorizontal: space2 },
  conv: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space3,
    borderRadius: tokens.radius.radiusLg,
    borderWidth: 1,
  },
  convName: { flex: 1 },
});
