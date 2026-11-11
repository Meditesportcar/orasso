// Le haut compact de la page d'une structure et de la fiche d'un pro, sur le site (lot R8g, maquette R9.3 `n-page`, vue « Un
// visiteur ») : la même grille que l'appli et que le haut du Profil (`pt-id`) : le logo dans l'anneau de ses stories, le nom (il
// **passe à la ligne**, jamais tronqué), le type et la vérification, « Suivre » (le seul bouton principal), la bio sur une ligne
// avec « plus », à droite les icônes empilées ; dessous la bande de compteurs. Rendu côté serveur : tout marche sans JavaScript.
import { AvatarRing, type AvatarRingState, Icon } from "@orasso/design-system/web";
import { pagesLabels as L, type PageCounter } from "@orasso/shared";
import type { ReactNode } from "react";

import "../../styles/pages.css";
import { type BandCell, CounterBand, ProfileBio } from "../profile/ProfileHead";

export function PageHead({
  testId,
  name,
  logoUrl,
  ring,
  storiesHref,
  typeLabel,
  verifiedLabel,
  follow,
  bio,
  side,
  counters,
  counterHref,
  nameAs: Name = "h1",
}: {
  testId: string;
  name: string;
  logoUrl: string | null;
  ring: AvatarRingState;
  /** Présent quand il y a une story à ouvrir. */
  storiesHref?: string;
  typeLabel: string;
  verifiedLabel: string | null;
  /** « Suivre » / « Suivi » : un petit bouton principal (formulaire ou lien). */
  follow: ReactNode;
  bio: string | null;
  /** Les icônes empilées à droite. */
  side: ReactNode;
  counters: readonly PageCounter[];
  /** Où mène un compteur qui ouvre quelque chose (« événements », « partenaires » : l'onglet des événements). */
  counterHref?: (key: PageCounter["key"]) => string | undefined;
  nameAs?: "h1" | "h2";
}) {
  const cells: BandCell[] = counters.map((x) => ({
    key: x.key,
    value: x.value,
    label: x.label,
    href: x.key !== "followers" ? counterHref?.(x.key) : undefined,
    testId: `page-count-${x.key}`,
  }));
  return (
    <div className="pt-top" data-testid={testId}>
      <div className="pt-id pg-id">
        <div className="pt-id__av">
          <AvatarRing
            ring={ring}
            neon={false}
            size="profile"
            src={logoUrl}
            name={name}
            href={storiesHref}
            label={storiesHref ? L.openStories : undefined}
          />
        </div>
        <div className="pt-id__mid">
          <Name className="pg-id__name o-t-poster-l" data-testid="page-name">
            {name}
          </Name>
          <div className="pt-id__gl">
            <span className="pg-type" data-testid="page-type">
              {typeLabel}
            </span>
            {verifiedLabel ? (
              <span className="pt-dept s-verified" data-testid="verified-badge">
                <Icon name="check" size={14} />
                {verifiedLabel}
              </span>
            ) : null}
            {follow}
          </div>
          <ProfileBio text={bio} testId="page-bio" />
        </div>
        <div className="pt-side">{side}</div>
      </div>
      {cells.length > 0 ? <CounterBand cells={cells} label={L.countsGroup} testId="page-counts" /> : null}
    </div>
  );
}
