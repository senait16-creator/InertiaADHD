// Fixed list of Maintenance areas, shared between the Maintenance home
// (js/maintenance.js) and a category's board (js/category.js). Areas are
// not user-created rows — this list is the source of truth for which
// keys/icons/colors exist. `real: true` is wired up to an actual board
// and is also what category.js checks before rendering one directly by
// URL — an area only ever belongs here once it's built; there's no
// "soon" placeholder concept anymore (removed at the user's request).
// Most real areas use the generic 4-section board (js/category.js);
// `href` overrides that for any area with its own dedicated page(s)
// instead — Hair (hair.html and friends) is an experimentation
// framework, not the plain title/notes/link shape category.js boards
// use; Relationships (relationships.html/person.html) has its own
// richer per-person profile for the same reason; Hair Care and the four
// Skin/Body/Nail/Jewelry Care areas are the Maintenance product/cost
// system (js/maintenanceShared.js and friends) — Hair Care is a second,
// cost-first view onto Hair Lab's own hair_products table (no separate
// table of its own), while the other four write to the generic
// maintenance_products/maintenance_routine_steps tables, filtered by
// the `area` query param on their shared pages.
export const MAINTENANCE_AREAS = [
  { key: "hair", name: "Hair", icon: "crown", color: "lavender", real: true, href: "hair.html" },
  { key: "hair-care", name: "Hair Care", icon: "shopping-cart", color: "amber", real: true, href: "hair-care.html" },
  { key: "skin", name: "Skin Care", icon: "droplets", color: "blue", real: true, href: "maintenance-products.html?area=skin" },
  { key: "body", name: "Body Care", icon: "dumbbell", color: "sage", real: true, href: "maintenance-products.html?area=body" },
  { key: "nail", name: "Nail Care", icon: "sparkles", color: "green", real: true, href: "maintenance-products.html?area=nail" },
  { key: "jewelry", name: "Jewelry", icon: "award", color: "lavender", real: true, href: "maintenance-products.html?area=jewelry" },
  { key: "relationships", name: "Relationships", icon: "users", color: "green", real: true, href: "relationships.html" },
];

export function getMaintenanceArea(key) {
  return MAINTENANCE_AREAS.find((area) => area.key === key) || null;
}
