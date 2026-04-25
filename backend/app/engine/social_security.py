"""
Social Security benefit calculator.
Users enter their estimated FRA monthly benefit (from ssa.gov).
This module applies the claiming-age adjustments and break-even analysis.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SSBenefitResult:
    claiming_age: int
    monthly_benefit: float
    annual_benefit: float
    reduction_pct: float          # negative = reduction, positive = increase vs FRA
    cumulative_at_80: float
    cumulative_at_85: float
    cumulative_at_90: float
    cumulative_at_95: float


def get_fra(birth_year: int) -> int:
    """Return Full Retirement Age as a whole number (rounded down for simplicity)."""
    if birth_year <= 1937:
        return 65
    elif birth_year <= 1942:
        # 65 + 2 months per year after 1937
        return 65  # approx (65 + 0–10 months → floor to 65 or 66)
    elif birth_year <= 1954:
        return 66
    elif birth_year <= 1959:
        return 66  # 66 + 2–10 months → we floor to 66
    else:
        return 67


def _benefit_factor(claiming_age: int, fra: int) -> float:
    """
    Compute the benefit multiplier relative to FRA benefit.
    Before FRA: reduce by 5/9 of 1% per month for the first 36 months,
                then 5/12 of 1% per month for each additional month.
    After FRA:  increase by 2/3 of 1% per month (= 8%/year), capped at age 70.
    """
    months_diff = (claiming_age - fra) * 12  # negative if early, positive if late

    if months_diff == 0:
        return 1.0
    elif months_diff > 0:
        # Delayed credits: 8%/year = 2/3% per month, max 4 years (48 months)
        months_delayed = min(months_diff, 48)
        return 1.0 + months_delayed * (2 / 3) / 100
    else:
        months_early = abs(months_diff)
        first_36 = min(months_early, 36)
        beyond_36 = max(0, months_early - 36)
        reduction = first_36 * (5 / 9) / 100 + beyond_36 * (5 / 12) / 100
        return 1.0 - reduction


def monthly_benefit_at_age(
    fra_monthly_benefit: float,
    fra_age: int,
    claiming_age: int,
) -> float:
    """Return the monthly benefit at the given claiming age."""
    factor = _benefit_factor(claiming_age, fra_age)
    return fra_monthly_benefit * factor


def analyze_claiming_age(
    fra_monthly_benefit: float,
    fra_age: int,
    claiming_age: int,
) -> SSBenefitResult:
    monthly = monthly_benefit_at_age(fra_monthly_benefit, fra_age, claiming_age)
    annual = monthly * 12
    factor = _benefit_factor(claiming_age, fra_age)
    reduction_pct = (factor - 1.0) * 100

    def cumulative_to_age(end_age: int) -> float:
        if end_age <= claiming_age:
            return 0.0
        return annual * (end_age - claiming_age)

    return SSBenefitResult(
        claiming_age=claiming_age,
        monthly_benefit=monthly,
        annual_benefit=annual,
        reduction_pct=reduction_pct,
        cumulative_at_80=cumulative_to_age(80),
        cumulative_at_85=cumulative_to_age(85),
        cumulative_at_90=cumulative_to_age(90),
        cumulative_at_95=cumulative_to_age(95),
    )


def compare_all_claiming_ages(
    fra_monthly_benefit: float,
    fra_age: int,
) -> list[SSBenefitResult]:
    """Return benefit analysis for every whole-year claiming age from 62 to 70."""
    return [
        analyze_claiming_age(fra_monthly_benefit, fra_age, age)
        for age in range(62, 71)
    ]


def break_even_age(
    fra_monthly_benefit: float,
    fra_age: int,
    age_a: int,
    age_b: int,
) -> float | None:
    """
    Find the age at which cumulative benefits from age_b claiming exceed those from age_a.
    Returns None if break-even never occurs (within 100 years).
    """
    benefit_a = monthly_benefit_at_age(fra_monthly_benefit, fra_age, age_a) * 12
    benefit_b = monthly_benefit_at_age(fra_monthly_benefit, fra_age, age_b) * 12

    if benefit_b <= benefit_a:
        return None  # later claiming never catches up

    # cumA(t) = benefit_a * (t - age_a),  for t >= age_a
    # cumB(t) = benefit_b * (t - age_b),  for t >= age_b
    # Intersection: benefit_a*(t-age_a) = benefit_b*(t-age_b)
    # t*(benefit_a - benefit_b) = benefit_a*age_a - benefit_b*age_b  (wrong sign, flip)
    # t = (benefit_b*age_b - benefit_a*age_a) / (benefit_b - benefit_a)
    numerator = benefit_b * age_b - benefit_a * age_a
    denominator = benefit_b - benefit_a

    if denominator <= 0:
        return None

    t = numerator / denominator
    return t if t > max(age_a, age_b) else None
