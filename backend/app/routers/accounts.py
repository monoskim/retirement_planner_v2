from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.account import AccountCreate, AccountUpdate, AccountOut

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


@router.get("", response_model=list[AccountOut])
def list_accounts(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM accounts ORDER BY created_at")
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM accounts WHERE id = ?", [account_id])
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return _fmt(rows[0])


@router.post("", response_model=AccountOut, status_code=201)
def create_account(body: AccountCreate, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO accounts
           (id, name, account_type, balance, annual_contribution, contribution_pct,
            employer_match_pct, employer_match_limit_pct, expected_return_pct,
            return_stddev_pct, cost_basis, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            new_id, body.name, body.account_type, body.balance,
            body.annual_contribution, body.contribution_pct, body.employer_match_pct,
            body.employer_match_limit_pct, body.expected_return_pct,
            body.return_stddev_pct, body.cost_basis, body.notes,
        ],
    )
    conn.execute("SELECT * FROM accounts WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: str,
    body: AccountUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM accounts WHERE id = ?", [account_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")
    conn.execute(
        """UPDATE accounts SET
           name=?, account_type=?, balance=?, annual_contribution=?, contribution_pct=?,
           employer_match_pct=?, employer_match_limit_pct=?,
           expected_return_pct=?, return_stddev_pct=?, cost_basis=?, notes=?
           WHERE id=?""",
        [
            body.name, body.account_type, body.balance, body.annual_contribution,
            body.contribution_pct, body.employer_match_pct, body.employer_match_limit_pct,
            body.expected_return_pct, body.return_stddev_pct,
            body.cost_basis, body.notes, account_id,
        ],
    )
    conn.execute("SELECT * FROM accounts WHERE id = ?", [account_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT id FROM accounts WHERE id = ?", [account_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")
    conn.execute("DELETE FROM accounts WHERE id = ?", [account_id])
