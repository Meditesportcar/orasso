import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Administration (super admin seulement) : layout à barre latérale, une page = une route enfant.
export default [
  route("admin", "layouts/admin.tsx", [
    index("routes/admin/index.tsx"),
    // Lot 31 : certifications de véhicules, transferts de plaque à arbitrer.
    route("certifications", "routes/admin/certifications.tsx"),
    route("transferts", "routes/admin/transferts.tsx"),
    // Lot 32 : file des signalements (modérateur et super admin), sanctions et contestations (super admin).
    route("signalements", "routes/admin/signalements.tsx"),
    route("sanctions", "routes/admin/sanctions.tsx"),
  ]),
] satisfies RouteConfig;
