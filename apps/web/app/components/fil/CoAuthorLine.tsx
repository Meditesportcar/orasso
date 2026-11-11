// La ligne « Publier avec… » du formulaire « Publier » du site (lot R8o, maquette R8.13 `p-collab`) : mêmes mots et même logique que
// l'appli (`features/fil/publish/CoAuthorLine.tsx`). Inviter un co-auteur : une personne, une structure, un pro, un média. Choisi,
// la ligne dit qu'il est invité et que la publication est seulement chez moi tant qu'il n'a pas accepté.
import { Icon } from "@orasso/design-system/web";
import {
  COAUTHOR_SEARCH_MIN_CHARS,
  type CoAuthorSearchItem,
  type CoAuthorSearchPage,
  type CoauthorKind,
  coauthorKindChip,
  coauthorKinds,
  coauthorLabels as T,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import "../../styles/fil.css";
import "../../styles/fil-publish.css";
import "../../styles/coauthors.css";
import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";

const ICON: Record<CoauthorKind, "profile" | "home" | "briefcase" | "camera"> = {
  user: "profile",
  structure: "home",
  pro: "briefcase",
  media: "camera",
};

function Picker({ onPick, disabled }: { onPick: (item: CoAuthorSearchItem) => void; disabled: boolean }) {
  const [kind, setKind] = useState<CoauthorKind | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoAuthorSearchItem[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.trim();

  // 300 ms après la dernière lettre ; une réponse arrivée après un autre texte ou un autre genre est jetée.
  useEffect(() => {
    if ([...text].length < COAUTHOR_SEARCH_MIN_CHARS) {
      setResults(null);
      setState("idle");
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setState("loading");
      const params = new URLSearchParams({ q: text, ...(kind ? { kind } : {}) });
      const res = await apiFetch<CoAuthorSearchPage>(`/me/feed-posts/coauthor-search?${params.toString()}`);
      if (stale) return;
      if (res.ok) {
        setResults(res.data.items);
        setState("idle");
      } else setState("error");
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text, kind]);

  return (
    <div className="s-stack s-stack--tight" data-testid="coauthor-picker">
      <div className="fil-chips" data-testid="coauthor-kinds">
        {coauthorKinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            className={kind === k ? "fil-chip is-on" : "fil-chip"}
            disabled={disabled}
            onClick={() => setKind((cur) => (cur === k ? null : k))}
            data-testid={`coauthor-kind-${k}`}
          >
            <Icon name={ICON[k]} size={14} /> {coauthorKindChip(k)}
          </button>
        ))}
      </div>
      <label className="s-field">
        <span className="o-t-label">{T.pickSearch}</span>
        <input
          type="search"
          value={q}
          disabled={disabled}
          placeholder={T.pickSearchHint}
          autoComplete="off"
          onChange={(e) => setQ(e.currentTarget.value)}
          data-testid="coauthor-input"
        />
      </label>
      {state === "loading" ? (
        <p className="o-t-caption" role="status" data-testid="coauthor-loading">
          {T.pickLoading}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="s-error" role="alert" data-testid="coauthor-error">
          {T.pickFailed}
        </p>
      ) : null}
      {results && state === "idle" && results.length === 0 ? (
        <p className="o-t-caption" data-testid="coauthor-none">
          {T.pickNone}
        </p>
      ) : null}
      {(results ?? []).map((item) => (
        <button
          key={item.key}
          type="button"
          className="fp-opt"
          disabled={disabled}
          onClick={() => onPick(item)}
          data-testid="coauthor-result"
        >
          {item.avatarUrl ? (
            <PersonAvatar url={item.avatarUrl} pseudo={item.name} size={32} />
          ) : (
            <Icon name={ICON[item.kind]} size={22} />
          )}
          <span>
            <b>{item.name}</b>
            <small>
              {item.partner ? `${coauthorKindChip(item.kind)} · ${T.partnerTag}` : coauthorKindChip(item.kind)}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function CoAuthorLine({
  value,
  onChange,
  disabled,
}: {
  value: CoAuthorSearchItem | null;
  onChange: (item: CoAuthorSearchItem | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sub = value ? (value.partner ? T.linePickedPartner(value.name) : T.linePicked(value.name)) : T.lineHint;
  return (
    <div className="s-stack s-stack--tight" data-testid="coauthor-line">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${T.lineTitle} ${sub}`}
        className={value ? "fp-opt fp-opt--box is-on" : "fp-opt fp-opt--box"}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        data-testid="coauthor-toggle"
      >
        <Icon name="crew" size={22} />
        <span>
          <b>{T.lineTitle}</b>
          <small data-testid="coauthor-sub">{sub}</small>
        </span>
        <span className="fp-box" aria-hidden="true">
          {value ? <Icon name="check" size={16} /> : null}
        </span>
      </button>
      {open ? (
        <>
          <Picker
            disabled={disabled}
            onPick={(item) => {
              onChange(item);
              setOpen(false);
            }}
          />
          {value ? (
            <button
              type="button"
              className="fil-link"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              data-testid="coauthor-clear"
            >
              <Icon name="close" size={16} /> {T.pickClear}
            </button>
          ) : null}
        </>
      ) : null}
      {value ? (
        <>
          <p className="fp-note" data-testid="coauthor-banner">
            <Icon name="info" size={16} />
            <span>
              <strong>{T.banner.lead(value.name)}</strong>
              {T.banner.rest}
            </span>
          </p>
          {value.partner ? (
            <p className="o-t-caption" data-testid="coauthor-partner">
              {T.partnerNote(value.name)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
