import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Administration (super admin seulement) : layout à barre latérale, une page = une route enfant.
export default [
  route("admin", "layouts/admin.tsx", [
    index("routes/admin/index.tsx"),
    // Lot 31 : certifications de véhicules, transferts de plaque à arbitrer.
    route("certifications", "routes/admin/certifications.tsx"),
    route("transferts", "routes/admin/transferts.tsx"),
  ]),
] satisfies RouteConfig;
