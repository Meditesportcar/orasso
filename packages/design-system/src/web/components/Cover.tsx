import { cx } from "./cx";

export type CoverProps = {
  title?: string;
  subtitle?: string;
  className?: string;
};

/**
 * La couverture du système de design : crème, moutarde, rouge et nuit, coupés à dix degrés. Une affiche crème
 * sur le mur, la moutarde et le rouge posés dessus comme des autocollants, la bande de nuit qui sort à droite.
 * Décorative : sert à la page d'accueil du système et aux fiches partagées.
 */
export function Cover({ title = "Orasso", subtitle = "Affiche de nuit · tout le monde à sa place", className }: CoverProps) {
  return (
    <figure className={cx("o-cover", className)}>
      <svg
        className="o-cover__art"
        viewBox="0 0 960 288"
        role="img"
        aria-label="Orasso : crème, moutarde, rouge et nuit, coupés à dix degrés"
      >
        <rect className="o-cover__poster" x="480" y="0" width="240" height="288" />
        <g className="o-cover__ground">
          <polygon points="480,200 720,158 720,166 480,208" />
          <polygon points="480,232 720,190 720,198 480,240" />
          <polygon points="480,264 720,222 720,230 480,272" />
          <polygon points="480,296 720,254 720,262 480,304" />
        </g>
        <rect className="o-cover__night" x="720" y="0" width="240" height="96" />
        <rect className="o-cover__accent" x="744" y="120" width="168" height="144" rx="18" />
        <rect className="o-cover__win" x="640" y="24" width="72" height="72" rx="18" />
        <rect className="o-cover__raised" x="744" y="24" width="120" height="48" rx="18" />
        <rect className="o-cover__night" x="800" y="192" width="160" height="96" rx="18" />
      </svg>
      <figcaption className="o-cover__text">
        <h1 className="o-cover__title">{title}</h1>
        <p className="o-cover__subtitle o-t-meta">{subtitle}</p>
      </figcaption>
    </figure>
  );
}
