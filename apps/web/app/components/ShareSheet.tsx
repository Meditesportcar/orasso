// La feuille « Partager » du site (lot R7f4, parité de l'appli, maquettes R7.23 et R7.24) : quatre destinations, En story (la page
// de composition `/app/story/partager`), Dans le Fil (carte 4:5, légende facultative), En message (le lien dans une conversation)
// et Vers l'extérieur (téléchargement du fichier rendu par l'API : plaques floutées, signature « orasso.fr »). Aucune règle ici :
// l'API dit ce qui est ouvert et pourquoi une destination est fermée (`GET /api/me/share/info`).
import { Button, Icon } from "@orasso/design-system/web";
import {
  addShareTargets,
  type ConversationPage,
  type ConversationSummary,
  shareLabels as L,
  noShareTargets,
  retryIds,
  type ShareFileFormat,
  type ShareInfo,
  STORY_CAPTION_MAX,
  type StoryLinkType,
  shareTargetsEmpty,
} from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";

import { apiFetch } from "../lib/api.client";
import "../styles/share.css";

export type ShareTarget = { type: StoryLinkType; id: string } | { story: string; mediaKind: "photo" | "video" };
type Step = "choose" | "feed" | "message" | "external";

const isContent = (t: ShareTarget): t is { type: StoryLinkType; id: string } => "type" in t;
const uuid = () => crypto.randomUUID();

/** Le bouton « Partager » et sa fenêtre. `label` : texte du bouton (« Partager », « Vers l'extérieur »…). */
export function ShareDialog({
  target,
  label = L.title,
  look = "secondary",
  testId = "share-open",
  onPoster,
}: {
  target: ShareTarget;
  label?: string;
  look?: "secondary";
  testId?: string;
  /** Voiture : « Vers l'extérieur » mène à l'affiche à trois styles (la fiche du véhicule). */
  onPoster?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <>
      <Button variant={look} icon="share" onClick={() => setOpen(true)} data-testid={testId}>
        {label}
      </Button>
      <dialog
        ref={ref}
        className="mod-dialog share-dialog"
        aria-label={L.title}
        onClose={() => setOpen(false)}
        data-testid="share-dialog"
      >
        {open ? <ShareBody target={target} onClose={() => setOpen(false)} onPoster={onPoster} /> : null}
      </dialog>
    </>
  );
}

