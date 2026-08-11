"""ANCL Logistics — Daily Transactions & P&L backend."""
from __future__ import annotations

import calendar
import io
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Header, Query, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from openpyxl import Workbook, load_workbook
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ANCL Logistics API")
api = APIRouter(prefix="/api")

# ---------- Helpers -------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "") -> str:
    v = uuid.uuid4().hex[:16]
    return f"{prefix}_{v}" if prefix else v


def strip_id(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


def to_iso(d: Any) -> Optional[str]:
    if isinstance(d, datetime):
        return d.isoformat()
    return d


# ---------- Auth (Emergent Google) ---------------------------------------
class SessionRequest(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "admin"


class SessionResponse(BaseModel):
    session_token: str
    user: UserOut


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User missing")
    return user


@api.post("/auth/session", response_model=SessionResponse)
async def auth_session(body: SessionRequest):
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="No email in profile")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        # Preserve role; first user became admin already
    else:
        user_id = new_id("user")
        # First user of the system becomes admin
        count = await db.users.count_documents({})
        role = "admin" if count == 0 else "clerk"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "role": role,
            "created_at": now_utc(),
        })

    # Seed masters if the workspace has none yet (idempotent safety net).
    if await db.vehicles.count_documents({}) == 0:
        await _seed_masters(user_id)

    session_token = data.get("session_token") or new_id("tok")
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "session_id_used": body.session_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return SessionResponse(
        session_token=session_token,
        user=UserOut(**{k: user.get(k) for k in ["user_id", "email", "name", "picture", "role"]}),
    )


@api.get("/auth/me", response_model=UserOut)
async def auth_me(user=Depends(get_current_user)):
    return UserOut(**{k: user.get(k) for k in ["user_id", "email", "name", "picture", "role"]})


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Master models -------------------------------------------------
class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: new_id("veh"))
    vehicle_no: str
    type: str = "Own"  # Own | Rented
    model: Optional[str] = None
    default_driver_id: Optional[str] = None
    default_driver_name: Optional[str] = None
    emi_amount_monthly: float = 0.0
    insurance_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    fc_expiry: Optional[str] = None
    fuel_type: Optional[str] = "Diesel"
    owner_name: Optional[str] = None
    agreed_rate: float = 0.0
    commission_pct: float = 0.0
    pay_terms: Optional[str] = "Per Trip"
    active: bool = True
    notes: Optional[str] = None


class Driver(BaseModel):
    id: str = Field(default_factory=lambda: new_id("drv"))
    name: str
    phone: Optional[str] = None
    linked_vehicle_id: Optional[str] = None
    default_bhatta_rate: float = 600.0
    salary_monthly: float = 0.0
    active: bool = True


class Party(BaseModel):
    id: str = Field(default_factory=lambda: new_id("pty"))
    party_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    credit_terms_days: int = 30
    opening_balance: float = 0.0
    active: bool = True


