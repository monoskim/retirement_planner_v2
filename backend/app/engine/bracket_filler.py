"""
Lifetime tax bracket fill optimizer.

Analyzes the full lifetime projection to identify years where additional
withdrawals could be made without pushing into higher tax brackets.
Compares lifetime taxes under baseline vs. optimized withdrawal strategy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from .tax import calculate_total_tax, _DATA as TAX_DATA, _inflation_factor


@dataclass
class BracketFillYear:
    year: int
    age: int
    ordinary_income: float                # non-withdrawal ordinary income
    ss_income: float                      # Social Security (if any)
    current_tax: float                    # current year's tax under baseline
    standard_deduction: float             # std ded for year
    bracket_limits: dict[float, float]    # e.g., {0.12: 11000, 0.22: 44725, ...}
    space_to_12_bracket: float            # room to fill 12%
    space_to_22_bracket: float            # room to fill 22%
    space_to_24_bracket: float            # room to fill 24%
    recommended_withdrawal: float         # suggested withdrawal amount
    tax_with_recommendation: float        # estimated tax if recommended withdrawal made
    tax_savings: float                    # how much taxes would reduce


@dataclass
class LifetimeBracketFillResult:
    baseline_lifetime_taxes: float        # total taxes under current strategy
    optimized_lifetime_taxes: float       # total taxes with recommendations
    lifetime_tax_savings: float           # difference
    recommended_total_additional_withdrawals: float
    fill_years: list[BracketFillYear]


def _get_bracket_limits(filing_status: str, year: int) -> dict[float, float]:
    """Return bracket upper limits (as ordinary income) for given year."""
    factor = _inflation_factor(year)
    limits = {}
    for upper_raw, rate in TAX_DATA["brackets"][filing_status]:
        limits[rate] = upper_raw * factor
    return limits


def _get_standard_deduction(filing_status: str, year: int) -> float:
    """Return standard deduction for given year."""
    factor = _inflation_factor(year)
    return TAX_DATA["standard_deductions"][filing_status] * factor


def analyze_lifetime_bracket_fill(
    profile: dict,
    projection_results: list[dict],
) -> dict:
    """
    Analyze lifetime projection for bracket fill opportunities.
    
    Args:
        profile: User profile dict (filing_status, life_expectancy, etc.)
        projection_results: List of yearly snapshots from run_projection()
    
    Returns:
        Dict with lifetime comparison and year-by-year recommendations.
    """
    filing_status = profile.get("filing_status", "single")
    rmd_start_age = 73
    
    # Calculate baseline lifetime taxes from projection
    baseline_lifetime_taxes = sum(
        yr.get("taxes", {}).get("total", 0.0)
        for yr in projection_results
    )
    
    fill_years = []
    total_additional_withdrawals = 0.0
    
    # Analyze each year for bracket fill opportunities
    for yr_snapshot in projection_results:
        year = yr_snapshot["year"]
        age = yr_snapshot["age"]
        
        # Skip RMD years and beyond (people typically already withdraw more)
        if age >= rmd_start_age:
            continue
        
        # Skip working years (contributions/SS not fully claimed yet)
        if yr_snapshot.get("is_working", False):
            continue
        
        # Extract current year income (excluding withdrawals)
        income = yr_snapshot.get("income", {})
        ss_income = income.get("Social Security", 0.0)
        rental_taxable = yr_snapshot.get("rental_income_taxable", 0.0)
        
        # Other non-withdrawal income (dividends, interest, pensions, etc.)
        other_income = sum(
            v for k, v in income.items()
            if k not in ("Social Security", "total", "rmd_withdrawals")
            and not k.startswith("rental")
        )
        
        ordinary_income_before_withdrawal = other_income + rental_taxable
        current_tax = yr_snapshot.get("taxes", {}).get("total", 0.0)
        
        std_ded = _get_standard_deduction(filing_status, year)
        bracket_limits = _get_bracket_limits(filing_status, year)
        
        # Taxable income before withdrawal
        taxable_income_before = max(0.0, ordinary_income_before_withdrawal - std_ded)
        
        # Determine room in each bracket
        bracket_12_limit = bracket_limits.get(0.12, 11000)
        bracket_22_limit = bracket_limits.get(0.22, 44725)
        bracket_24_limit = bracket_limits.get(0.24, 95375)
        
        space_to_12 = max(0.0, bracket_12_limit - taxable_income_before)
        space_to_22 = max(0.0, bracket_22_limit - taxable_income_before)
        space_to_24 = max(0.0, bracket_24_limit - taxable_income_before)
        
        # Recommend filling up to 22% bracket (or 24% if there's significant room)
        # Conservative: don't push too aggressively
        if space_to_22 > 1000:  # Only recommend if there's meaningful room
            recommended_withdrawal = space_to_22 * 0.9  # Leave buffer
        elif space_to_24 > 5000:
            recommended_withdrawal = space_to_24 * 0.8
        else:
            recommended_withdrawal = 0.0
        
        if recommended_withdrawal < 100:  # Skip tiny amounts
            recommended_withdrawal = 0.0
        
        # Calculate tax if withdrawal is made
        tax_with_withdrawal = 0.0
        if recommended_withdrawal > 0:
            tax_result = calculate_total_tax(
                ordinary_income=ordinary_income_before_withdrawal + recommended_withdrawal,
                long_term_gains=0.0,
                ss_benefits=ss_income,
                filing_status=filing_status,
                year=year,
                age=age,
            )
            tax_with_withdrawal = tax_result.total_tax
        else:
            tax_with_withdrawal = current_tax
        
        tax_savings = current_tax - tax_with_withdrawal
        
        # Only include years with meaningful opportunity
        if recommended_withdrawal > 0 and tax_savings > -500:  # Allow minor increases if beneficial long-term
            fill_years.append(BracketFillYear(
                year=year,
                age=age,
                ordinary_income=round(ordinary_income_before_withdrawal, 2),
                ss_income=round(ss_income, 2),
                current_tax=round(current_tax, 2),
                standard_deduction=round(std_ded, 2),
                bracket_limits={k: round(v, 2) for k, v in bracket_limits.items()},
                space_to_12_bracket=round(space_to_12, 2),
                space_to_22_bracket=round(space_to_22, 2),
                space_to_24_bracket=round(space_to_24, 2),
                recommended_withdrawal=round(recommended_withdrawal, 2),
                tax_with_recommendation=round(tax_with_withdrawal, 2),
                tax_savings=round(tax_savings, 2),
            ))
            total_additional_withdrawals += recommended_withdrawal
    
    # Estimate optimized lifetime taxes
    # Simple estimate: sum of individual year savings
    estimated_total_savings = sum(yr.tax_savings for yr in fill_years)
    optimized_lifetime_taxes = baseline_lifetime_taxes - estimated_total_savings
    
    return {
        "baseline_lifetime_taxes": round(baseline_lifetime_taxes, 2),
        "optimized_lifetime_taxes": round(optimized_lifetime_taxes, 2),
        "lifetime_tax_savings": round(baseline_lifetime_taxes - optimized_lifetime_taxes, 2),
        "recommended_total_additional_withdrawals": round(total_additional_withdrawals, 2),
        "fill_opportunities": [
            {
                "year": yr.year,
                "age": yr.age,
                "ordinary_income": yr.ordinary_income,
                "ss_income": yr.ss_income,
                "current_tax": yr.current_tax,
                "standard_deduction": yr.standard_deduction,
                "bracket_limits": yr.bracket_limits,
                "space_to_12_bracket": yr.space_to_12_bracket,
                "space_to_22_bracket": yr.space_to_22_bracket,
                "space_to_24_bracket": yr.space_to_24_bracket,
                "recommended_withdrawal": yr.recommended_withdrawal,
                "tax_with_recommendation": yr.tax_with_recommendation,
                "tax_savings": yr.tax_savings,
            }
            for yr in fill_years
        ],
    }
