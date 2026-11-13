// Le haut compact de l'onglet Crew du site (petit lot de fin, partie E, option B « Comme le Profil » choisie par Damien le
// 13/11), comme l'appli (`CrewHead.tsx`) : la même ligne que le haut du Profil du site (`ProfileHead`). À gauche la vignette
// carrée de la couverture (le logo du crew dans son coin ; la toucher ouvre la couverture en grand avec la description et
// « Signaler »), au milieu le nom (il passe à la ligne, jamais tronqué ; ▾ ouvre « Mes crews » quand j'ai plusieurs crews),
// « N membres · tu es le chef » et la description sur une ligne avec « plus » (elle se déplie avec l'Instagram), à droite
// Inviter et Réglages empilés pour le chef. Discussion : pleine largeur sous la ligne, et sur grand écran elle monte sur la ligne.
// Dessous, la rangée d'onglets soulignés, collante, avec « Publier » en icône au bout.
import { Button, Icon } from "@orasso/design-system/web";
import {
  type CrewView,
  crewInstagramUrl,
  crewLabels,
  crewPageLabels as L,
  type MyCrew,
  crewTabLabels as T,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ProfileBio, SideIcon } from "../profile/ProfileHead";
import { ReportDialog } from "../ReportDialog";
import { UnderTabs } from "../UnderTabs";
import { CrewBadge } from "./CrewPage";

/** L'adresse de l'onglet Crew pour ce crew et cet onglet (la même que `crewTabHref` de `CrewSpaceView`). */
type TabHref = (slug: string, tab: string) => string;

/** La couverture du crew dans une boîte (la classe donne la taille) : l'image, sinon le dégradé du kit. */
function Cover({
  crew,
  className,
  testId,
}: {
  crew: Pick<CrewView, "bannerUrl" | "name">;
  className: string;
  testId?: string;
}) {
  return (
    <span className={className} data-testid={crew.bannerUrl ? testId : undefined}>
      {crew.bannerUrl ? <img src={crew.bannerUrl} alt={`Bannière de ${crew.name}`} /> : null}
    </span>
  );
}

function InstagramChip({ handle, testId }: { handle: string; testId: string }) {
  return (
    <a
      className="crw-sc"
      href={crewInstagramUrl(handle)}
      rel="noopener noreferrer"
      target="_blank"
      aria-label={L.instagramA11y(handle)}
      data-testid={testId}
    >
      <Icon name="instagram" size={16} />
      {handle}
    </a>
  );
}

/** La couverture en grand, la description et l'Instagram ; « Signaler » y est, pour un membre (plus en bas de l'espace). */
function CoverDialog({
  crew,
  open,
  onClose,
  leader,
  reportable,
}: {
  crew: CrewView;
  open: boolean;
  onClose: () => void;
  leader: boolean;
  reportable: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="cf-sheet" aria-label={crew.name} onClose={onClose} data-testid="crew-cover-dialog">
      <div className="cf-sheet__body">
        <div className="cf-sheet__head">
          <h2 className="s-h2">{crew.name}</h2>
          <Button variant="close" label={T.closeA11y} onClick={onClose} />
        </div>
        <div className="crw-cov-big">
          <Cover crew={crew} className="crw-cov-big__img" />
          <span className="crw-cov-big__logo">
            <CrewBadge name={crew.name} logoUrl={crew.logoUrl} size={46} />
          </span>
        </div>
        <p className="o-t-caption s-muted crw-cov-big__sub">
          {crewLabels.membersCount(crew.membersCount)}
          {leader ? <span className="crw-tag crw-tag--acc">{L.youLead}</span> : null}
        </p>
        {crew.description ? (
          <p className="crw-cov-big__bio s-prewrap" data-testid="crew-cover-description">
            {crew.description}
          </p>
        ) : null}
        {crew.instagram ? <InstagramChip handle={crew.instagram} testId="crew-cover-instagram" /> : null}
        {reportable ? <ReportDialog look="link" targetType="crew" targetId={crew.id} /> : null}
      </div>
    </dialog>
  );
}

