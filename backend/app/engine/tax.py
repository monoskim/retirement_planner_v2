"""
Federal income tax calculator.
Reads bracket data from data/tax_brackets.json.
Supports inflation-adjusted bracket projection for future years.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_DATA = json.loads((Path(__file__).parent.parent / "data" / "tax_brackets.json").read_text())


@dataclass
class TaxResult:
    federal_income_tax: float
    capital_gains_tax: float
    niit: float
    total_tax: float
    effective_rate: float
    marginal_rate: float
    taxable_ordinary_income: float
    standard_deduction_used: float


def _inflation_factor(year: int) -> float:
    if year <= 2025:
        return 1.0
    return (1 + _DATA["annual_cola_estimate"]) ** (year - 2025)


def _get_std_deduction(filing_status: str, year: int, age: int = 0) -> float:
    base = _DATA["standard_deductions"][filing_status] * _inflation_factor(year)
    # Additional standard deduction for age 65+
    if age >= 65:
        extra = _DATA["additional_standard_deduction_65_plus"][filing_status]
        base += extra * _inflation_factor(year)
    return base


def calculate_federal_income_tax(
    ordinary_income: float,
    filing_status: str,
    year: int = 2025,
    age: int = 0,
) -> tuple[float, float, float]:
    """
    Returns (tax, taxable_income, marginal_rate).
    ordinary_income is gross — standard deduction is applied internally.
    """
    factor = _inflation_factor(year)
    std_ded = _get_std_deduction(filing_status, year, age)
    taxable = max(0.0, ordinary_income - std_ded)

    brackets = _DATA["brackets"][filing_status]
    tax = 0.0
    prev_upper = 0.0
    marginal_rate = brackets[-1][1]

    remaining = taxable
    for upper, rate in brackets:
        adj_upper = upper * factor
        width = adj_upper - prev_upper * factor if prev_upper else adj_upper
        in_bracket = min(remaining, width)
        if in_bracket <= 0:
            break
        tax += in_bracket * rate
        remaining -= in_bracket
        marginal_rate = rate
        prev_upper = upper
        if remaining <= 0:
            break

    return tax, taxable, marginal_rate


def calculate_capital_gains_tax(
    long_term_gains: float,
    ordinary_taxable_income: float,
    filing_status: str,
    year: int = 2025,
) -> float:
    """
    Long-term capital gains are stacked on top of ordinary taxable income
    to determine the applicable preferential rate.
    """
    if long_term_gains <= 0:
        return 0.0

    factor = _inflation_factor(year)
    thresholds = _DATA["capital_gains_thresholds"][filing_status]

    gains_floor = ordinary_taxable_income
    gains_ceil = gains_floor + long_term_gains

    tax = 0.0
    prev_upper = 0.0

    for upper_raw, rate in thresholds:
        upper = upper_raw * factor if upper_raw < 1e9 else upper_raw
        bracket_floor = max(gains_floor, prev_upper)
        bracket_ceil = min(gains_ceil, upper)
        taxable_in_bracket = max(0.0, bracket_ceil - bracket_floor)
        tax += taxable_in_bracket * rate
        prev_upper = upper
        if gains_ceil <= upper:
            break

    return tax


def calculate_niit(
    net_investment_income: float,
    agi: float,
    filing_status: str,
) -> float:
    """Net Investment Income Tax (3.8%) on the lesser of NII or excess over threshold."""
    threshold = _DATA["niit_threshold"][filing_status]
    excess_agi = max(0.0, agi - threshold)
    niit_base = min(net_investment_income, excess_agi)
    return niit_base * _DATA["niit_rate"]


def calculate_ss_taxable(
    ss_benefits: float,
    other_income: float,
    filing_status: str,
    tax_exempt_interest: float = 0.0,
) -> float:
    """
    Returns the taxable portion of Social Security benefits.
    Up to 85% may be taxable based on provisional income.
    Provisional income = other_income + tax_exempt_interest + 50% of SS benefits.
    """
    if ss_benefits <= 0:
        return 0.0

    provisional = other_income + tax_exempt_interest + 0.5 * ss_benefits

    if filing_status == "married_jointly":
        lower = _DATA["ss_provisional_income"]["joint_lower"]
        upper = _DATA["ss_provisional_income"]["joint_upper"]
    else:
        lower = _DATA["ss_provisional_income"]["single_lower"]
        upper = _DATA["ss_provisional_income"]["single_upper"]

    if provisional <= lower:
        return 0.0
    elif provisional <= upper:
        tier1 = 0.5 * (provisional - lower)
        return min(tier1, 0.5 * ss_benefits)
    else:
        tier1 = min(0.5 * (upper - lower), 0.5 * ss_benefits)
        tier2 = min(0.85 * (provisional - upper), 0.85 * ss_benefits - tier1)
        return tier1 + tier2


def calculate_total_tax(
    ordinary_income: float,
    long_term_gains: float,
    ss_benefits: float,
    filing_status: str,
    year: int = 2025,
    age: int = 0,
) -> TaxResult:
    """
    Full federal tax calculation for a given year's income.

    ordinary_income   — wages, IRA/401k withdrawals, rental net income, etc. (pre-deduction)
    long_term_gains   — net long-term capital gains from taxable accounts
    ss_benefits       — gross Social Security benefits received
    """
    ss_taxable = calculate_ss_taxable(ss_benefits, ordinary_income + long_term_gains, filing_status)
    total_ordinary = ordinary_income + ss_taxable

    income_tax, taxable_ordinary, marginal_rate = calculate_federal_income_tax(
        total_ordinary, filing_status, year, age
    )

    std_ded = _get_std_deduction(filing_status, year, age)
    ordinary_after_ded = max(0.0, total_ordinary - std_ded)

    cg_tax = calculate_capital_gains_tax(long_term_gains, ordinary_after_ded, filing_status, year)

    agi = total_ordinary + long_term_gains
    niit = calculate_niit(long_term_gains, agi, filing_status)

    total = income_tax + cg_tax + niit
    total_income = total_ordinary + long_term_gains
    effective = total / total_income if total_income > 0 else 0.0

    return TaxResult(
        federal_income_tax=income_tax,
        capital_gains_tax=cg_tax,
        niit=niit,
        total_tax=total,
        effective_rate=effective,
        marginal_rate=marginal_rate,
        taxable_ordinary_income=taxable_ordinary,
        standard_deduction_used=std_ded,
    )


def remaining_bracket_space(
    current_taxable_income: float,
    target_bracket_upper: float,
    filing_status: str,
    year: int = 2025,
) -> float:
    """
    How much more ordinary income can be added before crossing target_bracket_upper (marginal rate).
    Used by the Roth conversion optimizer to fill brackets.
    """
    factor = _inflation_factor(year)
    brackets = _DATA["brackets"][filing_status]

    for upper_raw, _rate in brackets:
        upper = upper_raw * factor
        if upper >= target_bracket_upper * factor:
            return max(0.0, upper - current_taxable_income)

    return 0.0
