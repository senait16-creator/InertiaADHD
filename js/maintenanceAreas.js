// Fixed list of Maintenance areas, shared between the Maintenance home
// (js/maintenance.js) and a category's board (js/category.js). Areas are
// not user-created rows — this list is the source of truth for which
// keys/icons/colors exist. `real: true` is wired up to an actual board;
// the rest show up dimmed with a "soon" tag until each gets built the
// same way. Most real areas use the generic 4-section board
// (js/category.js); `href` overrides that for Relationships, which has
// its own dedicated pages (relationships.html/person.html) instead —
// its data (a person's circle, season, feelings, ...) doesn't fit the
// plain title/notes/link shape category.js boards use.
export const MAINTENANCE_AREAS = [
  { key: "hair", name: "Hair", icon: "crown", color: "lavender", sub: "Wash schedule · Protective styles · Products", real: true },
  { key: "relationships", name: "Relationships", icon: "users", color: "green", sub: "Circle · Season · Intention", real: true, href: "relationships.html" },
  { key: "skin", name: "Skin", icon: "sparkles", color: "sage", sub: "Morning · Night · Products", real: false },
  { key: "nails", name: "Nails", icon: "sparkles", color: "blue", sub: "Ideas · Supplies · Appointments", real: false },
  { key: "feet", name: "Feet", icon: "footprints", color: "green", sub: "Pedicure · Moisturize · Shoes", real: false },
  { key: "body", name: "Body", icon: "scissors", color: "amber", sub: "Shaving · Waxing · Exfoliation", real: false },
  { key: "hygiene", name: "Hygiene", icon: "smile-plus", color: "lavender", sub: "Teeth · Whitening · Dentist", real: false },
];

export function getMaintenanceArea(key) {
  return MAINTENANCE_AREAS.find((area) => area.key === key) || null;
}