export function CrewHead({
  crews,
  crew,
  leader,
  member,
  live,
  tabHref,
}: {
  crews: readonly MyCrew[];
  crew: CrewView;
  leader: boolean;
  member: boolean;
  live: boolean;
  tabHref: TabHref;
}) {
  const [cover, setCover] = useState(false);
  const several = crews.length > 1;
  const unread = crew.space?.unreadCount ?? 0;
  const sub = `${crewLabels.membersCount(crew.membersCount)} · ${leader ? T.youLeader : T.youMember}`;
  const name = (
    <>
      <b className="crw-head__name o-never-truncate" data-testid="crew-name">
        {crew.name}
      </b>
      {several ? <Icon name="down" size={20} /> : null}
    </>
  );
  const instagram = crew.instagram ? <InstagramChip handle={crew.instagram} testId="crew-instagram" /> : null;
  return (
    <div className="crw-head" data-testid="crew-head">
      <button
        type="button"
        className="crw-cov"
        aria-label={T.coverA11y}
        onClick={() => setCover(true)}
        data-testid="crew-cover-open"
      >
        <Cover crew={crew} className="crw-cov__img" testId="crew-cover" />
        <span className="crw-cov__logo" aria-hidden="true">
          <CrewBadge name={crew.name} logoUrl={crew.logoUrl} size={32} />
        </span>
      </button>
      <div className="crw-head__mid">
        {several ? (
          <details className="crw-sel__menu">
            <summary className="crw-head__nm" aria-label={T.selectorA11y(crew.name)} data-testid="crew-selector">
              {name}
            </summary>
            <ul className="crw-sel__list" aria-label={T.selectorTitle} data-testid="crew-selector-list">
              {crews.map((c) => (
                <li key={c.id}>
                  <a
                    href={tabHref(c.slug, "fil")}
                    aria-current={c.id === crew.id ? "true" : undefined}
                    data-testid={`crew-choice-${c.slug}`}
                  >
                    <CrewBadge name={c.name} logoUrl={c.logoUrl} size={36} />
                    <span className="crw-grow">
                      <b className="o-never-truncate">{c.name}</b>
                      <span className="o-t-caption s-muted crw-block">
                        {c.id === crew.id && unread > 0
                          ? `${crewLabels.membersCount(c.membersCount)} · ${T.unreadMessages(unread)}`
                          : crewLabels.membersCount(c.membersCount)}
                      </span>
                    </span>
                    {c.id === crew.id ? <Icon name="check" size={20} /> : null}
                  </a>
                </li>
              ))}
              <li>
                <a href="/app/crews/rejoindre" data-testid="crew-choice-more">
                  <Icon name="add" size={22} />
                  <span className="crw-grow">
                    <b>{T.joinOrCreate}</b>
                  </span>
                </a>
              </li>
            </ul>
          </details>
        ) : (
          <div className="crw-head__nm" data-testid="crew-selector-single">
            {name}
          </div>
        )}
        <span className="o-t-caption s-muted" data-testid="crew-sub">
          {sub}
        </span>
        {crew.description ? (
          <ProfileBio text={crew.description} testId="crew-description" extra={instagram} />
        ) : instagram ? (
          <div className="pt-bio__extra">{instagram}</div>
        ) : null}
      </div>
      {member && crew.conversationId ? (
        <span className="crw-head__disc">
          <Button
            variant="secondary"
            icon="chat"
            href={`/app/messages/${crew.conversationId}`}
            aria-label={L.discussionA11y(unread)}
            data-testid="crew-discussion"
          >
            {L.discussion}
          </Button>
          {unread > 0 ? (
            <span className="crw-dot" data-testid="crew-unread">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      ) : null}
      {leader && live ? (
        <div className="pt-side crw-head__side">
          <SideIcon icon="share" label={L.inviteA11y} href={`/c/${crew.slug}/inviter`} testId="crew-invite" />
          <SideIcon icon="gear" label={L.settingsA11y} href={`/c/${crew.slug}/reglages`} testId="crew-settings" />
        </div>
      ) : null}
      <CoverDialog
        crew={crew}
        open={cover}
        onClose={() => setCover(false)}
        leader={leader}
        reportable={member && !leader && live}
      />
    </div>
  );
}

/**
 * La rangée d'onglets soulignés (collante sous la barre du haut) avec « Publier » en icône moutarde au bout : le seul bouton
 * principal et le seul néon de l'écran. Un onglet qui déborde (police agrandie) fait défiler la rangée de côté, son bord droit
 * s'efface tant qu'il reste des onglets à découvrir.
 */
export function CrewTabsBar({
  value,
  items,
  publish,
}: {
  value: string;
  items: readonly { id: string; label: string; href: string; count?: number | null }[];
  /** `null` : pas de « Publier » (non membre, crew dissous). Sinon `onClick` sur l'onglet Fil, un lien ailleurs. */
  publish: { onClick: () => void } | { href: string } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(".utabs");
    if (!row) return;
    const measure = () =>
      setMore(row.scrollWidth > row.clientWidth + 1 && row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(row);
    return () => {
      row.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);
  const button: ReactNode = publish ? (
    <Button
      icon="camera"
      aria-label={T.publishA11y}
      data-testid="crew-feed-publish"
      {...("href" in publish ? { href: publish.href } : { onClick: publish.onClick })}
    />
  ) : null;
  return (
    <div className="crw-tabsbar" ref={box} data-more={more ? "true" : undefined}>
      <UnderTabs
        value={value}
        items={items}
        label={crewLabels.crew}
        testId="crew-tabs"
        itemTestId={(id) => `crew-tab-${id}`}
      />
      {button}
    </div>
  );
}
