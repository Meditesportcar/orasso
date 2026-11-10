// La visionneuse de stories sur le site (lot R7f2, maquette R7.7 `p-story`) : une superposition plein écran, fond noir, la story en
// 9:16 centrée (à 1 280 px, une colonne étroite au milieu de l'écran). Mêmes règles et mêmes mots que l'appli : barres de
// progression (5 s par photo), toucher ou clic à droite / à gauche (suivante / précédente), appui long = pause, glisser vers le
// bas ou Échap = fermer, ← → au clavier ; en-tête, légende, lieu, voiture, événement, identifiés ; flamme, « Répondre »
// (message privé), « ⋯ » (signaler, ne plus voir, me retirer, supprimer, vues). Lue dans le navigateur (cookie de session) :
// jamais d'adresse de fichier dans le HTML rendu par le serveur, qui n'a pas de session pour les stories. L'image passe par
// la route protégée (`/api/stories/:id/media/:nom`). Fichier PARTAGÉ avec R7f4, R7h et R7m2 (une ligne chacun) ; lot R7g : la branche vidéo (`VideoSlide`, `VideoBar`).
import { Button, Icon, type IconName } from "@orasso/design-system/web";
import {
  clock,
  createReplyKeys,
  feedAgo,
  storyViewerLabels as L,
  progressOf,
  replyStillShown,
  STORY_HOLD_MS,
  STORY_VIEWERS_MAX,
  type StoriesByAuthor,
  type StoryReplyResult,
  type StoryTagView,
  type StoryView,
  shareLabels,
  shouldCloseOnDrag,
  storyDurationMs,
  storyNext,
  storyPlayable,
  storyPlayerKey,
  storyPrev,
  storyStartIndex,
  tapTarget,
  storyVideoLabels as V,
  viewersListPartial,
  viewersTotalFor,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";

import "../../styles/stories.css";
import { apiFetch } from "../../lib/api.client";
import { now } from "../../lib/clock";
import { listenSession } from "../../lib/sessionChannel";
import { ReportDialog } from "../ReportDialog";
import { CommercialBadge } from "./CommercialBadge";
import { LinkedCard } from "./LinkedCard";
import { SharedByLine } from "./SharedByLine";
import { VideoSlide } from "./VideoSlide";

type Viewers = {
  /** Compteur relu à cet appel : le titre « Vues · N » et la mention « liste partielle » partent de lui. */
  total: number;
  viewers: { userId: string; pseudo: string; avatarUrl: string | null; viewedAt: string }[];
};
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: StoriesByAuthor };

const TICK_MS = 50;
const NOTICE_MS = 2600;

