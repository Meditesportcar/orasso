// « Publier dans le crew » sur le site (lot R5c1, maquette R5.10, sans plaque ni carré : D36) : 1 à 6 photos, un mot,
// le véhicule et la sortie facultatifs ; ou un sondage. Une feuille (`<dialog>`) ouverte par le composeur du fil. Les
// photos partent une à une (`POST /api/me/uploads`, `purpose=crew_post`), puis la publication les rattache.
import { Button, Chip, Icon, TextField } from "@orasso/design-system/web";
import {
  CREW_POLL_OPTION_MAX,
  CREW_POLL_OPTIONS_MAX,
  CREW_POLL_OPTIONS_MIN,
  CREW_POLL_QUESTION_MAX,
  CREW_POST_PHOTOS_MAX,
  CREW_POST_TEXT_MAX,
  type CrewPostCreate,
  type CrewPostOptions,
  type CrewPostView,
  crewFeedLabels,
  type UploadResult,
} from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { now } from "../../lib/clock";

const END_CHOICES = [0, 1, 3, 7] as const;
type Mode = "photo" | "poll";
type Picked = { file: File; url: string; key: string | null };

async function uploadFile(file: File): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  const body = new FormData();
  body.append("purpose", "crew_post");
  body.append("file", file);
  try {
    const res = await fetch("/api/me/uploads", { method: "POST", body, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as (UploadResult & { error?: { message: string } }) | null;
    if (!res.ok || !json?.key) return { ok: false, message: json?.error?.message ?? "Envoi impossible. Réessaie." };
    return { ok: true, key: json.key };
  } catch {
    return { ok: false, message: "Connexion impossible. Réessaie." };
  }
}

export function PublishDialog({
  open,
  options,
  onClose,
  onPublished,
}: {
  open: boolean;
  options: CrewPostOptions | null;
  onClose: () => void;
  onPublished: (post: CrewPostView) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("photo");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [endDays, setEndDays] = useState<(typeof END_CHOICES)[number]>(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  // Les aperçus locaux sont libérés quand la photo est retirée, et tous en quittant la page.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => {
      for (const url of all) URL.revokeObjectURL(url);
    };
  }, []);
  const dropPhoto = (i: number) =>
    setPhotos((list) => {
      const gone = list[i];
      if (gone) {
        URL.revokeObjectURL(gone.url);
        previews.current.delete(gone.url);
      }
      return list.filter((_, j) => j !== i);
    });

  const filled = answers.map((a) => a.trim()).filter(Boolean);
  const missing =
    mode === "photo"
      ? photos.length === 0 && !text.trim()
        ? crewFeedLabels.missingPhotoOrText
        : null
      : !question.trim()
        ? crewFeedLabels.missingQuestion
        : filled.length < CREW_POLL_OPTIONS_MIN
          ? crewFeedLabels.missingOptions
          : null;

  function reset() {
    for (const p of photos) {
      URL.revokeObjectURL(p.url);
      previews.current.delete(p.url);
    }
    setPhotos([]);
    setText("");
    setVehicleId(null);
    setEventId(null);
    setQuestion("");
    setAnswers(["", ""]);
    setEndDays(0);
    setError(null);
    setMode("photo");
  }

  async function publish() {
    if (!options || missing) return;
    setBusy(true);
    setError(null);
    let body: CrewPostCreate;
    if (mode === "poll") {
      body = {
        kind: "poll",
        poll: {
          question: question.trim(),
          options: filled,
          endsAt: endDays ? new Date(now().getTime() + endDays * 86_400_000).toISOString() : null,
        },
      };
    } else if (photos.length) {
      const sent = [...photos];
      for (const [i, p] of sent.entries()) {
        if (p.key) continue;
        setProgress(crewFeedLabels.sending(i + 1, sent.length));
        const up = await uploadFile(p.file);
        if (!up.ok) {
          setBusy(false);
          setProgress(null);
          setError(up.message);
          setPhotos(sent);
          return;
        }
        sent[i] = { ...p, key: up.key };
      }
      setPhotos(sent);
      body = {
        kind: "photo",
        text: text.trim() || null,
        photoKeys: sent.map((p) => p.key as string),
        vehicleId,
        eventId,
      };
    } else {
      body = { kind: "text", text: text.trim(), vehicleId, eventId };
    }
    setProgress(null);
    const res = await apiFetch<CrewPostView>(`/crews/${options.crew.id}/posts`, { method: "POST", json: body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    reset();
    onPublished(res.data);
  }

  return (
    <dialog ref={ref} className="cf-sheet" aria-labelledby={titleId} onClose={onClose} data-testid="crew-publish">
      <div className="cf-sheet__body">
        <div className="cf-sheet__head">
          <h2 id={titleId} className="s-h2">
            {crewFeedLabels.publishTitle}
          </h2>
          <Button variant="close" label="Fermer" onClick={() => ref.current?.close()} />
        </div>
        <div className="cf-chips" role="tablist">
          {(["photo", "poll"] as const).map((m) => (
            <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
              {m === "photo" ? crewFeedLabels.publishPhoto : crewFeedLabels.publishPoll}
            </Chip>
          ))}
        </div>

        {mode === "photo" ? (
          <>
            <div className="cf-pub-grid">
              {photos.map((p, i) => (
                <div key={p.url} className="cf-pub-tile" data-testid="crew-publish-photo">
                  <img src={p.url} alt="" />
                  <button type="button" aria-label={crewFeedLabels.removePhoto} onClick={() => dropPhoto(i)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              {photos.length < CREW_POST_PHOTOS_MAX && (
                <label className="cf-pub-add" data-testid="crew-publish-add">
                  <Icon name="add" size={22} />
                  <span>{crewFeedLabels.addPhoto}</span>
                  <small>{crewFeedLabels.photosCount(photos.length)}</small>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    data-testid="crew-publish-file"
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])].slice(0, CREW_POST_PHOTOS_MAX - photos.length);
                      setPhotos((list) => [
                        ...list,
                        ...files.map((file) => {
                          const url = URL.createObjectURL(file);
                          previews.current.add(url);
                          return { file, url, key: null };
                        }),
                      ]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <p className="cf-note">
              <Icon name="lock" size={16} />
              <span className="o-t-caption">{crewFeedLabels.photosNote}</span>
            </p>
            <label className="s-label o-t-label" htmlFor={`${titleId}-word`}>
              {crewFeedLabels.word}
            </label>
            <textarea
              id={`${titleId}-word`}
              className="s-textarea"
              rows={3}
              maxLength={CREW_POST_TEXT_MAX}
              placeholder={crewFeedLabels.wordPlaceholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="crew-publish-text"
            />
            {options && options.vehicles.length > 0 && (
              <>
                <span className="s-label o-t-label">
                  {crewFeedLabels.withVehicle} <span className="s-muted">{crewFeedLabels.optional}</span>
                </span>
                <div className="cf-chips">
                  {options.vehicles.map((x) => (
                    <Chip
                      key={x.id}
                      selected={vehicleId === x.id}
                      onClick={() => setVehicleId(vehicleId === x.id ? null : x.id)}
                    >
                      {x.label}
                    </Chip>
                  ))}
                </div>
              </>
            )}
            {options && options.events.length > 0 && (
              <>
                <span className="s-label o-t-label">
                  {crewFeedLabels.forEvent} <span className="s-muted">{crewFeedLabels.optional}</span>
                </span>
                <div className="cf-chips">
                  {options.events.map((x) => (
                    <Chip
                      key={x.id}
                      selected={eventId === x.id}
                      onClick={() => setEventId(eventId === x.id ? null : x.id)}
                    >
                      {x.title}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <TextField
              label={crewFeedLabels.pollQuestion}
              value={question}
              maxLength={CREW_POLL_QUESTION_MAX}
              placeholder={crewFeedLabels.pollQuestionPlaceholder}
              onChange={(e) => setQuestion(e.target.value)}
              data-testid="crew-poll-question"
            />
            <span className="s-label o-t-label">{crewFeedLabels.pollOptions}</span>
            {answers.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: les réponses sont des champs à leur place.
              <div key={i} className="cf-answer">
                <TextField
                  label={crewFeedLabels.pollOption(i + 1)}
                  value={a}
                  maxLength={CREW_POLL_OPTION_MAX}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAnswers((list) => list.map((x, j) => (j === i ? value : x)));
                  }}
                  data-testid="crew-poll-answer"
                />
                {answers.length > CREW_POLL_OPTIONS_MIN && (
                  <Button
                    variant="secondary"
                    icon="trash"
                    aria-label={crewFeedLabels.pollRemoveOption(i + 1)}
                    onClick={() => setAnswers((list) => list.filter((_, j) => j !== i))}
                  />
                )}
              </div>
            ))}
            {answers.length < CREW_POLL_OPTIONS_MAX && (
              <Button variant="secondary" icon="add" onClick={() => setAnswers((list) => [...list, ""])}>
                {crewFeedLabels.pollAddOption}
              </Button>
            )}
            <span className="s-label o-t-label">
              {crewFeedLabels.pollEnd} <span className="s-muted">{crewFeedLabels.optional}</span>
            </span>
            <div className="cf-chips">
              {END_CHOICES.map((d) => (
                <Chip key={d} selected={endDays === d} onClick={() => setEndDays(d)}>
                  {d === 0 ? crewFeedLabels.pollNoEnd : crewFeedLabels.pollEndIn(d)}
                </Chip>
              ))}
            </div>
            <p className="o-t-caption s-muted">{crewFeedLabels.pollHint}</p>
          </>
        )}

        <div className="cf-vis" data-testid="crew-publish-visibility">
          <Icon name="lock" size={20} />
          <div>
            <b>{crewFeedLabels.visibleTo(options?.crew.membersCount ?? 0)}</b>
            <small>{crewFeedLabels.visibleHint}</small>
          </div>
        </div>
        {error && (
          <p className="s-error" role="alert">
            {error}
          </p>
        )}
        {(missing || progress) && (
          <p className="o-t-caption s-muted" data-testid="crew-publish-missing">
            {missing ?? progress}
          </p>
        )}
        <Button
          icon="upload"
          disabled={busy || Boolean(missing) || !options}
          loading={busy}
          onClick={() => void publish()}
          data-testid="crew-publish-send"
        >
          {crewFeedLabels.publish}
        </Button>
      </div>
    </dialog>
  );
}
