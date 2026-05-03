from __future__ import annotations

import json
import uuid
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import duckdb

from ..database import get_db, rows_to_dicts
from ..engine.projection import run_projection
from ..engine.monte_carlo import run_monte_carlo

router = APIRouter()


class MonteCarloParams(BaseModel):
    n_simulations: int = 3000
    return_mean_override: float | None = None
    return_stddev_override: float | None = None
    inflation_mean: float = 3.0
    inflation_stddev: float = 1.5


class CompareRequest(BaseModel):
    scenario_ids: list[str]


@router.post("/compare")
def compare_scenarios(
    body: CompareRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Run deterministic projection for multiple scenarios and return side-by-side results."""
    comparison = {}
    for sid in body.scenario_ids:
        actual_sid = None if sid == "base" else sid
        try:
            results = run_projection(conn, scenario_id=actual_sid)
            comparison[sid] = results
        except ValueError as exc:
            comparison[sid] = {"error": str(exc)}
    return {"scenarios": comparison}


def _load_base_data(conn):
    from ..engine.projection import (
        _load_profile, _load_accounts, _load_income_sources,
        _load_expenses, _load_ss, _load_rental_data,
    )
    return (
        _load_profile(conn),
        _load_accounts(conn),
        _load_income_sources(conn),
        _load_expenses(conn),
        _load_ss(conn),
        _load_rental_data(conn),
    )


@router.post("/{scenario_id}")
def run_simulation(
    scenario_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Run a deterministic projection for a scenario. Use 'base' as scenario_id for no overrides."""
    sid = None if scenario_id == "base" else scenario_id
    if sid:
        conn.execute("SELECT id FROM scenarios WHERE id = ?", [sid])
        if not conn.fetchone():
            raise HTTPException(status_code=404, detail="Scenario not found")

    try:
        results = run_projection(conn, scenario_id=sid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Cache results
    result_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO simulation_results (id, scenario_id, run_type, results_json)
           VALUES (?,?,?,?)""",
        [result_id, scenario_id, "deterministic", json.dumps(results)],
    )

    return {"simulation_id": result_id, "scenario_id": scenario_id, "results": results}


@router.post("/{scenario_id}/monte-carlo")
def run_monte_carlo_sim(
    scenario_id: str,
    params: MonteCarloParams = MonteCarloParams(),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Run Monte Carlo simulation for a scenario."""
    sid = None if scenario_id == "base" else scenario_id

    profile, accounts, income_sources, expenses, ss, rental_data = _load_base_data(conn)
    if not profile:
        raise HTTPException(status_code=400, detail="No profile found. Please set up your profile first.")

    # Apply scenario overrides to a copy of the data
    if sid:
        conn.execute("SELECT id FROM scenarios WHERE id = ?", [sid])
        if not conn.fetchone():
            raise HTTPException(status_code=404, detail="Scenario not found")
        conn.execute(
            "SELECT * FROM scenario_overrides WHERE scenario_id = ?", [sid]
        )
        overrides = rows_to_dicts(conn)
        from ..engine.projection import _apply_overrides
        import copy
        data = {
            "profile": copy.deepcopy(profile),
            "accounts": copy.deepcopy(accounts),
            "income_sources": copy.deepcopy(income_sources),
            "expenses": copy.deepcopy(expenses),
            "ss": copy.deepcopy(ss),
            "rental_data": copy.deepcopy(rental_data),
        }
        _apply_overrides(data, overrides)
        profile, accounts, income_sources, expenses, ss, rental_data = (
            data["profile"], data["accounts"], data["income_sources"],
            data["expenses"], data["ss"], data["rental_data"],
        )

    mc_result = run_monte_carlo(
        profile=profile,
        accounts=accounts,
        income_sources=income_sources,
        expenses=expenses,
        ss=ss,
        rental_data=rental_data,
        n_simulations=params.n_simulations,
        return_mean_override=params.return_mean_override,
        return_stddev_override=params.return_stddev_override,
        inflation_mean=params.inflation_mean,
        inflation_stddev=params.inflation_stddev,
    )

    result_dict = {
        "n_simulations": mc_result.n_simulations,
        "success_rate": mc_result.success_rate,
        "median_terminal_wealth": mc_result.median_terminal_wealth,
        "percentile_10": mc_result.percentile_10,
        "percentile_25": mc_result.percentile_25,
        "percentile_75": mc_result.percentile_75,
        "percentile_90": mc_result.percentile_90,
        "worst_case": mc_result.worst_case,
        "best_case": mc_result.best_case,
        "years": mc_result.years,
        "ages": mc_result.ages,
        "median_by_year": mc_result.median_by_year,
        "p10_by_year": mc_result.p10_by_year,
        "p25_by_year": mc_result.p25_by_year,
        "p75_by_year": mc_result.p75_by_year,
        "p90_by_year": mc_result.p90_by_year,
        "terminal_values": mc_result.terminal_values[:500],  # cap for response size
    }

    # Cache
    result_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO simulation_results (id, scenario_id, run_type, results_json, params_json) VALUES (?,?,?,?,?)",
        [result_id, scenario_id, "monte_carlo", json.dumps(result_dict), json.dumps(params.model_dump())],
    )

    return {"simulation_id": result_id, "scenario_id": scenario_id, **result_dict}


@router.get("/{scenario_id}/results")
def get_cached_results(
    scenario_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Retrieve the most recent cached simulation results for a scenario."""
    conn.execute(
        """SELECT * FROM simulation_results
           WHERE scenario_id = ?
           ORDER BY created_at DESC LIMIT 1""",
        [scenario_id],
    )
    rows = rows_to_dicts(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="No cached results found for this scenario")
    row = rows[0]
    return {
        "simulation_id": row["id"],
        "scenario_id": row["scenario_id"],
        "run_type": row["run_type"],
        "created_at": str(row["created_at"]),
        "results": json.loads(row["results_json"]),
    }
