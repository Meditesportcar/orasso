import { readThemeCookie, serverTheme, ThemeProvider, ThemeScript } from "@orasso/design-system/web";
import "@orasso/design-system/web/styles.css";
import "./styles/site.css";
import "./styles/dev-clock.css";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import { ClockBanner } from "./components/ClockBanner";
import { setClockOffset } from "./lib/clock";
import { readClockOffset } from "./lib/clock.server";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

// En-têtes de sécurité des pages (recette du lot 12) : pas d'encadrement par un autre site (espace organisateur,
// candidature), référent réduit à l'origine, nosniff. HSTS est posé par nginx.
export const headers: Route.HeadersFunction = () => ({
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
});

// La préférence de thème est un cookie : le serveur écrit le bon `data-theme` dans le HTML, sans flash.
export async function loader({ request }: Route.LoaderArgs) {
  // Horloge simulée (lot 34a) : le décalage de l'API passe au navigateur. 0 (et aucun appel) hors développement.
  const clockOffsetMs = await readClockOffset(request);
  return { themePreference: readThemeCookie(request.headers.get("cookie")), clockOffsetMs };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const preference = data?.themePreference ?? "beton";
  // Avant le rendu des pages : le serveur et le navigateur lisent la même heure (hydratation sans écart).
  if (data) setClockOffset(data.clockOffsetMs);
  return (
    // suppressHydrationWarning : pour « auto », ThemeScript corrige data-theme avant la première peinture.
    <html lang="fr" data-theme={serverTheme(preference)} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#17191C" />
        <ThemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider initialPreference={preference}>
          {children}
          <ClockBanner />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Erreur";
  let details = "Une erreur inattendue est survenue.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Erreur";
    details = error.status === 404 ? "Cette page n'existe pas." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
