/**
 * All display formatting in this app uses a single configured timezone
 * (`NEXT_PUBLIC_TIMEZONE`, default "Africa/Casablanca") rather than the
 * viewer's browser timezone. The API always returns UTC-aware ISO
 * datetime strings (e.g. "2026-06-05T18:33:00+00:00"); using
 * `Date.prototype.getHours()` etc. on those would render them in
 * whatever timezone the browser happens to be set to, which is
 * inconsistent from viewer to viewer and doesn't match the backend's
 * configured business timezone. `Intl.DateTimeFormat` with an explicit
 * `timeZone` always renders the same wall-clock time regardless of
 * where the browser is.
 */
export const APP_TIMEZONE: string =
  process.env.NEXT_PUBLIC_TIMEZONE ?? "Africa/Casablanca";

/**
 * Formats an ISO datetime string (as returned by the API, e.g.
 * "2026-06-05T18:33:00+00:00") for display as `DD/MM/YYYY HH:mm`, in
 * the app's configured timezone.
 *
 * Returns a fallback (default "—") for null/undefined/invalid input.
 */
export function formatDateTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const parts = getPartsInTimeZone(d, APP_TIMEZONE);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Converts an ISO datetime string from the API into the value shape
 * expected by an `<input type="datetime-local">` element
 * (`YYYY-MM-DDTHH:mm`), expressed in the app's configured timezone, so
 * existing studies load with the correct date AND time pre-filled when
 * editing regardless of the browser's own timezone.
 *
 * Note: the value returned here is a naive wall-clock string with no
 * offset, matching what `<input type="datetime-local">` produces on
 * submit. The backend interprets such naive values as being in its own
 * configured `TIMEZONE` (see `app/utils/timezone.py`), so this only
 * round-trips correctly when the frontend's `NEXT_PUBLIC_TIMEZONE` and
 * the backend's `TIMEZONE` are set to the same zone.
 */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const parts = getPartsInTimeZone(d, APP_TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Extracts zero-padded Y/M/D/H/min components of `date` as they appear
 * in `timeZone`, using `Intl.DateTimeFormat` so the conversion is always
 * correct (including DST) without pulling in a date library.
 */
function getPartsInTimeZone(
  date: Date,
  timeZone: string
): { year: string; month: string; day: string; hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const raw: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") raw[part.type] = part.value;
  }

  // Some locales render midnight as "24" with hour12: false; normalize.
  const hour = raw.hour === "24" ? "00" : raw.hour;

  return {
    year: raw.year,
    month: raw.month,
    day: raw.day,
    hour,
    minute: raw.minute,
  };
}
