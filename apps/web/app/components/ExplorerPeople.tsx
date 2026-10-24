// Personnes et crews dans l'Explorer du site (lot R2, maquettes R2.6 et R2.7 ; l'appli : `PeopleSegment.tsx`) : aucun
// annuaire. Des lignes de personnes et de crews avec une action (« Ajouter », « Écrire », « Rejoindre »), des sections
// avec leur raison, la note de vie privée. Un compte privé ne montre jamais de département.
import { Button, Icon } from "@orasso/design-system/web";
import { type CrewCard, gradeLabels, type PersonCard, explorerR2Labels as R } from "@orasso/shared";
import type { ReactNode } from "react";
import { Form } from "react-router";

import { CrewLogo } from "./Crews";
import { deptLong } from "./ExplorerUi";
import { PersonAvatar } from "./People";

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

/** « Ajouter » (demande d'ami), « Demande envoyée », ou « Écrire » à un ami. */
function PersonAction({ person, busy }: { person: PersonCard; busy: boolean }) {
  if (person.friendship === "friends") {
    return (
      <Form method="post">
        <input type="hidden" name="intent" value="message_open" />
        <input type="hidden" name="userId" value={person.userId} />
        <Button type="submit" variant="secondary" icon="chat" loading={busy} data-testid="person-write">
          {R.write}
        </Button>
      </Form>
    );
  }
  if (person.friendship === "pending_out") {
    return (
      <Button variant="secondary" icon="check" disabled data-testid="person-requested">
        {R.requested}
      </Button>
    );
  }
  if (person.friendship === "pending_in") {
    // Il m'a déjà demandé : son profil propose d'accepter.
    return (
      <Button variant="secondary" icon="add" href={`/u/${encodeURIComponent(person.pseudo)}`} data-testid="person-add">
        {R.add}
      </Button>
    );
  }
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="friend_add" />
      <input type="hidden" name="pseudo" value={person.pseudo} />
      <input type="hidden" name="source" value="search" />
      <Button type="submit" variant="secondary" icon="add" loading={busy} data-testid="person-add">
        {R.add}
      </Button>
    </Form>
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
  // Compte privé (non ami) : ses départements ne sont pas donnés par l'API.
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

export function CrewRowR2({ crew, mine, sent, busy }: { crew: CrewCard; mine: boolean; sent: boolean; busy: boolean }) {
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
        <Form method="post">
          <input type="hidden" name="intent" value="crew_request" />
          <input type="hidden" name="crewId" value={crew.id} />
          <Button type="submit" variant="secondary" icon="add" loading={busy} data-testid="crew-join">
            {R.join}
          </Button>
        </Form>
      )}
    </li>
  );
}
