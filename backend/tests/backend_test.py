"""ANCL Logistics backend API test suite.

Covers: auth, masters (vehicles/drivers/parties/categories) CRUD, trips CRUD +
computed fields, overheads, daily/monthly/annual P&L, pending-freight, Excel
export & import (preview + idempotent commit), and auth enforcement.
"""
from __future__ import annotations

import io
import os
from datetime import date, datetime
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
TOKEN = "TESTTOKEN123"
H = {"Authorization": f"Bearer {TOKEN}"}
XLSX_PATH = "/app/memory/ANCL_Logistics_v4.xlsx"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", **H})
    return sess


# -------- auth & seed --------------------------------------------------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200 and r.json()["ok"] is True

    def test_me(self, s):
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == "admin@ancl.test" and d["role"] == "admin"

    def test_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/vehicles")
        assert r.status_code == 401

    def test_bad_token_401(self):
        r = requests.get(f"{BASE_URL}/api/vehicles",
                         headers={"Authorization": "Bearer WRONG"})
        assert r.status_code == 401


# -------- masters seed & CRUD -----------------------------------------
class TestMastersSeed:
    def test_vehicles_seeded(self, s):
        r = s.get(f"{BASE_URL}/api/vehicles")
        assert r.status_code == 200
        vs = r.json()
        own = [v for v in vs if v["type"] == "Own"]
        rented = [v for v in vs if v["type"] == "Rented"]
        assert len(own) == 6 and len(rented) == 4, f"got own={len(own)} rented={len(rented)}"

    def test_drivers_seeded(self, s):
        r = s.get(f"{BASE_URL}/api/drivers")
        assert r.status_code == 200 and len(r.json()) >= 6

    def test_parties_endpoint(self, s):
        r = s.get(f"{BASE_URL}/api/parties")
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_pertrip_categories(self, s):
        r = s.get(f"{BASE_URL}/api/categories", params={"kind": "PerTrip"})
        assert r.status_code == 200
        assert len(r.json()) == 11

    def test_overhead_categories(self, s):
        r = s.get(f"{BASE_URL}/api/categories", params={"kind": "Overhead"})
        assert r.status_code == 200
        assert len(r.json()) == 22


class TestMastersCRUD:
    def test_vehicle_crud(self, s):
        payload = {"vehicle_no": "TEST-VEH-01", "type": "Own",
                   "emi_amount_monthly": 1000.0}
        r = s.post(f"{BASE_URL}/api/vehicles", json=payload)
        assert r.status_code == 200
        vid = r.json()["id"]
        r2 = s.put(f"{BASE_URL}/api/vehicles/{vid}",
                   json={**payload, "vehicle_no": "TEST-VEH-01-U"})
        assert r2.status_code == 200 and r2.json()["vehicle_no"] == "TEST-VEH-01-U"
        lst = s.get(f"{BASE_URL}/api/vehicles").json()
        assert any(v["id"] == vid and v["vehicle_no"] == "TEST-VEH-01-U" for v in lst)
        r3 = s.delete(f"{BASE_URL}/api/vehicles/{vid}")
        assert r3.status_code == 200
        lst2 = s.get(f"{BASE_URL}/api/vehicles").json()
        assert not any(v["id"] == vid for v in lst2)

    def test_party_create(self, s):
        r = s.post(f"{BASE_URL}/api/parties",
                   json={"party_name": "TEST_Party_A", "credit_terms_days": 30})
        assert r.status_code == 200
        pid = r.json()["id"]
        # GET verify
        lst = s.get(f"{BASE_URL}/api/parties").json()
        assert any(p["id"] == pid for p in lst)
        s.delete(f"{BASE_URL}/api/parties/{pid}")

    def test_driver_crud(self, s):
        r = s.post(f"{BASE_URL}/api/drivers",
                   json={"name": "TEST_Driver_X", "default_bhatta_rate": 500})
        assert r.status_code == 200
        did = r.json()["id"]
        s.delete(f"{BASE_URL}/api/drivers/{did}")

    def test_category_crud(self, s):
        r = s.post(f"{BASE_URL}/api/categories",
                   json={"name": "TEST_Cat", "kind": "PerTrip", "sort_order": 99})
        assert r.status_code == 200
        cid = r.json()["id"]
        s.delete(f"{BASE_URL}/api/categories/{cid}")


