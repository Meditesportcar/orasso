// « Nouveau vote » (lot R7l2, maquette R7.15 `v-prep`, même feuille que dans l'appli) : un titre (un modèle ou le sien), des
// candidats (tous les entrés, une origine ou des marques, une zone, à la main), une ouverture (dès les premières entrées,
// à une heure fixée, à lancer soi-même) et une durée. Posé sous la liste des votes, dans l'étape « Votes du public » de
// l'éditeur et dans l'écran « Votes ». Aucune règle ici : le brouillon, sa validation et le corps envoyé sont dans
// `@orasso/shared` (`votesOrga.ts`), l'API tranche.
import { Button, Chip, ChipRow, Icon, TextField } from "@orasso/design-system/web";
import {
  ALL_CATEGORIES_TITLE,
  criteriaOrigins,
  type EventZone,
  emptyVoteDraft,
  voteOrgaLabels as L,
  type VehicleMake,
  type VoteDraft,
  type VoteManageItem,
  voteCandidateModeOptions,
  voteDraftBody,
  voteDraftOfItem,
  voteDraftProblem,
  voteDraftWithMode,
  voteDraftWithTemplate,
  voteDurationOptions,
  voteOpenModeOptions,
  voteTemplates,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { now as clockNow } from "../../lib/clock";
import "../../styles/votes-orga.css";

const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

export function OrgaVoteForm({
  eventId,
  eventEndsAt,
  zones,
  makes,
  editing,
  allCategoriesMissing,
  podium,
  onSaved,
  onCancel,
}: {
  eventId: string;
  /** Fin de l'événement (instant ISO) : borne l'heure d'ouverture. */
  eventEndsAt: string | null;
  zones: readonly EventZone[];
  makes: readonly VehicleMake[];
  /** Un vote existant à modifier (avant son ouverture), sinon un nouveau vote. */
  editing?: VoteManageItem | null;
  /** « Toutes catégories » a été retiré : il revient avec « Ajouter » (modèle en tête des modèles). */
  allCategoriesMissing: boolean;
  /** Points du podium lus du réglage (`VoteManage.podium`). */
  podium?: readonly number[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<VoteDraft>(() => (editing ? voteDraftOfItem(editing) : emptyVoteDraft()));
  const [restoreAll, setRestoreAll] = useState(false);
  const [makeQuery, setMakeQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof VoteDraft>(key: K, value: VoteDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const problem = restoreAll
    ? null
    : voteDraftProblem(draft, { now: clockNow(), eventEndsAt: eventEndsAt ? new Date(eventEndsAt) : null });
  const chosenMakes = makes.filter((m) => draft.makeIds.includes(m.id));
  const found =
    makeQuery.trim().length < 2
      ? []
      : makes
          .filter((m) => m.name !== "Autre" && !draft.makeIds.includes(m.id))
          .filter((m) => m.name.toLowerCase().includes(makeQuery.trim().toLowerCase()))
          .slice(0, 8);
  const openOptions = voteOpenModeOptions.filter((o) => !(draft.mode === "hand" && o.mode === "first_entry"));

  async function submit() {
    if (problem) return;
    setBusy(true);
    setError(null);
    const res = restoreAll
      ? await apiFetch(`/events/${eventId}/votes/all-categories`, { method: "POST" })
      : editing
        ? await apiFetch(`/events/${eventId}/votes/${editing.id}`, { method: "PATCH", json: voteDraftBody(draft) })
        : await apiFetch(`/events/${eventId}/votes`, { method: "POST", json: voteDraftBody(draft) });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    onSaved();
  }

  return (
    <section className="wz-box s-stack ov-form" aria-label={editing ? L.editTitle : L.newTitle} data-testid="vote-form">
      <div className="ov-form__head">
        <h3 className="wz-h3">{editing ? L.editTitle : L.newTitle}</h3>
        <Button variant="close" label={L.close} onClick={onCancel} data-testid="vote-form-close" />
      </div>

      {!editing ? (
        <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="vote-templates">
          <legend className="o-t-label s-label">{L.templates}</legend>
          <ChipRow className="s-chips-wrap">
            {allCategoriesMissing ? (
              <Chip
                selected={restoreAll}
                onClick={() => {
                  setRestoreAll(true);
                  setDraft((d) => ({ ...emptyVoteDraft(), title: ALL_CATEGORIES_TITLE, openMode: d.openMode }));
                }}
              >
                {ALL_CATEGORIES_TITLE}
              </Chip>
            ) : null}
            {voteTemplates.map((tpl) => (
              <Chip
                key={tpl.id}
                selected={!restoreAll && draft.title === tpl.title}
                onClick={() => {
                  setRestoreAll(false);
                  setDraft((d) => voteDraftWithTemplate(d, tpl));
                }}
              >
                {tpl.title}
              </Chip>
            ))}
          </ChipRow>
        </fieldset>
      ) : null}

      <TextField
        label={L.titleField}
        name="voteTitle"
        value={draft.title}
        maxLength={60}
        disabled={restoreAll}
        onChange={(e) => {
          setRestoreAll(false);
          set("title", e.currentTarget.value);
        }}
        data-testid="vote-form-title"
      />

      {restoreAll ? (
        <p className="o-t-caption s-muted">{L.stampNote}</p>
      ) : (
        <>
          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="vote-form-modes">
            <legend className="o-t-label s-label">{L.candidatesQuestion}</legend>
            <div className="ov-options">
              {voteCandidateModeOptions.map((o) => (
                <button
                  type="button"
                  key={o.mode}
                  aria-pressed={draft.mode === o.mode}
                  className={draft.mode === o.mode ? "ov-option is-on" : "ov-option"}
                  onClick={() => setDraft((d) => voteDraftWithMode(d, o.mode))}
                  data-testid={`vote-mode-${o.mode}`}
                >
                  <Icon name={o.icon} />
                  <span>
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {draft.mode === "origins" ? (
            <div className="s-stack s-stack--tight" data-testid="vote-origins">
              <span className="o-t-label s-label">{L.originsQuestion}</span>
              <ChipRow className="s-chips-wrap">
                {criteriaOrigins.map((o) => (
                  <Chip
                    key={o.code}
                    selected={draft.countries.includes(o.code)}
                    onClick={() => set("countries", toggle(draft.countries, o.code))}
                  >
                    {o.chip}
                  </Chip>
                ))}
              </ChipRow>
              <TextField
                label={L.makesSearch}
                name="voteMakeSearch"
                value={makeQuery}
                placeholder={L.makesPlaceholder}
                onChange={(e) => setMakeQuery(e.currentTarget.value)}
                data-testid="vote-makes-search"
              />
              {chosenMakes.length > 0 || found.length > 0 ? (
                <ChipRow className="s-chips-wrap">
                  {[...chosenMakes, ...found].map((m) => (
                    <Chip
                      key={m.id}
                      selected={draft.makeIds.includes(m.id)}
                      onClick={() => set("makeIds", toggle(draft.makeIds, m.id))}
                    >
                      {m.name}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
              <p className="o-t-caption s-muted">{L.entersOnly}</p>
            </div>
          ) : null}

          {draft.mode === "zone" ? (
            zones.length > 0 ? (
              <div className="s-stack s-stack--tight" data-testid="vote-zones">
                <span className="o-t-label s-label">{L.zoneQuestion}</span>
                <ChipRow className="s-chips-wrap">
                  {zones.map((z) => (
                    <Chip key={z.id} selected={draft.zoneId === z.id} onClick={() => set("zoneId", z.id)}>
                      {z.name}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            ) : (
              <p className="s-notice">{L.noZone}</p>
            )
          ) : null}

          {draft.mode === "hand" ? <p className="o-t-caption s-muted">{L.handNote}</p> : null}

          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="vote-form-open">
            <legend className="o-t-label s-label">{L.whenQuestion}</legend>
            <div className="ov-options">
              {openOptions.map((o) => (
                <button
                  type="button"
                  key={o.mode}
                  aria-pressed={draft.openMode === o.mode}
                  className={draft.openMode === o.mode ? "ov-option is-on" : "ov-option"}
                  onClick={() => set("openMode", o.mode)}
                  data-testid={`vote-open-mode-${o.mode}`}
                >
                  <Icon name={o.icon} />
                  <span>
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </span>
                </button>
              ))}
            </div>
            {draft.openMode === "at" ? (
              <TextField
                label={L.openAtField}
                name="voteOpensAt"
                type="datetime-local"
                value={draft.opensAt}
                onChange={(e) => set("opensAt", e.currentTarget.value)}
                data-testid="vote-opens-at"
              />
            ) : null}
          </fieldset>

          <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="vote-form-duration">
            <legend className="o-t-label s-label">{L.durationQuestion}</legend>
            <ChipRow className="s-chips-wrap">
              {voteDurationOptions.map((o) => {
                const key = o.value === null ? "end" : o.value === "custom" ? "custom" : String(o.value);
                return (
                  <Chip
                    key={key}
                    selected={draft.duration === key}
                    onClick={() => set("duration", key as VoteDraft["duration"])}
                  >
                    {o.label}
                  </Chip>
                );
              })}
            </ChipRow>
            {draft.duration === "custom" ? (
              <TextField
                label={L.customMinutes}
                name="voteCustomMinutes"
                inputMode="numeric"
                maxLength={5}
                value={draft.customMinutes}
                onChange={(e) => set("customMinutes", e.currentTarget.value.replace(/\D/g, ""))}
                data-testid="vote-custom-minutes"
              />
            ) : null}
          </fieldset>
          <p className="o-t-caption s-muted">{L.pointsNote(podium)}</p>
        </>
      )}

      {problem ? (
        <p className="o-t-caption s-muted" data-testid="vote-form-problem">
          {problem}
        </p>
      ) : null}
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="s-row">
        {/* Posé sous le bouton principal de la page (« Continuer » de l'éditeur) : jamais un second principal. */}
        <Button
          variant="secondary"
          icon={editing ? "check" : "add"}
          loading={busy}
          disabled={busy || Boolean(problem)}
          onClick={() => void submit()}
          data-testid="vote-form-submit"
        >
          {editing ? L.submitSave : restoreAll ? L.addAllCategories : L.submitAdd}
        </Button>
      </div>
    </section>
  );
}
