from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.expense import ExpenseCreate, ExpenseUpdate, ExpenseOut

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


@router.get("", response_model=list[ExpenseOut])
def list_expenses(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM expenses ORDER BY created_at")
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM expenses WHERE id = ?", [expense_id])
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _fmt(rows[0])


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(body: ExpenseCreate, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO expenses
           (id, name, category, annual_amount, start_age, end_age,
            inflation_adjusted, notes)
           VALUES (?,?,?,?,?,?,?,?)""",
        [
            new_id, body.name, body.category, body.annual_amount,
            body.start_age, body.end_age, body.inflation_adjusted, body.notes,
        ],
    )
    conn.execute("SELECT * FROM expenses WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM expenses WHERE id = ?", [expense_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Expense not found")
    conn.execute(
        """UPDATE expenses SET
           name=?, category=?, annual_amount=?, start_age=?, end_age=?,
           inflation_adjusted=?, notes=?
           WHERE id=?""",
        [
            body.name, body.category, body.annual_amount, body.start_age,
            body.end_age, body.inflation_adjusted, body.notes, expense_id,
        ],
    )
    conn.execute("SELECT * FROM expenses WHERE id = ?", [expense_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT id FROM expenses WHERE id = ?", [expense_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Expense not found")
    conn.execute("DELETE FROM expenses WHERE id = ?", [expense_id])
