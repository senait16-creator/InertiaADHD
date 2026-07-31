// Fixed list of Maintenance areas, shared between the Maintenance home
// (js/maintenance.js) and a category's board (js/category.js). Areas are
// not user-created rows — this list is the source of truth for which
// keys/icons/colors exist. `real: true` is wired up to an actual board
// and is also what category.js checks before rendering one directly by
// URL — an area only ever belongs here once it's built; there's no
// "soon" placeholder concept anymore (removed at the user's request).
// Most real areas use the generic 4-section board (js/category.js);
// `href` overrides that for Relationships, which has its own dedicated
// pages (relationships.html/person.html) instead — its data (a
// person's circle, season, feelings, ...) doesn't fit the plain
// title/notes/link shape category.js boards use.
export const MAINTENANCE_AREAS = [
  { key: "hair", name: "Hair", icon: "crown", color: "lavender", real: true },
  { key: "relationships", name: "Relationships", icon: "users", color: "green", real: true, href: "relationships.html" },
];

export function getMaintenanceArea(key) {
  return MAINTENANCE_AREAS.find((area) => area.key === key) || null;
}
