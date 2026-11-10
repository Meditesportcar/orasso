// La ligne « Collaboration commerciale » des formulaires de publication du site, pour une story (`PublishForm` des stories) et
// pour une publication du Fil (lot R7m2, maquette R7.21 `pc_pub`). Même logique que l'appli, mêmes mots (`@orasso/shared`) :
//   - un partenaire actif cité dans la légende (`@wrap-66`) : la ligne « Collaboration commerciale · Wrap 66 » est là, NON
//     décochable, avec la note de la loi du 9 juin 2023 ; l'API pose la mention, l'écran l'annonce ;
//   - sinon, « Poser "Collaboration commerciale" moi-même » : on choisit un pro parmi les fiches publiées (`GET /pros?q=`).
import { Icon } from "@orasso/design-system/web";
import {
  type CommercialDraft,
  type CommercialLineState,
  type CommercialPartnerNamed,
  commercialLineState,
  partnershipLabels as L,
  type MyPartnerships,
  type Page,
  type ProCard,
  type ProPublic,
} from "@orasso/shared";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api.client";

/** Mes partenaires actifs et l'état de la ligne d'après la légende ; la liste reste vide tant que la lecture n'a pas répondu. */
export function useCommercialLine(caption: string, draft: CommercialDraft): CommercialLineState {
  const [partners, setPartners] = useState<CommercialPartnerNamed[]>([]);
  useEffect(() => {
    let alive = true;
    void apiFetch<MyPartnerships>("/me/partnerships").then((res) => {
      if (!alive || !res.ok) return;
      setPartners(res.data.items.map((i) => ({ proId: i.pro.proId, slug: i.pro.slug, name: i.pro.name })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => commercialLineState(partners, [], caption, draft), [partners, caption, draft]);
}

/** « Collaboration commerciale · Wrap 66 » quand la mention sera posée (partenaire cité, ou pro choisi), sinon `null`. */
export function commercialText(line: CommercialLineState): string | null {
  if (line.kind === "required") return L.commercialLine(line.name);
  return line.on && line.pick ? L.commercialLine(line.pick.name) : null;
}

export function CommercialLine({
  line,
  onDraft,
  disabled,
  kind,
}: {
  line: CommercialLineState;
  onDraft: (draft: CommercialDraft) => void;
  disabled: boolean;
  /** Une story se repartage (le pro est prévenu et peut la reprendre) ; une publication ne fait que prévenir. */
  kind: "story" | "post";
}) {
  const notified = (name: string) =>
    kind === "story" ? L.commercialNotifiedStory(name) : L.commercialNotifiedPost(name);
  if (line.kind === "required") {
    return (
      <div className="story-commercial" data-testid="commercial-line">
        <div className="story-option is-required" aria-disabled="true" data-testid="commercial-required">
          <Icon name="briefcase" size={20} />
          <span>
            <strong>{L.commercialLine(line.name)}</strong>
            <small>{L.commercialRequired}</small>
          </span>
        </div>
        <p className="o-t-caption" data-testid="commercial-notified">
          {notified(line.name)}
        </p>
        <p className="o-t-caption">{L.commercialLaw}</p>
      </div>
    );
  }
  return (
    <div className="story-commercial" data-testid="commercial-line">
      <button
        type="button"
        className="story-option"
        aria-pressed={line.on}
        disabled={disabled}
        onClick={() => onDraft({ on: !line.on, pick: line.on ? null : line.pick })}
        data-testid="commercial-self"
      >
        <Icon name="briefcase" size={20} />
        <span>
          <strong>{L.commercialSelf}</strong>
          <small>{L.commercialSelfHint}</small>
        </span>
      </button>
      {line.on ? (
        <ProPicker
          pick={line.pick}
          onPick={(pick) => onDraft({ on: true, pick })}
          disabled={disabled}
          notified={notified}
        />
      ) : null}
      {line.on ? <p className="o-t-caption">{L.commercialLaw}</p> : null}
    </div>
  );
}

/** Recherche d'une fiche pro publiée par son nom (deux lettres au moins : pas d'annuaire), puis le choix en pastille. */
function ProPicker({
  pick,
  onPick,
  disabled,
  notified,
}: {
  pick: CommercialDraft["pick"];
  onPick: (pick: CommercialDraft["pick"]) => void;
  disabled: boolean;
  notified: (name: string) => string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProCard[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.trim();

  // 300 ms après la dernière lettre ; une réponse arrivée après un autre texte est jetée.
  useEffect(() => {
    if (text.length < 2) {
      setResults(null);
      setState("idle");
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setState("loading");
      const res = await apiFetch<Page<ProCard>>(`/pros?${new URLSearchParams({ q: text, limit: "6", eligible: "1" })}`);
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
  }, [text]);

  async function choose(card: ProCard) {
    setState("loading");
    const res = await apiFetch<ProPublic>(`/pros/by-slug/${encodeURIComponent(card.slug)}`);
    if (!res.ok) return setState("error");
    onPick({ id: res.data.id, name: res.data.name });
    setQ("");
    setResults(null);
    setState("idle");
  }

  if (pick) {
    return (
      <div className="story-people" data-testid="commercial-picker">
        <div className="fil-chips">
          <button
            type="button"
            className="fil-chip is-on"
            aria-label={L.commercialChange}
            disabled={disabled}
            onClick={() => onPick(null)}
            data-testid="commercial-picked"
          >
            <Icon name="briefcase" size={12} /> {L.commercialPicked(pick.name)} <Icon name="close" size={12} />
          </button>
        </div>
        <p className="o-t-caption">{notified(pick.name)}</p>
      </div>
    );
  }
  return (
    <div className="story-people" data-testid="commercial-picker">
      <label className="s-field">
        <span className="o-t-label">{L.commercialPick}</span>
        <input
          type="text"
          value={q}
          placeholder={L.commercialPickPlaceholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setQ(e.currentTarget.value)}
          data-testid="commercial-input"
        />
      </label>
      {state === "error" ? (
        <p className="s-error" role="alert" data-testid="commercial-error">
          {L.commercialPickError}
        </p>
      ) : null}
      {results && state === "idle" && results.length === 0 ? (
        <p className="o-t-caption" data-testid="commercial-none">
          {L.commercialPickEmpty}
        </p>
      ) : null}
      {(results ?? []).map((p) => (
        <button
          key={p.slug}
          type="button"
          className="story-person"
          disabled={disabled}
          onClick={() => void choose(p)}
          data-testid="commercial-result"
        >
          <Icon name="briefcase" size={16} /> {p.name}
        </button>
      ))}
    </div>
  );
}
