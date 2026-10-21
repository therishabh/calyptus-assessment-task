# Orders Dashboard

A small React app that loads orders from a static JSON file and shows them in a searchable, filterable, sortable table with a paid-totals summary.

## Tech stack

- React 19 + Vite
- Tailwind CSS v4 (via the `@tailwindcss/vite` plugin)
- Data is loaded with the browser's built-in `fetch`, with no HTTP library

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## How it works

On load, `src/App.jsx` fetches `/orders.json`. Anything in `public/` is served from the site root, so `public/orders.json` is available at `/orders.json`. To change the data, edit that file and reload; no code changes are needed.

Expected shape:

```json
{
  "orders": [
    {
      "id": "ORD-1001",
      "customer": { "name": "Priya Shah", "email": "priya.shah@example.com" },
      "total": 129.0,
      "currency": "GBP",
      "status": "paid",
      "created_at": "2026-10-01T09:15:00Z",
      "items": 3
    }
  ]
}
```

## Features

- **Table columns:** Order ID, Customer, Email, Total, Status, Date & Time, Items.
- **Search:** case-insensitive, matches part of the customer name or email.
- **Status filter:** a dropdown built from the statuses present in the data. It combines with search.
- **Sorting:** click the Total or Date & Time header to sort ascending, click again for descending. Orders with no total always sort last.
- **Paid orders summary:** total of `paid` orders, grouped by currency (one card per currency). Currencies are never added together or converted. The summary covers all orders and does not change with search, filter or sort.
- **Loading state:** a skeleton placeholder while loading, plus a "taking longer than usual" notice after 3 seconds.
- **Error handling:** distinct messages for network failure, non-2xx responses, a 10 second timeout, invalid JSON and a missing `orders` list, with a "Try again" button. Rows without an `id` are skipped and a warning banner shows how many.

## Data handling notes

The sample data deliberately includes awkward cases, and the app handles them:

- `customer` can be `null`, or have an empty name. The cell shows `—`.
- `total` can be a string (`"149.50"`) or `null`. Strings are converted to numbers, and `null` shows `—`.
- Timestamps use different timezone offsets. They are parsed as real points in time (so sorting is correct) and displayed in the viewer's local timezone.
- Paid totals are added in whole cents to avoid floating-point rounding errors.
- Sorting by Total compares raw amounts and does not convert currencies, so £200 and $150 are compared as 200 vs 150.

## Previewing the error state

Add an `error` query parameter to force a failure without breaking the real endpoint:

| URL | Result |
| --- | --- |
| `/?error=1` (or `network`) | Network error |
| `/?error=404` | 404 Not Found |
| `/?error=500` | 500 Internal Server Error |
| `/?error=json` | Invalid JSON |
| `/?error=shape` | Missing `orders` list |
| `/?error=timeout` | Timeout (after 10 seconds) |

"Try again" fails the same way while the parameter is present. Remove it to load normally. This also works in a production build.

To see the loading state, open DevTools, go to the Network tab and set throttling to "Slow 3G".

## Project structure

```
public/orders.json   Data source, fetched at runtime
src/main.jsx         App entry point
src/App.jsx          Fetching, filtering, sorting, summary and table UI
src/index.css        Tailwind import (@import "tailwindcss")
vite.config.js       Vite config with the React and Tailwind plugins
```
