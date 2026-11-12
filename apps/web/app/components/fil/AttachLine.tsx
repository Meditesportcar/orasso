// La deuxième ligne d'une carte de publication rattachée à un événement (lot R8c2, maquette R8.7 `r8at`), comme dans l'appli :
// « pour le Rassemblement du Lydia · lun. 9 nov. », « présent au … », « sera au … », « était au … », et le tampon « Présent »
// quand la présence est validée. Le verbe est accordé avec le titre (`attachPhrase`). Toute la ligne ouvre la fiche de
// l'événement ; le titre ne se tronque jamais. Sans rôle : le titre seul.
import { Icon } from "@orasso/design-system/web";
import { attachDateLabel, attachPhrase, type FeedAttachView, feedScreenLabels as L } from "@orasso/shared";

/** Le texte de la ligne : « pour le Rassemblement du Lydia · lun. 9 nov. ». */
export function attachLineText(attach: FeedAttachView): string {
  const phrase = attachPhrase(attach.role, attach.phase, attach.event.title);
  const date = attachDateLabel(attach.event.startsAt);
  return date ? `${phrase} · ${date}` : phrase;
}

export function AttachLine({ attach }: { attach: FeedAttachView }) {
  const text = attachLineText(attach);
  return (
    <div className="fil-attach">
      <a
        className="fil-attach__line"
        href={`/e/${attach.event.slug}`}
        aria-label={L.attachOpen(text)}
        data-testid="feed-attach"
      >
        <span data-testid="feed-attach-text">{text}</span>
        <Icon name="next" size={14} />
      </a>
      {attach.presenceValidated ? (
        <span className="fil-attach__stamp" data-testid="feed-attach-stamp">
          <Icon name="stamp" size={13} />
          {L.attachStamp}
        </span>
      ) : null}
    </div>
  );
}

/** « Voir la fiche » : le bouton secondaire de la ligne d'actions d'une publication d'organisateur. */
export function AttachSeeButton({ attach }: { attach: FeedAttachView }) {
  if (attach.role !== "organizer") return null;
  return (
    <a
      className="fil-link"
      href={`/e/${attach.event.slug}`}
      aria-label={`${L.seeEvent} : ${attach.event.title}`}
      data-testid="feed-attach-see"
    >
      <Icon name="next" size={16} /> {L.seeEvent}
    </a>
  );
}