# -------- trips + computed fields -------------------------------------
class TestTrips:
    trip_ids: list = []
    per_trip_cats: list = []
    veh: dict = {}
    today: str = date.today().isoformat()

    def test_create_trip_computes(self, s):
        veh = next(v for v in s.get(f"{BASE_URL}/api/vehicles").json()
                   if v["type"] == "Own")
        TestTrips.veh = veh
        cats = s.get(f"{BASE_URL}/api/categories", params={"kind": "PerTrip"}).json()
        TestTrips.per_trip_cats = cats
        bhatta = next(c for c in cats if c["name"].lower().startswith("bhatta"))
        diesel = next(c for c in cats if "diesel" in c["name"].lower())
        payload = {
            "date": TestTrips.today, "ts_no": "TEST_TS_001",
            "vehicle_id": veh["id"],
            "revenue_to_pay": 10000, "amount_received": 6000,
            "return_adjustment": 200,
            "expenses": {bhatta["id"]: 600, diesel["id"]: 2500},
        }
        r = s.post(f"{BASE_URL}/api/trips", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        TestTrips.trip_ids.append(d["id"])
        assert d["pending_freight"] == 4000
        assert d["trip_expense_total"] == 3100
        assert d["trip_margin"] == 10000 + 200 - 3100
        assert d["vehicle_no"] == veh["vehicle_no"]
        assert d["vehicle_type"] == "Own"
        assert d.get("driver_name")  # denormalized

    def test_list_trips_filter(self, s):
        r = s.get(f"{BASE_URL}/api/trips",
                  params={"date_from": TestTrips.today, "date_to": TestTrips.today})
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTrips.trip_ids[0] in ids

    def test_update_trip(self, s):
        tid = TestTrips.trip_ids[0]
        bhatta = next(c for c in TestTrips.per_trip_cats if "bhatta" in c["name"].lower())
        payload = {
            "id": tid, "date": TestTrips.today, "ts_no": "TEST_TS_001",
            "vehicle_id": TestTrips.veh["id"],
            "revenue_to_pay": 12000, "amount_received": 12000,
            "return_adjustment": 0, "expenses": {bhatta["id"]: 600},
        }
        r = s.put(f"{BASE_URL}/api/trips/{tid}", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["pending_freight"] == 0
        assert d["trip_margin"] == 11400

    def test_delete_trip_later(self, s):
        # Keep trips for pnl tests; delete at end via cleanup fixture
        pass


# -------- overheads ---------------------------------------------------
class TestOverheads:
    oid: str = ""

    def test_create_overhead(self, s):
        cats = s.get(f"{BASE_URL}/api/categories", params={"kind": "Overhead"}).json()
        cat = next(c for c in cats if "Shop Rent" in c["name"])
        r = s.post(f"{BASE_URL}/api/overheads",
                   json={"date": date.today().isoformat(),
                         "category_id": cat["id"], "amount": 500,
                         "description": "TEST rent"})
        assert r.status_code == 200
        d = r.json()
        assert d["category_name"] == "Shop Rent"
        TestOverheads.oid = d["id"]

    def test_delete_overhead(self, s):
        # Delete happens in cleanup at end
        pass


# -------- P&L ---------------------------------------------------------
class TestPnL:
    def test_daily(self, s):
        today = date.today().isoformat()
        r = s.get(f"{BASE_URL}/api/pnl/daily", params={"date": today})
        assert r.status_code == 200
        d = r.json()
        for k in ("accrual", "cash", "chips", "overhead_breakdown"):
            assert k in d
        for k in ("income", "variable_cost", "overhead", "net_profit"):
            assert k in d["accrual"]
        for k in ("cash_in", "cash_out", "net_cash"):
            assert k in d["cash"]
        for k in ("trips_today", "own_trips", "rented_trips",
                  "new_pending_today", "total_pending_all_time"):
            assert k in d["chips"]
        # There is at least 1 trip today from previous tests
        assert d["chips"]["trips_today"] >= 1
        # Overhead breakdown should have prorated EMI items
        emi_items = [x for x in d["overhead_breakdown"] if "EMI" in x["name"]]
        assert len(emi_items) >= 1
        assert all(x["accrued"] > 0 for x in emi_items)

    def test_monthly_income_formula(self, s):
        today = date.today()
        r = s.get(f"{BASE_URL}/api/pnl/monthly",
                  params={"year": today.year, "month": today.month})
        assert r.status_code == 200
        d = r.json()
        # income.total_income == revenue + return_adjustment (NOT + received)
        assert d["income"]["total_income"] == round(
            d["income"]["revenue"] + d["income"]["return_adjustment"], 2)
        assert "received" in d["memorandum"]
        assert "pending_freight" in d["memorandum"]
        assert "old_workbook_income_double_counted" in d["memorandum"]
        assert "per_trip_items" in d and "overhead_items" in d
        assert "vehicle_type_summary" in d
        assert set(d["vehicle_type_summary"].keys()) == {"own", "rented"}
        # Overhead items should include full monthly EMI amounts (fixed items)
        emi = [x for x in d["overhead_items"] if "EMI" in x["name"]]
        assert emi, "expected fixed EMI overhead items in monthly P&L"

    def test_annual(self, s):
        r = s.get(f"{BASE_URL}/api/pnl/annual",
                  params={"fy_start_year": 2026})
        assert r.status_code == 200
        d = r.json()
        assert len(d["months"]) == 12
        # First should be April, last should be March
        assert d["months"][0]["month"] == 4
        assert d["months"][-1]["month"] == 3
        assert "totals" in d

    def test_pending_freight(self, s):
        r = s.get(f"{BASE_URL}/api/pending-freight")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -------- Excel export & import --------------------------------------
class TestExcel:
    def test_export(self, s):
        today = date.today()
        r = s.get(f"{BASE_URL}/api/excel/export",
                  params={"year": today.year, "month": today.month})
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "officedocument" in ct
        # Valid xlsx starts with PK (zip)
        assert r.content[:2] == b"PK"
        assert len(r.content) > 500

    def test_import_preview(self, s):
        if not os.path.exists(XLSX_PATH):
            pytest.skip("workbook not present")
        with open(XLSX_PATH, "rb") as f:
            files = {"file": ("book.xlsx", f,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            r = requests.post(f"{BASE_URL}/api/excel/import/preview",
                              headers=H, files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sheets" in d and isinstance(d["sheets"], list)
        assert "trip_rows_found" in d

    def test_import_commit_idempotent(self, s):
        if not os.path.exists(XLSX_PATH):
            pytest.skip("workbook not present")

        def _commit():
            with open(XLSX_PATH, "rb") as f:
                files = {"file": ("book.xlsx", f,
                                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                return requests.post(f"{BASE_URL}/api/excel/import/commit",
                                     headers=H, files=files)
        r1 = _commit()
        assert r1.status_code == 200, r1.text
        c1 = r1.json()["imported_trips"]
        r2 = _commit()
        assert r2.status_code == 200
        c2 = r2.json()["imported_trips"]
        assert c2 == 0, f"expected idempotent, got {c2} on 2nd run (1st={c1})"


# -------- Cleanup -----------------------------------------------------
def test_zzz_cleanup(s):
    for t in s.get(f"{BASE_URL}/api/trips").json():
        if (t.get("ts_no") or "").startswith("TEST_"):
            s.delete(f"{BASE_URL}/api/trips/{t['id']}")
    for o in s.get(f"{BASE_URL}/api/overheads").json():
        if (o.get("description") or "").startswith("TEST"):
            s.delete(f"{BASE_URL}/api/overheads/{o['id']}")
