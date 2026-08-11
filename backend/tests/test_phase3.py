"""Phase 3 backend tests: per-vehicle P&L, rented ledger running outstanding,
Monthly P&L PDF export, and auth enforcement. Uses isolated test data."""
from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
H = {"Authorization": "Bearer TESTTOKEN123"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", **H})
    return sess


@pytest.fixture(scope="module")
def vehicles(s):
    r = s.get(f"{BASE_URL}/api/vehicles")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def own_veh(vehicles):
    # Pick KA-XX-1288 as suggested by main agent (deterministic emi)
    for v in vehicles:
        if v.get("vehicle_no") == "KA-XX-1288":
            return v
    return next(v for v in vehicles if v["type"] == "Own")


@pytest.fixture(scope="module")
def rented_veh(vehicles):
    return next(v for v in vehicles if v["type"] == "Rented")


# ================= Per-Vehicle P&L =================
class TestVehiclePnl:
    """Uses a FRESH month far in future so no other trips interfere."""

    FRESH_YEAR = 2030
    FRESH_MONTH = 6

    @pytest.fixture(scope="class")
    def test_party(self, s):
        p = s.post(f"{BASE_URL}/api/parties", json={
            "party_name": "TEST_PH3_VehPnl_Party", "credit_terms_days": 30}).json()
        yield p
        s.delete(f"{BASE_URL}/api/parties/{p['id']}")

    @pytest.fixture(scope="class")
    def own_trip(self, s, own_veh, test_party):
        # Create ONE trip for KA-XX-1288: revenue 40000, single expense 8000
        d = f"{self.FRESH_YEAR:04d}-{self.FRESH_MONTH:02d}-05"
        # get one PerTrip expense category
        cats = s.get(f"{BASE_URL}/api/categories", params={"kind": "PerTrip"}).json()
        cat = cats[0]["name"] if isinstance(cats, list) and cats else "Fuel"
        t = s.post(f"{BASE_URL}/api/trips", json={
            "date": d, "ts_no": "TEST_PH3_VP_T1", "vehicle_id": own_veh["id"],
            "party_id": test_party["id"], "revenue_to_pay": 40000, "amount_received": 0,
            "expenses": {cat: 8000}
        }).json()
        assert "id" in t, f"trip create failed: {t}"
        yield t
        s.delete(f"{BASE_URL}/api/trips/{t['id']}")

    def test_shape_and_totals(self, s, own_trip):
        r = s.get(f"{BASE_URL}/api/pnl/vehicles",
                  params={"year": self.FRESH_YEAR, "month": self.FRESH_MONTH})
        assert r.status_code == 200
        d = r.json()
        for k in ("overhead_total", "total_emi", "shared_overhead", "total_trips", "vehicles"):
            assert k in d, f"missing top-level {k}"
        assert d["total_trips"] >= 1  # our own_trip
        assert d["shared_overhead"] == max(0.0, d["overhead_total"] - d["total_emi"])
        # sorted desc by net_contribution
        nets = [v["net_contribution"] for v in d["vehicles"]]
        assert nets == sorted(nets, reverse=True)
        # required row fields
        for row in d["vehicles"]:
            for k in ("vehicle_no", "type", "trips", "revenue", "trip_cost",
                      "emi", "overhead_share", "overhead_alloc", "net_contribution", "per_trip"):
                assert k in row

    def test_math_for_own_vehicle(self, s, own_veh, own_trip):
        r = s.get(f"{BASE_URL}/api/pnl/vehicles",
                  params={"year": self.FRESH_YEAR, "month": self.FRESH_MONTH})
        d = r.json()
        row = next(v for v in d["vehicles"] if v["vehicle_no"] == own_veh["vehicle_no"])
        assert row["trips"] == 1
        assert row["revenue"] == 40000.0
        assert row["trip_cost"] == 8000.0
        assert row["emi"] == float(own_veh.get("emi_amount_monthly", 0) or 0)
        # net = 40000 - 8000 - emi - shared_share
        expected_net = 40000 - 8000 - row["emi"] - row["overhead_share"]
        assert abs(row["net_contribution"] - round(expected_net, 2)) < 0.01
        # per_trip = net / trips
        assert abs(row["per_trip"] - row["net_contribution"]) < 0.01

    def test_idle_own_vehicle_negative_emi(self, s, own_veh, own_trip):
        r = s.get(f"{BASE_URL}/api/pnl/vehicles",
                  params={"year": self.FRESH_YEAR, "month": self.FRESH_MONTH})
        d = r.json()
        # Any Own vehicle that is NOT our own_veh should have 0 trips and net == -emi
        # (fresh future month so no other trips)
        for row in d["vehicles"]:
            if row["type"] == "Own" and row["vehicle_no"] != own_veh["vehicle_no"]:
                if row["trips"] == 0 and row["emi"] > 0:
                    # shared_share is 0 because n=0
                    assert row["overhead_share"] == 0
                    assert row["net_contribution"] == round(-row["emi"], 2)


# ================= Rented Ledger =================
class TestRentedLedger:
    @pytest.fixture(scope="class")
    def entries(self, s, rented_veh):
        """Create R1 & R2 for one owner in chronological order."""
        # Clean up any existing ledger for this vehicle first would be too disruptive;
        # instead use a fresh future date range and verify by IDs.
        d1 = "2030-07-05"
        d2 = "2030-07-15"
        r1 = s.post(f"{BASE_URL}/api/rented-ledger", json={
            "date": d1, "ts_no": "TEST_PH3_R1", "vehicle_id": rented_veh["id"],
            "revenue_to_pay": 25000, "commission_adj": 2500, "amount_paid": 10000,
        })
        assert r1.status_code == 200, r1.text
        e1 = r1.json()
        r2 = s.post(f"{BASE_URL}/api/rented-ledger", json={
            "date": d2, "ts_no": "TEST_PH3_R2", "vehicle_id": rented_veh["id"],
            "revenue_to_pay": 18000, "commission_adj": 1800, "amount_paid": 18000,
        })
        assert r2.status_code == 200, r2.text
        e2 = r2.json()
        yield {"e1": e1, "e2": e2, "veh": rented_veh}
        s.delete(f"{BASE_URL}/api/rented-ledger/{e1['id']}")
        s.delete(f"{BASE_URL}/api/rented-ledger/{e2['id']}")

    def test_post_auto_owner_from_vehicle(self, s, entries, rented_veh):
        # If vehicle has owner_name, owner_driver was auto-filled
        expected_owner = rented_veh.get("owner_name") or rented_veh.get("vehicle_no")
        assert entries["e1"].get("owner_driver") == expected_owner

    def test_list_running_outstanding(self, s, entries, rented_veh):
        r = s.get(f"{BASE_URL}/api/rented-ledger")
        assert r.status_code == 200
        all_entries = r.json()
        e1 = next(e for e in all_entries if e["id"] == entries["e1"]["id"])
        e2 = next(e for e in all_entries if e["id"] == entries["e2"]["id"])
        # balances: R1: 25000-2500-10000 = 12500 ; R2: 18000-1800-18000 = -1800
        assert e1["balance"] == 12500.0
        assert e2["balance"] == -1800.0
        # Running outstanding for THIS owner: might include prior entries from other tests.
        # So verify the DELTA between R1 and R2 running = -1800.
        assert round(e2["running_outstanding"] - e1["running_outstanding"], 2) == -1800.0
        # newest first
        idx1 = all_entries.index(e1); idx2 = all_entries.index(e2)
        assert idx2 < idx1, "newest-first ordering"
        # computed fields
        assert e1["vehicle_no"] == rented_veh["vehicle_no"]
        assert e1["owner"] == (rented_veh.get("owner_name") or rented_veh.get("vehicle_no"))

    def test_running_outstanding_isolated_owner(self, s, rented_veh):
        """Assert the exact 10700 running math using a unique owner_driver name."""
        owner_tag = "TEST_PH3_UniqueOwner_ZZZ"
        d1 = "2030-08-05"
        d2 = "2030-08-15"
        a = s.post(f"{BASE_URL}/api/rented-ledger", json={
            "date": d1, "vehicle_id": rented_veh["id"], "owner_driver": owner_tag,
            "revenue_to_pay": 25000, "commission_adj": 2500, "amount_paid": 10000,
        }).json()
        b = s.post(f"{BASE_URL}/api/rented-ledger", json={
            "date": d2, "vehicle_id": rented_veh["id"], "owner_driver": owner_tag,
            "revenue_to_pay": 18000, "commission_adj": 1800, "amount_paid": 18000,
        }).json()
        try:
            all_entries = s.get(f"{BASE_URL}/api/rented-ledger").json()
            eB = next(e for e in all_entries if e["id"] == b["id"])
            eA = next(e for e in all_entries if e["id"] == a["id"])
            assert eA["balance"] == 12500.0
            assert eB["balance"] == -1800.0
            assert eA["running_outstanding"] == 12500.0
            assert eB["running_outstanding"] == 10700.0
            # summary for this owner
            summary = s.get(f"{BASE_URL}/api/rented-ledger/summary").json()
            row = next(x for x in summary if x["owner"] == owner_tag)
            assert row["trips"] == 2
            assert row["total_revenue"] == 43000.0
            assert row["total_commission"] == 4300.0
            assert row["total_paid"] == 28000.0
            assert row["outstanding"] == 10700.0
        finally:
            s.delete(f"{BASE_URL}/api/rented-ledger/{a['id']}")
            s.delete(f"{BASE_URL}/api/rented-ledger/{b['id']}")

    def test_summary_sorted_desc(self, s, entries):
        r = s.get(f"{BASE_URL}/api/rented-ledger/summary")
        assert r.status_code == 200
        arr = r.json()
        outs = [x["outstanding"] for x in arr]
        assert outs == sorted(outs, reverse=True)

    def test_delete_removes_entry(self, s, rented_veh):
        e = s.post(f"{BASE_URL}/api/rented-ledger", json={
            "date": "2030-09-01", "vehicle_id": rented_veh["id"],
            "owner_driver": "TEST_PH3_DeleteMe",
            "revenue_to_pay": 5000, "commission_adj": 500, "amount_paid": 0,
        }).json()
        eid = e["id"]
        del_r = s.delete(f"{BASE_URL}/api/rented-ledger/{eid}")
        assert del_r.status_code == 200
        all_entries = s.get(f"{BASE_URL}/api/rented-ledger").json()
        assert not any(x["id"] == eid for x in all_entries)


# ================= PDF Export =================
class TestPdfMonthly:
    def test_pdf_returns_200_and_pdf_content(self, s):
        today = date.today()
        r = s.get(f"{BASE_URL}/api/pdf/monthly",
                  params={"year": today.year, "month": today.month})
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct.lower(), f"unexpected content-type: {ct}"
        assert r.content[:4] == b"%PDF", f"body does not start with %PDF: {r.content[:20]!r}"

    def test_pdf_handles_endash_categories(self, s):
        """Create an overhead category with en-dash to ensure no 500."""
        cat_name = "TEST_PH3 \u2013 EnDash Cat"
        c = s.post(f"{BASE_URL}/api/categories", json={
            "kind": "overhead", "name": cat_name}).json()
        try:
            today = date.today()
            # Add an expense so category actually appears in PDF
            s.post(f"{BASE_URL}/api/overhead-expenses", json={
                "date": today.isoformat(), "category": cat_name, "amount": 100.0
            })
            r = s.get(f"{BASE_URL}/api/pdf/monthly",
                      params={"year": today.year, "month": today.month})
            assert r.status_code == 200
            assert r.content[:4] == b"%PDF"
        finally:
            # cleanup: delete category via API if endpoint exists (best-effort)
            try:
                s.delete(f"{BASE_URL}/api/categories/{c['id']}")
            except Exception:
                pass


# ================= Auth enforcement =================
class TestAuthEnforcement:
    @pytest.mark.parametrize("path,params", [
        ("/api/pnl/vehicles", {"year": 2030, "month": 6}),
        ("/api/rented-ledger", None),
        ("/api/rented-ledger/summary", None),
        ("/api/pdf/monthly", {"year": 2030, "month": 6}),
    ])
    def test_requires_bearer(self, path, params):
        r = requests.get(f"{BASE_URL}{path}", params=params)  # no auth header
        assert r.status_code == 401, f"{path} returned {r.status_code}, expected 401"