function Avatar({ url, name, crew }: { url: string | null; name: string; crew: boolean }) {
  return (
    <span className={crew ? "story-view__av is-crew" : "story-view__av"} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="o-t-poster-l">{name.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

function Sticker({
  icon,
  label,
  href,
  aria,
  testId,
}: {
  icon: IconName;
  label: string;
  href?: string;
  aria?: string;
  testId?: string;
}) {
  const body = (
    <>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </>
  );
  return href ? (
    <a className="story-view__sticker" href={href} aria-label={aria ?? label} data-testid={testId}>
      {body}
    </a>
  ) : (
    <span className="story-view__sticker" data-testid={testId}>
      {body}
    </span>
  );
}

const tagHref = (t: StoryTagView) =>
  !t.slug
    ? null
    : t.kind === "user"
      ? `/u/${encodeURIComponent(t.slug)}`
      : t.kind === "structure"
        ? `/o/${t.slug}`
        : `/p/${t.slug}`;

export function Viewer({ authorKey, userId }: { authorKey: string; userId: string }) {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [flames, setFlames] = useState<Readonly<Record<string, boolean>>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState<{ story: StoryView; data: Viewers | null; error: string | null } | null>(null);
  const [replyFocused, setReplyFocused] = useState(false);
  const [text, setText] = useState("");
  // Envois en cours, par story : on peut répondre à la suivante pendant qu'une réponse part, et le bouton d'une story reste
  // inactif tant que son propre envoi n'est pas résolu. Les identifiants d'idempotence suivent chaque soumission.
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const [visible, setVisible] = useState(true);
  // Compte : `checking` masque tout (photo, métadonnées, listes) pendant qu'on revérifie la session au retour au premier plan ;
  // `unverified` = la vérification a échoué (réseau) : rien n'est montré sans elle.
  const [check, setCheck] = useState<"ok" | "checking" | "unverified">("ok");
  const checkSeq = useRef(0);
  const [replay, setReplay] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // Vidéo (lot R7g) : muette au départ, le choix vaut pour toute la visionneuse ; la seconde atteinte pour « 0:11 / 0:24 ».
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoSeconds, setVideoSeconds] = useState(0);
  const menuRef = useRef<HTMLDialogElement>(null);
  const viewersRef = useRef<HTMLDialogElement>(null);
  const seq = useRef(0);
  const viewed = useRef(new Set<string>());
  const viewersSeq = useRef(0);
  const replyKeys = useRef(createReplyKeys(() => crypto.randomUUID())).current;
  const syncSending = () => setSending(new Set(replyKeys.sendingStories()));
  const closing = useRef(false);
  const muteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Lecture ------------------------------------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la lecture (Réessayer).
  useEffect(() => {
    const mine = ++seq.current;
    setLoad({ status: "loading" });
    void apiFetch<StoriesByAuthor>(`/stories/by-author/${encodeURIComponent(authorKey)}`).then((res) => {
      if (mine !== seq.current) return;
      if (!res.ok) {
        setLoad({ status: "error", message: res.status === 429 ? L.tooMany : res.error.message || L.loadError });
        return;
      }
      setIndex(storyStartIndex(res.data.stories));
      setLoad({ status: "ready", data: res.data });
    });
  }, [authorKey, attempt]);

  const data = load.status === "ready" ? load.data : null;
  const list = (data?.stories ?? []).filter((s) => !removed.has(s.id));
  const at = Math.min(index, Math.max(0, list.length - 1));
  const base = list[at] ?? null;
  const story: StoryView | null = base ? { ...base, reacted: flames[base.id] ?? base.reacted } : null;
  const mine = story ? story.viewsCount !== null : false;
  const author = data?.author ?? null;
  const authorName = author?.pseudoOrName ?? "";
  const canReply = Boolean(author && author.persona !== "pro");

  // --- Fermer, avancer, reculer ---------------------------------------------------------------------------------------
  // Un seul `close()`, et la minuterie de « Ne plus voir ses stories » est annulée au démontage (sinon, sortie pendant les
  // 1,5 s = un second recul, hors de la visionneuse).
  useEffect(() => {
    closing.current = false;
    return () => {
      closing.current = true;
      if (muteTimer.current) clearTimeout(muteTimer.current);
    };
  }, []);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (muteTimer.current) clearTimeout(muteTimer.current);
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate("/app/fil", { replace: true });
  }, [navigate]);
  const count = list.length;
  const goNext = useCallback(() => {
    const step = storyNext(at, count);
    if (step.kind === "close") close();
    else setIndex(step.index);
  }, [at, count, close]);
  // Reculer sur la première story la rejoue depuis le début : l'index ne change pas, `replay` relance la minuterie.
  const goPrev = useCallback(() => {
    const step = storyPrev(at);
    if (step.kind !== "story") return;
    if (step.index === at) setReplay((n) => n + 1);
    else setIndex(step.index);
  }, [at]);

  // --- Pauses et minuterie ---------------------------------------------------------------------------------------------
  const ready = Boolean(story && loadedId === story.id && storyPlayable(story) && !gone.has(story.id));
  // Onglet masqué (changement d'onglet, écran verrouillé) : pause, le temps restant est gardé.
  // Pendant la vérification du compte (retour d'onglet ou de fenêtre), rien ne défile : la story ne finit pas sous « Réessayer ».
  const running = ready && visible && check === "ok" && !held && !menu && !viewers && !replyFocused;
  const total = story ? storyDurationMs(story) : 5000;
  const storyId = story?.id ?? null;
  // Une vidéo mène sa barre elle-même (`currentTime / duration`) et passe à la suivante à sa fin.
  const isVideo = story?.mediaKind === "video";
  const elapsed = useRef(0);
  const onDone = useRef(goNext);
  onDone.current = goNext;
  // Session changée dans un autre onglet (A se déconnecte, B se connecte) : au retour au premier plan, et avant toute reprise,
  // la visionneuse masque ses données, relit le compte courant (`/me`) et, s'il n'est plus le même (ou plus de session), purge
  // tout : l'état est vidé et la page rechargée (le chargeur de la route renvoie à la connexion ou monte une visionneuse neuve
  // pour le compte courant). Le menu et la liste des vues sont fermés : ils sont recréés par l'utilisateur, jamais conservés.
  const verifySession = useCallback(async () => {
    const mineCheck = ++checkSeq.current;
    setCheck("checking");
    // Tour 6 : le média est démonté pendant la vérification ; la minuterie (temps écoulé gardé) ne reprend qu'au nouvel `onLoad`.
    setLoadedId(null);
    setMenu(false);
    viewersSeq.current++;
    setViewers(null);
    const res = await apiFetch<{ user: { id: string } }>("/me");
    if (mineCheck !== checkSeq.current) return;
    if (res.ok && res.data.user.id === userId) return setCheck("ok");
    if (res.ok || res.status === 401) {
      seq.current++;
      setLoad({ status: "loading" });
      setRemoved(new Set());
      setFlames({});
      setText("");
      setImageError(null);
      window.location.reload();
      return;
    }
    setCheck("unverified");
  }, [userId]);
  useEffect(() => {
    let hiddenBefore = document.visibilityState === "hidden";
    let blurred = false;
    const sync = () => {
      const hidden = document.visibilityState === "hidden";
      setVisible(!hidden);
      if (hidden) hiddenBefore = true;
      else if (hiddenBefore) {
        hiddenBefore = false;
        // Tour 6 : un seul `/me` au retour d'onglet (le focus qui suit ne relance pas de seconde vérification).
        blurred = false;
        // Masqué tout de suite (avant la prochaine image affichée), puis le compte est relu.
        flushSync(() => setCheck("checking"));
        void verifySession();
      }
    };
    // Deux fenêtres côte à côte : la visionneuse reste visible quand l'autre fenêtre change de compte ; le retour du focus
    // dans cette fenêtre (après l'avoir quittée) et le retour par l'historique (`pageshow` d'une page gardée) revérifient
    // aussi le compte, masqué d'abord.
    const onBlur = () => {
      blurred = true;
    };
    const recheck = () => {
      flushSync(() => setCheck("checking"));
      void verifySession();
    };
    const onFocus = () => {
      if (!blurred || document.visibilityState === "hidden") return;
      blurred = false;
      recheck();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) recheck();
    };
    // Une autre fenêtre (visible en même temps) annonce son compte : s'il diffère du nôtre (ou plus aucun), tout est masqué
    // tout de suite, puis le compte est relu. Rien d'autre que l'identifiant du compte passe dans le canal.
    const stopListening = listenSession((other) => {
      if (other !== userId) recheck();
    });
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopListening();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [verifySession, userId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: une autre story (ou la première rejouée) repart de zéro.
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
    setVideoSeconds(0);
  }, [storyId, replay]);
  useEffect(() => {
    if (!running || isVideo) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const t = performance.now();
      elapsed.current += t - last;
      last = t;
      setProgress(progressOf(total, elapsed.current));
      if (elapsed.current >= total) {
        clearInterval(timer);
        onDone.current();
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, total, isVideo]);

  // Vue : une fois par story, quand l'image est lue ET affichée (onglet visible).
  const shown = ready && visible && check === "ok";
  useEffect(() => {
    if (!storyId || !shown || mine || viewed.current.has(storyId)) return;
    viewed.current.add(storyId);
    void apiFetch(`/stories/${storyId}/view`, { method: "POST" }).then((res) => {
      if (!res.ok) viewed.current.delete(storyId);
    });
  }, [storyId, shown, mine]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le brouillon est propre à chaque story.
  useEffect(() => setText(""), [storyId]);

  // Clavier : ← → passent d'une story à l'autre, Échap ferme (hors saisie, sauf Échap). Les feuilles ouvertes gardent Échap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menu || viewers) return;
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (e.key === "Escape") close();
      else if (typing) return;
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, viewers, close, goNext, goPrev]);

  useEffect(() => {
    if (menu) menuRef.current?.showModal();
    else menuRef.current?.close();
  }, [menu]);
  useEffect(() => {
    if (viewers) viewersRef.current?.showModal();
    else viewersRef.current?.close();
  }, [viewers]);

  // --- Gestes : toucher, appui long, glisser vers le bas ---------------------------------------------------------------
  const press = useRef<{
    x: number;
    y: number;
    at: number;
    held: boolean;
    moved: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent) => {
    // Le doigt qui glisse hors du cadre garde le geste : le relâcher y est vu.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = {
      x: e.clientX,
      y: e.clientY,
      at: Date.now(),
      held: false,
      moved: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    p.timer = setTimeout(() => {
      if (!p.moved) {
        p.held = true;
        setHeld(true);
      }
    }, STORY_HOLD_MS);
    press.current = p;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.held) return;
    if (Math.abs(e.clientY - p.y) > 10 || Math.abs(e.clientX - p.x) > 10) {
      p.moved = true;
      if (p.timer) clearTimeout(p.timer);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    if (p.held) return setHeld(false);
    if (p.moved) {
      const dy = e.clientY - p.y;
      const dt = Math.max(1, Date.now() - p.at);
      if (shouldCloseOnDrag(dy, dy / dt)) close();
      return;
    }
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    if (tapTarget(e.clientX - box.left, box.width) === "prev") goPrev();
    else goNext();
  };
  const onCancel = () => {
    const p = press.current;
    press.current = null;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.held) setHeld(false);
  };

  // --- Actions ------------------------------------------------------------------------------------------------------------
  const flame = async () => {
    if (!story || mine) return;
    const next = !story.reacted;
    const id = story.id;
    setFlames((f) => ({ ...f, [id]: next }));
    const res = await apiFetch(`/stories/${id}/reaction`, { method: next ? "PUT" : "DELETE" });
    if (!res.ok) {
      setFlames((f) => ({ ...f, [id]: !next }));
      setNotice(res.error.message || L.actionError);
    }
  };
  const shownDraft = useRef({ storyId: storyId as string | null, text });
  shownDraft.current = { storyId, text };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!story || !body) return;
    const sent = { storyId: story.id, text: body };
    // Identifiant lié à la soumission (story + texte), gardé jusqu'à sa résolution : une réponse perdue renvoyée à
    // l'identique n'est pas doublée, même après un envoi sur une autre story ; un texte modifié est un autre identifiant.
    const clientId = replyKeys.begin(sent.storyId, body);
    if (!clientId) return replyKeys.isSending(sent.storyId) ? undefined : setNotice(L.replyWait);
    syncSending();
    const res = await apiFetch<StoryReplyResult>(`/stories/${sent.storyId}/reply`, {
      method: "POST",
      json: { text: body, clientId },
    });
    replyKeys.end(sent.storyId, body, res.ok);
    syncSending();
    if (!res.ok) return setNotice(res.error.message || L.actionError);
    // La fin de l'envoi ne touche au champ que si cette soumission est encore celle qui s'affiche.
    if (replyStillShown(sent, shownDraft.current)) {
      setText("");
      setReplyFocused(false);
      (document.activeElement as HTMLElement | null)?.blur();
    }
    setNotice(res.data.mode === "message" ? L.replySentMessage : L.replySentRequest);
  };
  const mute = async () => {
    setMenu(false);
    const res = await apiFetch(`/me/story-mutes/${encodeURIComponent(authorKey)}`, { method: "PUT" });
    if (!res.ok) return setNotice(res.error.message || L.actionError);
    setNotice(L.muted);
    if (!closing.current) muteTimer.current = setTimeout(close, 1500);
  };
  const removeTag = async () => {
    if (!story) return;
    setMenu(false);
    const res = await apiFetch(`/me/story-tags/${story.id}/remove`, { method: "POST" });
    setNotice(res.ok ? L.removeTagDone : res.error.message || L.actionError);
  };
  const remove = async () => {
    if (!story) return;
    setMenu(false);
    if (!window.confirm(L.deleteConfirm)) return;
    const res = await apiFetch(`/me/stories/${story.id}`, { method: "DELETE" });
    if (!res.ok) return setNotice(res.error.message || L.actionError);
    const left = list.filter((s) => s.id !== story.id).length;
    // La dernière story supprimée : on ferme tout de suite (l'écran « plus disponible » n'a rien à dire de plus).
    if (left === 0) return close();
    setRemoved((r) => new Set(r).add(story.id));
    setNotice(L.deleteDone);
  };
  const openViewers = async (s: StoryView) => {
    setMenu(false);
    const mineSeq = ++viewersSeq.current;
    setViewers({ story: s, data: null, error: null });
    const res = await apiFetch<Viewers>(`/me/stories/${s.id}/viewers`);
    if (mineSeq !== viewersSeq.current) return;
    setViewers({ story: s, data: res.ok ? res.data : null, error: res.ok ? null : res.error.message || L.viewsError });
  };
  // L'image n'a pas pu être lue : 403 / 404 = la story n'est plus disponible ; sinon une panne, « Réessayer ».
  const onImageError = async (s: StoryView) => {
    const res = await fetch(s.mediaUrl, { credentials: "same-origin" }).catch(() => null);
    if (res && (res.status === 403 || res.status === 404)) setGone((g) => new Set(g).add(s.id));
    else setImageError(s.id);
  };
  const iAmTagged = Boolean(story?.tags.some((x) => x.kind === "user" && x.id === userId));

  // --- Rendu ----------------------------------------------------------------------------------------------------------------
  const shell = (children: React.ReactNode, testId: string) => (
    <div className="story-view" role="dialog" aria-modal="true" aria-label={L.viewer} data-testid="story-viewer-root">
      <div className="story-view__frame story-view__frame--empty">
        <div className="story-view__empty" data-testid={testId}>
          {children}
        </div>
      </div>
    </div>
  );
  if (check !== "ok") {
    return check === "checking"
      ? shell(<p className="o-t-caption">{L.loading}</p>, "story-checking")
      : shell(
          <>
            <p className="o-t-body">{L.loadError}</p>
            <div className="story-view__actions">
              <Button variant="secondary" icon="undo" onClick={() => void verifySession()} data-testid="story-retry">
                {L.retry}
              </Button>
              <Button variant="plate" icon="close" onClick={close} data-testid="story-close">
                {L.close}
              </Button>
            </div>
          </>,
          "story-unverified",
        );
  }
  if (load.status === "loading") return shell(<p className="o-t-caption">{L.loading}</p>, "story-loading");
  if (load.status === "error") {
    return shell(
      <>
        <p className="o-t-body">{load.message}</p>
        <div className="story-view__actions">
          <Button variant="secondary" icon="undo" onClick={() => setAttempt((n) => n + 1)} data-testid="story-retry">
            {L.retry}
          </Button>
          <Button variant="plate" icon="close" onClick={close} data-testid="story-close">
            {L.close}
          </Button>
        </div>
      </>,
      "story-error",
    );
  }
  if (!story || !author) {
    return shell(
      <>
        <p className="o-t-body" data-testid="story-unavailable">
          {L.unavailable}
        </p>
        <Button variant="plate" icon="close" onClick={close} data-testid="story-close">
          {L.close}
        </Button>
      </>,
      "story-unavailable-box",
    );
  }

  const crew = story.audience === "crew";
  const failed = gone.has(story.id);
  const audience = story.audience === "public" ? L.forPublic : mine ? L.forFollowersMine : L.forFollowers;
  const profile = authorKey.startsWith("u:") && !mine ? `/u/${encodeURIComponent(authorName)}` : null;
  const when = feedAgo(story.createdAt, now());
  const who = (
    <>
      <Avatar url={author.avatarUrl} name={authorName} crew={crew} />
      <span className="story-view__who-text">
        <strong className="story-view__name" data-testid="story-author">
          {authorName}
        </strong>
        <span className="story-view__sub">
          {author.live ? (
            <span className="story-view__live" data-testid="story-live-badge">
              {L.live}
            </span>
          ) : null}
          {crew ? (
            <span className="story-view__crew" data-testid="story-crew-badge">
              <Icon name="shield" size={13} />
              {L.crewBadge(story.crewName ?? "")}
            </span>
          ) : null}
          <span data-testid="story-when">{crew ? when : `${when} · ${audience}`}</span>
        </span>
      </span>
    </>
  );

  return (
    <div className="story-view" role="dialog" aria-modal="true" aria-label={L.viewer} data-testid="story-viewer-root">
      <div className="story-view__frame" ref={frame} data-testid="story-viewer">
        {/* Le média. */}
        {failed ? (
          <p className="story-view__gone o-t-body" data-testid="story-unavailable">
            {L.unavailable}
          </p>
        ) : !storyPlayable(story) ? (
          <p className="story-view__gone o-t-body" data-testid="story-unavailable">
            {L.processing}
          </p>
        ) : imageError === story.id ? (
          <div className="story-view__gone">
            <p className="o-t-body">{story.mediaKind === "video" ? V.playFailed : L.loadError}</p>
          </div>
        ) : story.mediaKind === "video" ? (
          <VideoSlide
            key={storyPlayerKey(story.id, retries, replay, true)}
            story={story}
            running={running}
            muted={videoMuted}
            onLoaded={() => setLoadedId(story.id)}
            onError={() => void onImageError(story)}
            onProgress={(ratio, seconds) => {
              setProgress(ratio);
              setVideoSeconds(seconds);
            }}
            onEnded={() => {
              setProgress(1);
              onDone.current();
            }}
          />
        ) : (
          <img
            key={`${story.id}:${retries}`}
            className="story-view__media"
            src={story.mediaUrl}
            alt={L.photoAlt(authorName)}
            draggable={false}
            onLoad={() => setLoadedId(story.id)}
            onError={() => void onImageError(story)}
            data-testid="story-media"
          />
        )}
        <div className="story-view__shade" aria-hidden="true" />

        {/* Les zones de geste : tout le cadre ; l'en-tête, les autocollants et le bas sont au-dessus. */}
        <div
          className="story-view__surface"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          data-testid="story-surface"
        />
        {/* Photo en panne : « Réessayer » est posé AU-DESSUS de la surface ; les zones gauche / droite restent actives. */}
        {imageError === story.id && !failed && storyPlayable(story) ? (
          <div className="story-view__retry">
            <Button
              variant="secondary"
              icon="undo"
              onClick={() => {
                setImageError(null);
                setRetries((n) => n + 1);
              }}
              data-testid="story-photo-retry"
            >
              {L.retry}
            </Button>
          </div>
        ) : null}
        <button type="button" className="story-view__sr" onClick={goPrev} aria-label={L.prev} data-testid="story-prev">
          {L.prev}
        </button>
        <button type="button" className="story-view__sr" onClick={goNext} aria-label={L.next} data-testid="story-next">
          {L.next}
        </button>

        <div className="story-view__top">
          <div
            className="story-view__bars"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={count}
            aria-valuenow={at + 1}
            aria-valuetext={L.progress(at + 1, count)}
            aria-label={L.viewer}
            data-testid="story-bars"
          >
            {list.map((s, i) => (
              <span
                key={s.id}
                className="story-view__bar"
                data-testid={i < at ? "story-bar-done" : i === at ? "story-bar-current" : "story-bar-next"}
              >
                <span
                  className="story-view__bar-fill"
                  style={{ width: i < at ? "100%" : i === at ? `${Math.round(progress * 100)}%` : "0%" }}
                />
              </span>
            ))}
          </div>
          <div className="story-view__head">
            {profile ? (
              <a
                className="story-view__who"
                href={profile}
                aria-label={L.tagged(authorName)}
                data-testid="story-author-open"
              >
                {who}
              </a>
            ) : (
              <div className="story-view__who">{who}</div>
            )}
            {isVideo && !failed && storyPlayable(story) ? (
              <button
                type="button"
                className="story-view__btn"
                onClick={() => setVideoMuted((m) => !m)}
                aria-label={videoMuted ? V.soundOn : V.soundOff}
                aria-pressed={!videoMuted}
                data-testid="story-video-sound"
              >
                <Icon name={videoMuted ? "soundOff" : "sound"} size={20} />
              </button>
            ) : null}
            <button
              type="button"
              className="story-view__btn"
              onClick={() => setMenu(true)}
              aria-label={L.more}
              data-testid="story-more"
            >
              <Icon name="more" size={22} />
            </button>
            <button
              type="button"
              className="story-view__btn"
              onClick={close}
              aria-label={L.close}
              data-testid="story-close"
            >
              <Icon name="close" size={22} />
            </button>
          </div>
          <SharedByLine story={story} authorName={authorName} />
          <CommercialBadge story={story} />
        </div>

        <div className="story-view__bottom">
          {isVideo && !failed && storyPlayable(story) ? (
            <div className="story-view__videobar" data-testid="story-video-bar">
              <span className="story-view__vtime">
                <Icon name="video" size={16} />
                <span data-testid="story-video-time">
                  {clock(videoSeconds * 1000)} / {clock(story.durationMs ?? 0)}
                </span>
              </span>
            </div>
          ) : null}
          <LinkedCard story={story} />
          <div className="story-view__stickers" data-testid="story-stickers">
            {story.caption ? (
              <p className="story-view__caption" data-testid="story-caption">
                {story.caption}
              </p>
            ) : null}
            <div className="story-view__sticker-row">
              {story.vehicle ? (
                <Sticker
                  icon="vehicle"
                  label={story.vehicle.label}
                  href={mine ? `/app/garage/${story.vehicle.id}` : `/v/${story.vehicle.id}`}
                  aria={L.car(story.vehicle.label)}
                  testId="story-sticker-vehicle"
                />
              ) : null}
              {story.event ? (
                <Sticker
                  icon="ticket"
                  label={story.event.title}
                  href={`/e/${story.event.slug}`}
                  aria={L.event(story.event.title)}
                  testId="story-sticker-event"
                />
              ) : null}
              {story.placeLabel ? <Sticker icon="place" label={story.placeLabel} testId="story-sticker-place" /> : null}
              {story.tags.map((tag) => (
                <Sticker
                  key={`${tag.kind}:${tag.id}`}
                  icon="profile"
                  label={`@${tag.name}`}
                  href={tagHref(tag) ?? undefined}
                  aria={L.tagged(tag.name)}
                  testId={`story-tag-${tag.name}`}
                />
              ))}
            </div>
          </div>
          {notice ? (
            <p className="story-view__notice" role="status" data-testid="story-notice">
              {notice}
            </p>
          ) : null}
          {mine ? (
            <div className="story-view__row">
              <button
                type="button"
                className="story-view__pill story-view__pill--grow"
                onClick={() => void openViewers(story)}
                data-testid="story-views"
              >
                <Icon name="eye" size={18} />
                <span>{L.views(story.viewsCount ?? 0)}</span>
              </button>
              <span
                className="story-view__pill"
                role="img"
                aria-label={L.flameCount(story.reactionsCount ?? 0)}
                data-testid="story-flames-count"
              >
                <Icon name="fire" size={20} />
                <span>{story.reactionsCount ?? 0}</span>
              </span>
            </div>
          ) : (
            <form className="story-view__row" onSubmit={(e) => void send(e)}>
              {canReply ? (
                <label className="story-view__pill story-view__pill--grow">
                  <Icon name="bubble" size={18} />
                  <input
                    className="story-view__input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onFocus={() => setReplyFocused(true)}
                    onBlur={() => setReplyFocused(false)}
                    placeholder={L.replyTo(authorName)}
                    aria-label={L.replyTo(authorName)}
                    maxLength={500}
                    data-testid="story-reply-input"
                  />
                  {text.trim() ? (
                    <button
                      type="submit"
                      className="story-view__send"
                      disabled={sending.has(story.id)}
                      aria-label={sending.has(story.id) ? L.replySending : L.replySend}
                      data-testid="story-reply-send"
                    >
                      <Icon name="send" size={20} />
                    </button>
                  ) : null}
                </label>
              ) : (
                <span className="story-view__pill--grow" />
              )}
              <button
                type="button"
                className={
                  story.reacted
                    ? "story-view__pill story-view__pill--flame is-on"
                    : "story-view__pill story-view__pill--flame"
                }
                onClick={() => void flame()}
                aria-pressed={story.reacted}
                aria-label={story.reacted ? L.flameOn : L.flame}
                data-testid="story-flame"
              >
                <Icon name="fire" size={22} />
              </button>
            </form>
          )}
        </div>
      </div>

      <dialog
        ref={menuRef}
        className="mod-dialog"
        aria-label={L.menuTitle}
        onClose={() => setMenu(false)}
        data-testid="story-menu"
      >
        <div className="s-stack">
          <h2 className="s-h2">{L.menuTitle}</h2>
          {mine ? (
            <>
              <button
                type="button"
                className="story-menu__row"
                onClick={() => void openViewers(story)}
                data-testid="story-menu-views"
              >
                <Icon name="eye" size={20} />
                <span>
                  <strong>{L.views(story.viewsCount ?? 0)}</strong>
                </span>
              </button>
              {story.exportable ? (
                <a
                  className="story-menu__row"
                  href={`/api/stories/${story.id}/export?download=1`}
                  download
                  data-testid="story-menu-external"
                >
                  <Icon name="export" size={20} />
                  <span>
                    <strong>{shareLabels.menuExternal}</strong>
                    <small>{shareLabels.externalStoryFile}</small>
                  </span>
                </a>
              ) : null}
              <button
                type="button"
                className="story-menu__row"
                onClick={() => void remove()}
                data-testid="story-menu-delete"
              >
                <Icon name="trash" size={20} />
                <span>
                  <strong>{L.delete}</strong>
                  <small>{L.deleteHint}</small>
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="story-menu__row"
                onClick={() => void mute()}
                data-testid="story-menu-mute"
              >
                <Icon name="eyeOff" size={20} />
                <span>
                  <strong>{L.mute}</strong>
                  <small>{L.muteHint}</small>
                </span>
              </button>
              {iAmTagged ? (
                <button
                  type="button"
                  className="story-menu__row"
                  onClick={() => void removeTag()}
                  data-testid="story-menu-untag"
                >
                  <Icon name="profile" size={20} />
                  <span>
                    <strong>{L.removeTag}</strong>
                  </span>
                </button>
              ) : null}
              <div className="story-menu__report" data-testid="story-menu-report">
                <ReportDialog targetType="story" targetId={story.id} label={L.report} look="link" />
              </div>
            </>
          )}
          <Button variant="plate" icon="close" fullWidth onClick={() => setMenu(false)} data-testid="story-menu-close">
            {L.close}
          </Button>
        </div>
      </dialog>

      <dialog
        ref={viewersRef}
        className="mod-dialog"
        aria-label={L.viewsTitle}
        onClose={() => {
          viewersSeq.current++;
          setViewers(null);
        }}
        data-testid="story-viewers-dialog"
      >
        {viewers ? (
          <div className="s-stack">
            <h2 className="s-h2">{L.views(viewersTotalFor(viewers.story.viewsCount, viewers.data))}</h2>
            {viewersListPartial(viewersTotalFor(viewers.story.viewsCount, viewers.data)) ? (
              <p className="o-t-caption" data-testid="story-viewers-partial">
                {L.viewsPartial(STORY_VIEWERS_MAX)}
              </p>
            ) : null}
            {viewers.error ? (
              <p className="o-t-body" role="alert" data-testid="story-viewers-error">
                {viewers.error}
              </p>
            ) : viewers.data && viewers.data.viewers.length === 0 ? (
              <p className="o-t-body" data-testid="story-viewers-empty">
                {L.viewsEmpty}
              </p>
            ) : (
              <ul className="story-menu__list" data-testid="story-viewers">
                {(viewers.data?.viewers ?? []).map((v) => (
                  <li key={v.userId}>
                    <a
                      href={`/u/${encodeURIComponent(v.pseudo)}`}
                      className="story-menu__viewer"
                      data-testid={`story-viewer-${v.pseudo}`}
                    >
                      <Avatar url={v.avatarUrl} name={v.pseudo} crew={false} />
                      <strong>{v.pseudo}</strong>
                      <small>{feedAgo(v.viewedAt, now())}</small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {viewers.story.tags.length > 0 ? (
              <p className="o-t-caption" data-testid="story-viewers-tags">
                {L.tags} : {viewers.story.tags.map((x) => `@${x.name}`).join(" ")}
              </p>
            ) : null}
            <Button variant="plate" icon="close" fullWidth onClick={() => setViewers(null)}>
              {L.close}
            </Button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
