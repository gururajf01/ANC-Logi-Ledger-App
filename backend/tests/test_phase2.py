"""Phase 2 backend tests: pending-freight buckets, collect-payment auto/manual allocation,
oldest-first ordering, and annual FY endpoint. Uses ISOLATED test party+trips to avoid
depending on demo data. Cleans up at end.
"""
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
def veh(s):
    return next(v for v in s.get(f"{BASE_URL}/api/vehicles").json() if v["type"] == "Own")


@pytest.fixture(scope="module")
def scenario(s, veh):
    """Party + 2 trips: older(pending=20000), newer(revenue 15000, received 5000 -> pending=10000)."""
    p = s.post(f"{BASE_URL}/api/parties", json={
        "party_name": "TEST_PH2_Party", "phone": "+919999900001", "credit_terms_days": 30
    }).json()
    pid = p["id"]
    today = date.today()
    d_old = (today - timedelta(days=45)).isoformat()   # 60_plus? no, 45 -> 31_60
    d_new = (today - timedelta(days=10)).isoformat()   # 0_15
    t1 = s.post(f"{BASE_URL}/api/trips", json={
        "date": d_old, "ts_no": "TEST_PH2_T1", "vehicle_id": veh["id"],
        "party_id": pid, "revenue_to_pay": 20000, "amount_received": 0,
    }).json()
    t2 = s.post(f"{BASE_URL}/api/trips", json={
        "date": d_new, "ts_no": "TEST_PH2_T2", "vehicle_id": veh["id"],
        "party_id": pid, "revenue_to_pay": 15000, "amount_received": 5000,
    }).json()
    yield {"pid": pid, "t1": t1, "t2": t2, "d_old": d_old, "d_new": d_new}

    # cleanup
    for tid in (t1["id"], t2["id"]):
        s.delete(f"{BASE_URL}/api/trips/{tid}")
    # delete receipts of this party
    for r in s.get(f"{BASE_URL}/api/receipts", params={"party_id": pid}).json():
        s.request("DELETE", f"{BASE_URL}/api/receipts/{r['id']}")
    s.delete(f"{BASE_URL}/api/parties/{pid}")


# -------------- open-trips endpoint ---------------------------------------
class TestOpenTrips:
    def test_open_trips_only_pending_and_sorted(self, s, scenario):
        pid = scenario["pid"]
        r = s.get(f"{BASE_URL}/api/parties/{pid}/open-trips")
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) == 2
        # oldest first
        assert arr[0]["date"] < arr[1]["date"]
        # required fields
        for row in arr:
            for k in ("trip_id", "ts_no", "date", "pending", "age_days"):
                assert k in row, f"missing {k}"
            assert row["pending"] > 0
        assert arr[0]["pending"] == 20000
        assert arr[1]["pending"] == 10000
        assert arr[0]["age_days"] >= 44


# -------------- pending-freight buckets -----------------------------------
class TestPendingFreight:
    def test_buckets_and_phone(self, s, scenario):
        r = s.get(f"{BASE_URL}/api/pending-freight")
        assert r.status_code == 200
        entries = r.json()
        entry = next((e for e in entries if e["party_id"] == scenario["pid"]), None)
        assert entry, "test party should appear"
        assert entry["phone"] == "+919999900001"
        assert entry["total_pending"] == 30000  # 20k + 10k
        buckets = entry["buckets"]
        # trip1 age=45 -> 31_60 bucket; trip2 age=10 -> 0_15 bucket
        assert buckets["31_60"] == 20000
        assert buckets["0_15"] == 10000
        assert buckets["16_30"] == 0
        assert buckets["60_plus"] == 0


