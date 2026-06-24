// Format a UTC ISO timestamp as an Eastern-Time deadline label.
// Used for the bracket lock deadline shown on the home + rules pages, derived
// from the real first-R32 kickoff so it auto-corrects once ESPN sets the time.
export function formatEtDeadline(iso: string | null, long = false): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  const tz = "America/New_York";

  if (long) {
    // "Sunday, June 28, 2026 at 12:00 PM ET"
    const date = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });
    return `${date} at ${time} ET`;
  }

  // Short: "Sun Jun 28 · 12pm ET"
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  let time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  time = time.replace(":00", "").replace(/\s/g, "").toLowerCase(); // "12:00 PM" -> "12pm"
  return `${date} · ${time} ET`;
}
