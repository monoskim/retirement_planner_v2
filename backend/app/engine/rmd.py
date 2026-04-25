"""
Required Minimum Distribution (RMD) calculator.
Implements SECURE 2.0 rules: RMDs start at age 73.
Uses IRS Uniform Lifetime Table (2022 regulations).
"""
from __future__ import annotations

import json
from pathlib import Path

_DATA = json.loads((Path(__file__).parent.parent / "data" / "rmd_tables.json").read_text())

# The table maps string keys; convert to int keys for efficient lookup
_ULT: dict[int, float] = {int(k): v for k, v in _DATA["uniform_lifetime_table"].items()}

RMD_START_AGE: int = _DATA["rmd_start_age"]
RMD_SUBJECT_TYPES: set[str] = set(_DATA["rmd_subject_account_types"])
RMD_EXEMPT_TYPES: set[str] = set(_DATA["rmd_exempt_account_types"])


def distribution_period(age: int) -> float | None:
    """
    Return the IRS Uniform Lifetime Table distribution period for the given age.
    Returns None if the account is not subject to RMDs at this age.
    """
    if age < RMD_START_AGE:
        return None
    # Use age 115 period for any age above 115
    key = min(age, 115)
    return _ULT.get(key)


def calculate_rmd(account_balance: float, age: int) -> float:
    """
    Calculate the annual RMD for a single account.
    Uses the prior year-end balance (passed in as account_balance).
    Returns 0.0 if age < RMD_START_AGE or balance is zero/negative.
    """
    if account_balance <= 0 or age < RMD_START_AGE:
        return 0.0
    period = distribution_period(age)
    if period is None or period <= 0:
        return 0.0
    return account_balance / period


def calculate_all_rmds(
    accounts: list[dict],
    balances: dict[str, float],
    age: int,
) -> dict[str, float]:
    """
    Calculate RMDs for all eligible accounts.

    accounts  — list of account dicts (must have 'id' and 'account_type')
    balances  — {account_id: current_balance}
    age       — owner's current age

    Returns {account_id: rmd_amount} for accounts that have an RMD due.
    """
    if age < RMD_START_AGE:
        return {}

    result: dict[str, float] = {}
    for acc in accounts:
        if acc["account_type"] not in RMD_SUBJECT_TYPES:
            continue
        bal = balances.get(acc["id"], 0.0)
        rmd = calculate_rmd(bal, age)
        if rmd > 0:
            result[acc["id"]] = rmd

    return result


def total_rmd(accounts: list[dict], balances: dict[str, float], age: int) -> float:
    """Convenience: sum of all RMDs for the year."""
    return sum(calculate_all_rmds(accounts, balances, age).values())