# -------------- collect (auto oldest-first) -------------------------------
class TestCollectAuto:
    def test_collect_25000_settles_oldest_first_ACC7(self, s, scenario):
        pid = scenario["pid"]
        today = date.today().isoformat()
        r = s.post(f"{BASE_URL}/api/receipts/collect", json={
            "party_id": pid, "amount": 25000, "date": today, "payment_mode": "Cash"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # Two allocations: 20000 to T1, 5000 to T2
        allocs = {a["trip_id"]: a["amount"] for a in d["allocations"]}
        assert allocs.get(scenario["t1"]["id"]) == 20000
        assert allocs.get(scenario["t2"]["id"]) == 5000
        assert d["allocated"] == 25000
        # Remaining outstanding: T2 pending was 10000, minus 5000 settled = 5000
        assert d["party_outstanding"] == 5000

    def test_trips_settled_amount_updated(self, s, scenario):
        trips = s.get(f"{BASE_URL}/api/trips", params={"party_id": scenario["pid"]}).json()
        by_id = {t["id"]: t for t in trips}
        t1 = by_id[scenario["t1"]["id"]]
        t2 = by_id[scenario["t2"]["id"]]
        assert t1["settled_amount"] == 20000
        assert t1["pending_freight"] == 0
        assert t2["settled_amount"] == 5000
        assert t2["pending_freight"] == 5000  # revenue 15000 - received 5000 - settled 5000

    def test_pending_freight_reflects_settlement(self, s, scenario):
        entries = s.get(f"{BASE_URL}/api/pending-freight").json()
        entry = next((e for e in entries if e["party_id"] == scenario["pid"]), None)
        assert entry is not None
        assert entry["total_pending"] == 5000
        assert entry["buckets"]["0_15"] == 5000
        assert entry["buckets"]["31_60"] == 0

    def test_daily_pnl_all_time_pending_reduced(self, s, scenario):
        # Not exact, but presence check: should not raise and should include chips
        r = s.get(f"{BASE_URL}/api/pnl/daily", params={"date": date.today().isoformat()})
        assert r.status_code == 200
        assert "total_pending_all_time" in r.json()["chips"]


# -------------- collect (manual override) ---------------------------------
class TestCollectManual:
    @pytest.fixture(scope="class")
    def party2(self, s, veh):
        p = s.post(f"{BASE_URL}/api/parties", json={
            "party_name": "TEST_PH2_Party_Manual", "credit_terms_days": 30
        }).json()
        pid = p["id"]
        d_old = (date.today() - timedelta(days=40)).isoformat()
        d_new = (date.today() - timedelta(days=5)).isoformat()
        t1 = s.post(f"{BASE_URL}/api/trips", json={
            "date": d_old, "ts_no": "TEST_PH2M_T1", "vehicle_id": veh["id"],
            "party_id": pid, "revenue_to_pay": 8000
        }).json()
        t2 = s.post(f"{BASE_URL}/api/trips", json={
            "date": d_new, "ts_no": "TEST_PH2M_T2", "vehicle_id": veh["id"],
            "party_id": pid, "revenue_to_pay": 8000
        }).json()
        yield {"pid": pid, "t1": t1, "t2": t2}
        for tid in (t1["id"], t2["id"]):
            s.delete(f"{BASE_URL}/api/trips/{tid}")
        s.delete(f"{BASE_URL}/api/parties/{pid}")

    def test_manual_allocations_override_auto(self, s, party2):
        # Manually pay newer trip first, ignoring oldest-first heuristic
        r = s.post(f"{BASE_URL}/api/receipts/collect", json={
            "party_id": party2["pid"], "amount": 3000,
            "date": date.today().isoformat(), "payment_mode": "UPI",
            "allocations": [{"trip_id": party2["t2"]["id"], "amount": 3000}]
        })
        assert r.status_code == 200
        d = r.json()
        assert len(d["allocations"]) == 1
        assert d["allocations"][0]["trip_id"] == party2["t2"]["id"]
        # Verify: T1 still 8000, T2 now 5000
        trips = {t["id"]: t for t in s.get(f"{BASE_URL}/api/trips",
                 params={"party_id": party2["pid"]}).json()}
        assert trips[party2["t1"]["id"]]["pending_freight"] == 8000
        assert trips[party2["t2"]["id"]]["pending_freight"] == 5000


# -------------- annual ---------------------------------------------------
class TestAnnual:
    def test_annual_fy_shape(self, s):
        r = s.get(f"{BASE_URL}/api/pnl/annual", params={"fy_start_year": 2026})
        assert r.status_code == 200
        d = r.json()
        assert len(d["months"]) == 12
        assert d["months"][0]["month"] == 4 and d["months"][0]["year"] == 2026
        assert d["months"][-1]["month"] == 3 and d["months"][-1]["year"] == 2027
        for m in d["months"]:
            for k in ("revenue", "received", "pending", "total_expense", "net_profit"):
                assert k in m
        for k in ("revenue", "received", "pending", "total_expense", "net_profit", "total_income"):
            assert k in d["totals"]


# -------------- over-allocation cap --------------------------------------
class TestOverAllocation:
    @pytest.fixture(scope="class")
    def party3(self, s, veh):
        p = s.post(f"{BASE_URL}/api/parties", json={
            "party_name": "TEST_PH2_Party_Over", "credit_terms_days": 30
        }).json()
        pid = p["id"]
        t1 = s.post(f"{BASE_URL}/api/trips", json={
            "date": (date.today() - timedelta(days=3)).isoformat(),
            "ts_no": "TEST_PH2O_T1", "vehicle_id": veh["id"],
            "party_id": pid, "revenue_to_pay": 1000
        }).json()
        yield {"pid": pid, "t1": t1}
        s.delete(f"{BASE_URL}/api/trips/{t1['id']}")
        s.delete(f"{BASE_URL}/api/parties/{pid}")

    def test_collect_more_than_outstanding_caps_per_trip(self, s, party3):
        # try to collect 5000 when total outstanding is only 1000
        r = s.post(f"{BASE_URL}/api/receipts/collect", json={
            "party_id": party3["pid"], "amount": 5000,
            "date": date.today().isoformat(), "payment_mode": "Cash"
        })
        assert r.status_code == 200
        d = r.json()
        # allocation must NOT exceed the trip's pending (1000)
        assert d["allocated"] == 1000
        assert d["allocations"][0]["amount"] == 1000
        assert d["party_outstanding"] == 0
