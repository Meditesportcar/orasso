import { useLocation } from "react-router";

import { LEGAL_PAGES } from "../components/SiteChrome";

const TITLES: Record<string, string> = Object.fromEntries(
  LEGAL_PAGES.map((p) => [p.slug, p.slug === "conditions" ? "Conditions d'utilisation" : p.label]),
);

export function meta() {
  return [{ title: "Orasso · Informations légales" }, { name: "robots", content: "noindex" }];
}

// Pages provisoires : le texte définitif (CGU, confidentialité, mentions légales) viendra de Damien.
export default function Legal() {
  const slug = useLocation().pathname.replace(/^\//, "");
  return (
    <div className="s-stack">
      <h1 className="s-title">{TITLES[slug] ?? "Informations"}</h1>
      <p className="s-notice">
        Cette page est provisoire : le texte définitif sera publié avant l'ouverture au public. Pour toute question,
        écris à contact@orasso.fr.
      </p>
    </div>
  );
}
