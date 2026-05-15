---
inclusion: always
---

# Project: Expense & Budget Visualizer

## Overview
A mobile-friendly, single-page web app for tracking daily spending. No backend, no framework — pure HTML, CSS, and Vanilla JavaScript. All data lives in the browser's `localStorage`.

## Tech Stack
- **HTML** — semantic structure (`index.html`)
- **CSS** — one file only: `css/style.css`
- **JavaScript** — one file only: `js/app.js` (Vanilla JS, no frameworks)
- **Chart.js 4.x** — loaded from CDN for the pie chart

## Folder Rules
- Only **1 CSS file** inside `css/`
- Only **1 JS file** inside `js/`
- No build tools, no bundlers, no test setup

## Data Storage
- `localStorage` key: `budget_tracker_transactions`
- `localStorage` key: `budget_tracker_categories` (custom categories)
- `localStorage` key: `budget_tracker_settings` (theme, spend limit)
- All data is client-side only

## Features (current)
1. **Add Transaction** — item name, amount, category; validates all fields
2. **Transaction List** — scrollable, deletable, sortable (amount / category)
3. **Total Balance** — auto-updates on add/delete
4. **Pie Chart** — spending by category, auto-updates
5. **Custom Categories** — users can add/remove their own categories with emoji + color
6. **Monthly Summary** — month picker shows totals and per-category breakdown
7. **Sort Transactions** — sort by date (default), amount asc/desc, or category A-Z
8. **Spend Limit Highlight** — set a monthly limit; items that push total over limit are highlighted in red
9. **Dark / Light Mode Toggle** — persisted in localStorage, respects system preference on first load

## Code Conventions
- All user-supplied strings must be passed through `escapeHtml()` before DOM injection
- Use `const` / `let`, no `var`
- Functions grouped by responsibility with section comment banners
- Currency formatted as `Rp X.XXX` using `id-ID` locale
- IDs generated with `Date.now() + random` suffix
- No external dependencies beyond Chart.js
