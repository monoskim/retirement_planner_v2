from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.social_security import (
    SocialSecurityCreate,
    SocialSecurityUpdate,
    SocialSecurityOut,
)

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


@router.get("", response_model=SocialSecurityOut | None)
def get_social_security(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM social_security WHERE id = 1")
    rows = rows_to_dicts(conn)
    if not rows:
        return None
    return _fmt(rows[0])


@router.post("", response_model=SocialSecurityOut)
def upsert_social_security(
    body: SocialSecurityCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM social_security WHERE id = 1")
    exists = conn.fetchone()
    if exists:
        conn.execute(
            """UPDATE social_security SET
               fra_monthly_benefit=?, fra_age=?, claiming_age=?,
               spouse_fra_monthly_benefit=?, spouse_fra_age=?,
               spouse_claiming_age=?, notes=?
               WHERE id=1""",
            [
                body.fra_monthly_benefit, body.fra_age, body.claiming_age,
                body.spouse_fra_monthly_benefit, body.spouse_fra_age,
                body.spouse_claiming_age, body.notes,
            ],
        )
    else:
        conn.execute(
            """INSERT INTO social_security
               (id, fra_monthly_benefit, fra_age, claiming_age,
                spouse_fra_monthly_benefit, spouse_fra_age,
                spouse_claiming_age, notes)
               VALUES (1,?,?,?,?,?,?,?)""",
            [
                body.fra_monthly_benefit, body.fra_age, body.claiming_age,
                body.spouse_fra_monthly_benefit, body.spouse_fra_age,
                body.spouse_claiming_age, body.notes,
            ],
        )
    conn.execute("SELECT * FROM social_security WHERE id = 1")
    return _fmt(rows_to_dicts(conn)[0])
