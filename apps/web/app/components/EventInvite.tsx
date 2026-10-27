import { Button, Icon } from "@orasso/design-system/web";
import {
  eventInvitedBanner,
  type FollowingGoing,
  followingGoingText,
  GOING_FACES,
  inviteNoteLines,
  inviterNames,
  eventInviteLabels as L,
  type ReceivedEventInvitation,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { PersonAvatar } from "./People";
import { ReportDialog } from "./ReportDialog";
import "../styles/event-invite.css";

// Lot R6c (maquettes R6.3 et R6.6) : les morceaux du site pour « inviter du monde » à un événement, partagés par la
// fiche d'un événement et la Boîte : le menu « ⋯ » de l'invité, le bandeau « Kenji_66 t'invite », « Qui y va ».

/** Les réglages de notifications du site (« Invitations, oui ou non »). */
export const INVITE_SETTINGS_HREF = "/app/moi#notifications";

/**
 * Menu « ⋯ » d'une invitation : couper les invitations de cette personne, réglages, signaler. Tour 2 (relecture
 * Opus 5) : une invitation regroupée propose de couper, et de signaler, chacun de ses auteurs.
 */
export function InviteMenu({
  inviters,
  testId,
}: {
  inviters: { userId: string; pseudo: string }[];
  /** Identifiant de test du bouton « ⋯ ». */
  testId: string;
}) {
  const busy = useNavigation().state !== "idle";
  if (inviters.length === 0) return null;
  const names = inviterNames(
    inviters.map((p) => p.pseudo),
    inviters.length,
  );
  return (
    <details className="ri-menu">
      <summary className="ri-menu__dots" aria-label={L.moreA11y} data-testid={testId}>
        <Icon name="more" size={20} />
      </summary>
      <div className="ri-menu__sheet" data-testid="invite-menu">
        <strong className="ri-menu__title">{L.menuTitle(names)}</strong>
        {inviters.map((inviter) => (
          <Form key={inviter.userId} method="post" preventScrollReset>
            <input type="hidden" name="intent" value="invite_mute" />
            <input type="hidden" name="userId" value={inviter.userId} />
            <input type="hidden" name="pseudo" value={inviter.pseudo} />
            <button type="submit" className="ri-menu__row" disabled={busy} data-testid="invite-mute">
              <Icon name="bell" size={18} />
              <span>
                <strong>{L.mute(inviter.pseudo)}</strong>
                <small>{L.muteHint}</small>
              </span>
            </button>
          </Form>
        ))}
        <a className="ri-menu__row" href={INVITE_SETTINGS_HREF} data-testid="invite-settings">
          <Icon name="gear" size={18} />
          <span>
            <strong>{L.settings}</strong>
            <small>{L.settingsHint}</small>
          </span>
        </a>
        {inviters.map((inviter) => (
          <div key={`report-${inviter.userId}`} className="ri-menu__report">
            <ReportDialog
              look="link"
              targetType="profile"
              targetId={inviter.userId}
              label={inviters.length > 1 ? L.reportWho(inviter.pseudo) : undefined}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

/** Bandeau en haut de la fiche d'un événement : « Kenji_66 t'invite » et son mot (chacun attribué s'ils sont plusieurs). */
export function InviteBanner({ invitation }: { invitation: ReceivedEventInvitation }) {
  const { inviters } = invitation;
  const first = inviters[0];
  if (!first) return null;
  return (
    <div className="ri-banner" data-testid="invite-banner">
      <span className="ri-faces">
        {inviters.slice(0, 2).map((p) => (
          <PersonAvatar key={p.userId} url={p.avatarUrl} pseudo={p.pseudo} size={40} />
        ))}
      </span>
      <div>
        <b>
          {eventInvitedBanner(
            inviters.map((p) => p.pseudo),
            inviters.length,
          )}
        </b>
        {inviteNoteLines(inviters).map((line) => (
          <small key={line}>{line}</small>
        ))}
      </div>
      <InviteMenu inviters={inviters} testId="invite-banner-more" />
    </div>
  );
}

/** « Qui y va » (ceux que je suis) et « Inviter du monde ». Réservé aux membres connectés. */
export function WhoGoes({ going, slug }: { going: FollowingGoing | null; slug: string }) {
  return (
    <div className="ri-who" data-testid="who-goes">
      {/* Comme l'appli : le titre « Qui y va » seulement quand quelqu'un que je suis y va. */}
      {going && going.total > 0 && (
        <div className="ri-who__head">
          <span className="s-label o-t-label">{L.whoGoes}</span>
          <small className="o-t-caption s-muted">{L.whoGoesHint}</small>
        </div>
      )}
      {going && going.total > 0 && (
        <div className="ri-who__row" data-testid="who-goes-people">
          <span className="ri-faces">
            {going.people.slice(0, GOING_FACES).map((p) => (
              <PersonAvatar key={p.pseudo} url={p.avatarUrl} pseudo={p.pseudo} size={30} />
            ))}
          </span>
          <span>
            {followingGoingText(
              going.people.map((p) => p.pseudo),
              going.total,
            )}
          </span>
        </div>
      )}
      <Button
        variant="secondary"
        icon="send"
        href={`/e/${slug}/inviter`}
        fullWidth
        aria-label={L.inviteA11y}
        data-testid="invite-open"
      >
        {L.invite}
      </Button>
      <p className="o-t-caption s-muted">{L.noPlace}</p>
    </div>
  );
}