class ExpenseCategory(BaseModel):
    id: str = Field(default_factory=lambda: new_id("cat"))
    name: str
    kind: str = "PerTrip"  # PerTrip | Overhead
    is_fixed_recurring: bool = False
    default_monthly_amount: float = 0.0
    allocation_method: str = "actual_date"  # daily_prorata | per_trip | actual_date
    sort_order: int = 0
    active: bool = True


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: new_id("trip"))
    date: str  # YYYY-MM-DD
    ts_no: str
    vehicle_id: str
    vehicle_no: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    vehicle_type: str = "Own"
    party_id: Optional[str] = None
    party_name: Optional[str] = None
    route_from: Optional[str] = None
    route_to: Optional[str] = None
    revenue_to_pay: float = 0.0
    amount_received: float = 0.0
    settled_amount: float = 0.0
    return_adjustment: float = 0.0
    expenses: Dict[str, float] = Field(default_factory=dict)  # {category_id: amount}
    payment_mode: str = "Cash"
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class OverheadEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ovh"))
    date: str
    category_id: str
    category_name: Optional[str] = None
    amount: float
    description: Optional[str] = None
    paid_to: Optional[str] = None
    payment_mode: str = "Cash"
    vehicle_id: Optional[str] = None
    recurring: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class Receipt(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rcp"))
    date: str
    party_id: str
    amount: float
    payment_mode: str = "Cash"
    against_trips: List[Dict[str, Any]] = Field(default_factory=list)  # [{trip_id, amount}]
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class RentedLedgerEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rle"))
    date: str
    ts_no: Optional[str] = None
    vehicle_id: str
    owner_driver: Optional[str] = None
    revenue_to_pay: float = 0.0
    amount_paid: float = 0.0
    commission_adj: float = 0.0
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Seed -----------------------------------------------------------
async def _seed_masters(admin_user_id: str) -> None:
    # Own vehicles (from Settings sheet)
    own = [
        ("KA-XX-7195", "Sharanu", 3318),
        ("KA-XX-4608", "Manju K", 15070),
        ("KA-XX-6421", "Rafiq", 16141),
        ("KA-XX-8660", "Sachin", 15658),
        ("KA-XX-1288", "Rahul", 8840),
        ("KA-XX-262", "Rasul", 15499),
    ]
    rented = [
        ("KA-XX-467", "Manju M"),
        ("KA-XX-7559", "Adil"),
        ("KA-XX-8662", "Manju MLP"),
        ("KA-XX-ATTACH", "Attach/Owner"),
    ]
    for vno, drv, emi in own:
        d = Driver(name=drv, default_bhatta_rate=600.0).dict()
        d["created_by"] = admin_user_id
        await db.drivers.insert_one(d)
        v = Vehicle(vehicle_no=vno, type="Own", emi_amount_monthly=float(emi),
                    default_driver_id=d["id"], default_driver_name=drv).dict()
        v["created_by"] = admin_user_id
        await db.vehicles.insert_one(v)
        await db.drivers.update_one({"id": d["id"]}, {"$set": {"linked_vehicle_id": v["id"]}})

    for vno, owner in rented:
        v = Vehicle(vehicle_no=vno, type="Rented", owner_name=owner,
                    default_driver_name=owner).dict()
        v["created_by"] = admin_user_id
        await db.vehicles.insert_one(v)

    per_trip = ["Bhatta", "Hamali", "Diesel HBL", "Attach Commission", "Diesel MLP",
                "Tea/Snacks", "Vehicle Maintenance", "Salary (per-trip)", "Misc 1",
                "Misc 2", "Misc 3"]
    for i, n in enumerate(per_trip):
        c = ExpenseCategory(name=n, kind="PerTrip", sort_order=i).dict()
        await db.expense_categories.insert_one(c)

    overhead = [
        ("Diesel MLP/Bulk", "actual_date", 0),
        ("Driver Salaries", "daily_prorata", 0),
        ("Vehicle EMI – 7195", "daily_prorata", 3318),
        ("Vehicle EMI – 4608", "daily_prorata", 15070),
        ("Vehicle EMI – 6421", "daily_prorata", 16141),
        ("Vehicle EMI – 8660", "daily_prorata", 15658),
        ("Vehicle EMI – 1288", "daily_prorata", 8840),
        ("Vehicle EMI – 262", "daily_prorata", 15499),
        ("Vehicle Maintenance", "actual_date", 0),
        ("Shop Rent", "daily_prorata", 0),
        ("Electricity & Bills", "daily_prorata", 0),
        ("Chits/Pigmy", "daily_prorata", 0),
        ("LR Printing & Stationery", "actual_date", 0),
        ("Tea/Snacks/Food", "actual_date", 0),
        ("Commission (Office)", "actual_date", 0),
        ("Profit Encashment", "actual_date", 0),
        ("Misc 1", "actual_date", 0), ("Misc 2", "actual_date", 0),
        ("Misc 3", "actual_date", 0), ("Misc 4", "actual_date", 0),
        ("Misc 5", "actual_date", 0), ("Misc 6", "actual_date", 0),
    ]
    for i, (n, alloc, amt) in enumerate(overhead):
        c = ExpenseCategory(name=n, kind="Overhead", is_fixed_recurring=(amt > 0),
                            default_monthly_amount=float(amt), allocation_method=alloc,
                            sort_order=i).dict()
        await db.expense_categories.insert_one(c)


# ---------- Generic CRUD helpers ------------------------------------------
def _list(coll_name: str, sort_field: str = "sort_order"):
    async def _handler(user=Depends(get_current_user)):
        cursor = db[coll_name].find({}, {"_id": 0})
        docs = await cursor.to_list(2000)
        try:
            docs.sort(key=lambda d: (d.get(sort_field, 0), d.get("name", d.get("vehicle_no", ""))))
        except Exception:
            pass
        return docs
    return _handler


# ---------- Vehicles ------------------------------------------------------
@api.get("/vehicles")
async def list_vehicles(user=Depends(get_current_user)):
    docs = await db.vehicles.find({}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: d.get("vehicle_no", ""))
    return docs


@api.post("/vehicles")
async def create_vehicle(v: Vehicle, user=Depends(get_current_user)):
    d = v.dict()
    await db.vehicles.insert_one(d)
    return strip_id(d)


@api.put("/vehicles/{vid}")
async def update_vehicle(vid: str, v: Vehicle, user=Depends(get_current_user)):
    d = v.dict()
    d["id"] = vid
    await db.vehicles.update_one({"id": vid}, {"$set": d})
    return d


@api.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user=Depends(get_current_user)):
    await db.vehicles.delete_one({"id": vid})
    return {"ok": True}


# ---------- Drivers -------------------------------------------------------
@api.get("/drivers")
async def list_drivers(user=Depends(get_current_user)):
    docs = await db.drivers.find({}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: d.get("name", ""))
    return docs


