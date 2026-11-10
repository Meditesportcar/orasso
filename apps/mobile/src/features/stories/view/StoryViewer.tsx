// La visionneuse de stories (lot R7f2, maquette R7.7 `p-story`, mode B : plein écran, fond noir, sans barre d'onglets). Elle lit
// les stories d'un auteur (`GET /stories/by-author/:key`, déjà filtrées par l'API) et les joue une à une :
//   - barres de progression en haut (une par story, 5 s par photo, `useStoryClock`) ;
//   - toucher à droite / à gauche : suivante / précédente ; glisser vers le bas : fermer ; appui long : pause (PanResponder
//     JS, comme le recadreur et la carte de tri, qui écrit des valeurs partagées ; la translation, le fondu et la barre sont
//     des styles animés, donc des worklets, sans travail JS pendant le geste) ;
//   - en-tête (avatar, nom, « il y a 3 h », bandeau « Mon crew · … »), légende, lieu, voiture, événement, identifiés ;
//   - en bas : flamme, « Répondre » (message privé) et « ⋯ » (signaler, ne plus voir, supprimer, vues) ;
//   - `POST /stories/:id/view` une fois par story, quand l'image est lue ET affichée (écran au premier plan).
// Pause automatique : menu ou feuille ouverts, champ de réponse en saisie, signalement ouvert, écran quitté, appli en
// arrière-plan (`AppState`), image pas lue, média en panne.
// Mouvement réduit : pas de glissement, fondu de 120 ms. Une story absente (expirée, retirée) : « Cette story n'est plus
// disponible ». Aucune règle de visibilité ici : tout ce qui arrive a déjà été filtré par l'API.
import { GradientFill, Icon, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  createReplyKeys,
  storyViewerLabels as L,
  replyStillShown,
  STORY_HOLD_MS,
  type StoriesByAuthor,
  type StoryTagView,
  type StoryView,
  shouldCloseOnDrag,
  storyDurationMs,
  storyNext,
  storyPlayable,
  storyPrev,
  storyShareLabels,
  storyStartIndex,
  tapTarget,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { openReport, useReportOpen } from "@/features/ReportSheet";
import { ShareSheet } from "@/features/share/ShareSheet";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { useSession } from "@/lib/session";
import { useAppActive } from "@/lib/useAppActive";
import { KeyboardSafe } from "@/ui/KeyboardSafe";
import { SmButton } from "@/ui/Kit";
import { Bottom } from "./Bottom";
import { CommercialBadge } from "./CommercialBadge";
import { Header } from "./Header";
import { LinkedCard } from "./LinkedCard";
import { MenuSheet } from "./MenuSheet";
import { ProgressBars } from "./ProgressBars";
import { proShareOption, ReshareButton } from "./ReshareButton";
import { SharedByLine } from "./SharedByLine";
import { Stickers } from "./Stickers";
import { useStoryClock } from "./useStoryClock";
import { Viewer } from "./Viewer";
import { ViewersSheet } from "./ViewersSheet";

const { space2, space3 } = tokens.spacing;
const REDUCED_FADE_MS = 120;
const CLOSE_MS = 180;
const NOTICE_MS = 2600;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: StoriesByAuthor };

