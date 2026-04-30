from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.rental_property import (
    RentalPropertyCreate, RentalPropertyUpdate, RentalPropertyOut,
    MortgageCreate, MortgageUpdate, MortgageOut,
    RentalIncomeCreate, RentalIncomeUpdate, RentalIncomeOut,
    RentalExpenseCreate, RentalExpenseUpdate, RentalExpenseOut,
)

router = APIRouter()


def _fmt(row: dict) -> dict:
    for field in ("purchase_date", "start_date", "current_balance_date", "created_at"):
        if row.get(field):
            row[field] = str(row[field])
    return row


# ---- Properties ----

@router.get("", response_model=list[RentalPropertyOut])
def list_properties(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM rental_properties ORDER BY created_at")
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.get("/{property_id}", response_model=RentalPropertyOut)
def get_property(property_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM rental_properties WHERE id = ?", [property_id])
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    return _fmt(rows[0])


@router.post("", response_model=RentalPropertyOut, status_code=201)
def create_property(body: RentalPropertyCreate, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO rental_properties
           (id, name, purchase_date, purchase_price, land_value, building_value,
            current_market_value, appreciation_rate_pct, property_type, status,
            planned_sale_year, expected_sale_price, closing_cost_pct,
            active_participation, is_primary_residence, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            new_id, body.name, str(body.purchase_date), body.purchase_price,
            body.land_value, body.building_value, body.current_market_value,
            body.appreciation_rate_pct, body.property_type, body.status,
            body.planned_sale_year, body.expected_sale_price, body.closing_cost_pct,
            body.active_participation, body.is_primary_residence, body.notes,
        ],
    )
    conn.execute("SELECT * FROM rental_properties WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{property_id}", response_model=RentalPropertyOut)
def update_property(
    property_id: str,
    body: RentalPropertyUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM rental_properties WHERE id = ?", [property_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Property not found")
    conn.execute(
        """UPDATE rental_properties SET
           name=?, purchase_date=?, purchase_price=?, land_value=?,
           building_value=?, current_market_value=?, appreciation_rate_pct=?,
           property_type=?, status=?, planned_sale_year=?, expected_sale_price=?,
           closing_cost_pct=?, active_participation=?, is_primary_residence=?, notes=?
           WHERE id=?""",
        [
            body.name, str(body.purchase_date), body.purchase_price, body.land_value,
            body.building_value, body.current_market_value, body.appreciation_rate_pct,
            body.property_type, body.status, body.planned_sale_year, body.expected_sale_price,
            body.closing_cost_pct, body.active_participation, body.is_primary_residence,
            body.notes, property_id,
        ],
    )
    conn.execute("SELECT * FROM rental_properties WHERE id = ?", [property_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{property_id}", status_code=204)
def delete_property(property_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT id FROM rental_properties WHERE id = ?", [property_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Property not found")
    conn.execute("DELETE FROM rental_properties WHERE id = ?", [property_id])


# ---- Mortgages ----

@router.get("/{property_id}/mortgages", response_model=list[MortgageOut])
def list_mortgages(property_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute(
        "SELECT * FROM mortgages WHERE property_id = ? ORDER BY created_at",
        [property_id],
    )
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.post("/{property_id}/mortgages", response_model=MortgageOut, status_code=201)
def create_mortgage(
    property_id: str,
    body: MortgageCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM rental_properties WHERE id = ?", [property_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Property not found")
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO mortgages
           (id, property_id, lender, original_amount, interest_rate, term_years,
            start_date, current_balance, current_balance_date, extra_monthly_payment, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        [
            new_id, property_id, body.lender, body.original_amount, body.interest_rate,
            body.term_years, str(body.start_date), body.current_balance,
            str(body.current_balance_date) if body.current_balance_date else None,
            body.extra_monthly_payment, body.notes,
        ],
    )
    conn.execute("SELECT * FROM mortgages WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{property_id}/mortgages/{mortgage_id}", response_model=MortgageOut)
def update_mortgage(
    property_id: str,
    mortgage_id: str,
    body: MortgageUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute(
        "SELECT id FROM mortgages WHERE id = ? AND property_id = ?",
        [mortgage_id, property_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Mortgage not found")
    conn.execute(
        """UPDATE mortgages SET
           lender=?, original_amount=?, interest_rate=?, term_years=?,
           start_date=?, current_balance=?, current_balance_date=?,
           extra_monthly_payment=?, notes=?
           WHERE id=?""",
        [
            body.lender, body.original_amount, body.interest_rate, body.term_years,
            str(body.start_date), body.current_balance,
            str(body.current_balance_date) if body.current_balance_date else None,
            body.extra_monthly_payment, body.notes, mortgage_id,
        ],
    )
    conn.execute("SELECT * FROM mortgages WHERE id = ?", [mortgage_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{property_id}/mortgages/{mortgage_id}", status_code=204)
def delete_mortgage(
    property_id: str, mortgage_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    conn.execute(
        "SELECT id FROM mortgages WHERE id = ? AND property_id = ?", [mortgage_id, property_id]
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Mortgage not found")
    conn.execute("DELETE FROM mortgages WHERE id = ?", [mortgage_id])


# ---- Rental Income ----

@router.get("/{property_id}/income", response_model=list[RentalIncomeOut])
def list_rental_income(property_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute(
        "SELECT * FROM rental_income WHERE property_id = ? ORDER BY created_at",
        [property_id],
    )
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.post("/{property_id}/income", response_model=RentalIncomeOut, status_code=201)
def create_rental_income(
    property_id: str,
    body: RentalIncomeCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM rental_properties WHERE id = ?", [property_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Property not found")
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO rental_income
           (id, property_id, monthly_rent, vacancy_rate_pct, annual_rent_increase_pct,
            start_date, notes)
           VALUES (?,?,?,?,?,?,?)""",
        [
            new_id, property_id, body.monthly_rent, body.vacancy_rate_pct,
            body.annual_rent_increase_pct,
            str(body.start_date) if body.start_date else None,
            body.notes,
        ],
    )
    conn.execute("SELECT * FROM rental_income WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{property_id}/income/{income_id}", response_model=RentalIncomeOut)
def update_rental_income(
    property_id: str,
    income_id: str,
    body: RentalIncomeUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute(
        "SELECT id FROM rental_income WHERE id = ? AND property_id = ?",
        [income_id, property_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Rental income record not found")
    conn.execute(
        """UPDATE rental_income SET
           monthly_rent=?, vacancy_rate_pct=?, annual_rent_increase_pct=?,
           start_date=?, notes=?
           WHERE id=?""",
        [
            body.monthly_rent, body.vacancy_rate_pct, body.annual_rent_increase_pct,
            str(body.start_date) if body.start_date else None,
            body.notes, income_id,
        ],
    )
    conn.execute("SELECT * FROM rental_income WHERE id = ?", [income_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{property_id}/income/{income_id}", status_code=204)
def delete_rental_income(
    property_id: str, income_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    conn.execute(
        "SELECT id FROM rental_income WHERE id = ? AND property_id = ?",
        [income_id, property_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Rental income record not found")
    conn.execute("DELETE FROM rental_income WHERE id = ?", [income_id])


# ---- Rental Expenses ----

@router.get("/{property_id}/expenses", response_model=list[RentalExpenseOut])
def list_rental_expenses(property_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute(
        "SELECT * FROM rental_expenses WHERE property_id = ? ORDER BY created_at",
        [property_id],
    )
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.post("/{property_id}/expenses", response_model=RentalExpenseOut, status_code=201)
def create_rental_expense(
    property_id: str,
    body: RentalExpenseCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM rental_properties WHERE id = ?", [property_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Property not found")
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO rental_expenses
           (id, property_id, name, category, annual_amount, inflation_adjusted, notes)
           VALUES (?,?,?,?,?,?,?)""",
        [new_id, property_id, body.name, body.category, body.annual_amount,
         body.inflation_adjusted, body.notes],
    )
    conn.execute("SELECT * FROM rental_expenses WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{property_id}/expenses/{expense_id}", response_model=RentalExpenseOut)
def update_rental_expense(
    property_id: str,
    expense_id: str,
    body: RentalExpenseUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute(
        "SELECT id FROM rental_expenses WHERE id = ? AND property_id = ?",
        [expense_id, property_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Rental expense not found")
    conn.execute(
        """UPDATE rental_expenses SET
           name=?, category=?, annual_amount=?, inflation_adjusted=?, notes=?
           WHERE id=?""",
        [body.name, body.category, body.annual_amount, body.inflation_adjusted,
         body.notes, expense_id],
    )
    conn.execute("SELECT * FROM rental_expenses WHERE id = ?", [expense_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{property_id}/expenses/{expense_id}", status_code=204)
def delete_rental_expense(
    property_id: str, expense_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    conn.execute(
        "SELECT id FROM rental_expenses WHERE id = ? AND property_id = ?",
        [expense_id, property_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Rental expense not found")
    conn.execute("DELETE FROM rental_expenses WHERE id = ?", [expense_id])
