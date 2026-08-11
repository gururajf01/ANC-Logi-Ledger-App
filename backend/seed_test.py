import asyncio, os
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')
import server

async def main():
    db = server.db
    await db.users.delete_many({})
    await db.user_sessions.delete_many({})
    await db.vehicles.delete_many({})
    await db.drivers.delete_many({})
    await db.parties.delete_many({})
    await db.expense_categories.delete_many({})
    await db.trips.delete_many({})
    await db.overheads.delete_many({})
    uid = "user_testadmin01"
    await db.users.insert_one({"user_id": uid, "email": "admin@ancl.test", "name": "Test Admin", "role": "admin", "created_at": server.now_utc()})
    await server._seed_masters(uid)
    await db.user_sessions.insert_one({"session_token": "TESTTOKEN123", "user_id": uid, "created_at": server.now_utc(), "expires_at": server.now_utc()+timedelta(days=7)})
    print("seeded")

asyncio.run(main())
