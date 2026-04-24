import type { ReverseSplitEvent } from "@/types/reverse-split";

export const EMPTY_EVENTS: ReverseSplitEvent[] = [];

export function parseDateKey(input: Date | string): string {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00Z`) : input;
  return date.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return parseDateKey(date);
}

export function formatDateLabel(dateKey: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

export function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

export function monthName(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function getMonthGrid(year: number, monthIndex: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const mondayFirstOffset = (first.getUTCDay() + 6) % 7;
  const cells: Array<{ day: number | null; dateKey: string | null }> = [];

  for (let i = 0; i < mondayFirstOffset; i += 1) {
    cells.push({ day: null, dateKey: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      dateKey: parseDateKey(new Date(Date.UTC(year, monthIndex, day))),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateKey: null });
  }

  return cells;
}

export function groupByDate(events: ReverseSplitEvent[]) {
  return events.reduce<Record<string, ReverseSplitEvent[]>>((acc, event) => {
    acc[event.splitDate] = acc[event.splitDate] ?? [];
    acc[event.splitDate].push(event);
    return acc;
  }, {});
}

export function sortEvents(events: ReverseSplitEvent[]) {
  return [...events].sort((a, b) => {
    const dateOrder = b.splitDate.localeCompare(a.splitDate);
    if (dateOrder !== 0) return dateOrder;
    return a.symbol.localeCompare(b.symbol);
  });
}

export function filterEvents(events: ReverseSplitEvent[], query: string, roundingOnly: boolean) {
  const normalizedQuery = query.trim().toLowerCase();

  return sortEvents(events).filter((event) => {
    if (roundingOnly && !event.roundingUp) return false;
    if (!normalizedQuery) return true;

    return [
      event.symbol,
      event.companyName,
      event.ratio,
      event.sources.join(" "),
      event.summary ?? "",
      event.confidence ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function getLastUpdated(events: ReverseSplitEvent[]) {
  if (!events.length) return "No data";

  const latest = events
    .map((event) => new Date(event.lastUpdated).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  if (!latest) return "No data";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(latest));
}

export function isUpcoming(event: ReverseSplitEvent, todayKey = parseDateKey(new Date())) {
  return event.splitDate >= todayKey;
}
