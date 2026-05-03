from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db, rows_to_dicts
from ..models.scenario import (
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioOut,
    ScenarioOverrideCreate,
    ScenarioOverrideOut,
)

router = APIRouter()


def _fmt(row: dict) -> dict:
    if row.get("created_at"):
        row["created_at"] = str(row["created_at"])
    return row


def _insert_rows(conn: duckdb.DuckDBPyConnection, table: str, rows: list[dict]) -> None:
    if not rows:
        return

    columns = list(rows[0].keys())
    placeholders = ", ".join(["?"] * len(columns))
    column_sql = ", ".join(columns)
    values = [[row[column] for column in columns] for row in rows]
    conn.executemany(
        f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders})",
        values,
    )


def _update_scenario_with_fk_workaround(
    conn: duckdb.DuckDBPyConnection,
    scenario_id: str,
    body: ScenarioUpdate,
) -> None:
    conn.execute("SELECT * FROM scenario_overrides WHERE scenario_id = ? ORDER BY created_at", [scenario_id])
    overrides = rows_to_dicts(conn)

    conn.execute("SELECT * FROM simulation_results WHERE scenario_id = ? ORDER BY created_at", [scenario_id])
    simulation_results = rows_to_dicts(conn)

    conn.execute("SELECT id FROM scenarios WHERE base_scenario_id = ? ORDER BY created_at", [scenario_id])
    base_dependents = rows_to_dicts(conn)

    if overrides:
        conn.execute("DELETE FROM scenario_overrides WHERE scenario_id = ?", [scenario_id])
    if simulation_results:
        conn.execute("DELETE FROM simulation_results WHERE scenario_id = ?", [scenario_id])
    if base_dependents:
        conn.execute("UPDATE scenarios SET base_scenario_id = NULL WHERE base_scenario_id = ?", [scenario_id])

    conn.execute(
        "UPDATE scenarios SET name=?, description=?, is_base=?, base_scenario_id=? WHERE id=?",
        [body.name, body.description, body.is_base, body.base_scenario_id, scenario_id],
    )

    for dependent in base_dependents:
        conn.execute(
            "UPDATE scenarios SET base_scenario_id = ? WHERE id = ?",
            [scenario_id, dependent["id"]],
        )

    _insert_rows(conn, "scenario_overrides", overrides)
    _insert_rows(conn, "simulation_results", simulation_results)


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM scenarios ORDER BY created_at")
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT * FROM scenarios WHERE id = ?", [scenario_id])
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _fmt(rows[0])


@router.post("", response_model=ScenarioOut, status_code=201)
def create_scenario(body: ScenarioCreate, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    new_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO scenarios (id, name, description, is_base, base_scenario_id) VALUES (?,?,?,?,?)",
        [new_id, body.name, body.description, body.is_base, body.base_scenario_id],
    )
    conn.execute("SELECT * FROM scenarios WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: str,
    body: ScenarioUpdate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM scenarios WHERE id = ?", [scenario_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Scenario not found")
    try:
        conn.execute(
            "UPDATE scenarios SET name=?, description=?, is_base=?, base_scenario_id=? WHERE id=?",
            [body.name, body.description, body.is_base, body.base_scenario_id, scenario_id],
        )
    except duckdb.ConstraintException as exc:
        if "foreign key constraint" not in str(exc).lower():
            raise
        _update_scenario_with_fk_workaround(conn, scenario_id, body)

    conn.execute("SELECT * FROM scenarios WHERE id = ?", [scenario_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("SELECT id FROM scenarios WHERE id = ?", [scenario_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # First, delete any associated overrides
    conn.execute("DELETE FROM scenario_overrides WHERE scenario_id = ?", [scenario_id])
    # Then delete simulation results
    conn.execute("DELETE FROM simulation_results WHERE scenario_id = ?", [scenario_id])
    # Finally delete the scenario
    conn.execute("DELETE FROM scenarios WHERE id = ?", [scenario_id])


# ---- Overrides ----

@router.get("/{scenario_id}/overrides", response_model=list[ScenarioOverrideOut])
def list_overrides(scenario_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute(
        "SELECT * FROM scenario_overrides WHERE scenario_id = ? ORDER BY created_at",
        [scenario_id],
    )
    return [_fmt(r) for r in rows_to_dicts(conn)]


@router.post("/{scenario_id}/overrides", response_model=ScenarioOverrideOut, status_code=201)
def add_override(
    scenario_id: str,
    body: ScenarioOverrideCreate,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute("SELECT id FROM scenarios WHERE id = ?", [scenario_id])
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Scenario not found")
    new_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO scenario_overrides
           (id, scenario_id, entity_type, entity_id, field_name, override_value)
           VALUES (?,?,?,?,?,?)""",
        [new_id, scenario_id, body.entity_type, body.entity_id, body.field_name, body.override_value],
    )
    conn.execute("SELECT * FROM scenario_overrides WHERE id = ?", [new_id])
    return _fmt(rows_to_dicts(conn)[0])


@router.delete("/{scenario_id}/overrides/{override_id}", status_code=204)
def delete_override(
    scenario_id: str,
    override_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    conn.execute(
        "SELECT id FROM scenario_overrides WHERE id = ? AND scenario_id = ?",
        [override_id, scenario_id],
    )
    if not conn.fetchone():
        raise HTTPException(status_code=404, detail="Override not found")
    conn.execute("DELETE FROM scenario_overrides WHERE id = ?", [override_id])
