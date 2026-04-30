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
    # Get regular expenses
    conn.execute("SELECT * FROM expenses ORDER BY created_at")
    expenses = [_fmt(r) for r in rows_to_dicts(conn)]

    # Check for primary residence and its mortgage
    conn.execute("SELECT id FROM rental_properties WHERE is_primary_residence = TRUE LIMIT 1")
    prop_rows = rows_to_dicts(conn)
    if prop_rows:
        property_id = prop_rows[0]["id"]
        conn.execute("SELECT * FROM mortgages WHERE property_id = ? ORDER BY created_at LIMIT 1", [property_id])
        mortgage_rows = rows_to_dicts(conn)
        if mortgage_rows:
            m = mortgage_rows[0]
            # Use actual_monthly_payment if provided, otherwise calculate and add escrow
            actual_monthly = m.get("actual_monthly_payment")
            extra = m.get("extra_monthly_payment", 0.0) or 0.0
            if actual_monthly is not None and actual_monthly > 0:
                monthly = actual_monthly + extra
            else:
                principal = m.get("original_amount", 0.0)
                rate = m.get("interest_rate", 0.0) / 100.0
                n_years = m.get("term_years", 30)
                n_payments = n_years * 12
                if rate > 0 and n_payments > 0:
                    monthly = principal * (rate/12) / (1 - (1 + rate/12) ** -n_payments)
                else:
                    monthly = principal / n_payments if n_payments > 0 else 0.0
                # Add escrow (property tax and insurance) if present
                monthly += (m.get("property_tax", 0.0) + m.get("insurance", 0.0)) / 12.0
                monthly += extra
            annual_payment = round(monthly * 12, 2)
            # Add as synthetic expense
            expenses.append({
                "id": "primary-mortgage",
                "name": "Primary Residence Mortgage",
                "category": "housing",
                "annual_amount": annual_payment,
                "start_age": None,
                "end_age": None,
                "inflation_adjusted": True,
                "notes": "Auto-generated from primary residence mortgage",
                "created_at": None,
            })

    return expenses


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
