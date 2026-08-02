// Fixed option lists for the Relationships panel (see relationships.html,
// person.html). Deliberately closed vocabularies — tap-to-select chips,
// not free text — so updating someone stays fast. None of these are a
// score: Season and Feelings in particular are honest descriptions of
// the present, not a rating.
export const CIRCLES = [
  "Core / Go-To",
  "Close Friend",
  "Community",
  "Growing Friendship",
  "Distant Friend",
  "Acquaintance",
  "Family",
  "Mentor",
  "Professional",
];

export const SEASONS = [
  "Flourishing",
  "Growing",
  "Stable",
  "Needs Tending",
  "Gray Area",
  "Reconciliation",
  "Space",
  "Boundaries",
];

export const INVESTMENT_INTENTIONS = ["Invest More", "Maintain", "Occasional Check-ins", "Give Space", "Revisit Later"];

export const FEELINGS = [
  "Safe",
  "Peaceful",
  "Energized",
  "Seen",
  "Comfortable",
  "Curious",
  "Uncertain",
  "Tense",
  "Drained",
  "Anxious",
  "Guarded",
];

// Seasons that read as "things are okay" for the Reconnect view below —
// not a health score, just which words in the list describe an
// unstrained relationship worth quietly resurfacing.
const RECONNECT_SEASONS = new Set(["Flourishing", "Growing", "Stable"]);
const RECONNECT_INTENTIONS = new Set(["Invest More", "Maintain", "Occasional Check-ins"]);
const RECONNECT_STALE_DAYS = 30;

// A person belongs in the Reconnect view when the relationship reads as
// good/stable, the stated intention is to stay engaged, and there's no
// recent recorded connection — never because of a missed-checkin streak
// or a countdown; this is a quiet surfacing, not a task.
export function isReconnectCandidate(person) {
  const season = person.season || [];
  const hasGoodSeason = season.some((s) => RECONNECT_SEASONS.has(s));
  const wantsEngagement = RECONNECT_INTENTIONS.has(person.investment_intention);
  if (!hasGoodSeason || !wantsEngagement) return false;

  if (!person.last_connection_at) return true;
  const daysSince = (Date.now() - new Date(person.last_connection_at).getTime()) / 86400000;
  return daysSince >= RECONNECT_STALE_DAYS;
}

// A deterministic (not random) color per person, so the same person
// always gets the same avatar tint across visits — cycles the app's
// existing 5-color palette rather than introducing new colors.
const AVATAR_COLORS = ["sage", "green", "blue", "amber", "lavender"];
export function avatarColorFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
