"""
Roth conversion optimizer.
Identifies how much to convert each year to maximize after-tax wealth
by filling lower tax brackets during the gap years between retirement and RMD age.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from .tax import calculate_total_tax, _DATA as TAX_DATA, _inflation_factor


@dataclass
class RothConversionYear:
    year: int
    age: int
    ordinary_income_base: float          # income before conversion
    bracket_22_space: float              # room to fill up to 22% bracket top
    bracket_24_space: float              # room to fill up to 24% bracket top
    recommended_conversion: float        # suggested conversion amount
    tax_on_conversion: float
    marginal_rate_after_conversion: float


@dataclass
class RothConversionStrategy:
    strategy_name: str                   # "no_conversion", "fill_12", "fill_22", "fill_24"
    total_converted: float
    total_tax_on_conversions: float
    projected_rmd_reduction: float       # estimated RMD reduction in year 73
    conversion_by_year: list[RothConversionYear]


def _bracket_upper(filing_status: str, target_rate: float, year: int) -> float:
    """Return the upper income limit for the bracket with the given rate."""
    factor = _inflation_factor(year)
    for upper_raw, rate in TAX_DATA["brackets"][filing_status]:
        if rate == target_rate:
            return upper_raw * factor
    return 0.0


def analyze_roth_conversion(
    profile: dict,
    accounts: list[dict],
    income_sources: list[dict],
    ss: dict | None,
) -> dict:
    """
    Analyze Roth conversion opportunities during gap years.
    Returns analysis for multiple strategies.
    """
    birth_date = profile["birth_date"]
    if isinstance(birth_date, str):
        birth_date = date.fromisoformat(birth_date)

    current_year = datetime.now().year
    current_age = current_year - birth_date.year
    retirement_age = profile.get("retirement_age", 65)
    filing_status = profile.get("filing_status", "single")
    life_expectancy = profile.get("life_expectancy", 95)
    inflation_rate = profile.get("inflation_rate", 3.0) / 100.0

    rmd_start_age = 73

    # Gap years: from retirement to RMD start (or life expectancy)
    gap_start = max(current_age, retirement_age)
    gap_end = min(rmd_start_age - 1, life_expectancy)

    if gap_start >= gap_end:
        return {
            "message": "No gap years available for Roth conversion optimization.",
            "gap_start_age": gap_start,
            "gap_end_age": gap_end,
            "strategies": [],
        }

    # Sum up tax-deferred balances
    trad_balance = sum(
        acc.get("balance", 0.0)
        for acc in accounts
        if acc["account_type"] in ("trad_ira", "401k", "403b")
    )

    strategies = []

    for strategy_name, target_rate in [
        ("no_conversion", None),
        ("fill_12", 0.12),
        ("fill_22", 0.22),
        ("fill_24", 0.24),
    ]:
        total_converted = 0.0
        total_tax = 0.0
        years_detail = []

        for age in range(gap_start, gap_end + 1):
            year = current_year + (age - current_age)
            years_elapsed = age - current_age

            # Ordinary income (non-SS, non-conversion) during gap years
            base_income = 0.0
            for src in income_sources:
                start = src.get("start_age") or 0
                end = src.get("end_age") or 999
                if start <= age <= end:
                    amt = src.get("annual_amount", 0.0)
                    if src.get("inflation_adjusted", False):
                        amt *= (1 + inflation_rate) ** years_elapsed
                    base_income += amt

            if strategy_name == "no_conversion" or target_rate is None:
                conversion = 0.0
                tax_on_conv = 0.0
                marginal = 0.0
            else:
                bracket_top = _bracket_upper(filing_status, target_rate, year)
                std_ded = TAX_DATA["standard_deductions"][filing_status] * _inflation_factor(year)
                taxable_base = max(0.0, base_income - std_ded)
                space = max(0.0, bracket_top - taxable_base)
                conversion = min(space, trad_balance * 0.5)  # cap at half balance per year

                tax_with = calculate_total_tax(
                    ordinary_income=base_income + conversion,
                    long_term_gains=0.0,
                    ss_benefits=0.0,
                    filing_status=filing_status,
                    year=year,
                    age=age,
                )
                tax_without = calculate_total_tax(
                    ordinary_income=base_income,
                    long_term_gains=0.0,
                    ss_benefits=0.0,
                    filing_status=filing_status,
                    year=year,
                    age=age,
                )
                tax_on_conv = tax_with.total_tax - tax_without.total_tax
                marginal = tax_with.marginal_rate
                total_converted += conversion
                total_tax += tax_on_conv

            years_detail.append(RothConversionYear(
                year=year,
                age=age,
                ordinary_income_base=round(base_income, 2),
                bracket_22_space=round(_bracket_upper(filing_status, 0.22, year) -
                                        max(0.0, base_income - TAX_DATA["standard_deductions"][filing_status] *
                                            _inflation_factor(year)), 2),
                bracket_24_space=round(_bracket_upper(filing_status, 0.24, year) -
                                        max(0.0, base_income - TAX_DATA["standard_deductions"][filing_status] *
                                            _inflation_factor(year)), 2),
                recommended_conversion=round(conversion, 2),
                tax_on_conversion=round(tax_on_conv, 2),
                marginal_rate_after_conversion=round(marginal * 100, 2) if marginal else 0.0,
            ))

        # Estimate RMD reduction at age 73
        # Rough estimate: converting reduces tax-deferred balance,
        # which reduces future RMDs proportionally
        avg_return = 7.0 / 100.0
        years_to_73 = max(0, 73 - current_age)
        future_trad = (trad_balance - total_converted) * (1 + avg_return) ** years_to_73
        future_trad_no_conv = trad_balance * (1 + avg_return) ** years_to_73
        from .rmd import distribution_period
        dp = distribution_period(73) or 26.5
        rmd_without_conv = future_trad_no_conv / dp
        rmd_with_conv = future_trad / dp
        rmd_reduction = max(0.0, rmd_without_conv - rmd_with_conv)

        strategies.append(RothConversionStrategy(
            strategy_name=strategy_name,
            total_converted=round(total_converted, 2),
            total_tax_on_conversions=round(total_tax, 2),
            projected_rmd_reduction=round(rmd_reduction, 2),
            conversion_by_year=years_detail,
        ))

    return {
        "gap_start_age": gap_start,
        "gap_end_age": gap_end,
        "current_trad_balance": round(trad_balance, 2),
        "strategies": [
            {
                "strategy_name": s.strategy_name,
                "total_converted": s.total_converted,
                "total_tax_on_conversions": s.total_tax_on_conversions,
                "projected_rmd_reduction": s.projected_rmd_reduction,
                "conversion_by_year": [
                    {
                        "year": y.year,
                        "age": y.age,
                        "ordinary_income_base": y.ordinary_income_base,
                        "bracket_22_space": y.bracket_22_space,
                        "bracket_24_space": y.bracket_24_space,
                        "recommended_conversion": y.recommended_conversion,
                        "tax_on_conversion": y.tax_on_conversion,
                        "marginal_rate_after_conversion": y.marginal_rate_after_conversion,
                    }
                    for y in s.conversion_by_year
                ],
            }
            for s in strategies
        ],
    }
