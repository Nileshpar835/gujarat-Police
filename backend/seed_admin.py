"""
Creates the first admin user directly against the database, bypassing the
API (which requires an existing admin to create new users — see
POST /auth/users). Run this once after applying the schema.

Usage:
    python3 seed_admin.py --username admin --email admin@example.gov.in --password <choose one>
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, Role
from app.core.security import hash_password


async def seed_admin(username: str, email: str, password: str):
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            print(f"User '{username}' already exists. Aborting.")
            sys.exit(1)

        role_result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = role_result.scalar_one_or_none()
        if not admin_role:
            print("No 'admin' role found — has database/schema.sql been applied (it seeds roles)?")
            sys.exit(1)

        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role_id=admin_role.id,
        )
        db.add(user)
        await db.commit()
        print(f"Created admin user '{username}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    asyncio.run(seed_admin(args.username, args.email, args.password))
