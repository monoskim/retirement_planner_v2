from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import duckdb

from ..database import get_db
from ..engine.roth_optimizer import analyze_roth_conversion
from ..engine.social_security import compare_all_claiming_ages, break_even_age
from ..engine.projection import _load_profile, _load_accounts, _load_income_sources, _load_ss

router = APIRouter()


@router.post("/roth-conversion/{scenario_id}")
def optimize_roth_conversion(
    scenario_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Analyze Roth conversion opportunities during gap years."""
    sid = None if scenario_id == "base" else scenario_id

    profile = _load_profile(conn)
    accounts = _load_accounts(conn)
    income_sources = _load_income_sources(conn)
    ss = _load_ss(conn)

    if not profile:
        raise HTTPException(status_code=400, detail="No profile found.")

    if sid:
        from ..database import rows_to_dicts
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
            "expenses": [],
            "ss": copy.deepcopy(ss),
            "rental_data": [],
        }
        _apply_overrides(data, overrides)
        profile = data["profile"]
        accounts = data["accounts"]
        income_sources = data["income_sources"]

    return analyze_roth_conversion(
        profile=profile,
        accounts=accounts,
        income_sources=income_sources,
        ss=ss,
    )


@router.post("/social-security/{scenario_id}")
def optimize_social_security(
    scenario_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
):
    """Compare Social Security claiming ages from 62 to 70."""
    ss = _load_ss(conn)
    if not ss:
        raise HTTPException(status_code=400, detail="No Social Security data found.")

    fra_benefit = ss.get("fra_monthly_benefit", 0.0)
    fra_age = ss.get("fra_age", 67)

    if fra_benefit <= 0:
        raise HTTPException(
            status_code=400,
            detail="FRA monthly benefit not set. Please enter your estimated Social Security benefit.",
        )

    analyses = compare_all_claiming_ages(fra_benefit, fra_age)

    breakeven_62_70 = break_even_age(fra_benefit, fra_age, 62, 70)
    breakeven_62_67 = break_even_age(fra_benefit, fra_age, 62, fra_age)
    breakeven_67_70 = break_even_age(fra_benefit, fra_age, fra_age, 70)

    return {
        "fra_monthly_benefit": fra_benefit,
        "fra_age": fra_age,
        "claiming_ages": [
            {
                "claiming_age": a.claiming_age,
                "monthly_benefit": round(a.monthly_benefit, 2),
                "annual_benefit": round(a.annual_benefit, 2),
                "reduction_pct": round(a.reduction_pct, 2),
                "cumulative_at_80": round(a.cumulative_at_80, 2),
                "cumulative_at_85": round(a.cumulative_at_85, 2),
                "cumulative_at_90": round(a.cumulative_at_90, 2),
                "cumulative_at_95": round(a.cumulative_at_95, 2),
            }
            for a in analyses
        ],
        "break_even_ages": {
            "age_62_vs_70": round(breakeven_62_70, 1) if breakeven_62_70 else None,
            f"age_62_vs_{fra_age}": round(breakeven_62_67, 1) if breakeven_62_67 else None,
            f"age_{fra_age}_vs_70": round(breakeven_67_70, 1) if breakeven_67_70 else None,
        },
    }
