from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.expense import ExpenseCreate, ExpenseUpdate, ExpenseOut

router = APIRouter()

MORTGAGE_KEYWORDS = (
    "mortgage",
    "home loan",
    "loan payment",
    "principal",
    "interest",
    "p&i",
)

PROPERTY_COST_KEYWORDS = (
    "property tax",
    "homeowners insurance",
    "homeowner's insurance",
    "home insurance",
    "hoa",
    "condo fee",
    "maintenance",
)


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    raw_periods = row.get("periods_json")
    if isinstance(raw_periods, str) and raw_periods.strip():
        try:
            row["periods"] = json.loads(raw_periods)
        except json.JSONDecodeError:
            row["periods"] = []
    else:
        row["periods"] = []
    row.pop("periods_json", None)
    return row


def _primary_housing_context(conn: duckdb.DuckDBPyConnection) -> tuple[bool, bool]:
    """Return (has_primary_property, has_primary_mortgage)."""
    conn.execute("SELECT id FROM rental_properties WHERE is_primary_residence = TRUE LIMIT 1")
    primary_rows = rows_to_dicts(conn)
    if not primary_rows:
        return (False, False)

    property_id = primary_rows[0]["id"]
    conn.execute("SELECT id FROM mortgages WHERE property_id = ? LIMIT 1", [property_id])
    mortgage_rows = rows_to_dicts(conn)
    return (True, bool(mortgage_rows))


def _is_conflicting_expense(name: str, notes: str | None, has_primary: bool, has_mortgage: bool) -> bool:
    if not has_primary:
        return False

    text = f"{name} {notes or ''}".lower()
    is_property_cost = any(keyword in text for keyword in PROPERTY_COST_KEYWORDS)
    is_mortgage_cost = any(keyword in text for keyword in MORTGAGE_KEYWORDS)

    if is_property_cost:
        return True
    if has_mortgage and is_mortgage_cost:
        return True
    return False


def _validate_expense_ownership(body: ExpenseCreate | ExpenseUpdate, conn: duckdb.DuckDBPyConnection) -> None:
    has_primary, has_mortgage = _primary_housing_context(conn)
    if not _is_conflicting_expense(body.name, body.notes, has_primary, has_mortgage):
        return

    raise HTTPException(
        status_code=422,
        detail=(
            "This expense looks like a primary-home mortgage or property carrying cost. "
            "Manage mortgage in Property > Mortgage and property tax/insurance/HOA/maintenance "
            "in Property > Expenses to avoid double counting."
        ),
    )


@router.get("", response_model=list[ExpenseOut])
def list_expenses(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    # Return only persisted living expenses. Housing debt/carrying costs live under Property/Loan.
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
    _validate_expense_ownership(body, conn)
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO expenses
           (id, name, category, annual_amount, start_age, end_age,
            inflation_adjusted, notes, periods_json)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            new_id, body.name, body.category, body.annual_amount,
            body.start_age, body.end_age, body.inflation_adjusted, body.notes,
            json.dumps([p.model_dump() for p in body.periods]) if body.periods else None,
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
    _validate_expense_ownership(body, conn)
    conn.execute(
        """UPDATE expenses SET
           name=?, category=?, annual_amount=?, start_age=?, end_age=?,
           inflation_adjusted=?, notes=?, periods_json=?
           WHERE id=?""",
        [
            body.name, body.category, body.annual_amount, body.start_age,
            body.end_age, body.inflation_adjusted, body.notes,
            json.dumps([p.model_dump() for p in body.periods]) if body.periods else None,
            expense_id,
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
