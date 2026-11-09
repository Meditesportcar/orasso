// « Partager en story » sur le site (lot R7f4, parité de l'appli, maquette R7.23) : la carte d'un contenu d'Orasso sur un fond
// 9:16 aux couleurs du contenu, à déplacer à la souris et à agrandir à la molette ; légende et public, puis « Publier pour
// 24 h ». Le fond et la carte sont rendus par l'API (`GET /api/me/share/card`) : un seul rendu, le serveur refait la même
// composition avec le cadrage choisi (`POST /api/me/stories` avec `linked` et `frame`, sans média).
import { Button, Icon } from "@orasso/design-system/web";
import {
  canvasPerView,
  type Frame,
  shareLabels as L,
  moveFrame,
  type ShareInfo,
  STORY_CAPTION_MAX,
  STORY_H,
  STORY_W,
  type StoryAudienceOption,
  type StoryLinkType,
  storyAudienceOptions,
} from "@orasso/shared";
import { useMemo, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import "../../styles/share.css";

const CARD_W = 1080;
const CARD_H = 1350;
const REST: Frame = { scale: 1, offsetX: 0, offsetY: 0 };
const VIEW_W = 288;

const cardUrl = (type: StoryLinkType, id: string, part: "card" | "ground") =>
  `/api/me/share/card?type=${type}&id=${encodeURIComponent(id)}&part=${part}`;

export function ShareComposer({
  type,
  id,
  info,
  infoError,
  visibility,
  crews,
}: {
  type: StoryLinkType;
  id: string;
  info: ShareInfo | null;
  infoError: string | null;
  visibility: "public" | "private";
  crews: { id: string; name: string; membersCount: number }[];
}) {
  const options: StoryAudienceOption[] = useMemo(
    () =>
      storyAudienceOptions(
        { persona: "fan" },
        visibility,
        crews.map((x) => ({ id: x.id, name: x.name, members: x.membersCount })),
      ),
    [visibility, crews],
  );
  const [key, setKey] = useState("");
  const chosen = options.find((o) => o.key === key) ?? options[0];
  const [caption, setCaption] = useState("");
  const [frame, setFrame] = useState<Frame>(REST);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID()).current;
  const drag = useRef<{ x: number; y: number; start: Frame } | null>(null);
  const live = useRef<Frame>(REST);
  live.current = frame;

  const k = VIEW_W / STORY_W;
  const viewH = Math.round((VIEW_W * STORY_H) / STORY_W);
  const cpv = canvasPerView(VIEW_W);
  const closed = info && !info.destinations.story;
  const eventLine =
    info?.type === "event"
      ? chosen?.audience === "crew" || visibility === "private"
        ? L.organizerNotNotified
        : L.organizerNotified
      : null;

  const publish = async () => {
    if (!info || !chosen) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ id: string }>("/me/stories", {
      method: "POST",
      json: {
        linked: { type: info.type, id: info.id },
        clientId,
        audience: chosen.audience,
        ...(chosen.crewId ? { crewId: chosen.crewId } : {}),
        persona: "fan",
        caption: caption.trim() || null,
        frame: live.current,
      },
    });
    if (res.ok) window.location.assign("/app/fil");
    else {
      setError(res.error.message);
      setBusy(false);
    }
  };

  return (
    <div className="share-compose" data-testid="share-story-composer">
      <div className="s-stack s-stack--tight">
        <div
          className="share-stage"
          style={{ width: VIEW_W, height: viewH }}
          role="img"
          aria-label={L.composeHint}
          data-testid="share-story-stage"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, start: live.current };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setFrame(moveFrame(d.start, 1, (e.clientX - d.x) * cpv, (e.clientY - d.y) * cpv, CARD_W, CARD_H));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(e) => {
            setFrame(moveFrame(live.current, e.deltaY < 0 ? 1.1 : 1 / 1.1, 0, 0, CARD_W, CARD_H));
          }}
        >
          {info && !closed ? (
            <>
              <img className="share-stage__ground" src={cardUrl(type, id, "ground")} alt="" />
              <img
                src={cardUrl(type, id, "card")}
                alt={info.title}
                data-testid="share-story-card"
                style={{
                  left: 0,
                  top: (viewH - CARD_H * k) / 2,
                  width: CARD_W * k,
                  height: CARD_H * k,
                  transform: `translate(${frame.offsetX * k}px, ${frame.offsetY * k}px) scale(${frame.scale})`,
                }}
              />
              <div className="share-stage__link">
                <span className="share-stage__pill" data-testid="share-story-link">
                  <Icon
                    name={type === "vehicle" ? "vehicle" : type === "vote_result" ? "trophy" : "ticket"}
                    size={16}
                  />
                  {info.linkLabel}
                </span>
              </div>
            </>
          ) : null}
        </div>
        <p className="o-t-caption s-muted" data-testid="share-story-hint">
          <Icon name="hand" size={14} /> {L.composeHint}
        </p>
      </div>
      <div className="share-compose__form">
        {infoError ? <p className="s-notice s-notice--error">{infoError}</p> : null}
        {closed ? (
          <p className="s-notice s-notice--error" data-testid="share-story-closed">
            {info?.reasons.story ?? L.errors.unsupported}
          </p>
        ) : null}
        <label className="s-field">
          <span className="o-t-label">{L.caption}</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={STORY_CAPTION_MAX}
            placeholder={L.captionPlaceholder}
            disabled={busy}
            data-testid="share-story-caption"
          />
        </label>
        <p className="o-t-label s-muted">QUI LA VOIT</p>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={chosen?.key === o.key ? "share-opt is-primary" : "share-opt"}
            disabled={busy || options.length === 1}
            aria-pressed={chosen?.key === o.key}
            onClick={() => setKey(o.key)}
            data-testid={`share-story-audience-${o.audience}`}
          >
            <Icon name={o.audience === "crew" ? "shield" : o.audience === "public" ? "explore" : "profile"} size={22} />
            <span>
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
          </button>
        ))}
        {eventLine ? (
          <p className="o-t-caption s-muted" data-testid="share-story-organizer">
            {eventLine}
          </p>
        ) : null}
        {error ? (
          <p className="s-notice s-notice--error" data-testid="share-story-publish-error">
            {error}
          </p>
        ) : null}
        <Button
          variant="primary"
          icon="send"
          disabled={busy || !info || Boolean(closed) || !chosen}
          onClick={() => void publish()}
          data-testid="share-story-publish"
        >
          {busy ? L.publishing : L.publish}
        </Button>
      </div>
    </div>
  );
}
