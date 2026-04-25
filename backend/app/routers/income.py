from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.income import IncomeSourceCreate, IncomeSourceUpdate, IncomeSourceOut

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


@router.get("", response_model=list[IncomeSourceOut])
def list_income_sources(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM income_sources ORDER BY created_at")
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.get("/{source_id}", response_model=IncomeSourceOut)
def get_income_source(source_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM income_sources WHERE id = ?", [source_id])
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="Income source not found")
    return _fmt(rows[0])


@router.post("", response_model=IncomeSourceOut, status_code=201)
def create_income_source(
    body: IncomeSourceCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO income_sources
           (id, name, income_type, annual_amount, start_age, end_age,
            inflation_adjusted, tax_treatment, notes)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            new_id, body.name, body.income_type, body.annual_amount,
            body.start_age, body.end_age, body.inflation_adjusted,
            body.tax_treatment, body.notes,
        ],
    )
    conn.execute("SELECT * FROM income_sources WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{source_id}", response_model=IncomeSourceOut)
def update_income_source(
    source_id: str,
    body: IncomeSourceUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM income_sources WHERE id = ?", [source_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Income source not found")
    conn.execute(
        """UPDATE income_sources SET
           name=?, income_type=?, annual_amount=?, start_age=?, end_age=?,
           inflation_adjusted=?, tax_treatment=?, notes=?
           WHERE id=?""",
        [
            body.name, body.income_type, body.annual_amount, body.start_age,
            body.end_age, body.inflation_adjusted, body.tax_treatment,
            body.notes, source_id,
        ],
    )
    conn.execute("SELECT * FROM income_sources WHERE id = ?", [source_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{source_id}", status_code=204)
def delete_income_source(source_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT id FROM income_sources WHERE id = ?", [source_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Income source not found")
    conn.execute("DELETE FROM income_sources WHERE id = ?", [source_id])
