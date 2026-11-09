// Les votes prévus d'un événement, étape « Votes du public » de l'éditeur (lot R7l2, maquette R7.15 `vp_list`) : la liste avec
// ses réglages (« Japonaises · dimanche 12 h · jusqu'à la fin de l'événement »), « Toutes catégories » présent d'office
// (retirable, remis par « Ajouter » avec son modèle), un menu par vote (modifier, monter, descendre, retirer) et
// « Ajouter un vote » qui ouvre la feuille « Nouveau vote ». Chaque vote est enregistré à part par l'API : l'étape n'est
// jamais bloquante pour publier.
import { Button, Icon } from "@orasso/design-system/web";
import {
  type EventZone,
  voteOrgaLabels as L,
  type VehicleMake,
  type VoteManageItem,
  voteConfigLine,
  voteStatus,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { OrgaVoteForm } from "./OrgaVoteForm";
import { useOrgaVotes } from "./useOrgaVotes";
import { voteIconName } from "./voteIcon";

export function OrgaVoteList({
  eventId,
  eventEndsAt,
  zones,
  makes,
}: {
  eventId: string;
  eventEndsAt: string | null;
  zones: readonly EventZone[];
  makes: readonly VehicleMake[];
}) {
  const { manage, error: loadError, loading, reload, now } = useOrgaVotes(eventId);
  const [form, setForm] = useState<{ editing: VoteManageItem | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = manage?.items ?? [];
  const canWrite = manage?.canWrite !== false;
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? null;
  const makeNames = (ids: string[]) =>
    ids.map((id) => makes.find((m) => m.id === id)?.name).filter((n): n is string => Boolean(n));

  async function act(call: () => Promise<{ ok: boolean; error?: { message: string } }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await call();
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.message ?? L.loadError);
      return false;
    }
    await reload();
    return true;
  }

  const move = (v: VoteManageItem, delta: -1 | 1) => {
    const ids = items.map((x) => x.id);
    const i = ids.indexOf(v.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    void act(() => apiFetch(`/events/${eventId}/votes/order`, { method: "PUT", json: { ids } }));
  };

  return (
    <div className="s-stack" data-testid="wizard-votes">
      {loading ? <p className="s-muted">{L.loading}</p> : null}
      {loadError && !manage ? (
        <div className="s-stack s-stack--tight">
          <p className="s-error" role="alert">
            {loadError}
          </p>
          <div className="s-row">
            <Button variant="secondary" icon="undo" onClick={() => void reload()} data-testid="wizard-votes-retry">
              {L.retry}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}

      {manage ? (
        <>
          <p className="ov-count">
            <b className="o-t-number" data-testid="wizard-votes-count">
              {L.count(items.length)}
            </b>
            <span className="o-t-caption s-muted">{L.podiumLine(manage?.podium)}</span>
          </p>
          {items.length === 0 ? <p className="s-muted">{L.empty}</p> : null}
          <ul className="ov-list">
            {items.map((v, i) => {
              const open = menu === v.id;
              const locked = v.state !== "upcoming";
              const status = voteStatus(v, { now, published: true, canWrite: false });
              return (
                <li key={v.id} className="ov-card" data-testid={`wizard-vote-${v.id}`}>
                  <div className="ov-card__head">
                    <span className={v.kind === "all_categories" ? "ov-round is-acc" : "ov-round"}>
                      <Icon name={voteIconName(v)} />
                    </span>
                    <span className="ov-card__text">
                      <b className="o-never-truncate">{v.title}</b>
                      <small>{locked ? status.text : voteConfigLine(v, now, zoneName, makeNames)}</small>
                      <small className="s-muted">
                        {[v.rareStamp ? L.tagStamp : L.tagTrophy, v.kind === "all_categories" ? L.tagDefault : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    {canWrite ? (
                      <button
                        type="button"
                        className="ov-dots"
                        aria-label={`${L.menu} : ${v.title}`}
                        aria-expanded={open}
                        onClick={() => setMenu(open ? null : v.id)}
                        data-testid={`wizard-vote-menu-${v.id}`}
                      >
                        <Icon name="more" />
                      </button>
                    ) : null}
                  </div>
                  {open ? (
                    <div className="s-row">
                      {!locked && v.kind !== "all_categories" ? (
                        <Button
                          variant="secondary"
                          icon="edit"
                          onClick={() => setForm({ editing: v })}
                          data-testid={`wizard-vote-edit-${v.id}`}
                        >
                          {L.edit}
                        </Button>
                      ) : null}
                      {i > 0 ? (
                        <Button variant="secondary" icon="up" disabled={busy} onClick={() => move(v, -1)}>
                          {L.moveUp}
                        </Button>
                      ) : null}
                      {i < items.length - 1 ? (
                        <Button variant="secondary" icon="down" disabled={busy} onClick={() => move(v, 1)}>
                          {L.moveDown}
                        </Button>
                      ) : null}
                      <Button
                        variant="plate"
                        tone="dashed"
                        icon="trash"
                        disabled={busy}
                        onClick={() => setRemoving(v.id)}
                        data-testid={`wizard-vote-remove-${v.id}`}
                      >
                        {L.remove}
                      </Button>
                    </div>
                  ) : null}
                  {removing === v.id ? (
                    <div className="s-stack s-stack--tight" role="alertdialog" data-testid="wizard-vote-remove-confirm">
                      <b>{L.removeTitle(v.title)}</b>
                      <span className="o-t-caption s-muted">{L.removeBody}</span>
                      <div className="s-row">
                        <Button
                          variant="alert"
                          icon="trash"
                          loading={busy}
                          onClick={() =>
                            void act(() => apiFetch(`/events/${eventId}/votes/${v.id}`, { method: "DELETE" })).then(
                              (ok) => {
                                if (ok) {
                                  setRemoving(null);
                                  setMenu(null);
                                }
                              },
                            )
                          }
                          data-testid="wizard-vote-remove-yes"
                        >
                          {L.removeConfirm}
                        </Button>
                        <Button variant="secondary" icon="back" disabled={busy} onClick={() => setRemoving(null)}>
                          {L.keep}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {canWrite && !form ? (
            <div className="s-row">
              <Button
                variant="secondary"
                icon="add"
                onClick={() => setForm({ editing: null })}
                data-testid="wizard-vote-add"
              >
                {L.add}
              </Button>
            </div>
          ) : null}
        </>
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
            setMenu(null);
            void reload();
          }}
        />
      ) : null}

      <p className="o-t-caption s-muted">{L.pointsNote(manage?.podium)}</p>
      <p className="o-t-caption s-muted">{L.stampNote}</p>
      <p className="o-t-caption s-muted">{L.teamNote}</p>
      <p className="o-t-caption s-muted">{L.stepNotBlocking}</p>
    </div>
  );
}
