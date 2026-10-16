import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Administration (super admin seulement) : layout à barre latérale, une page = une route enfant.
export default [route("admin", "layouts/admin.tsx", [index("routes/admin/index.tsx")])] satisfies RouteConfig;
