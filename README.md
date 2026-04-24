# Revsplit

Static public reverse split dashboard for Vercel Hobby.

## What It Does

- Shows reverse stock split events in day, month, and table views.
- Uses `public/data/reverse-splits.json` as the only runtime data source.
- Requires no login, profiles, payments, database, backend server, or runtime secrets.
- Refreshes data through GitHub Actions by committing updated JSON.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Data Refresh

```bash
npm run setup:data
npm run export:data:local
```

The exporter combines:

- `data/reverse-splits-2025.csv`
- `data/split_performance.csv`
- StockAnalysis, TipRanks, and HedgeFollow public pages

It writes the dashboard feed to `public/data/reverse-splits.json`.

GitHub Actions uses the same exporter through `npm run export:data`-equivalent Python command after installing `requirements.txt`, then commits the JSON only when the feed changes. If TipRanks blocks anonymous requests, the exporter logs a warning and still keeps StockAnalysis, HedgeFollow, archive CSV, and EDGAR rows.

## Verification

```bash
npm run lint
npm run build
npm run test:python
```

## Vercel

Use `Revsplit` as the Vercel project root.

- Build command: `npm run build`
- Output directory: leave blank/default
- Environment variables: none required

The included `vercel.json` pins the Next.js framework and build command. Do not override the output directory to `out` in Vercel; Vercel's Next.js builder handles the static export from `next.config.ts`.
