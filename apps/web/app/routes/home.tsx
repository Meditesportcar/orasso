import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Orasso" },
    { name: "description", content: "Organisation et gestion d'événements automobiles" },
    { property: "og:image", content: "/og-image.png" },
  ];
}

// Page provisoire du socle : le site public arrive avec les lots 07 et 13.
export default function Home() {
  return (
    <main>
      <h1>Orasso</h1>
      <p>Site en construction.</p>
    </main>
  );
}
