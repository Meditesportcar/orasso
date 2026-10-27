import { Button, Chip, Icon, type IconName } from "@orasso/design-system/web";
import {
  type FollowButtonKind,
  type FollowState,
  followButtonKind,
  gradeLabels,
  networkLabels as N,
  type PersonCard,
  type ProfileVisibility,
} from "@orasso/shared";
import type { MouseEvent } from "react";
import { Form } from "react-router";

// Éléments sociaux communs du site (lot 17 ; lot R6b : le bouton « Suivre » remplace celui d'ami) : avatar, bouton de
// suivi, ligne de personne.

export function PersonAvatar({ url, pseudo, size = 40 }: { url: string | null; pseudo: string; size?: number }) {
  return (
    <span className="s-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{pseudo.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

const FOLLOW_LABEL: Record<FollowButtonKind, string> = {
  follow: N.follow,
  follow_back: N.followBack,
  request: N.request,
  following: N.followed,
  requested: N.requested,
};
const FOLLOW_ICON: Record<FollowButtonKind, IconName> = {
  follow: "add",
  follow_back: "add",
  request: "add",
  following: "check",
  requested: "wait",
};
/** Identifiants de test de la version compacte (listes). */
const SMALL_TEST_ID: Record<FollowButtonKind, string> = {
  follow: "net-follow",
  follow_back: "net-follow-back",
  request: "net-follow",
  following: "net-followed",
  requested: "net-requested",
};

/** Un abonnement à poser (principal sur le profil) ou un état déjà posé (secondaire, confirmation avant de le défaire). */
const isAction = (k: FollowButtonKind) => k === "follow" || k === "follow_back" || k === "request";

/** « Garder » : referme la confirmation en place (sans script, le clic sur le bouton « Abonné » la referme aussi). */
function keep(e: MouseEvent<HTMLElement>) {
  const d = e.currentTarget.closest("details");
  if (d) d.open = false;
}

/**
 * Le bouton unique « Suivre » (lot R6b, D37 : il remplace l'amitié ; maquettes R6.1 et R6.2), selon `followButtonKind` :
 * Suivre / Suivre en retour / Demander à suivre posent l'abonnement ; Abonné / Demandé ouvrent, en place, la
 * confirmation « Ne plus suivre X ? » / « Annuler ta demande à X ? ». Tout passe par des formulaires (`intent` `follow`
 * ou `unfollow`) et une confirmation `<details>` : ça marche sans JavaScript.
 * `full` : pleine largeur de sa colonne, principal pour s'abonner (profil). `small` : compact et toujours secondaire (listes).
 */
export function FollowAction({
  pseudo,
  mine,
  followsMe,
  canFollow,
  visibility,
  size = "full",
  inert = false,
  busy = false,
}: {
  pseudo: string;
  mine: FollowState;
  followsMe: boolean;
  canFollow: boolean;
  visibility: ProfileVisibility;
  size?: "full" | "small";
  /** Aperçu : le bouton ne fait rien. */
  inert?: boolean;
  busy?: boolean;
}) {
  const kind = followButtonKind({ canFollow, mine, followsMe, visibility });
  if (!kind) return null;
  const small = size === "small";
  const testId = small ? SMALL_TEST_ID[kind] : "follow-button";
  const label = FOLLOW_LABEL[kind];
  const buttonClass = small ? "fl-sm" : undefined;
  if (inert) {
    return (
      <Button
        variant={isAction(kind) && !small ? "primary" : "secondary"}
        icon={FOLLOW_ICON[kind]}
        fullWidth={!small}
        className={buttonClass}
        tabIndex={-1}
        data-testid={testId}
      >
        {label}
      </Button>
    );
  }
  if (isAction(kind)) {
    return (
      <Form method="post" className="fl-form">
        <input type="hidden" name="pseudo" value={pseudo} />
        <Button
          type="submit"
          name="intent"
          value="follow"
          variant={small ? "secondary" : "primary"}
          icon={FOLLOW_ICON[kind]}
          fullWidth={!small}
          className={buttonClass}
          loading={busy}
          aria-label={`${label} ${pseudo}`}
          data-testid={testId}
        >
          {label}
        </Button>
      </Form>
    );
  }
  const cancel = kind === "requested";
  return (
    <details className={small ? "fl-conf fl-conf--sm" : "fl-conf"}>
      <summary
        className={`o-button o-t-button o-button--secondary${small ? " fl-sm" : " o-button--full"}`}
        aria-label={`${label} ${pseudo}`}
        data-testid={testId}
      >
        <Icon name={FOLLOW_ICON[kind]} size={18} />
        <span className="o-button__label">{label}</span>
      </summary>
      <div className="fl-confirm" data-testid="follow-confirm">
        <p className="fl-confirm__q">{cancel ? N.cancelRequestConfirm(pseudo) : N.unfollowConfirm(pseudo)}</p>
        {!cancel && visibility === "private" && <p className="o-t-caption s-muted">{N.unfollowPrivateHint}</p>}
        <Form method="post" className="fl-form">
          <input type="hidden" name="pseudo" value={pseudo} />
          <Button
            type="submit"
            name="intent"
            value="unfollow"
            variant="alert"
            icon="close"
            fullWidth
            loading={busy}
            data-testid="follow-confirm-yes"
          >
            {cancel ? N.cancelRequest : N.unfollow}
          </Button>
        </Form>
        <Button variant="secondary" icon="back" fullWidth onClick={keep} data-testid="follow-confirm-keep">
          {N.keep}
        </Button>
      </div>
    </details>
  );
}

/** Referme le menu et sa confirmation (tous les `<details>` englobants). */
function closeAll(e: MouseEvent<HTMLElement>) {
  let d = e.currentTarget.closest("details");
  while (d) {
    d.open = false;
    d = d.parentElement?.closest("details") ?? null;
  }
}

/**
 * Lot R6b, tour 2 (relectures Opus 1, Codex 1) : le menu ⋯ d'une ligne de mes abonnés. « Retirer cet abonné » ouvre la
 * confirmation en place ; « Retirer » envoie `follower_remove` (la personne n'est pas prévenue). Deux `<details>` : ça
 * marche sans JavaScript.
 */
export function FollowerMenu({ userId, pseudo, busy = false }: { userId: string; pseudo: string; busy?: boolean }) {
  return (
    <details className="fl-conf fl-conf--sm">
      <summary className="o-button o-button--close fl-x" aria-label={N.rowMenu(pseudo)} data-testid="net-person-more">
        <Icon name="more" size={16} />
      </summary>
      <div className="fl-confirm" data-testid="net-follower-menu">
        <details className="fl-step">
          <summary className="o-button o-t-button o-button--secondary o-button--full" data-testid="net-remove">
            <Icon name="close" size={18} />
            <span className="o-button__label">{N.removeFollower}</span>
          </summary>
          <div className="fl-step__body" data-testid="net-remove-confirm">
            <p className="fl-confirm__q">{N.removeFollowerConfirm(pseudo)}</p>
            <p className="o-t-caption s-muted">{N.removeFollowerHint}</p>
            <Form method="post" className="fl-form">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="pseudo" value={pseudo} />
              <Button
                type="submit"
                name="intent"
                value="follower_remove"
                variant="alert"
                icon="close"
                fullWidth
                loading={busy}
                data-testid="net-remove-yes"
              >
                {N.remove}
              </Button>
            </Form>
            <Button variant="secondary" icon="back" fullWidth onClick={closeAll} data-testid="net-remove-keep">
              {N.keep}
            </Button>
          </div>
        </details>
      </div>
    </details>
  );
}

/**
 * Une carte de personne (recherche, propriétaires près de chez moi) ne dit pas si le compte est privé : ses départements
 * sont absents d'un compte privé dont on n'est pas abonné accepté. Sert seulement à choisir « Suivre » ou « Demander à
 * suivre » ; l'API tranche (même règle que l'appli).
 */
export function cardVisibility(person: Pick<PersonCard, "departments" | "follow">): ProfileVisibility {
  return person.departments === null && person.follow.mine !== "accepted" ? "private" : "public";
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