export function StoryViewer({ authorKey }: { authorKey: string }) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me } = useSession();
  const focused = useIsFocused();
  const reportOpen = useReportOpen();
  const appActive = useAppActive();

  // --- Lecture ------------------------------------------------------------------------------------------------------
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const gate = useRef(createRequestGate(cacheScope)).current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la lecture (Réessayer).
  useEffect(() => {
    const ticket = gate.start();
    setLoad({ status: "loading" });
    api
      .storiesByAuthor(authorKey)
      .then((data) => {
        if (!ticket.current()) return;
        setIndex(storyStartIndex(data.stories));
        setLoad({ status: "ready", data });
      })
      .catch((e) => {
        if (!ticket.current()) return;
        const message = e instanceof ApiRequestError && e.status === 429 ? L.tooMany : errorMessage(e) || L.loadError;
        setLoad({ status: "error", message });
      });
    return () => gate.invalidate();
  }, [authorKey, attempt, gate]);

  // Retraits (suppression de ma story) et flammes (réaction posée tout de suite, rendue si l'API refuse).
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [flames, setFlames] = useState<Readonly<Record<string, boolean>>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const data = load.status === "ready" ? load.data : null;
  const list = useMemo(() => (data?.stories ?? []).filter((s) => !removed.has(s.id)), [data, removed]);
  const at = Math.min(index, Math.max(0, list.length - 1));
  const base = list[at] ?? null;
  const story: StoryView | null = base ? { ...base, reacted: flames[base.id] ?? base.reacted } : null;
  const mine = story ? story.viewsCount !== null : false;
  const author = data?.author ?? null;
  const authorName = author?.pseudoOrName ?? "";

  // --- Pauses -------------------------------------------------------------------------------------------------------
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Média en panne (réseau) : « Réessayer » est posé au-dessus de la surface de gestes, dont les zones gauche / droite
  // restent actives (une photo en panne ne bloque pas le passage aux stories suivantes).
  const [mediaFailedId, setMediaFailedId] = useState<string | null>(null);
  const [mediaRetries, setMediaRetries] = useState(0);
  const [held, setHeld] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  // La story ciblée par « Vers l'extérieur » reste celle choisie jusqu'à la fermeture de la feuille.
  const [externalTarget, setExternalTarget] = useState<{ story: string; mediaKind: StoryView["mediaKind"] } | null>(
    null,
  );
  const [viewersFor, setViewersFor] = useState<StoryView | null>(null);
  const [replyFocused, setReplyFocused] = useState(false);
  const ready = Boolean(story && loadedId === story.id && storyPlayable(story) && !gone.has(story.id));
  const running =
    focused && appActive && ready && !held && !menuOpen && !externalOpen && !viewersFor && !replyFocused && !reportOpen;

  // --- Fermer, avancer, reculer ---------------------------------------------------------------------------------------
  const ty = useSharedValue(0);
  const fade = useSharedValue(1);
  const closing = useRef(false);
  // Les minuteries de sortie sont gardées : au démontage elles sont annulées et `closing` est posé, donc rien ne ferme
  // (ne recule) une seconde fois, ni un autre écran, après que la visionneuse a déjà quitté.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const muteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    closing.current = false;
    return () => {
      closing.current = true;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (muteTimer.current) clearTimeout(muteTimer.current);
    };
  }, []);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (muteTimer.current) clearTimeout(muteTimer.current);
    const leave = () => (router.canGoBack() ? router.back() : router.replace("/fil"));
    if (reducedMotion) {
      fade.value = withTiming(0, { duration: REDUCED_FADE_MS });
      leaveTimer.current = setTimeout(leave, REDUCED_FADE_MS);
    } else {
      ty.value = withTiming(height, { duration: CLOSE_MS });
      leaveTimer.current = setTimeout(leave, CLOSE_MS - 10);
    }
  }, [router, reducedMotion, fade, ty, height]);

  const count = list.length;
  const goNext = useCallback(() => {
    const step = storyNext(at, count);
    if (step.kind === "close") close();
    else setIndex(step.index);
  }, [at, count, close]);
  // Reculer sur la première story la rejoue depuis le début : l'index ne change pas, `replay` change la clé de la minuterie.
  const [replay, setReplay] = useState(0);
  const goPrev = useCallback(() => {
    const step = storyPrev(at);
    if (step.kind !== "story") return;
    if (step.index === at) setReplay((n) => n + 1);
    else setIndex(step.index);
  }, [at]);

  const total = story ? storyDurationMs(story) : 5000;
  const progress = useStoryClock(`${story?.id ?? "none"}:${replay}`, total, running, goNext);

  // --- Vue (une fois par story, quand l'image est lue) ----------------------------------------------------------------
  const viewed = useRef(new Set<string>());
  const storyId = story?.id ?? null;
  // Une story n'est comptée vue que réellement affichée : image lue, écran au premier plan.
  const shown = ready && focused && appActive;
  useEffect(() => {
    if (!storyId || !shown || mine || viewed.current.has(storyId)) return;
    viewed.current.add(storyId);
    api.storyView(storyId).catch(() => viewed.current.delete(storyId));
  }, [storyId, shown, mine]);

  // --- Message d'état ---------------------------------------------------------------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // --- Gestes -----------------------------------------------------------------------------------------------------------
  const live = useRef({ goNext, goPrev, close, width, reducedMotion, setHeld });
  live.current = { goNext, goPrev, close, width, reducedMotion, setHeld };
  const pan = useMemo(() => {
    let moved = false;
    let held = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const settle = () => {
      if (held) live.current.setHeld(false);
      held = false;
      moved = false;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        moved = false;
        held = false;
        stop();
        timer = setTimeout(() => {
          if (!moved) {
            held = true;
            live.current.setHeld(true);
          }
        }, STORY_HOLD_MS);
      },
      onPanResponderMove: (_e, g) => {
        if (held) return;
        if (!moved && (Math.abs(g.dy) > 10 || Math.abs(g.dx) > 10)) {
          moved = true;
          stop();
        }
        if (moved && g.dy > 0 && !live.current.reducedMotion) ty.value = g.dy;
      },
      onPanResponderRelease: (e, g) => {
        stop();
        if (held) return settle();
        if (moved) {
          moved = false;
          if (shouldCloseOnDrag(g.dy, g.vy)) live.current.close();
          else ty.value = withSpring(0);
          return;
        }
        if (tapTarget(e.nativeEvent.pageX, live.current.width) === "prev") live.current.goPrev();
        else live.current.goNext();
      },
      onPanResponderTerminate: () => {
        stop();
        settle();
        ty.value = withSpring(0);
      },
    });
  }, [ty]);

  // Navigateur : ← → passent d'une story à l'autre, Échap ferme (hors saisie, sauf Échap).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (e.key === "Escape") live.current.close();
      else if (typing) return;
      else if (e.key === "ArrowRight") live.current.goNext();
      else if (e.key === "ArrowLeft") live.current.goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dragStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: ty.value }], opacity: fade.value };
  });

  // --- Actions ------------------------------------------------------------------------------------------------------------
  const flame = async () => {
    if (!story || mine) return;
    const next = !story.reacted;
    const id = story.id;
    setFlames((f) => ({ ...f, [id]: next }));
    try {
      await api.storyReact(id, next);
    } catch (e) {
      setFlames((f) => ({ ...f, [id]: !next }));
      setNotice(errorMessage(e));
    }
  };

  const [text, setText] = useState("");
  // Envois en cours, par story : on peut répondre à la suivante pendant qu'une réponse part, et le bouton d'une story reste
  // inactif tant que son propre envoi n'est pas résolu. Les identifiants d'idempotence suivent chaque soumission.
  const replyKeys = useRef(createReplyKeys(randomUUID)).current;
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const syncSending = () => setSending(new Set(replyKeys.sendingStories()));
  const shownDraft = useRef({ storyId: storyId as string | null, text });
  shownDraft.current = { storyId, text };
  // Un autre story : le brouillon d'une réponse ne passe pas à la suivante.
  // biome-ignore lint/correctness/useExhaustiveDependencies: le brouillon est propre à chaque story.
  useEffect(() => {
    setText("");
  }, [storyId]);
  const send = async () => {
    const body = text.trim();
    if (!story || !body) return;
    const sent = { storyId: story.id, text: body };
    // Identifiant lié à la soumission (story + texte), gardé jusqu'à sa résolution : une réponse perdue renvoyée à
    // l'identique n'est pas doublée, même après un envoi sur une autre story ; un texte modifié est un autre identifiant.
    const clientId = replyKeys.begin(sent.storyId, body);
    if (!clientId) return replyKeys.isSending(sent.storyId) ? undefined : setNotice(L.replyWait);
    syncSending();
    let ok = false;
    try {
      const r = await api.storyReply(sent.storyId, body, clientId);
      ok = true;
      // La fin de l'envoi ne touche au champ que si cette soumission est encore celle qui s'affiche.
      if (replyStillShown(sent, shownDraft.current)) {
        setText("");
        Keyboard.dismiss();
        setReplyFocused(false);
      }
      setNotice(r.mode === "message" ? L.replySentMessage : L.replySentRequest);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      replyKeys.end(sent.storyId, body, ok);
      syncSending();
    }
  };

  const mute = async () => {
    setMenuOpen(false);
    try {
      await api.storyMute(authorKey, true);
      setNotice(L.muted);
      if (!closing.current) muteTimer.current = setTimeout(close, 1500);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const report = () => {
    if (!story) return;
    setMenuOpen(false);
    openReport({ type: "story", id: story.id });
  };
  const removeTag = async () => {
    if (!story) return;
    setMenuOpen(false);
    try {
      await api.storyTagRemove(story.id);
      setNotice(L.removeTagDone);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const remove = async () => {
    if (!story) return;
    setMenuOpen(false);
    if (!(await confirmRemove(L.deleteConfirm))) return;
    try {
      await api.storyDelete(story.id);
      const left = list.filter((s) => s.id !== story.id).length;
      // La dernière story supprimée : on ferme tout de suite (l'écran « plus disponible » n'a rien à dire de plus).
      if (left === 0) return close();
      setRemoved((r) => new Set(r).add(story.id));
      setNotice(L.deleteDone);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  // Lot R7m2 : le pro cité en « Collaboration commerciale » reprend la story au nom de sa fiche.
  const [resharing, setResharing] = useState(false);
  const [resharedIds, setResharedIds] = useState<ReadonlySet<string>>(new Set());
  const reshare = async () => {
    const option = story ? proShareOption(story) : undefined;
    if (!story || !option?.id || resharing) return;
    setResharing(true);
    try {
      await api.storyShare(story.id, undefined, option.id);
      setResharedIds((ids) => new Set(ids).add(story.id));
      setNotice(storyShareLabels.reshared);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "already_shared")
        setResharedIds((ids) => new Set(ids).add(story.id));
      else setNotice(errorMessage(e));
    } finally {
      setResharing(false);
    }
  };

  const openProfile = (pseudo: string) => router.push(`/u/${encodeURIComponent(pseudo)}`);
  const openTag = (tag: StoryTagView) => {
    if (!tag.slug) return;
    if (tag.kind === "user") openProfile(tag.slug);
    else router.push(tag.kind === "structure" ? `/o/${tag.slug}` : `/p/${tag.slug}`);
  };
  const iAmTagged = Boolean(story && me && story.tags.some((x) => x.kind === "user" && x.id === me.user.id));
  const canReply = Boolean(author && author.persona !== "pro");

  // --- États sans story --------------------------------------------------------------------------------------------------
  const emptyScreen = (message: string, retry?: () => void, testID = "story-unavailable") => (
    <View style={[styles.root, styles.center, { backgroundColor: c.night }]}>
      <StatusBar style="light" />
      <Text variant="bodyStrong" color={c.nightInk} style={styles.message} testID={testID}>
        {message}
      </Text>
      <View style={styles.actions}>
        {retry ? (
          <SmButton kind="s" icon="undo" onPress={retry} testID="story-retry">
            {L.retry}
          </SmButton>
        ) : null}
        <SmButton kind="s" icon="close" onPress={close} testID="story-close">
          {L.close}
        </SmButton>
      </View>
    </View>
  );
  if (load.status === "loading") {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: c.night }]} testID="story-loading">
        <StatusBar style="light" />
        <Text variant="caption" color={c.nightInk} accessibilityLiveRegion="polite">
          {L.loading}
        </Text>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={L.close}
          style={[styles.closeAlone, { top: insets.top + 8 }]}
          testID="story-close"
        >
          <Icon name="close" size={22} color={c.nightInk} />
        </Pressable>
      </View>
    );
  }
  if (load.status === "error") return emptyScreen(load.message, () => setAttempt((n) => n + 1), "story-error");
  if (!story || !author) return emptyScreen(L.unavailable);

  const failed = gone.has(story.id);
  const processing = !storyPlayable(story);
  const markGone = (status: number) => {
    if (status === 403 || status === 404) setGone((g) => new Set(g).add(story.id));
    else setMediaFailedId(story.id);
  };

  return (
    <KeyboardSafe style={styles.root}>
      <StatusBar style="light" />
      <Animated.View style={[styles.root, { backgroundColor: c.night }, dragStyle]} testID="story-viewer">
        {/* Le média. */}
        <View style={StyleSheet.absoluteFill} testID={`story-media-${story.id}`}>
          {failed || processing ? (
            <View style={[styles.center, styles.fill]}>
              <Text variant="bodyStrong" color={c.nightInk} style={styles.message} testID="story-unavailable">
                {failed ? L.unavailable : L.processing}
              </Text>
            </View>
          ) : (
            <Viewer
              key={`${story.id}:${mediaRetries}`}
              story={story}
              authorName={authorName}
              width={width}
              height={height}
              onLoaded={() => {
                setLoadedId(story.id);
                setMediaFailedId(null);
              }}
              onLoading={() => setMediaFailedId(null)}
              onFailed={markGone}
            />
          )}
        </View>
        <GradientFill
          css={`linear-gradient(180deg, ${withAlpha(c.night, 0.6)} 0%, transparent 26%, transparent 62%, ${withAlpha(c.night, 0.75)} 100%)`}
        />
        {/* Les zones de geste : tout l'écran ; l'en-tête, les autocollants et le bas sont au-dessus. */}
        <View
          style={StyleSheet.absoluteFill}
          {...pan.panHandlers}
          accessibilityLabel={L.viewer}
          testID="story-surface"
        />
        {mediaFailedId === story.id && !failed && !processing ? (
          <View style={styles.retryBox} pointerEvents="box-none">
            <View>
              <SmButton
                kind="s"
                icon="undo"
                onPress={() => {
                  setMediaFailedId(null);
                  setMediaRetries((n) => n + 1);
                }}
                testID="photo-retry"
              >
                {L.retry}
              </SmButton>
            </View>
          </View>
        ) : null}
        <View style={[styles.top, { paddingTop: insets.top + space2 }]} pointerEvents="box-none">
          <ProgressBars count={list.length} index={at} progress={progress} />
          <Header
            story={story}
            name={authorName}
            avatarUrl={author.avatarUrl}
            mine={mine}
            live={author.live}
            onProfile={authorKey.startsWith("u:") && !mine ? () => openProfile(authorName) : undefined}
            onMore={() => setMenuOpen(true)}
            onClose={close}
          />
          <SharedByLine story={story} authorName={authorName} onOpen={openTag} />
          <CommercialBadge story={story} />
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 22 }]} pointerEvents="box-none">
          <LinkedCard story={story} />
          <ReshareButton
            story={story}
            done={resharedIds.has(story.id)}
            busy={resharing}
            onPress={() => void reshare()}
          />
          <Stickers
            story={story}
            onVehicle={(id) => router.push(mine ? `/vehicule/${id}` : `/v/${id}`)}
            onEvent={(slug) => router.push(`/e/${slug}`)}
            onTag={openTag}
          />
          {notice ? (
            <View
              style={[styles.notice, { backgroundColor: c.nightInk }]}
              accessibilityLiveRegion="polite"
              testID="story-notice"
            >
              <Text variant="bodyStrong" color={c.night} style={styles.noticeText}>
                {notice}
              </Text>
            </View>
          ) : null}
          <Bottom
            story={story}
            mine={mine}
            name={authorName}
            canReply={canReply}
            text={text}
            onText={setText}
            sending={sending.has(story.id)}
            onSend={() => void send()}
            onFocusChange={setReplyFocused}
            onFlame={() => void flame()}
            onViews={() => {
              setViewersFor(story);
            }}
          />
        </View>
      </Animated.View>
      <MenuSheet
        open={menuOpen}
        mine={mine}
        views={story.viewsCount ?? 0}
        tagged={iAmTagged}
        onClose={() => setMenuOpen(false)}
        onMute={() => void mute()}
        onReport={report}
        onRemoveTag={() => void removeTag()}
        onViews={() => {
          setMenuOpen(false);
          setViewersFor(story);
        }}
        onDelete={() => void remove()}
        onExternal={
          story.exportable
            ? () => {
                setMenuOpen(false);
                setExternalTarget({ story: story.id, mediaKind: story.mediaKind });
                setExternalOpen(true);
              }
            : undefined
        }
      />
      <ShareSheet
        visible={externalOpen}
        onClose={() => setExternalOpen(false)}
        target={externalTarget ?? { story: story.id, mediaKind: story.mediaKind }}
      />
      <ViewersSheet story={viewersFor} onClose={() => setViewersFor(null)} onProfile={openProfile} />
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: space3, padding: space3 },
  message: { textAlign: "center" },
  actions: { flexDirection: "row", gap: space2 },
  closeAlone: {
    position: "absolute",
    right: 12,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  // Sous le message « Photo indisponible » (centré dans le cadre), au-dessus de la surface de gestes.
  retryBox: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingTop: 76 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 10 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14, gap: 14 },
  notice: { alignSelf: "center", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, maxWidth: "100%" },
  noticeText: { fontSize: 13.5, lineHeight: 17, textAlign: "center" },
});
