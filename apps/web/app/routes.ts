import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // Page de démonstration du système de design : non liée, non référencée (lot 03).
  route("_ds", "routes/ds.tsx"),
] satisfies RouteConfig;
