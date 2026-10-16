import { Button, Chip } from "@orasso/design-system/web";
import { type FriendshipState, friendStateLabels, gradeLabels, type PersonCard, socialLabels } from "@orasso/shared";
import { Form } from "react-router";

// Éléments sociaux communs du site (lot 17) : avatar, bouton d'ami, ligne de personne.

export function PersonAvatar({ url, pseudo, size = 40 }: { url: string | null; pseudo: string; size?: number }) {
  return (
    <span className="s-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{pseudo.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

/**
 * Bouton d'ami selon la relation : Ajouter / Demande envoyée / Accepter (+ Refuser) / Ami (retirer). Un seul bouton
 * principal par écran : `primary` le réserve à l'action qui compte ici.
 */
export function FriendAction({
  state,
  pseudo,
  userId,
  requestId,
  primary = false,
  source = "profile",
  busy = false,
}: {
  state: FriendshipState;
  pseudo: string;
  userId: string;
  requestId: string | null;
  primary?: boolean;
  source?: "profile" | "search";
  busy?: boolean;
}) {
  if (state === "pending_out") {
    return (
      <Button variant="secondary" icon="wait" disabled data-testid="friend-state">
        {friendStateLabels.pending_out}
      </Button>
    );
  }
  if (state === "pending_in" && requestId) {
    return (
      <div className="s-row">
        <Form method="post">
          <input type="hidden" name="intent" value="friend_accept" />
          <input type="hidden" name="id" value={requestId} />
          <Button type="submit" variant={primary ? "primary" : "secondary"} icon="check" loading={busy}>
            {socialLabels.accept}
          </Button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="friend_decline" />
          <input type="hidden" name="id" value={requestId} />
          <Button type="submit" variant="secondary" icon="close" loading={busy}>
            {socialLabels.decline}
          </Button>
        </Form>
      </div>
    );
  }
  if (state === "friends") {
    return (
      <Form method="post">
        <input type="hidden" name="intent" value="friend_remove" />
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="secondary" icon="close" loading={busy} data-testid="friend-remove">
          {socialLabels.removeFriend}
        </Button>
      </Form>
    );
  }
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="friend_add" />
      <input type="hidden" name="pseudo" value={pseudo} />
      <input type="hidden" name="source" value={source} />
      <Button type="submit" variant={primary ? "primary" : "secondary"} icon="add" loading={busy}>
        {socialLabels.addFriend}
      </Button>
    </Form>
  );
}

/** Une personne dans une liste : avatar, pseudo, grade, secteur, véhicules (le nom d'un véhicule ne se tronque jamais). */
export function PersonRow({ person, action }: { person: PersonCard; action?: React.ReactNode }) {
  return (
    <li className="s-person" data-testid="person-row">
      <PersonAvatar url={person.avatarUrl} pseudo={person.pseudo} size={48} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(person.pseudo)}`}>
          {person.pseudo}
        </a>
        <div className="s-row s-row--tight">
          <Chip>{gradeLabels[person.grade]}</Chip>
          {person.departments && person.departments.length > 0 && (
            <span className="o-t-caption s-muted">{person.departments.join(", ")}</span>
          )}
        </div>
        {person.vehicles.length > 0 && (
          <ul className="s-person__vehicles">
            {person.vehicles.map((v) => (
              <li key={v.id}>{v.label}</li>
            ))}
          </ul>
        )}
      </div>
      {action}
    </li>
  );
}
