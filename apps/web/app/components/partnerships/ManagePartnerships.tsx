// Côté pro, dans « Ma fiche » du site (lot R7m1) : mes partenaires (« Mettre fin », confirmation) et mes propositions en
// attente (« Retirer la proposition »). Proposer se fait depuis le profil d'un passionné. Après la date de l'abonnement, la
// ligne « Réservé à l'abonnement pro » dit pourquoi on ne propose plus.
import { gradeLabels, partnershipLabels as L, type ProPartnerships } from "@orasso/shared";

import "../../styles/partnerships.css";
import { PersonAvatar } from "../People";
import { EndForm } from "./EndForm";

export function ManagePartnerships({ data, busy }: { data: ProPartnerships | null; busy: boolean }) {
  if (!data) return null;
  const pending = data.items.filter((i) => i.status === "pending");
  const active = data.items.filter((i) => i.status === "active");
  return (
    <section
      className="orga__panel s-stack"
      aria-labelledby="member-partners-title"
      data-testid="pro-member-partnerships"
    >
      <h2 id="member-partners-title" className="s-h2">
        {L.mineTitle}
        <span className="o-t-caption s-muted"> · {L.partnersCount(active.length)}</span>
      </h2>
      {data.canPropose === "subscription_required" && (
        <p className="s-notice" data-testid="partnership-locked">
          {L.subscriptionOnly}
        </p>
      )}
      {data.canPropose === "not_verified" && <p className="s-notice">{L.notVerified}</p>}
      {pending.length > 0 && <p className="o-t-label s-muted">{L.pendingTitle.toUpperCase()}</p>}
      <ul className="ptn-line__list">
        {[...pending, ...active].map((r) => (
          <li className="ptn-row" key={r.id} data-testid="partnership-row">
            <span className="ptn-row__head">
              <PersonAvatar url={r.user.avatarUrl} pseudo={r.user.pseudo} size={40} />
              <span>
                <b>
                  <a href={`/u/${encodeURIComponent(r.user.pseudo)}`}>{r.user.pseudo}</a>
                </b>
                <small>{[gradeLabels[r.user.grade], r.vehicle?.label].filter(Boolean).join(" · ")}</small>
              </span>
            </span>
            <p className="o-t-caption s-muted">{`« ${r.message} »`}</p>
            <EndForm
              intent={r.status === "pending" ? "partnership_withdraw" : "partnership_end"}
              id={r.id}
              name={r.user.pseudo}
              forPro
              busy={busy}
              withdraw={r.status === "pending"}
            />
          </li>
        ))}
      </ul>
      {!pending.length && !active.length && <p className="s-muted">{L.partnersEmpty}</p>}
    </section>
  );
}
