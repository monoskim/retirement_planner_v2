"""
Monte Carlo simulation engine.
Runs N simulations with randomized investment returns to produce
probability distributions of retirement outcomes.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date, datetime

import numpy as np

from .tax import calculate_total_tax
from .rmd import calculate_all_rmds
from .social_security import monthly_benefit_at_age
from .withdrawal import make_withdrawals


@dataclass
class MonteCarloResult:
    n_simulations: int
    success_rate: float                  # % of sims that don't deplete portfolio
    median_terminal_wealth: float
    percentile_10: float
    percentile_25: float
    percentile_75: float
    percentile_90: float
    worst_case: float
    best_case: float
    # Year-by-year median and percentile bands
    years: list[int]
    ages: list[int]
    median_by_year: list[float]
    p10_by_year: list[float]
    p25_by_year: list[float]
    p75_by_year: list[float]
    p90_by_year: list[float]
    # Detailed per-sim terminal values (for histogram)
    terminal_values: list[float]


def run_monte_carlo(
    profile: dict,
    accounts: list[dict],
    income_sources: list[dict],
    expenses: list[dict],
    ss: dict | None,
    n_simulations: int = 3000,
    return_mean_override: float | None = None,   # % (e.g. 7.0)
    return_stddev_override: float | None = None,  # % (e.g. 15.0)
    inflation_mean: float = 3.0,
    inflation_stddev: float = 1.5,
) -> MonteCarloResult:
    """
    Vectorized Monte Carlo using numpy.
    Each simulation runs independently with randomized annual returns and inflation.
    Rental properties are excluded for simplicity (included in base projection).
    """
    birth_date = profile["birth_date"]
    if isinstance(birth_date, str):
        birth_date = date.fromisoformat(birth_date)

    current_year = datetime.now().year
    current_age = current_year - birth_date.year
    end_age = profile.get("life_expectancy", 95)
    retirement_age = profile.get("retirement_age", 65)
    filing_status = profile.get("filing_status", "single")
    base_inflation = profile.get("inflation_rate", 3.0) / 100.0

    n_years = end_age - current_age + 1
    N = n_simulations

    # ---- Generate random return and inflation sequences (N x n_years) ----
    rng = np.random.default_rng()

    # Per-account return sequences (use per-account mean/stddev or override)
    # Shape: (N, n_years, n_accounts)
    n_accounts = len(accounts)
    account_returns = np.zeros((N, n_years, n_accounts))
    for i, acc in enumerate(accounts):
        mean = (return_mean_override if return_mean_override is not None
                else acc.get("expected_return_pct", 7.0)) / 100.0
        std = (return_stddev_override if return_stddev_override is not None
               else acc.get("return_stddev_pct", 15.0)) / 100.0
        # Log-normal: ln(1+r) ~ N(mu, sigma)
        # mu and sigma of the log-normal:
        log_mu = np.log(1 + mean) - 0.5 * np.log(1 + (std / (1 + mean)) ** 2)
        log_sigma = np.sqrt(np.log(1 + (std / (1 + mean)) ** 2))
        log_returns = rng.normal(log_mu, log_sigma, size=(N, n_years))
        account_returns[:, :, i] = np.exp(log_returns) - 1

    # Inflation sequences (N x n_years)
    inflation_sequences = rng.normal(
        inflation_mean / 100.0,
        inflation_stddev / 100.0,
        size=(N, n_years),
    )
    inflation_sequences = np.clip(inflation_sequences, -0.02, 0.20)

    # ---- Initial balances ----
    init_balances = np.array([acc.get("balance", 0.0) for acc in accounts], dtype=float)

    # ---- Run simulations ----
    # Balances shape: (N, n_accounts)
    balances = np.tile(init_balances, (N, 1))

    portfolio_by_year = np.zeros((N, n_years))

    ss_annual = 0.0
    ss_start_age = 999
    if ss:
        claiming_age = ss.get("claiming_age", 67)
        fra_benefit = ss.get("fra_monthly_benefit", 0.0)
        fra_age = ss.get("fra_age", 67)
        ss_annual = monthly_benefit_at_age(fra_benefit, fra_age, claiming_age) * 12
        ss_start_age = claiming_age

    for year_idx in range(n_years):
        age = current_age + year_idx
        years_elapsed = year_idx
        is_working = age < retirement_age

        # Returns this year: shape (N, n_accounts)
        ret = account_returns[:, year_idx, :]  # shape (N, n_accounts)
        infl = inflation_sequences[:, year_idx]  # shape (N,)

        # ---- Contributions ----
        if is_working:
            for i, acc in enumerate(accounts):
                atype = acc["account_type"]
                if atype in ("401k", "403b", "roth_401k", "trad_ira", "roth_ira", "hsa", "cash"):
                    contrib = acc.get("annual_contribution", 0.0)
                    match_pct = acc.get("employer_match_pct", 0.0) / 100.0
                    match_lim = acc.get("employer_match_limit_pct", 0.0) / 100.0
                    match = contrib * match_lim * match_pct
                    balances[:, i] += contrib + match

        # ---- Apply returns ----
        balances *= (1.0 + ret)
        np.maximum(balances, 0.0, out=balances)

        # ---- Income ----
        total_income = np.zeros(N)
        for src in income_sources:
            start = src.get("start_age") or 0
            end = src.get("end_age") or 999
            if start <= age <= end:
                amount = src.get("annual_amount", 0.0)
                if src.get("inflation_adjusted", False):
                    amount_v = amount * np.prod(1 + inflation_sequences[:, :year_idx + 1], axis=1)
                else:
                    amount_v = amount
                total_income += amount_v

        # SS income
        if age >= ss_start_age and ss_annual > 0:
            total_income += ss_annual

        # ---- Expenses ----
        total_expenses = np.zeros(N)
        for exp in expenses:
            start = exp.get("start_age") or 0
            end_a = exp.get("end_age") or 999
            if start <= age <= end_a:
                amount = exp.get("annual_amount", 0.0)
                if exp.get("inflation_adjusted", True):
                    amount_v = amount * (1 + infl) ** years_elapsed
                else:
                    amount_v = amount
                total_expenses += amount_v

        # ---- Simplified RMDs (scalar: use median balance) ----
        rmd_total = np.zeros(N)
        if age >= 73:
            for i, acc in enumerate(accounts):
                if acc["account_type"] in ("trad_ira", "401k", "403b"):
                    from .rmd import distribution_period
                    period = distribution_period(age)
                    if period and period > 0:
                        rmd_v = balances[:, i] / period
                        rmd_total += rmd_v
                        balances[:, i] = np.maximum(0.0, balances[:, i] - rmd_v)

        # ---- Simplified tax (use scalar approximation) ----
        ordinary_income = total_income + rmd_total
        # Simple effective rate: 15% flat average (simplified for MC speed)
        tax_rate = 0.15
        taxes = np.maximum(0.0, ordinary_income * tax_rate)

        # ---- Net cash need ----
        cash_available = total_income + rmd_total
        shortfall = np.maximum(0.0, total_expenses + taxes - cash_available)

        # ---- Simplified withdrawals (from all accounts pro-rata) ----
        total_balance = balances.sum(axis=1)
        for i in range(n_accounts):
            acc_weight = np.where(total_balance > 0, balances[:, i] / total_balance, 0.0)
            withdraw = shortfall * acc_weight
            balances[:, i] = np.maximum(0.0, balances[:, i] - withdraw)

        portfolio_by_year[:, year_idx] = balances.sum(axis=1)

    # ---- Compute statistics ----
    terminal = portfolio_by_year[:, -1]
    success_mask = terminal > 0
    success_rate = float(success_mask.mean() * 100)

    years_list = [current_year + i for i in range(n_years)]
    ages_list = list(range(current_age, end_age + 1))

    median_by_year = np.percentile(portfolio_by_year, 50, axis=0).tolist()
    p10_by_year = np.percentile(portfolio_by_year, 10, axis=0).tolist()
    p25_by_year = np.percentile(portfolio_by_year, 25, axis=0).tolist()
    p75_by_year = np.percentile(portfolio_by_year, 75, axis=0).tolist()
    p90_by_year = np.percentile(portfolio_by_year, 90, axis=0).tolist()

    return MonteCarloResult(
        n_simulations=N,
        success_rate=success_rate,
        median_terminal_wealth=float(np.median(terminal)),
        percentile_10=float(np.percentile(terminal, 10)),
        percentile_25=float(np.percentile(terminal, 25)),
        percentile_75=float(np.percentile(terminal, 75)),
        percentile_90=float(np.percentile(terminal, 90)),
        worst_case=float(np.min(terminal)),
        best_case=float(np.max(terminal)),
        years=years_list,
        ages=ages_list,
        median_by_year=[round(v, 2) for v in median_by_year],
        p10_by_year=[round(v, 2) for v in p10_by_year],
        p25_by_year=[round(v, 2) for v in p25_by_year],
        p75_by_year=[round(v, 2) for v in p75_by_year],
        p90_by_year=[round(v, 2) for v in p90_by_year],
        terminal_values=[round(float(v), 2) for v in terminal],
    )
