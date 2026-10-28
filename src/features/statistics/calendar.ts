/** Calendar-date arithmetic: date-only values never pass through a device time zone. */
export function parseDateKey(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Invalid calendar date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return date;
}

export function calendarKey(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function localDateKey(
  value: Date | number | string = new Date(),
  timeZone?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return calendarKey(date);
}

export function mondayOfWeek(value: string): string {
  const date = parseDateKey(value);
  return addCalendarDays(value, -((date.getUTCDay() + 6) % 7));
}

export function datesInMonth(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid calendar month");
  const start = `${month}-01`;
  parseDateKey(start);
  const values: string[] = [];
  let cursor = start;
  while (cursor.startsWith(month)) {
    values.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return values;
}

/** Monday-first whole-week cells for a month view. */
export function monthGrid(month: string): string[] {
  const dates = datesInMonth(month);
  const start = mondayOfWeek(dates[0]);
  const end = addCalendarDays(mondayOfWeek(dates[dates.length - 1]), 6);
  const cells: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addCalendarDays(cursor, 1))
    cells.push(cursor);
  return cells;
}

export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(parseDateKey(value));
}