function Head({ title, onClose, onBack }: { title: string; onClose: () => void; onBack?: () => void }) {
  const id = useId();
  return (
    <div className="share-head">
      {onBack ? (
        <button type="button" className="share-x" onClick={onBack} aria-label="Retour" data-testid="share-back">
          <Icon name="back" size={18} />
        </button>
      ) : null}
      <h2 className="s-h2 share-title" id={id}>
        {title}
      </h2>
      <button type="button" className="share-x" onClick={onClose} aria-label={L.close} data-testid="share-close">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function Row({
  icon,
  title,
  hint,
  disabled,
  reason,
  primary,
  onClick,
  dest,
}: {
  icon: "smartphone" | "feed" | "chat" | "export";
  title: string;
  hint: string;
  disabled?: boolean;
  reason?: string;
  primary?: boolean;
  onClick: () => void;
  dest: string;
}) {
  return (
    <div className="share-row">
      <button
        type="button"
        className={primary ? "share-opt is-primary" : "share-opt"}
        disabled={disabled}
        onClick={onClick}
        data-testid={`share-dest-${dest}`}
      >
        <Icon name={icon} size={22} />
        <span>
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
      </button>
      {disabled && reason ? (
        <p className="o-t-caption s-muted" data-testid={`share-reason-${dest}`}>
          {reason}
        </p>
      ) : null}
    </div>
  );
}

export function ShareBody({
  target,
  onClose,
  onPoster,
}: {
  target: ShareTarget;
  onClose: () => void;
  onPoster?: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const content = isContent(target);
  const key = content ? `${target.type}:${target.id}` : target.story;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume la cible.
  useEffect(() => {
    if (!content) return;
    let alive = true;
    setInfo(null);
    setError(null);
    void apiFetch<ShareInfo>(`/me/share/info?type=${target.type}&id=${encodeURIComponent(target.id)}`).then((r) => {
      if (!alive) return;
      if (r.ok) setInfo(r.data);
      else setError(r.error.message);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!content) {
    return (
      <External
        title={L.menuExternal}
        story={{ id: target.story, mediaKind: target.mediaKind }}
        formats={[]}
        onClose={onClose}
      />
    );
  }
  if (error) {
    return (
      <div className="s-stack" data-testid="share-error">
        <Head title={L.title} onClose={onClose} />
        <p className="s-notice s-notice--error">{error}</p>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="s-stack">
        <Head title={L.title} onClose={onClose} />
        <p className="s-muted">Chargement…</p>
      </div>
    );
  }
  if (step === "feed") return <ToFeed info={info} onBack={() => setStep("choose")} onClose={onClose} />;
  if (step === "message") return <ToMessage info={info} onBack={() => setStep("choose")} onClose={onClose} />;
  if (step === "external") {
    return (
      <External
        title={info.title || L.external}
        content={{ type: info.type, id: info.id }}
        formats={info.formats}
        onBack={() => setStep("choose")}
        onClose={onClose}
      />
    );
  }
  const d = info.destinations;
  return (
    <div className="s-stack" data-testid="share-sheet">
      <Head title={L.title} onClose={onClose} />
      <div className="share-card">
        {info.imageUrl ? <img src={info.imageUrl} alt="" className="share-thumb" /> : null}
        <div>
          <strong data-testid="share-title">{info.title}</strong>
          <p className="o-t-caption s-muted">{info.subtitle}</p>
        </div>
      </div>
      <p className="o-t-label s-muted">{L.sectionTitle.toUpperCase()}</p>
      <Row
        icon="smartphone"
        title={L.story}
        hint={L.storyHint(info.linkLabel)}
        disabled={!d.story}
        reason={info.reasons.story}
        primary={d.story}
        dest="story"
        onClick={() => {
          window.location.assign(`/app/story/partager?type=${info.type}&id=${encodeURIComponent(info.id)}`);
        }}
      />
      <Row
        icon="feed"
        title={L.feed}
        hint={L.feedHint}
        disabled={!d.feed}
        reason={info.reasons.feed}
        dest="feed"
        onClick={() => setStep("feed")}
      />
      <Row
        icon="chat"
        title={L.message}
        hint={L.messageHint}
        disabled={!d.message}
        reason={info.reasons.message}
        dest="message"
        onClick={() => setStep("message")}
      />
      <Row
        icon="export"
        title={L.external}
        hint={L.externalHint}
        disabled={!d.external}
        reason={info.reasons.external}
        dest="external"
        onClick={() => {
          if (info.type === "vehicle" && onPoster) {
            onClose();
            onPoster();
          } else setStep("external");
        }}
      />
    </div>
  );
}

function ToFeed({ info, onBack, onClose }: { info: ShareInfo; onBack: () => void; onClose: () => void }) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const clientId = useRef(uuid()).current;
  const publish = async () => {
    setBusy(true);
    setError(null);
    const r = await apiFetch("/me/feed-posts", {
      method: "POST",
      json: {
        linked: { type: info.type === "vehicle" ? "vehicle" : "event", id: info.id },
        clientId,
        caption: caption.trim() || null,
      },
    });
    if (r.ok) setDone(true);
    else setError(r.error.message);
    setBusy(false);
  };
  return (
    <div className="s-stack" data-testid="share-feed">
      <Head title={L.feed} onClose={onClose} onBack={onBack} />
      {done ? (
        <p className="s-notice" data-testid="share-feed-done">
          {L.feedDone}
        </p>
      ) : (
        <>
          <p className="s-muted">{L.feedHint}</p>
          <label className="s-field">
            <span className="o-t-label">{L.caption}</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={STORY_CAPTION_MAX}
              placeholder={L.captionPlaceholder}
              data-testid="share-feed-caption"
            />
          </label>
          {error ? <p className="s-notice s-notice--error">{error}</p> : null}
          <Button
            variant="primary"
            icon="send"
            disabled={busy}
            onClick={() => void publish()}
            data-testid="share-feed-publish"
          >
            {busy ? L.feedPublishing : "Publier dans le Fil"}
          </Button>
        </>
      )}
    </div>
  );
}

function ToMessage({ info, onBack, onClose }: { info: ShareInfo; onBack: () => void; onClose: () => void }) {
  // Les conversations se lisent page par page (« Voir plus ») : « Aucune conversation » seulement si tout est lu et vide.
  const [targets, setTargets] = useState(noShareTargets);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Un identifiant par conversation, gardé tant que l'envoi n'a pas abouti : une réponse perdue puis une reprise ne
  // créent pas deux messages.
  const ids = useRef(retryIds(uuid)).current;
  const read = async (cursor?: string) => {
    setReading(true);
    setReadError(null);
    const r = await apiFetch<ConversationPage>(
      `/me/conversations?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (r.ok) setTargets((s) => addShareTargets(cursor ? s : noShareTargets, r.data));
    else setReadError(r.error.message);
    setReading(false);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: première page à l'ouverture seulement.
  useEffect(() => {
    void read();
  }, []);
  // Aucune conversation admissible sur les pages lues et d'autres à lire : on poursuit (dix pages au plus), sans attendre un
  // appui sur « Voir plus » devant une liste vide.
  const autoPages = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` change à chaque rendu, seul l'état lu compte.
  useEffect(() => {
    if (targets.loaded && !targets.items.length && targets.next && !reading && !readError && autoPages.current < 10) {
      autoPages.current += 1;
      void read(targets.next);
    }
  }, [targets, reading, readError]);
  const items = targets.items;
  const send = async (conv: ConversationSummary) => {
    setBusy(true);
    setError(null);
    const r = await apiFetch(`/conversations/${conv.id}/messages`, {
      method: "POST",
      json: { clientId: ids.get(conv.id), body: L.messageBody(info.title || L.title, info.url) },
    });
    if (r.ok) {
      ids.done(conv.id);
      setSent(conv.title);
    } else setError(r.error.message);
    setBusy(false);
  };
  return (
    <div className="s-stack" data-testid="share-message">
      <Head title={L.messageTitle} onClose={onClose} onBack={onBack} />
      {sent ? (
        <p className="s-notice" data-testid="share-message-done">{`${L.messageSent} (${sent})`}</p>
      ) : (
        <>
          {reading && !targets.loaded ? <p className="s-muted">Chargement…</p> : null}
          {shareTargetsEmpty(targets) ? <p className="s-muted">{L.messageEmpty}</p> : null}
          {readError ? <p className="s-notice s-notice--error">{readError}</p> : null}
          {error ? <p className="s-notice s-notice--error">{error}</p> : null}
          {items.map((conv) => (
            <button
              key={conv.id}
              type="button"
              className="share-opt"
              disabled={busy}
              onClick={() => void send(conv)}
              data-testid={`share-conv-${conv.id}`}
            >
              <Icon name={conv.kind === "crew" ? "crew" : "profile"} size={20} />
              <span>
                <strong>{conv.title}</strong>
              </span>
            </button>
          ))}
          {targets.next || readError ? (
            <Button
              variant="secondary"
              icon={readError ? "undo" : "next"}
              disabled={reading}
              onClick={() => void read(targets.next ?? undefined)}
              data-testid="share-conv-more"
            >
              {readError ? "Réessayer" : reading ? "Chargement…" : L.messageMore}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function External({
  title,
  content,
  story,
  formats,
  onBack,
  onClose,
}: {
  title: string;
  content?: { type: StoryLinkType; id: string };
  story?: { id: string; mediaKind: "photo" | "video" };
  formats: ShareFileFormat[];
  onBack?: () => void;
  onClose: () => void;
}) {
  const files: { key: string; label: string; file: string; href: string }[] = story
    ? [
        {
          key: "story",
          label: L.externalStory,
          file: story.mediaKind === "video" ? "Vidéo telle que publiée" : L.externalStoryFile,
          href: `/api/stories/${story.id}/export?download=1`,
        },
      ]
    : content
      ? content.type === "feed_post"
        ? [
            {
              key: "post",
              label: L.externalPost,
              file: L.externalPostFile,
              href: `/api/feed-posts/${content.id}/export?download=1`,
            },
          ]
        : formats.map((f) => ({
            key: f,
            label: f === "story" ? L.externalStory : L.externalPost,
            file: f === "story" ? L.externalStoryFile : L.externalPostFile,
            href: `/api/me/share/export?type=${content.type}&id=${encodeURIComponent(content.id)}&format=${f}&download=1`,
          }))
      : [];
  return (
    <div className="s-stack" data-testid="share-external">
      <Head title={title} onClose={onClose} onBack={onBack} />
      <p className="s-muted">{L.externalDownload}</p>
      {files.map((f) => (
        <a key={f.key} className="share-opt" href={f.href} download data-testid={`share-file-${f.key}`}>
          <Icon name="export" size={22} />
          <span>
            <strong>{f.label}</strong>
            <small>{f.file}</small>
          </span>
        </a>
      ))}
      <p className="o-t-caption s-muted">{L.externalNote1}</p>
      <p className="o-t-caption s-muted">{L.externalNote2}</p>
    </div>
  );
}
