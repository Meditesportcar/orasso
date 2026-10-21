// Temps 7 (`s-create` data-cs 6) : « Ton affiche » — photo (`POST /me/uploads purpose=event_poster_photo`), Post 4:5 /
// Story 9:16, rail des huit styles (vignettes rendues par `POST /posters/preview`), aperçu en direct (débounce 300 ms,
// 540 px), titre de 34 caractères au plus, affiche perso en plus. L'affiche est rendue par l'API à l'enregistrement.
import { Chip, ChipRow, Icon, TextField } from "@orasso/design-system/web";
import {
  draftStart,
  POSTER_DEFAULT_STYLE,
  POSTER_TITLE_MAX,
  type PosterFormat,
  type PosterSettings,
  type PosterStyle,
  posterStyleLabels,
  posterStyles,
  posterTexts,
  wizardV2Labels as W,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import type { StepProps } from "./types";

type Ctx = { structureId: string; structureName: string };

/** Rend un aperçu (PNG) et donne son adresse locale, ou `null` si l'API refuse. */
async function renderPreview(
  poster: PosterSettings,
  d: StepProps["d"],
  ctx: Ctx,
  format: PosterFormat,
  width: number,
): Promise<string | null> {
  const date = draftStart(d) ?? new Date().toISOString();
  const res = await fetch("/api/posters/preview", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...poster,
      title: poster.title.trim() || d.title.trim().slice(0, POSTER_TITLE_MAX) || "—",
      date,
      place: d.city.slice(0, 80),
      structureName: ctx.structureName,
      structureId: ctx.structureId,
      format,
      width,
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  return URL.createObjectURL(await res.blob());
}

export function PosterStep({
  d,
  set,
  setD,
  structureId,
  structureName,
  photoUrl,
  ownPoster,
  setOwnPoster,
}: StepProps & {
  structureId: string;
  structureName: string;
  /** Photo déjà enregistrée (modification). */
  photoUrl: string | null;
  ownPoster: File | null;
  setOwnPoster: (file: File | null) => void;
}) {
  const ctx = { structureId, structureName };
  const poster: PosterSettings = d.poster ?? {
    photoKey: null,
    style: POSTER_DEFAULT_STYLE,
    title: d.title.trim().slice(0, POSTER_TITLE_MAX),
  };
  // Le temps de l'affiche pose ses réglages : l'affiche sera rendue à l'enregistrement.
  useEffect(() => {
    if (!d.poster) set("poster", poster);
  });
  // Toujours sur le dernier état (une photo qui finit de s'envoyer ne remet pas l'ancien style).
  const patch = (change: Partial<PosterSettings>) =>
    setD((p) => ({ ...p, poster: { ...(p.poster ?? poster), ...change } }));
  const [format, setFormat] = useState<PosterFormat>("post");
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Partial<Record<PosterStyle, string>>>({});
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState<string | null>(photoUrl);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );
  const keep = (u: string | null) => {
    if (u) urls.current.push(u);
    return u;
  };

  // Aperçu en direct : 300 ms après la dernière saisie.
  const key = `${poster.photoKey}|${poster.style}|${poster.title}|${format}|${d.startsAt}|${d.city}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume ce qui change l'aperçu.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void renderPreview(poster, d, ctx, format, 540).then((u) => {
        if (alive) setPreview(keep(u));
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  // Vignettes du rail : refaites quand la photo ou le format change (pas à chaque lettre du titre : limite de l'API).
  // biome-ignore lint/correctness/useExhaustiveDependencies: la photo et le format suffisent.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        for (const style of posterStyles) {
          const u = await renderPreview({ ...poster, style }, d, ctx, format, 180);
          if (!alive) return;
          setThumbs((t) => ({ ...t, [style]: keep(u) ?? undefined }));
        }
      })();
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [poster.photoKey, format]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("purpose", "event_poster_photo");
    form.set("file", file);
    const res = await fetch("/api/me/uploads", { method: "POST", body: form, credentials: "same-origin" }).catch(
      () => null,
    );
    setSending(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      return setError(body?.error?.message ?? "La photo n'a pas pu être envoyée.");
    }
    const { key: photoKey } = (await res.json()) as { key: string };
    setPhoto(keep(URL.createObjectURL(file)));
    patch({ photoKey });
  }

  return (
    <div className="wz-gen s-stack">
      <div className="wz-genhead">
        <span className="o-t-label s-label">{posterTexts.photo}</span>
        <ChipRow aria-label="Format">
          <Chip selected={format === "post"} onClick={() => setFormat("post")}>
            {posterTexts.post}
          </Chip>
          <Chip selected={format === "story"} onClick={() => setFormat("story")}>
            {posterTexts.story}
          </Chip>
        </ChipRow>
      </div>
      <div className="wz-phpick">
        {photo ? <img src={photo} alt="" className="is-on" /> : null}
        <label className="wz-phadd" data-testid="wizard-poster-photo">
          <Icon name="gallery" />
          <span>{sending ? W.posterSending : photo ? W.posterPhotoChange : W.posterPhotoPick}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void pickPhoto(e.currentTarget.files?.[0])}
          />
        </label>
      </div>
      {!poster.photoKey ? <p className="o-t-caption s-muted">{W.posterNoPhoto}</p> : null}
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={format === "story" ? "wz-genprev is-story" : "wz-genprev"}>
        {preview ? (
          <img src={preview} alt={W.posterPreviewAlt} data-testid="wizard-poster-preview" />
        ) : (
          <span className="wz-genprev__wait" />
        )}
      </div>
      <span className="o-t-label s-label">
        {posterTexts.style} · {posterTexts.stylesCount}
      </span>
      <div className="wz-tpls">
        {posterStyles.map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={poster.style === style}
            className={poster.style === style ? "wz-tpl is-on" : "wz-tpl"}
            onClick={() => patch({ style })}
            data-testid={`wizard-style-${style}`}
          >
            {thumbs[style] ? <img src={thumbs[style]} alt="" /> : <span className="wz-tpl__wait" />}
            <span>{posterStyleLabels[style]}</span>
          </button>
        ))}
      </div>
      <TextField
        label={W.posterTitleField}
        name="posterTitle"
        maxLength={POSTER_TITLE_MAX}
        value={poster.title}
        onChange={(e) => patch({ title: e.currentTarget.value })}
        help={`${poster.title.length} / ${POSTER_TITLE_MAX}`}
      />
      <label className="wz-own" data-testid="wizard-own-poster">
        <Icon name="add" />
        <span>
          <b>{W.posterOwnTitle}</b>
          <span className="o-t-caption s-muted">{ownPoster ? W.posterOwnChosen(ownPoster.name) : W.posterOwnHint}</span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setOwnPoster(e.currentTarget.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
