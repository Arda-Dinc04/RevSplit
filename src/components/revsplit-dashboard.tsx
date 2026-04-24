"use client";

import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Filter,
  LayoutGrid,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  addDays,
  EMPTY_EVENTS,
  filterEvents,
  formatDateLabel,
  formatLongDate,
  getLastUpdated,
  getMonthGrid,
  groupByDate,
  isUpcoming,
  monthName,
  parseDateKey,
  sortEvents,
} from "@/lib/reverse-splits";
import type { DashboardTab, ReverseSplitEvent } from "@/types/reverse-split";

const DATA_URL = "/data/reverse-splits.json";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const sourceLabel = (source: string) =>
  source
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

function normalizeEvents(payload: unknown): ReverseSplitEvent[] {
  if (Array.isArray(payload)) return payload as ReverseSplitEvent[];
  if (payload && typeof payload === "object" && "events" in payload) {
    const events = (payload as { events?: unknown }).events;
    if (Array.isArray(events)) return events as ReverseSplitEvent[];
  }
  return EMPTY_EVENTS;
}

function EventCard({ event }: { event: ReverseSplitEvent }) {
  const magnitude = event.ratioTo / Math.max(event.ratioFrom, 1);

  return (
    <article className="split-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="ticker-chip px-2.5 py-1 text-sm font-bold">{event.symbol}</span>
            {event.confidence ? (
              <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/70">
                {event.confidence}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">{event.companyName}</h3>
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-white/60">
          {formatDateLabel(event.splitDate, { year: "numeric" })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#242634] p-3">
          <div className="font-mono text-xs text-white/50">Ratio</div>
          <div className="mt-1 text-lg font-bold text-white">{event.ratio}</div>
        </div>
        <div className="rounded-lg bg-[#242634] p-3">
          <div className="font-mono text-xs text-white/50">Compression</div>
          <div className="mt-1 text-lg font-bold text-white">{magnitude.toFixed(2)}x</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {event.sources.map((source) => (
          <span key={`${event.id}-${source}`} className="rounded-full bg-white/7 px-2.5 py-1 text-xs text-white/70">
            {sourceLabel(source)}
          </span>
        ))}
        {event.roundingUp ? (
          <span className="rounded-full bg-[rgba(89,193,140,0.14)] px-2.5 py-1 text-xs text-[#a7efca]">
            Rounding up
          </span>
        ) : null}
      </div>

      {event.summary ? <p className="mt-4 text-sm leading-6 text-white/68">{event.summary}</p> : null}

      {event.filingUrl ? (
        <a
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#91d7f3] hover:text-white"
          href={event.filingUrl}
          target="_blank"
          rel="noreferrer"
        >
          SEC filing <ArrowUpRight size={15} />
        </a>
      ) : null}
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/14 bg-black/12 px-4 py-8 text-center text-sm text-white/55">
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-pill">
      <div className="font-mono text-xs text-white/48">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="control-button w-full justify-start" data-active={active} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function dateCursorFromKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function RevsplitDashboard() {
  const [events, setEvents] = useState<ReverseSplitEvent[]>(EMPTY_EVENTS);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<DashboardTab>("day");
  const [query, setQuery] = useState("");
  const [roundingOnly, setRoundingOnly] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => parseDateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date();
    return { year: today.getUTCFullYear(), month: today.getUTCMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(new Date()));

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
        const payload = await response.json();
        if (!active) return;
        const loadedEvents = sortEvents(normalizeEvents(payload));
        setEvents(loadedEvents);
        setLoadState("ready");
      } catch {
        if (!active) return;
        setEvents(EMPTY_EVENTS);
        setLoadState("error");
      }
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, []);

  const todayKey = parseDateKey(new Date());
  const filteredEvents = filterEvents(events, query, roundingOnly);
  const eventsByDate = groupByDate(filteredEvents);
  const matchingDateKeys = Array.from(new Set(filteredEvents.map((event) => event.splitDate))).sort((a, b) =>
    b.localeCompare(a),
  );
  const firstMatchingDate = matchingDateKeys[0] ?? "";
  const upcomingCount = events.filter((event) => isUpcoming(event, todayKey)).length;
  const roundingCount = events.filter((event) => event.roundingUp).length;
  const highConfidenceCount = events.filter((event) => event.confidence === "High").length;
  const lastUpdated = getLastUpdated(events);

  const dayKeys = [addDays(anchorDate, -1), anchorDate, addDays(anchorDate, 1)];
  const monthCells = getMonthGrid(monthCursor.year, monthCursor.month);
  const monthKey = `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, "0")}`;
  const monthEvents = filteredEvents.filter((event) => event.splitDate.startsWith(monthKey));
  const selectedDateIsVisible = Boolean(selectedDate && selectedDate.startsWith(monthKey));
  const selectedDateEvents = selectedDateIsVisible ? eventsByDate[selectedDate] ?? [] : [];
  const monthlyDetailEvents = selectedDateEvents.length ? selectedDateEvents : monthEvents;
  const monthlyDetailLabel = selectedDateEvents.length ? "Selected date" : "Month events";
  const monthlyDetailTitle = selectedDateEvents.length
    ? formatLongDate(selectedDate)
    : monthName(monthCursor.year, monthCursor.month);

  const jumpToDate = (dateKey: string) => {
    setAnchorDate(dateKey);
    setSelectedDate(dateKey);
    setMonthCursor(dateCursorFromKey(dateKey));
  };

  const moveMonth = (amount: number) => {
    const date = new Date(Date.UTC(monthCursor.year, monthCursor.month + amount, 1));
    const nextCursor = { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    setMonthCursor(nextCursor);
    setSelectedDate("");
  };

  return (
    <main className="dashboard-shell">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 lg:flex-row">
        <aside className="glass-panel rounded-lg p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-48px)] lg:w-[292px]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#8d2334,#2f1f78)]">
                <Database size={21} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Revsplit</h1>
                <p className="font-mono text-xs text-white/52">reverse split calendar</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Metric label="Events" value={events.length} />
              <Metric label="Upcoming" value={upcomingCount} />
              <Metric label="Rounding" value={roundingCount} />
              <Metric label="High confidence" value={highConfidenceCount} />
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-1 gap-2">
            <TabButton active={tab === "day"} icon={<LayoutGrid size={17} />} label="Day view" onClick={() => setTab("day")} />
            <TabButton active={tab === "month"} icon={<CalendarDays size={17} />} label="Monthly view" onClick={() => setTab("month")} />
            <TabButton active={tab === "table"} icon={<Table2 size={17} />} label="Table view" onClick={() => setTab("table")} />
          </nav>

          <div className="mt-5 rounded-lg border border-white/10 bg-[#1b1c27] p-3">
            <div className="flex items-center gap-2 font-mono text-xs text-white/48">
              <Clock3 size={14} />
              Last updated
            </div>
            <div className="mt-2 text-sm text-white/76">{lastUpdated}</div>
          </div>

          <p className="mt-5 text-xs leading-5 text-white/42">
            Information only. Not financial advice.
          </p>
        </aside>

        <section className="glass-panel min-h-[calc(100vh-32px)] flex-1 rounded-lg">
          <header className="border-b border-white/10 p-4 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="font-mono text-xs text-[#91d7f3]">Public reverse split feed</div>
                <h2 className="mt-2 text-3xl font-bold text-white md:text-4xl">Market Insights Calendar</h2>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 sm:w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/36" size={17} />
                  <input
                    className="h-11 w-full rounded-lg border border-white/10 bg-[#171821] pl-10 pr-3 text-sm text-white outline-none transition focus:border-[#d3475f]"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Ticker, company, source"
                  />
                </label>

                <button
                  className="control-button"
                  data-active={roundingOnly}
                  type="button"
                  onClick={() => setRoundingOnly((value) => !value)}
                >
                  <Filter size={16} />
                  Rounding
                </button>
              </div>
            </div>
          </header>

          {loadState === "loading" ? (
            <div className="p-4 md:p-6">
              <EmptyState label="Loading reverse split data." />
            </div>
          ) : null}

          {loadState === "error" ? (
            <div className="p-4 md:p-6">
              <EmptyState label="Could not load public/data/reverse-splits.json." />
            </div>
          ) : null}

          {loadState === "ready" && tab === "day" ? (
            <div className="p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button className="control-button" type="button" onClick={() => setAnchorDate(addDays(anchorDate, -1))}>
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="control-button"
                    type="button"
                    onClick={() => {
                      setAnchorDate(todayKey);
                      setSelectedDate(todayKey);
                    }}
                  >
                    Today
                  </button>
                  <button
                    className="control-button"
                    type="button"
                    disabled={!firstMatchingDate}
                    onClick={() => {
                      if (!firstMatchingDate) return;
                      jumpToDate(firstMatchingDate);
                    }}
                  >
                    Latest event
                  </button>
                  <button className="control-button" type="button" onClick={() => setAnchorDate(addDays(anchorDate, 1))}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="font-mono text-sm text-white/54">{formatLongDate(anchorDate)}</div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {dayKeys.map((dateKey) => {
                  const dayEvents = eventsByDate[dateKey] ?? [];
                  return (
                    <section key={dateKey} className="min-w-0">
                      <div className="mb-3 rounded-lg border border-white/10 bg-[#171821] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-lg font-bold text-white">{formatDateLabel(dateKey)}</div>
                            <div className="font-mono text-xs text-white/44">{dateKey}</div>
                          </div>
                          <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/60">{dayEvents.length}</span>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {dayEvents.length ? (
                          dayEvents.map((event) => <EventCard event={event} key={event.id} />)
                        ) : (
                          <EmptyState label="No reverse splits on this date." />
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}

          {loadState === "ready" && tab === "month" ? (
            <div className="p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button className="control-button" type="button" onClick={() => moveMonth(-1)}>
                    <ChevronLeft size={16} />
                  </button>
                  <div className="min-w-[190px] text-center text-xl font-bold text-white">
                    {monthName(monthCursor.year, monthCursor.month)}
                  </div>
                  <button className="control-button" type="button" onClick={() => moveMonth(1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-white/10 bg-[#171821] px-3 py-2 font-mono text-xs text-white/58">
                    {monthEvents.length} matching events
                  </span>
                  <button
                    className="control-button"
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setMonthCursor({ year: today.getUTCFullYear(), month: today.getUTCMonth() });
                      setSelectedDate(todayKey);
                    }}
                  >
                    <RefreshCw size={16} />
                    Current
                  </button>
                  <button
                    className="control-button"
                    type="button"
                    disabled={!firstMatchingDate}
                    onClick={() => firstMatchingDate && jumpToDate(firstMatchingDate)}
                  >
                    Latest event
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr,340px]">
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <div className="grid grid-cols-7 bg-[#171821]">
                    {WEEKDAYS.map((day) => (
                      <div className="border-r border-white/8 p-2 text-center font-mono text-xs text-white/46 last:border-r-0" key={day}>
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthCells.map((cell, index) => {
                      const cellEvents = cell.dateKey ? eventsByDate[cell.dateKey] ?? [] : [];
                      const isSelected = cell.dateKey === selectedDate;
                      return (
                        <button
                          className={`min-h-[104px] border-r border-t border-white/8 bg-[#1b1c27] p-2 text-left transition last:border-r-0 hover:bg-[#242634] ${
                            isSelected ? "outline outline-2 outline-[#d3475f]" : ""
                          } ${!cell.day ? "opacity-25" : ""}`}
                          key={`${cell.dateKey ?? "empty"}-${index}`}
                          type="button"
                          disabled={!cell.dateKey}
                          onClick={() => {
                            if (!cell.dateKey) return;
                            setSelectedDate(cell.dateKey);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-white/58">{cell.day ?? ""}</span>
                            {cellEvents.length ? (
                              <span className="rounded-full bg-[#2f9ac9]/20 px-2 py-0.5 text-[11px] text-[#bcecff]">
                                {cellEvents.length}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                            {cellEvents.slice(0, 3).map((event) => (
                              <span className="truncate rounded bg-[#d3475f]/17 px-1.5 py-1 text-[11px] text-[#ffd7df]" key={event.id}>
                                {event.symbol}
                              </span>
                            ))}
                            {cellEvents.length > 3 ? (
                              <span className="rounded bg-white/7 px-1.5 py-1 text-[11px] text-white/58">
                                +{cellEvents.length - 3} more
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside>
                  <div className="mb-3 rounded-lg border border-white/10 bg-[#171821] p-3">
                    <div className="font-mono text-xs text-white/44">{monthlyDetailLabel}</div>
                    <div className="mt-1 text-lg font-bold text-white">{monthlyDetailTitle}</div>
                  </div>
                  <div className="grid gap-3">
                    {monthlyDetailEvents.length ? (
                      monthlyDetailEvents.map((event) => <EventCard event={event} key={event.id} />)
                    ) : (
                      <EmptyState label="No matching events in this month." />
                    )}
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {loadState === "ready" && tab === "table" ? (
            <div className="p-4 md:p-6">
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead className="bg-[#171821] font-mono text-xs text-white/48">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Ratio</th>
                      <th className="px-4 py-3">Sources</th>
                      <th className="px-4 py-3">Rounding</th>
                      <th className="px-4 py-3">Filing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((event) => (
                      <tr className="border-t border-white/8 odd:bg-white/[0.015]" key={event.id}>
                        <td className="px-4 py-3 font-mono text-white/68">{event.splitDate}</td>
                        <td className="px-4 py-3 font-bold text-white">{event.symbol}</td>
                        <td className="max-w-[260px] px-4 py-3 text-white/76">{event.companyName}</td>
                        <td className="px-4 py-3 text-white">{event.ratio}</td>
                        <td className="px-4 py-3 text-white/62">{event.sources.map(sourceLabel).join(", ")}</td>
                        <td className="px-4 py-3 text-white/72">{event.roundingUp ? "Yes" : ""}</td>
                        <td className="px-4 py-3">
                          {event.filingUrl ? (
                            <a className="inline-flex items-center gap-1 text-[#91d7f3]" href={event.filingUrl} target="_blank" rel="noreferrer">
                              SEC <ArrowUpRight size={14} />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredEvents.length ? <div className="mt-4"><EmptyState label="No reverse splits match the current filters." /></div> : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
