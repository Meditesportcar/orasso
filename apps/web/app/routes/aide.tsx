// Aide du site (lot M5, parité de la maquette 7.3) : les questions fréquentes (mêmes textes que l'appli, `helpFaq` de
// `packages/shared`), « Nous écrire » et « Signaler un problème » par e-mail, et la ligne qui dit où sont passés les
// sanctions (Compte) et l'export des données (Confidentialité). Les tutos animés vivent dans l'appli. Sans JavaScript :
// les questions s'ouvrent avec `<details>`.
import { Icon } from "@orasso/design-system/web";
import { CONTACT_EMAIL, helpFaq, helpLabels } from "@orasso/shared";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/aide";
import "../styles/aide.css";

// Lot M7 : une page de réglage (Profil › Aide), mode B : en-tête de fiche, sans bande ni barre d'onglets.
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Aide · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  return null;
}

const mailto = (subject: string, body?: string) =>
  `mailto:${CONTACT_EMAIL}?${[`subject=${encodeURIComponent(subject)}`, ...(body ? [`body=${encodeURIComponent(body)}`] : [])].join("&")}`;

export default function Aide() {
  return (
    <>
      <FicheBar title={helpLabels.title} back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="aide">
        <div className="s-stack s-stack--tight">
          <p className="s-muted">Questions fréquentes, nous écrire. Les tutos animés sont dans l'appli Orasso.</p>
        </div>

        <section className="s-section s-section--first s-stack s-stack--tight" aria-labelledby="faq-titre">
          <h2 id="faq-titre" className="s-h2">
            {helpLabels.faq}
          </h2>
          <div className="ai-faq" data-testid="help-faq">
            {helpFaq.map((f, i) => (
              <details key={f.id} open={i === 0}>
                <summary>
                  <span>{f.q}</span>
                  <Icon name="down" size={18} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="s-section s-stack s-stack--tight" aria-labelledby="ecrire-titre">
          <h2 id="ecrire-titre" className="s-h2">
            {helpLabels.write}
          </h2>
          <div className="ai-list" data-testid="help-write">
            <a className="ai-row" href={mailto(helpLabels.writeSubject("site"))} data-testid="help-write-team">
              <Icon name="chat" size={20} />
              <span className="ai-row__text">
                <strong>{helpLabels.writeTeam}</strong>
                <span className="o-t-caption">{helpLabels.writeTeamCaption}</span>
              </span>
              <Icon name="next" size={16} />
            </a>
            <a
              className="ai-row"
              href={mailto(helpLabels.reportSubject("site", "web"), helpLabels.reportBody)}
              data-testid="help-report"
            >
              <Icon name="flag" size={20} />
              <span className="ai-row__text">
                <strong>{helpLabels.report}</strong>
                <span className="o-t-caption">{helpLabels.reportCaption}</span>
              </span>
              <Icon name="next" size={16} />
            </a>
          </div>
        </section>

        <p className="o-t-caption s-muted ai-center" data-testid="help-moved">
          {helpLabels.movedNoteSite}
        </p>
      </div>
    </>
  );
}