@api.post("/drivers")
async def create_driver(d: Driver, user=Depends(get_current_user)):
    x = d.dict()
    await db.drivers.insert_one(x)
    return strip_id(x)


@api.put("/drivers/{did}")
async def update_driver(did: str, d: Driver, user=Depends(get_current_user)):
    x = d.dict()
    x["id"] = did
    await db.drivers.update_one({"id": did}, {"$set": x})
    return x


@api.delete("/drivers/{did}")
async def delete_driver(did: str, user=Depends(get_current_user)):
    await db.drivers.delete_one({"id": did})
    return {"ok": True}


# ---------- Parties -------------------------------------------------------
@api.get("/parties")
async def list_parties(user=Depends(get_current_user)):
    docs = await db.parties.find({}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: d.get("party_name", ""))
    return docs


@api.post("/parties")
async def create_party(p: Party, user=Depends(get_current_user)):
    x = p.dict()
    await db.parties.insert_one(x)
    return strip_id(x)


@api.put("/parties/{pid}")
async def update_party(pid: str, p: Party, user=Depends(get_current_user)):
    x = p.dict()
    x["id"] = pid
    await db.parties.update_one({"id": pid}, {"$set": x})
    return x


@api.delete("/parties/{pid}")
async def delete_party(pid: str, user=Depends(get_current_user)):
    await db.parties.delete_one({"id": pid})
    return {"ok": True}


@api.get("/parties/{pid}/open-trips")
async def party_open_trips(pid: str, user=Depends(get_current_user)):
    trips = await db.trips.find({"party_id": pid}, {"_id": 0}).to_list(5000)
    out = []
    today = date.today()
    for t in trips:
        t = _compute_trip(t)
        if t["pending_freight"] <= 0:
            continue
        try:
            age = (today - datetime.strptime(t["date"], "%Y-%m-%d").date()).days
        except Exception:
            age = 0
        out.append({"trip_id": t["id"], "ts_no": t.get("ts_no"), "date": t["date"],
                    "revenue": t.get("revenue_to_pay"), "pending": t["pending_freight"],
                    "age_days": age, "route": f"{t.get('route_from') or '-'} → {t.get('route_to') or '-'}"})
    out.sort(key=lambda x: x["date"])  # oldest first
    return out


# ---------- Categories ----------------------------------------------------
@api.get("/categories")
async def list_categories(kind: Optional[str] = None, user=Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if kind:
        q["kind"] = kind
    docs = await db.expense_categories.find(q, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: (d.get("kind", ""), d.get("sort_order", 0)))
    return docs


@api.post("/categories")
async def create_category(c: ExpenseCategory, user=Depends(get_current_user)):
    x = c.dict()
    await db.expense_categories.insert_one(x)
    return strip_id(x)


@api.put("/categories/{cid}")
async def update_category(cid: str, c: ExpenseCategory, user=Depends(get_current_user)):
    x = c.dict()
    x["id"] = cid
    await db.expense_categories.update_one({"id": cid}, {"$set": x})
    return x


@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(get_current_user)):
    await db.expense_categories.delete_one({"id": cid})
    return {"ok": True}


# ---------- Trips ---------------------------------------------------------
def _compute_trip(t: dict) -> dict:
    expenses = t.get("expenses", {}) or {}
    trip_exp = sum(float(v or 0) for v in expenses.values())
    revenue = float(t.get("revenue_to_pay", 0) or 0)
    received = float(t.get("amount_received", 0) or 0)
    settled = float(t.get("settled_amount", 0) or 0)
    ret_adj = float(t.get("return_adjustment", 0) or 0)
    t["trip_expense_total"] = round(trip_exp, 2)
    t["pending_freight"] = round(revenue - received - settled, 2)
    t["trip_margin"] = round(revenue + ret_adj - trip_exp, 2)
    return t


