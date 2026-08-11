# ANCL Logistics — Daily Transaction & P&L Mobile App

## Original Problem Statement
Mobile-first (Expo React Native) accounting app for ANCL Logistics, a small road-transport office in Hubballi, Karnataka. Records daily income/expense transactions and produces daily, monthly, and annual P&L with proper separation of per-trip (variable) costs vs office/fixed overheads. ~100 trips/month, 6 owned trucks + 4 rented lorries. Must reproduce the existing Excel workbook logic exactly, then improve on it. Clerk should log a trip in under 20 seconds, one-handed.

## Architecture
- **Frontend**: Expo Router (file-based), React Native. Screens under `/app`. Shared code in `/src` (theme, api client, AuthContext, MasterListScreen component).
- **Backend**: FastAPI (`/app/backend/server.py`), single router with `/api` prefix.
- **DB**: MongoDB (motor). Collections: users, user_sessions, vehicles, drivers, parties, expense_categories, trips, overheads, receipts.
- **Auth**: Emergent-managed Google OAuth. First user = admin, others = clerk (role stored per user). Bearer session token, 7-day expiry.
- **Money format**: Indian ₹ lakh-style grouping via `src/theme.ts` `inr()`.

## User Personas
- **Admin (owner)**: full access — masters, all P&L, reports, settings.
- **Clerk**: create/edit entries, limited P&L (role enforced server-side; roles stored, UI gating is Phase 3).
- **Viewer**: read-only reports (Phase 3).

## Core Requirements (static)
- Per-trip math: pending = revenue − received; margin = (revenue + return_adj) − trip_expense_total.
- Daily P&L: Accrual (income − variable − prorated overhead) and Cash (cash_in − cash_out) toggle.
- Overhead allocation: daily_prorata (fixed EMIs/rent/salaries), per_trip, actual_date. Monthly always uses full amounts.
- Monthly P&L: **corrected** income = revenue + return_adj (NOT + received — fixes workbook double-count). Received shown as memorandum with restatement note.
- Excel import (idempotent preview + commit) and export (same-layout xlsx).

## Implemented (2026-08-11) — Phase 1 MVP ✅
- Google OAuth login + AuthContext (web + native deep link) + Gate routing.
- Auto-seed masters from Excel Settings on first login (idempotent): 6 own + 4 rented vehicles w/ EMIs & drivers, 11 per-trip categories, 22 overhead categories.
- Masters CRUD: Vehicles, Drivers, Parties, Expense Categories (generic modal-based `MasterListScreen`).
- Add/Edit Trip form: vehicle chip auto-fills driver + prefills Bhatta ₹600; live Pending & Margin; collapsible expense grid; Save / Save & Add Another.
- Add Overhead form.
- Today screen: net-profit hero, Accrual/Cash toggle, chips (trips, own/rented, new pending, all-time pending), entries list, dual FABs.
- Monthly P&L: itemised collapsible statement, corrected income + restatement note, vehicle-type summary, Excel export button.
- Trips list tab.
- Backend endpoints for daily/monthly/annual P&L, pending-freight ageing, receipts.
- Excel import (preview + idempotent commit) and export (openpyxl).
- **Tested**: backend 27/27 pass; frontend all core flows pass; infinite-loop bug fixed.

## Backlog / Remaining
### P1 (Phase 2)
- Receipts & collections UI (allocate payment oldest-first across trips) — backend exists, needs screen.
- Pending Freight (receivables) screen with ageing buckets + WhatsApp reminder — backend `/api/pending-freight` exists.
- Rented Vehicle Ledger with per-owner running outstanding.
- Annual Dashboard with charts (revenue vs expense bars, profit trend, expense donut, cumulative pending) — backend `/api/pnl/annual` exists.
- PDF export of monthly P&L.
- Offline-first queue + background sync + sync status indicator.
- Native date picker & TS-number auto-suggest; "Duplicate last trip".
- Precise Excel column-mapped import (A–V trip rows, X–AA overhead block, Rented Ledger) — current import is heuristic.

### P2 (Phase 3)
- Per-vehicle and per-driver P&L.
- Photo/document attachments (LR, fuel bills).
- Recurring overhead auto-post with review queue.
- Vehicle compliance alerts (insurance/permit/FC expiry).
- Full role enforcement + audit trail; automatic daily backup/restore.
- Kannada localisation.

## Next Tasks
1. Build Pending Freight receivables screen + Receipts flow (highest business value: tracking who owes money).
2. Annual Dashboard with charts.
3. Rented Vehicle Ledger.

## Test Credentials
See `/app/memory/test_credentials.md` (Bearer `TESTTOKEN123`, re-seed via `/app/backend/seed_test.py`).
