"""
Year-by-year retirement projection engine.
Loads data from the database, applies scenario overrides, and simulates
each year from current age to life expectancy.
"""
from __future__ import annotations

import copy
import json
from datetime import date, datetime
from dataclasses import asdict

import duckdb

from .tax import calculate_total_tax, TaxResult
from .rmd import calculate_all_rmds, RMD_SUBJECT_TYPES
from .social_security import monthly_benefit_at_age
from .rental_property import calculate_rental_year, RentalPropertyYearResult
from .withdrawal import make_withdrawals, WithdrawalResult
from ..database import rows_to_dicts


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def _load_profile(conn: duckdb.DuckDBPyConnection) -> dict | None:
    conn.execute("SELECT * FROM profiles WHERE id = 1")
    rows = rows_to_dicts(conn)
    return rows[0] if rows else None


def _load_accounts(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    conn.execute("SELECT * FROM accounts ORDER BY created_at")
    return rows_to_dicts(conn)


def _load_income_sources(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    conn.execute("SELECT * FROM income_sources ORDER BY created_at")
    return rows_to_dicts(conn)


def _load_expenses(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    conn.execute("SELECT * FROM expenses ORDER BY created_at")
    return rows_to_dicts(conn)


def _load_ss(conn: duckdb.DuckDBPyConnection) -> dict | None:
    conn.execute("SELECT * FROM social_security WHERE id = 1")
    rows = rows_to_dicts(conn)
    return rows[0] if rows else None


def _load_rental_data(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    """
    Load rental properties with their mortgages, income, and expense rows.
    Returns a list of composite dicts.
    """
    conn.execute("SELECT * FROM rental_properties WHERE status != 'sold' ORDER BY created_at")
    properties = rows_to_dicts(conn)

    result = []
    for prop in properties:
        pid = prop["id"]

        conn.execute("SELECT * FROM mortgages WHERE property_id = ? ORDER BY created_at LIMIT 1", [pid])
        mortgages = rows_to_dicts(conn)

        conn.execute("SELECT * FROM rental_income WHERE property_id = ? ORDER BY created_at LIMIT 1", [pid])
        income_rows = rows_to_dicts(conn)

        conn.execute("SELECT * FROM rental_expenses WHERE property_id = ? ORDER BY created_at", [pid])
        expense_rows = rows_to_dicts(conn)

        result.append({
            "property": prop,
            "mortgage": mortgages[0] if mortgages else None,
            "income": income_rows[0] if income_rows else None,
            "expenses": expense_rows,
        })
    return result


def _load_scenario_overrides(conn: duckdb.DuckDBPyConnection, scenario_id: str) -> list[dict]:
    conn.execute(
        "SELECT * FROM scenario_overrides WHERE scenario_id = ?",
        [scenario_id],
    )
    return rows_to_dicts(conn)


# ---------------------------------------------------------------------------
# Scenario override application
# ---------------------------------------------------------------------------

def _apply_overrides(data: dict, overrides: list[dict]) -> None:
    """
    Apply scenario overrides in-place to the loaded data dict.
    data keys: profile, accounts, income_sources, expenses, ss, rental_data
    """
    for ov in overrides:
        try:
            value = json.loads(ov["override_value"])
        except (json.JSONDecodeError, KeyError):
            value = ov.get("override_value")

        etype = ov["entity_type"]
        eid = ov["entity_id"]
        field = ov["field_name"]

        if etype == "profile" and data.get("profile"):
            data["profile"][field] = value
        elif etype == "social_security" and data.get("ss"):
            data["ss"][field] = value
        elif etype == "account":
            for acc in data.get("accounts", []):
                if acc["id"] == eid:
                    acc[field] = value
        elif etype == "income":
            for src in data.get("income_sources", []):
                if src["id"] == eid:
                    src[field] = value
        elif etype == "expense":
            for exp in data.get("expenses", []):
                if exp["id"] == eid:
                    exp[field] = value
        elif etype == "rental_property":
            for rd in data.get("rental_data", []):
                if rd["property"]["id"] == eid:
                    rd["property"][field] = value


# ---------------------------------------------------------------------------
# Main projection function
# ---------------------------------------------------------------------------

def run_projection(
    conn: duckdb.DuckDBPyConnection,
    scenario_id: str | None = None,
    return_rate_override: float | None = None,  # optional flat override for all accounts
) -> list[dict]:
    """
    Run the year-by-year projection.
    Returns a list of yearly snapshot dicts, one per year from current_age to life_expectancy.
    """
    # --- Load base data ---
    data = {
        "profile": _load_profile(conn),
        "accounts": _load_accounts(conn),
        "income_sources": _load_income_sources(conn),
        "expenses": _load_expenses(conn),
        "ss": _load_ss(conn),
        "rental_data": _load_rental_data(conn),
    }

    if data["profile"] is None:
        raise ValueError("No profile found. Please set up your profile first.")

    # --- Apply scenario overrides ---
    if scenario_id:
        overrides = _load_scenario_overrides(conn, scenario_id)
        _apply_overrides(data, overrides)

    # Deep copy data so we can mutate it during simulation
    data = copy.deepcopy(data)

    profile = data["profile"]
    accounts = data["accounts"]
    income_sources = data["income_sources"]
    expenses = data["expenses"]
    ss = data["ss"]
    rental_data = data["rental_data"]

    # --- Setup ---
    birth_date = profile["birth_date"]
    if isinstance(birth_date, str):
        birth_date = date.fromisoformat(birth_date)

    current_year = datetime.now().year
    current_age = current_year - birth_date.year
    end_age = profile.get("life_expectancy", 95)
    retirement_age = profile.get("retirement_age", 65)
    filing_status = profile.get("filing_status", "single")
    inflation_rate = profile.get("inflation_rate", 3.0) / 100.0

    # Account balances tracked as mutable state
    balances: dict[str, float] = {acc["id"]: acc.get("balance", 0.0) for acc in accounts}

    # Track accumulated depreciation per property
    prop_depr: dict[str, float] = {}

    results: list[dict] = []

    for age in range(current_age, end_age + 1):
        year = current_year + (age - current_age)
        years_elapsed = age - current_age
        is_working = age < retirement_age

        # ---- 1. CONTRIBUTIONS (pre-retirement) ----
        if is_working:
            for acc in accounts:
                atype = acc["account_type"]
                if atype in ("401k", "403b", "roth_401k", "trad_ira", "roth_ira", "hsa", "cash"):
                    contrib = acc.get("annual_contribution", 0.0)
                    match_pct = acc.get("employer_match_pct", 0.0) / 100.0
                    match_limit = acc.get("employer_match_limit_pct", 0.0) / 100.0
                    # Employer match up to the salary % limit
                    # Simplified: match = match_pct * min(contrib, salary * match_limit)
                    # Since we don't track salary separately here, use contrib as proxy
                    match_base = contrib * match_limit if match_limit > 0 else contrib
                    match = match_base * match_pct
                    balances[acc["id"]] = balances.get(acc["id"], 0.0) + contrib + match

        # ---- 2. INVESTMENT RETURNS ----
        for acc in accounts:
            ret = (return_rate_override if return_rate_override is not None
                   else acc.get("expected_return_pct", 7.0)) / 100.0
            balances[acc["id"]] = balances.get(acc["id"], 0.0) * (1.0 + ret)

        # ---- 3. INCOME SOURCES ----
        income_breakdown: dict[str, float] = {}
        for src in income_sources:
            start = src.get("start_age") or 0
            end = src.get("end_age") or 999
            if start <= age <= end:
                amount = src.get("annual_amount", 0.0)
                if src.get("inflation_adjusted", False):
                    amount *= (1 + inflation_rate) ** years_elapsed
                income_breakdown[src["name"]] = amount

        # ---- 4. SOCIAL SECURITY ----
        ss_income = 0.0
        ss_annual = 0.0
        if ss and age >= ss.get("claiming_age", 999):
            fra_benefit = ss.get("fra_monthly_benefit", 0.0)
            fra_age = ss.get("fra_age", 67)
            claiming_age = ss.get("claiming_age", 67)
            monthly = monthly_benefit_at_age(fra_benefit, fra_age, claiming_age)
            ss_annual = monthly * 12
            ss_income = ss_annual
            income_breakdown["Social Security"] = ss_annual

        # ---- 5. RENTAL PROPERTIES ----
        rental_results: dict[str, dict] = {}
        total_rental_taxable = 0.0

        # First pass: estimate AGI for PAL rule (pre-rental)
        pre_rental_income = sum(income_breakdown.values())
        agi_estimate = pre_rental_income

        for rd in rental_data:
            prop = rd["property"]
            pid = prop["id"]
            purchase_date = prop.get("purchase_date")
            if isinstance(purchase_date, str):
                purchase_date = date.fromisoformat(purchase_date)
            years_owned = year - purchase_date.year if purchase_date else 0

            # Check if property should be sold this year
            planned_sale_year = prop.get("planned_sale_year")
            if planned_sale_year and year >= planned_sale_year:
                continue  # skip; sale handled separately

            result = calculate_rental_year(
                property_data=prop,
                mortgage_data=rd.get("mortgage"),
                income_data=rd.get("income"),
                expense_rows=rd.get("expenses", []),
                calendar_year=year,
                years_owned=years_owned,
                inflation_rate=inflation_rate,
                agi_estimate=agi_estimate,
            )
            depr_so_far = prop_depr.get(pid, 0.0) + result.depreciation
            prop_depr[pid] = depr_so_far

            rental_results[pid] = {
                "property_name": result.property_name,
                "gross_rent": result.gross_rent,
                "net_rent": result.net_rent,
                "mortgage_interest": result.mortgage_interest,
                "depreciation": result.depreciation,
                "total_deductible_expenses": result.total_deductible_expenses,
                "net_income_before_pal": result.net_income_before_pal,
                "net_taxable_income": result.net_taxable_income,
                "mortgage_balance": result.mortgage_balance,
                "market_value": result.market_value,
                "equity": result.equity,
                "accumulated_depreciation": depr_so_far,
                "cash_flow": result.cash_flow,
            }
            total_rental_taxable += result.net_taxable_income

        # ---- 6. EXPENSES ----
        expense_breakdown: dict[str, float] = {}
        for exp in expenses:
            start = exp.get("start_age") or 0
            end_a = exp.get("end_age") or 999
            if start <= age <= end_a:
                amount = exp.get("annual_amount", 0.0)
                if exp.get("inflation_adjusted", True):
                    amount *= (1 + inflation_rate) ** years_elapsed
                cat = exp.get("name", exp.get("category", "other"))
                expense_breakdown[cat] = expense_breakdown.get(cat, 0.0) + amount

        total_expenses = sum(expense_breakdown.values())

        # ---- 7. RMDs ----
        rmd_map = calculate_all_rmds(accounts, balances, age)
        total_rmd = sum(rmd_map.values())
        for acc_id, rmd_amt in rmd_map.items():
            balances[acc_id] = max(0.0, balances.get(acc_id, 0.0) - rmd_amt)

        # ---- 8. TAX CALCULATION (2-pass) ----
        # Pass 1: estimate tax without withdrawal income
        total_non_withdrawal_income = sum(income_breakdown.values()) + total_rental_taxable
        # RMDs are withdrawals from tax-deferred → count as ordinary income
        ordinary_income_p1 = total_non_withdrawal_income + total_rmd

        tax_p1 = calculate_total_tax(
            ordinary_income=ordinary_income_p1,
            long_term_gains=0.0,
            ss_benefits=ss_annual,
            filing_status=filing_status,
            year=year,
            age=age,
        )

        # Determine shortfall
        cash_available = total_non_withdrawal_income + total_rmd
        cash_needed_p1 = total_expenses + tax_p1.total_tax
        shortfall_p1 = max(0.0, cash_needed_p1 - cash_available)

        # Pass 2: make withdrawals, recalculate tax
        withdrawal_result = WithdrawalResult()
        if shortfall_p1 > 0:
            withdrawal_result = make_withdrawals(
                accounts=accounts,
                balances=balances,
                net_amount_needed=shortfall_p1,
                age=float(age),
                marginal_tax_rate=tax_p1.marginal_rate,
            )

        # Additional ordinary income from tax-deferred withdrawals
        additional_ordinary = withdrawal_result.tax_deferred_withdrawn

        tax_final = calculate_total_tax(
            ordinary_income=ordinary_income_p1 + additional_ordinary,
            long_term_gains=0.0,
            ss_benefits=ss_annual,
            filing_status=filing_status,
            year=year,
            age=age,
        )

        # ---- 9. NET WORTH SNAPSHOT ----
        liquid_portfolio = sum(balances.values())
        real_estate_equity = sum(r["equity"] for r in rental_results.values())
        total_net_worth = liquid_portfolio + real_estate_equity

        total_income = sum(income_breakdown.values()) + total_rental_taxable + total_rmd
        cash_surplus_deficit = total_income + withdrawal_result.total_withdrawn - total_expenses - tax_final.total_tax

        snapshot = {
            "year": year,
            "age": age,
            "total_net_worth": round(total_net_worth, 2),
            "liquid_portfolio": round(liquid_portfolio, 2),
            "real_estate_equity": round(real_estate_equity, 2),
            "accounts": {
                acc["id"]: {
                    "name": acc["name"],
                    "type": acc["account_type"],
                    "balance": round(balances.get(acc["id"], 0.0), 2),
                }
                for acc in accounts
            },
            "income": {
                **{k: round(v, 2) for k, v in income_breakdown.items()},
                "rmd_withdrawals": round(total_rmd, 2),
                "total": round(sum(income_breakdown.values()) + total_rmd + total_rental_taxable, 2),
            },
            "rental_income_taxable": round(total_rental_taxable, 2),
            "expenses": {
                **{k: round(v, 2) for k, v in expense_breakdown.items()},
                "total": round(total_expenses, 2),
            },
            "taxes": {
                "federal_income_tax": round(tax_final.federal_income_tax, 2),
                "capital_gains_tax": round(tax_final.capital_gains_tax, 2),
                "niit": round(tax_final.niit, 2),
                "total": round(tax_final.total_tax, 2),
                "effective_rate": round(tax_final.effective_rate * 100, 2),
                "marginal_rate": round(tax_final.marginal_rate * 100, 2),
            },
            "withdrawals": {
                "taxable": round(withdrawal_result.taxable_withdrawn, 2),
                "tax_deferred": round(withdrawal_result.tax_deferred_withdrawn, 2),
                "roth": round(withdrawal_result.roth_withdrawn, 2),
                "penalty": round(withdrawal_result.penalty_paid, 2),
                "total": round(withdrawal_result.total_withdrawn, 2),
            },
            "rental_properties": {
                pid: {k: round(v, 2) if isinstance(v, float) else v
                      for k, v in r.items()}
                for pid, r in rental_results.items()
            },
            "cash_surplus_deficit": round(cash_surplus_deficit, 2),
            "is_solvent": total_net_worth > 0,
            "is_working": is_working,
        }
        results.append(snapshot)

        # Stop early if portfolio is completely depleted
        if liquid_portfolio <= 0 and not is_working and real_estate_equity <= 0:
            # Fill remaining years with zero
            for future_age in range(age + 1, end_age + 1):
                results.append({
                    **snapshot,
                    "year": current_year + (future_age - current_age),
                    "age": future_age,
                    "total_net_worth": 0.0,
                    "liquid_portfolio": 0.0,
                    "is_solvent": False,
                })
            break

    return results