@api.get("/trips")
async def list_trips(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    party_id: Optional[str] = None,
    limit: int = 500,
    user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if date_from and date_to:
        q["date"] = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        q["date"] = {"$gte": date_from}
    elif date_to:
        q["date"] = {"$lte": date_to}
    if vehicle_id:
        q["vehicle_id"] = vehicle_id
    if party_id:
        q["party_id"] = party_id
    docs = await db.trips.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    return [_compute_trip(d) for d in docs]


@api.post("/trips")
async def create_trip(t: Trip, user=Depends(get_current_user)):
    d = t.dict()
    d["created_by"] = user["user_id"]
    d = _compute_trip(d)
    # Duplicate TS warning: reject only if same ts_no+vehicle
    if d.get("ts_no"):
        dup = await db.trips.find_one({"ts_no": d["ts_no"]}, {"_id": 0})
        if dup:
            d["ts_duplicate_warning"] = True
    # Enrich denormalized fields
    veh = await db.vehicles.find_one({"id": d["vehicle_id"]}, {"_id": 0})
    if veh:
        d["vehicle_no"] = veh["vehicle_no"]
        d["vehicle_type"] = veh.get("type", "Own")
        if not d.get("driver_id") and veh.get("default_driver_id"):
            d["driver_id"] = veh["default_driver_id"]
            d["driver_name"] = veh.get("default_driver_name")
    if d.get("driver_id") and not d.get("driver_name"):
        drv = await db.drivers.find_one({"id": d["driver_id"]}, {"_id": 0})
        if drv:
            d["driver_name"] = drv["name"]
    if d.get("party_id") and not d.get("party_name"):
        p = await db.parties.find_one({"id": d["party_id"]}, {"_id": 0})
        if p:
            d["party_name"] = p["party_name"]
    await db.trips.insert_one(d)
    return strip_id(d)


@api.put("/trips/{tid}")
async def update_trip(tid: str, t: Trip, user=Depends(get_current_user)):
    d = t.dict()
    d["id"] = tid
    d["updated_at"] = now_utc()
    d = _compute_trip(d)
    await db.trips.update_one({"id": tid}, {"$set": d})
    return d


@api.delete("/trips/{tid}")
async def delete_trip(tid: str, user=Depends(get_current_user)):
    await db.trips.delete_one({"id": tid})
    return {"ok": True}


# ---------- Overheads -----------------------------------------------------
@api.get("/overheads")
async def list_overheads(date_from: Optional[str] = None, date_to: Optional[str] = None,
                        user=Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if date_from and date_to:
        q["date"] = {"$gte": date_from, "$lte": date_to}
    docs = await db.overheads.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs


@api.post("/overheads")
async def create_overhead(o: OverheadEntry, user=Depends(get_current_user)):
    d = o.dict()
    d["created_by"] = user["user_id"]
    cat = await db.expense_categories.find_one({"id": d["category_id"]}, {"_id": 0})
    if cat:
        d["category_name"] = cat["name"]
    await db.overheads.insert_one(d)
    return strip_id(d)


@api.delete("/overheads/{oid}")
async def delete_overhead(oid: str, user=Depends(get_current_user)):
    await db.overheads.delete_one({"id": oid})
    return {"ok": True}


# ---------- Receipts ------------------------------------------------------
@api.get("/receipts")
async def list_receipts(party_id: Optional[str] = None, user=Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if party_id:
        q["party_id"] = party_id
    docs = await db.receipts.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs


@api.post("/receipts")
async def create_receipt(r: Receipt, user=Depends(get_current_user)):
    d = r.dict()
    await db.receipts.insert_one(d)
    return strip_id(d)


class CollectRequest(BaseModel):
    party_id: str
    amount: float
    date: str
    payment_mode: str = "Cash"
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    allocations: Optional[List[Dict[str, Any]]] = None  # [{trip_id, amount}] manual override


@api.post("/receipts/collect")
async def collect_payment(body: CollectRequest, user=Depends(get_current_user)):
    party = await db.parties.find_one({"id": body.party_id}, {"_id": 0})
    party_name = party["party_name"] if party else None

    # Gather open trips (oldest first)
    trips = await db.trips.find({"party_id": body.party_id}, {"_id": 0}).to_list(5000)
    for t in trips:
        _compute_trip(t)
    open_trips = sorted([t for t in trips if t["pending_freight"] > 0], key=lambda t: t["date"])

    allocations: List[Dict[str, Any]] = []
    if body.allocations:
        for a in body.allocations:
            amt = float(a.get("amount", 0) or 0)
            if amt <= 0:
                continue
            allocations.append({"trip_id": a["trip_id"], "amount": round(amt, 2)})
    else:
        # Auto-allocate oldest first
        remaining = float(body.amount)
        for t in open_trips:
            if remaining <= 0:
                break
            take = min(remaining, t["pending_freight"])
            allocations.append({"trip_id": t["id"], "ts_no": t.get("ts_no"), "amount": round(take, 2)})
            remaining -= take

    # Apply allocations to trips' settled_amount
    for a in allocations:
        tr = await db.trips.find_one({"id": a["trip_id"]}, {"_id": 0})
        if not tr:
            continue
        new_settled = float(tr.get("settled_amount", 0) or 0) + float(a["amount"])
        await db.trips.update_one({"id": a["trip_id"]}, {"$set": {"settled_amount": round(new_settled, 2), "updated_at": now_utc()}})

    receipt = Receipt(
        date=body.date, party_id=body.party_id, amount=float(body.amount),
        payment_mode=body.payment_mode, against_trips=allocations,
        reference_no=body.reference_no, notes=body.notes,
    ).dict()
    await db.receipts.insert_one(receipt)

    # Recompute party outstanding
    trips2 = await db.trips.find({"party_id": body.party_id}, {"_id": 0}).to_list(5000)
    outstanding = 0.0
    for t in trips2:
        _compute_trip(t)
        if t["pending_freight"] > 0:
            outstanding += t["pending_freight"]

    return {"ok": True, "receipt_id": receipt["id"], "party_name": party_name,
            "allocated": round(sum(a["amount"] for a in allocations), 2),
            "allocations": allocations, "party_outstanding": round(outstanding, 2)}


# ---------- Daily P&L -----------------------------------------------------
@api.get("/pnl/daily")
async def daily_pnl(date_str: str = Query(..., alias="date"), user=Depends(get_current_user)):
    # Parse date
    y, m, dnum = map(int, date_str.split("-"))
    days_in_month = calendar.monthrange(y, m)[1]
    trips = await db.trips.find({"date": date_str}, {"_id": 0}).to_list(1000)
    overheads_day = await db.overheads.find({"date": date_str}, {"_id": 0}).to_list(1000)
    # Whole month overheads (for prorata)
    month_prefix = f"{y:04d}-{m:02d}"
    trips_month = await db.trips.find({"date": {"$regex": f"^{month_prefix}"}}, {"_id": 0}).to_list(5000)
    trips_in_month = len(trips_month)
    trips_today_count = len(trips)

    # Compute per-trip metrics
    revenue = sum(float(t.get("revenue_to_pay", 0) or 0) for t in trips)
    ret_adj = sum(float(t.get("return_adjustment", 0) or 0) for t in trips)
    trip_expense = sum(sum(float(v or 0) for v in (t.get("expenses") or {}).values()) for t in trips)
    received = sum(float(t.get("amount_received", 0) or 0) for t in trips)
    pending_today = sum(_compute_trip(dict(t))["pending_freight"] for t in trips)
    own_trips = [t for t in trips if (t.get("vehicle_type") == "Own")]
    rented_trips = [t for t in trips if (t.get("vehicle_type") == "Rented")]

    # Overhead accrual for the day
    categories = await db.expense_categories.find({"kind": "Overhead"}, {"_id": 0}).to_list(200)
    accrued_overhead = 0.0
    breakdown = []
    for c in categories:
        alloc = c.get("allocation_method", "actual_date")
        monthly_amt = float(c.get("default_monthly_amount", 0) or 0)
        if alloc == "daily_prorata" and monthly_amt > 0:
            share = monthly_amt / days_in_month
        elif alloc == "per_trip" and monthly_amt > 0 and trips_in_month > 0 and trips_today_count > 0:
            share = (monthly_amt / trips_in_month) * trips_today_count
        else:
            share = 0.0
        # Add any actual entries dated today for this category
        actuals = sum(float(o.get("amount", 0) or 0) for o in overheads_day if o.get("category_id") == c["id"])
        total = round(share + actuals, 2)
        if total > 0:
            breakdown.append({"category_id": c["id"], "name": c["name"], "accrued": round(share, 2), "actual": round(actuals, 2), "total": total})
        accrued_overhead += share
        accrued_overhead += actuals

    # All-time pending freight (net of same-day receipts and later settlements)
    all_trips = await db.trips.find({}, {"_id": 0}).to_list(20000)
    outstanding = 0.0
    for t in all_trips:
        _compute_trip(t)
        if t["pending_freight"] > 0:
            outstanding += t["pending_freight"]
    all_receipts = await db.receipts.find({}, {"_id": 0}).to_list(20000)
    receipts_today = [r for r in all_receipts if r.get("date") == date_str]
    receipts_today_amt = sum(float(r.get("amount", 0) or 0) for r in receipts_today)

    income_accrual = revenue + ret_adj
    net_accrual = income_accrual - trip_expense - accrued_overhead

    cash_in = received + receipts_today_amt
    cash_out = trip_expense + sum(float(o.get("amount", 0) or 0) for o in overheads_day)
    net_cash = cash_in - cash_out

    return {
        "date": date_str,
        "accrual": {
            "income": round(income_accrual, 2),
            "revenue": round(revenue, 2),
            "return_adjustment": round(ret_adj, 2),
            "variable_cost": round(trip_expense, 2),
            "overhead": round(accrued_overhead, 2),
            "net_profit": round(net_accrual, 2),
            "margin_pct": round((net_accrual / income_accrual * 100) if income_accrual else 0.0, 2),
        },
        "cash": {
            "cash_in": round(cash_in, 2),
            "cash_out": round(cash_out, 2),
            "net_cash": round(net_cash, 2),
        },
        "chips": {
            "trips_today": trips_today_count,
            "own_trips": len(own_trips),
            "rented_trips": len(rented_trips),
            "new_pending_today": round(pending_today, 2),
            "total_pending_all_time": round(outstanding, 2),
        },
        "overhead_breakdown": breakdown,
    }


# ---------- Monthly P&L ---------------------------------------------------
@api.get("/pnl/monthly")
async def monthly_pnl(year: int, month: int, user=Depends(get_current_user)):
    month_prefix = f"{year:04d}-{month:02d}"
    trips = await db.trips.find({"date": {"$regex": f"^{month_prefix}"}}, {"_id": 0}).to_list(5000)
    overheads = await db.overheads.find({"date": {"$regex": f"^{month_prefix}"}}, {"_id": 0}).to_list(5000)
    cats = await db.expense_categories.find({}, {"_id": 0}).to_list(500)
    per_trip_cats = [c for c in cats if c.get("kind") == "PerTrip"]
    overhead_cats = [c for c in cats if c.get("kind") == "Overhead"]

    revenue = sum(float(t.get("revenue_to_pay", 0) or 0) for t in trips)
    received = sum(float(t.get("amount_received", 0) or 0) for t in trips)
    ret_adj = sum(float(t.get("return_adjustment", 0) or 0) for t in trips)
    total_income = revenue + ret_adj  # corrected formula

    per_trip_items = []
    per_trip_total = 0.0
    for c in per_trip_cats:
        amt = sum(float((t.get("expenses") or {}).get(c["id"], 0) or 0) for t in trips)
        per_trip_items.append({"id": c["id"], "name": c["name"], "amount": round(amt, 2)})
        per_trip_total += amt

    overhead_items = []
    overhead_total = 0.0
    for c in overhead_cats:
        actual_amt = sum(float(o.get("amount", 0) or 0) for o in overheads if o.get("category_id") == c["id"])
        # For fixed items, use monthly default if actual is zero
        default_amt = float(c.get("default_monthly_amount", 0) or 0)
        use_amt = actual_amt if actual_amt > 0 else default_amt
        if use_amt > 0:
            overhead_items.append({"id": c["id"], "name": c["name"], "amount": round(use_amt, 2)})
            overhead_total += use_amt

    total_expense = per_trip_total + overhead_total
    net_profit = total_income - total_expense

    own = [t for t in trips if t.get("vehicle_type") == "Own"]
    rented = [t for t in trips if t.get("vehicle_type") == "Rented"]

    def _summ(subset):
        rev = sum(float(t.get("revenue_to_pay", 0) or 0) for t in subset)
        rcv = sum(float(t.get("amount_received", 0) or 0) for t in subset)
        rad = sum(float(t.get("return_adjustment", 0) or 0) for t in subset)
        exp = sum(sum(float(v or 0) for v in (t.get("expenses") or {}).values()) for t in subset)
        return {"revenue": round(rev, 2), "received": round(rcv, 2), "pending": round(rev - rcv, 2),
                "return_adj": round(rad, 2), "trip_expenses": round(exp, 2), "trips": len(subset),
                "net_contribution": round(rev + rad - exp, 2)}

    old_formula_income = revenue + received + ret_adj  # what the sheet had, for restatement note

    return {
        "year": year, "month": month,
        "income": {"revenue": round(revenue, 2), "return_adjustment": round(ret_adj, 2),
                   "total_income": round(total_income, 2)},
        "memorandum": {"received": round(received, 2),
                       "pending_freight": round(revenue - received, 2),
                       "old_workbook_income_double_counted": round(old_formula_income, 2)},
        "per_trip_items": per_trip_items,
        "per_trip_total": round(per_trip_total, 2),
        "overhead_items": overhead_items,
        "overhead_total": round(overhead_total, 2),
        "total_expense": round(total_expense, 2),
        "net_profit": round(net_profit, 2),
        "profit_pct": round((net_profit / total_income * 100) if total_income else 0.0, 2),
        "vehicle_type_summary": {"own": _summ(own), "rented": _summ(rented)},
        "trips_count": len(trips),
    }


# ---------- Annual dashboard ---------------------------------------------
@api.get("/pnl/annual")
async def annual_pnl(fy_start_year: int = 2026, user=Depends(get_current_user)):
    months = []
    total_rev = total_recv = total_ret = total_pt = total_ovh = 0.0
    for i in range(12):
        m = ((3 + i) % 12) + 1  # Apr..Mar
        y = fy_start_year if (3 + i) < 12 else fy_start_year + 1
        mp = await monthly_pnl(y, m, user)  # type: ignore
        months.append({
            "year": y, "month": m,
            "revenue": mp["income"]["revenue"], "received": mp["memorandum"]["received"],
            "pending": mp["memorandum"]["pending_freight"], "return_adj": mp["income"]["return_adjustment"],
            "total_income": mp["income"]["total_income"], "trip_expenses": mp["per_trip_total"],
            "overhead": mp["overhead_total"], "total_expense": mp["total_expense"],
            "net_profit": mp["net_profit"], "profit_pct": mp["profit_pct"],
            "trips": mp["trips_count"],
            "own_trips": mp["vehicle_type_summary"]["own"]["trips"],
            "rented_trips": mp["vehicle_type_summary"]["rented"]["trips"],
        })
        total_rev += mp["income"]["revenue"]
        total_recv += mp["memorandum"]["received"]
        total_pt += mp["per_trip_total"]
        total_ovh += mp["overhead_total"]
        total_ret += mp["income"]["return_adjustment"]
    total_income = total_rev + total_ret
    total_exp = total_pt + total_ovh
    return {
        "fy_start_year": fy_start_year,
        "months": months,
        "totals": {
            "revenue": round(total_rev, 2), "received": round(total_recv, 2),
            "pending": round(total_rev - total_recv, 2), "return_adj": round(total_ret, 2),
            "total_income": round(total_income, 2), "trip_expenses": round(total_pt, 2),
            "overhead": round(total_ovh, 2), "total_expense": round(total_exp, 2),
            "net_profit": round(total_income - total_exp, 2),
            "profit_pct": round(((total_income - total_exp) / total_income * 100) if total_income else 0.0, 2),
        }
    }


# ---------- Pending Freight (party-wise) ----------------------------------
@api.get("/pending-freight")
async def pending_freight(user=Depends(get_current_user)):
    trips = await db.trips.find({}, {"_id": 0}).to_list(20000)
    parties = await db.parties.find({}, {"_id": 0}).to_list(2000)
    party_map = {p["id"]: p for p in parties}
    by_party: Dict[str, Dict[str, Any]] = {}
    today = date.today()
    for t in trips:
        _compute_trip(t)
        pid = t.get("party_id") or "_unassigned"
        pending = t["pending_freight"]
        if pending <= 0:
            continue
        try:
            tdate = datetime.strptime(t["date"], "%Y-%m-%d").date()
            age = (today - tdate).days
        except Exception:
            age = 0
        p = party_map.get(pid)
        entry = by_party.setdefault(pid, {
            "party_id": pid, "party_name": (p["party_name"] if p else (t.get("party_name") or "Unassigned")),
            "phone": (p.get("phone") if p else None),
            "total_pending": 0.0, "buckets": {"0_15": 0.0, "16_30": 0.0, "31_60": 0.0, "60_plus": 0.0},
            "trips": [],
        })
        entry["total_pending"] += pending
        if age <= 15:
            entry["buckets"]["0_15"] += pending
        elif age <= 30:
            entry["buckets"]["16_30"] += pending
        elif age <= 60:
            entry["buckets"]["31_60"] += pending
        else:
            entry["buckets"]["60_plus"] += pending
        entry["trips"].append({"trip_id": t["id"], "ts_no": t.get("ts_no"), "date": t["date"],
                               "pending": round(pending, 2), "age_days": age})
    out = list(by_party.values())
    out = [{**p, "total_pending": round(p["total_pending"], 2),
            "trips": sorted(p["trips"], key=lambda x: x["date"]),
            "buckets": {k: round(v, 2) for k, v in p["buckets"].items()}}
           for p in out if p["total_pending"] > 0.01]
    out.sort(key=lambda x: -x["total_pending"])
    return out



# ---------- Excel Export --------------------------------------------------
@api.get("/excel/export")
async def excel_export(year: int, month: int, user=Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = f"{calendar.month_abbr[month]} {year % 100}"
    ws.append(["ANCL LOGISTICS – Monthly Trip & Accounts Log", "", f"{calendar.month_name[month]} {year}"])
    ws.append([])
    headers = ["Date", "TS #", "Vehicle", "Type", "Driver", "Party", "From", "To",
               "Revenue", "Received", "Pending", "Return/Adj", "Trip Expense", "Trip Margin", "Notes"]
    ws.append(headers)
    month_prefix = f"{year:04d}-{month:02d}"
    trips = await db.trips.find({"date": {"$regex": f"^{month_prefix}"}}, {"_id": 0}).sort("date", 1).to_list(5000)
    for t in trips:
        t = _compute_trip(t)
        ws.append([t.get("date"), t.get("ts_no"), t.get("vehicle_no"), t.get("vehicle_type"),
                   t.get("driver_name"), t.get("party_name"), t.get("route_from"), t.get("route_to"),
                   t.get("revenue_to_pay"), t.get("amount_received"), t.get("pending_freight"),
                   t.get("return_adjustment"), t.get("trip_expense_total"), t.get("trip_margin"),
                   t.get("notes")])

    # P&L sheet
    pnl = await monthly_pnl(year, month, user)  # type: ignore
    ws2 = wb.create_sheet("Monthly P&L")
    ws2.append(["A. INCOME"])
    ws2.append(["Revenue (To Pay)", pnl["income"]["revenue"]])
    ws2.append(["Return / Adjustments", pnl["income"]["return_adjustment"]])
    ws2.append(["TOTAL INCOME (A)", pnl["income"]["total_income"]])
    ws2.append([])
    ws2.append(["B. EXPENSES"])
    ws2.append(["Per-trip:"])
    for it in pnl["per_trip_items"]:
        ws2.append([it["name"], it["amount"]])
    ws2.append(["Per-trip sub-total", pnl["per_trip_total"]])
    ws2.append(["Overhead:"])
    for it in pnl["overhead_items"]:
        ws2.append([it["name"], it["amount"]])
    ws2.append(["Overhead sub-total", pnl["overhead_total"]])
    ws2.append(["TOTAL EXPENSES (B)", pnl["total_expense"]])
    ws2.append([])
    ws2.append(["NET PROFIT / (LOSS)", pnl["net_profit"]])
    ws2.append(["PROFIT %", pnl["profit_pct"]])
    ws2.append([])
    ws2.append(["MEMORANDUM"])
    ws2.append(["Received (cash collected)", pnl["memorandum"]["received"]])
    ws2.append(["Pending Freight outstanding", pnl["memorandum"]["pending_freight"]])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"ANCL_{year}_{calendar.month_abbr[month]}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------- Excel Import --------------------------------------------------
@api.post("/excel/import/preview")
async def excel_import_preview(file: UploadFile = File(...), user=Depends(get_current_user)):
    contents = await file.read()
    try:
        wb = load_workbook(io.BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Not a valid xlsx: {e}")
    sheets = wb.sheetnames
    summary = {"sheets": sheets, "trip_rows_found": 0, "overhead_rows_found": 0, "rented_rows_found": 0}
    for sname in sheets:
        low = sname.lower()
        ws = wb[sname]
        # Heuristic: monthly sheet has "monthly" or month abbr in name
        if any(mabbr.lower() in low for mabbr in ["apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar"]) and "ledger" not in low and "dashboard" not in low:
            for row in ws.iter_rows(min_row=5, max_row=min(ws.max_row, 200), values_only=True):
                if row and any(cell not in (None, "") for cell in row[:5]):
                    summary["trip_rows_found"] += 1
        if "ledger" in low:
            summary["rented_rows_found"] += max(0, ws.max_row - 3)
    return summary


@api.post("/excel/import/commit")
async def excel_import_commit(file: UploadFile = File(...), user=Depends(get_current_user)):
    contents = await file.read()
    try:
        wb = load_workbook(io.BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Not a valid xlsx: {e}")
    imported_trips = 0
    imported_overheads = 0
    per_trip_cats = await db.expense_categories.find({"kind": "PerTrip"}, {"_id": 0}).to_list(200)
    per_trip_by_name = {c["name"].lower(): c["id"] for c in per_trip_cats}
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(500)
    vehicle_by_no = {v["vehicle_no"].lower(): v for v in vehicles}
    for sname in wb.sheetnames:
        low = sname.lower()
        if any(mabbr in low for mabbr in ["apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar"]) and "ledger" not in low and "dashboard" not in low:
            ws = wb[sname]
            # Very defensive: iterate rows and look for row with date + ts# + vehicle
            for row in ws.iter_rows(min_row=5, max_row=min(ws.max_row, 200), values_only=True):
                if not row:
                    continue
                d, ts, veh_no = row[0], row[1], row[2] if len(row) > 2 else None
                if not d or not ts:
                    continue
                # Coerce date
                if isinstance(d, datetime):
                    date_str = d.strftime("%Y-%m-%d")
                elif isinstance(d, date):
                    date_str = d.strftime("%Y-%m-%d")
                else:
                    continue
                # Idempotent: skip if trip with same ts_no+date exists
                existing = await db.trips.find_one({"ts_no": str(ts), "date": date_str}, {"_id": 0})
                if existing:
                    continue
                veh = None
                if veh_no:
                    veh = vehicle_by_no.get(str(veh_no).strip().lower())
                trip = Trip(
                    date=date_str, ts_no=str(ts),
                    vehicle_id=veh["id"] if veh else "",
                    vehicle_no=veh["vehicle_no"] if veh else str(veh_no or ""),
                    vehicle_type=veh.get("type", "Own") if veh else "Own",
                    revenue_to_pay=float(row[6] or 0) if len(row) > 6 and isinstance(row[6], (int, float)) else 0.0,
                    amount_received=float(row[7] or 0) if len(row) > 7 and isinstance(row[7], (int, float)) else 0.0,
                    return_adjustment=float(row[8] or 0) if len(row) > 8 and isinstance(row[8], (int, float)) else 0.0,
                ).dict()
                trip = _compute_trip(trip)
                await db.trips.insert_one(trip)
                imported_trips += 1
    return {"imported_trips": imported_trips, "imported_overheads": imported_overheads}


# ---------- Startup / init ------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.trips.create_index([("date", -1)])
    await db.overheads.create_index([("date", -1)])


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/health")
async def health():
    return {"ok": True, "time": now_utc().isoformat()}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
