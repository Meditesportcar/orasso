// « Votes » pendant l'événement, côté site (lot R7l2, maquette R7.16 `v-live`) : chaque vote avec son état (« Ouvert · 34
// voix · ferme mardi à 23 h », « Prévu · dimanche 16 h », « Prêt à lancer ») et ses actions, « Lancer le vote » et « Clore
// maintenant » (avec confirmation), les candidats d'un vote « à la main » et le classement en direct pour l'équipe.
// Propriétaire et co-organisateurs écrivent ; le staff lit seulement (aucun bouton, l'API répond 403 aux écritures).
import { Button, Icon } from "@orasso/design-system/web";
import {
  type EventZone,
  voteOrgaLabels as L,
  type VehicleMake,
  type VoteManage,
  type VoteManageItem,
  voteStatus,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { OrgaVoteCandidates } from "./OrgaVoteCandidates";
import { OrgaVoteForm } from "./OrgaVoteForm";
import { useOrgaVotes } from "./useOrgaVotes";
import { voteIconName } from "./voteIcon";

type Pending = { kind: "launch" | "close" | "remove"; vote: VoteManageItem };

export function OrgaVotesLive({
  eventId,
  eventEndsAt,
  published,
  readOnly,
  initial,
  zones,
  makes,
}: {
  eventId: string;
  eventEndsAt: string | null;
  published: boolean;
  readOnly: boolean;
  initial: VoteManage | null;
  zones: readonly EventZone[];
  makes: readonly VehicleMake[];
}) {
  const { manage, error: loadError, loading, reload, now } = useOrgaVotes(eventId, initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: VoteManageItem | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = manage?.items ?? [];
  const canWrite = !readOnly && manage?.canWrite === true;
  const statuses = items.map((v) => voteStatus(v, { now, published, canWrite }));
  // Un seul bouton principal par écran : le premier vote prêt à lancer.
  const hot = items.findIndex((_, i) => statuses[i]?.canLaunch && !statuses[i]?.launchBlocked);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const path = `/events/${eventId}/votes/${pending.vote.id}`;
    const res =
      pending.kind === "remove"
        ? await apiFetch(path, { method: "DELETE" })
        : await apiFetch(`${path}/${pending.kind === "launch" ? "open" : "close"}`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setNotice(pending.kind === "launch" ? L.launched : pending.kind === "close" ? L.closed : null);
    setPending(null);
    await reload();
  }

  return (
    <div className="s-stack" data-testid="votes-screen">
      {loading ? <p className="s-muted">{L.loading}</p> : null}
      {loadError && !manage ? (
        <div className="s-stack s-stack--tight">
          <p className="s-error" role="alert">
            {loadError}
          </p>
          <div className="s-row">
            <Button variant="secondary" icon="undo" onClick={() => void reload()} data-testid="votes-retry">
              {L.retry}
            </Button>
          </div>
        </div>
      ) : null}
      {error && !pending ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="s-notice s-notice--ok" role="status" data-testid="votes-notice">
          {notice}
        </p>
      ) : null}
      {manage && items.length === 0 ? <p className="s-muted">{L.empty2}</p> : null}

      <ul className="ov-list">
        {items.map((v, i) => {
          const status = statuses[i];
          if (!status) return null;
          const expanded = open === v.id;
          const hand = v.candidateMode === "hand";
          const hasDetail = hand || v.state !== "upcoming";
          return (
            <li key={v.id} className="ov-card" data-testid={`vote-card-${v.id}`}>
              <div className="ov-card__head">
                <span className={v.kind === "all_categories" ? "ov-round is-acc" : "ov-round"}>
                  <Icon name={voteIconName(v)} />
                </span>
                <span className="ov-card__text">
                  <b className="o-never-truncate">{v.title}</b>
                  <span className={`ov-status is-${status.tone}`} data-testid={`vote-status-${v.id}`}>
                    <i aria-hidden="true" />
                    {status.text}
                  </span>
                </span>
              </div>
              <div className="s-row">
                {status.canLaunch ? (
                  <Button
                    variant={i === hot ? "primary" : "secondary"}
                    icon="spark"
                    disabled={Boolean(status.launchBlocked)}
                    onClick={() => setPending({ kind: "launch", vote: v })}
                    data-testid={`vote-launch-${v.id}`}
                  >
                    {L.launch}
                  </Button>
                ) : null}
                {status.canClose ? (
                  <Button
                    variant="secondary"
                    icon="close"
                    onClick={() => setPending({ kind: "close", vote: v })}
                    data-testid={`vote-close-${v.id}`}
                  >
                    {L.closeNow}
                  </Button>
                ) : null}
                {hasDetail && !readOnly ? (
                  <Button
                    variant="secondary"
                    icon={hand ? "vehicle" : "list"}
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : v.id)}
                    data-testid={`vote-open-${v.id}`}
                  >
                    {hand ? L.candidatesButton : L.rankingTitle}
                  </Button>
                ) : null}
                {canWrite && v.state === "upcoming" && v.kind !== "all_categories" ? (
                  <Button
                    variant="secondary"
                    icon="edit"
                    onClick={() => setForm({ editing: v })}
                    data-testid={`vote-edit-${v.id}`}
                  >
                    {L.edit}
                  </Button>
                ) : null}
                {canWrite && v.state === "upcoming" ? (
                  <Button
                    variant="plate"
                    tone="dashed"
                    icon="trash"
                    onClick={() => setPending({ kind: "remove", vote: v })}
                    data-testid={`vote-remove-${v.id}`}
                  >
                    {L.remove}
                  </Button>
                ) : null}
              </div>
              {status.launchBlocked ? <p className="o-t-caption s-muted">{status.launchBlocked}</p> : null}

              {pending?.vote.id === v.id ? (
                <div className="s-stack s-stack--tight" role="alertdialog" data-testid="vote-confirm">
                  <b>
                    {pending.kind === "launch"
                      ? L.launchTitle(v.title)
                      : pending.kind === "close"
                        ? L.closeTitle(v.title)
                        : L.removeTitle(v.title)}
                  </b>
                  <span className="o-t-caption s-muted">
                    {pending.kind === "launch" ? L.launchBody : pending.kind === "close" ? L.closeBody : L.removeBody}
                  </span>
                  {error ? (
                    <p className="s-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="s-row">
                    <Button
                      variant={pending.kind === "remove" ? "alert" : "secondary"}
                      icon={pending.kind === "launch" ? "spark" : pending.kind === "close" ? "close" : "trash"}
                      loading={busy}
                      onClick={() => void confirm()}
                      data-testid="vote-confirm-yes"
                    >
                      {pending.kind === "launch"
                        ? L.launchConfirm
                        : pending.kind === "close"
                          ? L.closeConfirm
                          : L.removeConfirm}
                    </Button>
                    <Button
                      variant="plate"
                      icon="back"
                      disabled={busy}
                      onClick={() => {
                        setPending(null);
                        setError(null);
                      }}
                    >
                      {pending.kind === "remove" ? L.keep : L.cancel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {expanded && hand ? (
                <OrgaVoteCandidates
                  eventId={eventId}
                  vote={v}
                  editable={canWrite && v.state === "upcoming"}
                  enteredIds={new Set(manage?.enteredApplicationIds ?? [])}
                  onChanged={reload}
                />
              ) : null}
              {expanded && v.state !== "upcoming" ? (
                <div className="s-stack s-stack--tight" data-testid="vote-ranking">
                  <span className="o-t-caption s-muted">
                    {v.state === "open" ? L.rankingLive : L.voiceCount(v.total)}
                  </span>
                  {v.ranking.length === 0 ? <p className="s-muted">{L.rankingEmpty}</p> : null}
                  <ol className="ov-rows">
                    {v.ranking.slice(0, 10).map((r) => (
                      <li key={r.applicationId}>
                        <span className="ov-card__text">
                          <b className="o-never-truncate">{`${r.rank}. ${r.vehicleLabel}`}</b>
                          <small className="s-muted">{r.pseudo}</small>
                        </span>
                        <b className="o-t-number">{L.voiceCount(r.votes)}</b>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canWrite && !form ? (
        <div className="s-row">
          <Button variant="secondary" icon="add" onClick={() => setForm({ editing: null })} data-testid="votes-add">
            {L.addVoteOnScreen}
          </Button>
        </div>
      ) : null}
      {form ? (
        <OrgaVoteForm
          key={form.editing?.id ?? "new"}
          eventId={eventId}
          eventEndsAt={eventEndsAt}
          zones={zones}
          makes={makes}
          editing={form.editing}
          allCategoriesMissing={manage !== null && !items.some((v) => v.kind === "all_categories")}
          podium={manage?.podium}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      ) : null}
      <p className="o-t-caption s-muted">{L.bell}</p>
      <p className="o-t-caption s-muted">{canWrite ? L.teamNote : L.staffReadOnly}</p>
    </div>
  );
}
