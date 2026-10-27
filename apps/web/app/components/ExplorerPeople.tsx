// Personnes et crews dans l'Explorer du site (lot R2, maquettes R2.6 et R2.7 ; l'appli : `PeopleSegment.tsx`) : aucun
// annuaire. Des lignes de personnes et de crews avec une action (« Ajouter », « Écrire », « Rejoindre »), des sections
// avec leur raison, la note de vie privée. Un compte privé ne montre jamais de département.
import { Button, Icon } from "@orasso/design-system/web";
import { type CrewCard, gradeLabels, type PersonCard, explorerR2Labels as R } from "@orasso/shared";
import type { ReactNode } from "react";
import { CrewLogo } from "./Crews";
import { CrewRequestDialog } from "./crew-page/CrewPage";
import { deptLong } from "./ExplorerUi";
import { cardVisibility, FollowAction, PersonAvatar } from "./People";

export function PeopleSection({
  title,
  hint,
  testId,
  children,
}: {
  title: string;
  hint?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="ex-sec" data-testid={testId} aria-label={title}>
      <div className="ex-sec__head">
        <h2 className="ex-sec__title">{title}</h2>
        {hint ? <span className="o-t-caption s-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function PeopleEmpty({ children }: { children: string }) {
  return (
    <p className="ex-empty o-t-caption" data-testid="people-empty">
      {children}
    </p>
  );
}

export function PrivacyNote({ children }: { children: string }) {
  return (
    <p className="ex-privacy o-t-caption" data-testid="people-privacy">
      <Icon name="lock" size={16} />
      <span>{children}</span>
    </p>
  );
}

/** Le bouton « Suivre » compact d'une ligne (lot R6b) : Suivre, Demander à suivre, Abonné ou Demandé. */
function PersonAction({ person, busy }: { person: PersonCard; busy: boolean }) {
  return (
    <FollowAction
      pseudo={person.pseudo}
      mine={person.follow.mine}
      followsMe={person.follow.followsMe}
      canFollow
      visibility={cardVisibility(person)}
      size="small"
      busy={busy}
    />
  );
}

export function PersonRowR2({
  person,
  busy,
  testId = "person-row",
}: {
  person: PersonCard;
  busy: boolean;
  testId?: string;
}) {
  // Compte privé (non abonné) : ses départements ne sont pas donnés par l'API.
  const hidden = person.departments === null;
  const firstDept = !hidden ? person.departments?.[0] : null;
  const caption = [
    person.vehicles[0]?.label,
    firstDept ? deptLong(firstDept) : null,
    R.grade(gradeLabels[person.grade]),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="s-person ex-row" data-testid={testId}>
      <PersonAvatar url={person.avatarUrl} pseudo={person.pseudo} size={44} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(person.pseudo)}`}>
          {person.pseudo}
        </a>
        <span className="o-t-caption s-muted">
          {hidden ? <strong className="ex-row__priv">{R.privateAccount} · </strong> : null}
          {caption}
        </span>
      </div>
      <PersonAction person={person} busy={busy} />
    </li>
  );
}

export function CrewRowR2({
  crew,
  mine,
  sent,
}: {
  crew: CrewCard;
  mine: boolean;
  sent: boolean;
  /** Gardé pour les appelants : la demande part maintenant par la fenêtre (lot R5c2), qui a son propre état. */
  busy?: boolean;
}) {
  return (
    <li className="s-person ex-row" data-testid="crew-row">
      <CrewLogo url={crew.logoUrl} name={crew.name} size={44} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title o-never-truncate" href={`/c/${crew.slug}`}>
          {crew.name}
        </a>
        <span className="o-t-caption s-muted">
          {[deptLong(crew.department), R.members(crew.membersCount), mine ? R.yourCrew : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {mine ? (
        <Button variant="secondary" icon="next" href={`/c/${crew.slug}`} data-testid="crew-open">
          Ouvrir
        </Button>
      ) : sent || crew.requested ? (
        // Lot R3b : la demande déjà envoyée vient de l'API (elle reste après un rechargement).
        <Button variant="secondary" icon="check" disabled data-testid="crew-requested">
          {R.joinRequested}
        </Button>
      ) : (
        // Lot R5c2 (R5.8) : la demande part toujours avec la fenêtre « un mot pour le chef », comme sur sa fiche.
        <CrewRequestDialog crew={crew} leaderPseudo={null} testId="crew-join" label={R.join} />
      )}
    </li>
  );
}
