import { Icon, type IconName } from "@orasso/design-system/web";
import { profileTabsLabels as PT, wideWordEm } from "@orasso/shared";
import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef, useState } from "react";

import "../../styles/profile.css";

// Le haut du Profil, version « Compact » (lot R8b1, décision D40, maquette R8.1 `pr-profil`, option A), sur le site : la même
// grille que l'appli (`ProfileHead.tsx` de l'appli). Une grille de trois colonnes : la photo de 72 px ; au milieu le pseudo
// (une ligne, il rapetisse au lieu de se couper), la ligne du grade et du département (ou « Suivre » chez un autre) et la bio
// sur une seule ligne avec « plus » ; à droite deux icônes empilées. Dessous, la bande de compteurs (`CounterBand`). Mon
// compte (`/app/moi`) et le profil d'un membre (`PublicProfile`) montent les mêmes briques.

/** Une icône carrée de 36 px, empilée à droite de la photo : un lien (`href`) ou un bouton (`onClick`, `type="submit"`). */
export function SideIcon({
  icon,
  label,
  href,
  testId,
  type,
  disabled,
  tabIndex,
  onClick,
  target,
}: {
  icon: IconName;
  label: string;
  href?: string;
  testId?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  tabIndex?: number;
  onClick?: () => void;
  /** Un lien qui sort d'Orasso (`_blank`) : ouvert dans un nouvel onglet, sans lien vers l'opener. */
  target?: "_blank";
}) {
  const body = <Icon name={icon} size={20} />;
  return href ? (
    <a
      className="pt-side__btn"
      href={href}
      aria-label={label}
      title={label}
      data-testid={testId}
      tabIndex={tabIndex}
      target={target}
      rel={target ? "noopener noreferrer" : undefined}
      onClick={onClick}
    >
      {body}
    </a>
  ) : (
    <button
      type={type ?? "button"}
      className="pt-side__btn"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      tabIndex={tabIndex}
    >
      {body}
    </button>
  );
}

/**
 * La bio sur une seule ligne : « plus » (avec un chevron bas) la déroule en entier, « moins » la replie. « plus » n'apparaît que
 * si la bio est vraiment coupée (mesuré dans le navigateur) ; sans bio, pas de ligne.
 */
export function ProfileBio({ text, testId }: { text: string | null | undefined; testId?: string }) {
  const line = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = line.current;
    if (!el || open) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open]);
  if (!text) return null;
  return (
    <div className={open ? "pt-bio pt-bio--open" : "pt-bio"}>
      <p ref={line} data-testid={testId}>
        {text}
      </p>
      {cut || open ? (
        <button
          type="button"
          className="pt-bio__more"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {open ? PT.bioLess : PT.bioMore}
          <Icon name="down" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function ProfileHead({
  avatar,
  name,
  nameAs: Name = "p",
  line,
  bio,
  bioTestId,
  side,
  testId,
}: {
  /** La photo dans son anneau de 72 px (avec son petit appareil photo sur mon compte). */
  avatar: ReactNode;
  name: string;
  /** L'élément du pseudo : `p` sur Mon compte, `h1` ou `h2` sur un profil. */
  nameAs?: ElementType;
  /** La ligne du grade : grade, département, « Suivre »… */
  line: ReactNode;
  bio?: string | null;
  bioTestId?: string;
  side: ReactNode;
  testId?: string;
}) {
  return (
    <div className="pt-id" data-testid={testId}>
      <div className="pt-id__av">{avatar}</div>
      <div className="pt-id__mid">
        <div className="pt-id__namebox">
          <Name className="pt-id__name o-t-poster-l" style={{ "--em": wideWordEm(name) } as CSSProperties}>
            {name}
          </Name>
        </div>
        <div className="pt-id__gl">{line}</div>
        <ProfileBio text={bio} testId={bioTestId} />
      </div>
      <div className="pt-side">{side}</div>
    </div>
  );
}

/** Une case de la bande de compteurs. `value` `null` : la lecture n'a pas abouti, la case dit « – ». */
export type BandCell = {
  key: string;
  value: number | null;
  /** Le libellé accordé au nombre (« abonné », « abonnés »). */
  label: string;
  /** Sans adresse, le nombre n'ouvre rien. */
  href?: string;
  testId: string;
};

/** `.r8cnt.band` : un trait en haut et en bas, les colonnes séparées d'un trait, le nombre en 18 gras, le libellé dessous. */
export function CounterBand({ cells, label, testId }: { cells: readonly BandCell[]; label: string; testId: string }) {
  return (
    <nav className="pt-band" style={{ "--n": cells.length } as CSSProperties} aria-label={label} data-testid={testId}>
      {cells.map((cell) => {
        const body = (
          <>
            <strong>{cell.value === null ? PT.unknownCount : cell.value}</strong>
            <small>{cell.label}</small>
          </>
        );
        return cell.href ? (
          <a key={cell.key} href={cell.href} data-testid={cell.testId}>
            {body}
          </a>
        ) : (
          <span key={cell.key} data-testid={cell.testId}>
            {body}
          </span>
        );
      })}
    </nav>
  );
}
