from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.profile import ProfileCreate, ProfileUpdate, ProfileOut

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("birth_date"):
        row["birth_date"] = str(row["birth_date"])
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


@router.get("", response_model=ProfileOut | None)
def get_profile(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM profiles WHERE id = 1")
    rows = rows_to_dicts(conn)
    if not rows:
        return None
    return _fmt(rows[0])


@router.post("", response_model=ProfileOut)
def upsert_profile(
    body: ProfileCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM profiles WHERE id = 1")
    exists = conn.fetchone()
    if exists:
        conn.execute(
            """UPDATE profiles SET
                name=?, birth_date=?, filing_status=?, state=?,
                retirement_age=?, life_expectancy=?, inflation_rate=?
               WHERE id=1""",
            [
                body.name, str(body.birth_date), body.filing_status, body.state,
                body.retirement_age, body.life_expectancy, body.inflation_rate,
            ],
        )
    else:
        conn.execute(
            """INSERT INTO profiles
               (id, name, birth_date, filing_status, state,
                retirement_age, life_expectancy, inflation_rate)
               VALUES (1,?,?,?,?,?,?,?)""",
            [
                body.name, str(body.birth_date), body.filing_status, body.state,
                body.retirement_age, body.life_expectancy, body.inflation_rate,
            ],
        )
    conn.execute("SELECT * FROM profiles WHERE id = 1")
    return _fmt(rows_to_dicts(conn)[0])
