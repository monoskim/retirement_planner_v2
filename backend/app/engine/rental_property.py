"""
Rental property financial engine.
Handles: mortgage amortization, depreciation, net rental income/loss,
passive activity loss rules, property sale tax calculations, and equity tracking.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


RESIDENTIAL_DEPRECIATION_YEARS = 27.5
COMMERCIAL_DEPRECIATION_YEARS = 39.0
DEPRECIATION_RECAPTURE_RATE = 0.25


@dataclass
class MortgageYearResult:
    year: int
    interest_paid: float        # deductible
    principal_paid: float       # non-deductible
    ending_balance: float
    monthly_payment: float
    is_paid_off: bool = False


@dataclass
class RentalPropertyYearResult:
    year: int
    property_id: str
    property_name: str
    # Income
    gross_rent: float
    net_rent: float             # after vacancy
    # Deductible expenses
    mortgage_interest: float
    property_tax: float
    insurance: float
    maintenance: float
    hoa: float
    management_fee: float
    utilities: float
    other_expenses: float
    depreciation: float
    total_deductible_expenses: float
    # P&L
    net_income_before_pal: float   # net_rent - total_deductible_expenses
    passive_loss_allowed: float    # after PAL rules
    net_taxable_income: float      # what hits Schedule E
    # Balance sheet
    mortgage_balance: float
    market_value: float
    equity: float
    accumulated_depreciation: float
    # Cash flow (actual cash in/out ignoring non-cash depreciation)
    cash_flow: float               # net_rent - cash_expenses - mortgage_payment
    mortgage_principal_paid: float


@dataclass
class PropertySaleResult:
    sale_price: float
    adjusted_basis: float          # purchase_price - accumulated_depreciation
    total_gain: float
    depreciation_recapture_amount: float
    depreciation_recapture_tax: float   # at 25%
    long_term_capital_gain: float       # remaining gain after recapture
    gross_proceeds: float               # sale_price - closing_costs
    net_proceeds_before_tax: float      # gross_proceeds
    estimated_tax: float                # recapture + ltcg tax (ltcg rate passed in)


def _monthly_payment(principal: float, annual_rate: float, term_years: int) -> float:
    """Standard mortgage payment formula."""
    if annual_rate <= 0 or principal <= 0:
        return principal / (term_years * 12) if term_years > 0 else 0.0
    r = annual_rate / 100 / 12
    n = term_years * 12
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


def amortize_year(
    starting_balance: float,
    annual_interest_rate: float,
    original_term_years: int,
    original_amount: float,
    extra_monthly: float = 0.0,
) -> MortgageYearResult | None:
    """
    Run one year of mortgage amortization.
    Returns None if the loan is already paid off.
    """
    if starting_balance <= 0:
        return None

    monthly_rate = annual_interest_rate / 100 / 12
    base_payment = _monthly_payment(original_amount, annual_interest_rate, original_term_years)
    monthly_payment = base_payment + extra_monthly

    balance = starting_balance
    total_interest = 0.0
    total_principal = 0.0

    for _ in range(12):
        if balance <= 0:
            break
        interest = balance * monthly_rate
        principal = min(monthly_payment - interest, balance)
        if principal < 0:
            principal = 0.0
        total_interest += interest
        total_principal += principal
        balance -= principal

    balance = max(0.0, balance)
    return MortgageYearResult(
        year=0,  # caller sets this
        interest_paid=total_interest,
        principal_paid=total_principal,
        ending_balance=balance,
        monthly_payment=monthly_payment,
        is_paid_off=(balance <= 0),
    )


def _depreciation_life(property_type: str) -> float:
    if property_type == "commercial":
        return COMMERCIAL_DEPRECIATION_YEARS
    return RESIDENTIAL_DEPRECIATION_YEARS


def annual_depreciation(building_value: float, property_type: str) -> float:
    """Annual straight-line depreciation deduction."""
    life = _depreciation_life(property_type)
    return building_value / life if life > 0 else 0.0


def passive_loss_allowed(net_loss: float, agi: float, active_participation: bool) -> float:
    """
    Apply passive activity loss rules.
    Active participants can deduct up to $25K against ordinary income,
    with phaseout from $100K–$150K AGI.
    Returns the allowed deduction (0 if no loss, or the clipped amount).
    """
    if net_loss >= 0:
        return 0.0  # there's income, not a loss

    loss_amount = abs(net_loss)

    if not active_participation:
        return 0.0  # loss suspended; carried forward (simplified: ignored here)

    if agi <= 100_000:
        allowed = min(loss_amount, 25_000)
    elif agi >= 150_000:
        allowed = 0.0
    else:
        phase = (agi - 100_000) / 50_000
        allowed = min(loss_amount, 25_000 * (1 - phase))

    return allowed


def calculate_rental_year(
    property_data: dict,
    mortgage_data: dict | None,
    income_data: dict | None,
    expense_rows: list[dict],
    calendar_year: int,
    years_owned: int,
    inflation_rate: float,
    agi_estimate: float,
) -> RentalPropertyYearResult:
    """
    Calculate one year of rental property financials.

    property_data  — row from rental_properties table
    mortgage_data  — row from mortgages table (or None)
    income_data    — row from rental_income table (or None)
    expense_rows   — rows from rental_expenses table
    calendar_year  — the simulation year (for tracking)
    years_owned    — how many years the property has been owned (for depreciation)
    inflation_rate — annual inflation rate as decimal (e.g. 0.03)
    agi_estimate   — estimated AGI before rental income/loss (for PAL rule)
    """
    prop_id = property_data["id"]
    prop_name = property_data["name"]
    prop_type = property_data.get("property_type", "residential_single")
    building_val = property_data.get("building_value", 0.0)
    active_part = property_data.get("active_participation", True)
    is_primary = property_data.get("is_primary_residence", False)

    # ---- Depreciation (not applicable to primary residences) ----
    depr = 0.0 if is_primary else annual_depreciation(building_val, prop_type)
    # Only depreciate from the first year of ownership
    accumulated_depr = depr * min(years_owned, _depreciation_life(prop_type))

    # ---- Rental Income (primary residences have no rental income) ----
    gross_rent = 0.0
    net_rent = 0.0
    if income_data and not is_primary:
        base_monthly = income_data.get("monthly_rent", 0.0)
        rent_increase = income_data.get("annual_rent_increase_pct", 0.0) / 100
        vacancy_rate = income_data.get("vacancy_rate_pct", 5.0) / 100
        # Compound rent increases from the start
        adjusted_monthly = base_monthly * (1 + rent_increase) ** years_owned
        gross_rent = adjusted_monthly * 12
        net_rent = gross_rent * (1 - vacancy_rate)

    # ---- Operating Expenses ----
    prop_tax = ins = maint = hoa = mgmt = util = other = 0.0
    for exp in expense_rows:
        amt = exp.get("annual_amount", 0.0)
        if exp.get("inflation_adjusted", True):
            amt *= (1 + inflation_rate) ** years_owned
        cat = exp.get("category", "other")
        if cat == "property_tax":
            prop_tax += amt
        elif cat == "insurance":
            ins += amt
        elif cat == "maintenance":
            maint += amt
        elif cat == "hoa":
            hoa += amt
        elif cat == "management_fee":
            mgmt += amt
        elif cat == "utilities":
            util += amt
        else:
            other += amt

    # ---- Mortgage ----
    mortgage_interest = 0.0
    mortgage_balance = 0.0
    mortgage_principal_paid = 0.0
    monthly_payment = 0.0

    if mortgage_data and mortgage_data.get("current_balance", 0.0) > 0:
        mort_result = amortize_year(
            starting_balance=mortgage_data["current_balance"],
            annual_interest_rate=mortgage_data.get("interest_rate", 0.0),
            original_term_years=mortgage_data.get("term_years", 30),
            original_amount=mortgage_data.get("original_amount", mortgage_data["current_balance"]),
            extra_monthly=mortgage_data.get("extra_monthly_payment", 0.0),
        )
        if mort_result:
            mortgage_interest = mort_result.interest_paid
            mortgage_principal_paid = mort_result.principal_paid
            mortgage_balance = mort_result.ending_balance
            monthly_payment = mort_result.monthly_payment
            # Update the balance for next year's calculation
            mortgage_data["current_balance"] = mortgage_balance

    # ---- Net Income / Loss ----
    total_deductible = (
        mortgage_interest + prop_tax + ins + maint + hoa + mgmt + util + other + depr
    )
    net_income_before_pal = net_rent - total_deductible

    # Primary residences have no taxable rental income/loss
    if is_primary:
        pal_deduction = 0.0
        net_taxable = 0.0
    else:
        # Passive activity loss rule
        pal_deduction = passive_loss_allowed(net_income_before_pal, agi_estimate, active_part)
        if net_income_before_pal < 0:
            # Loss: only allowed portion reduces taxes; rest is suspended
            net_taxable = -pal_deduction  # negative = reduces ordinary income
        else:
            # Income: fully taxable
            net_taxable = net_income_before_pal

    # ---- Market Value & Equity ----
    app_rate = property_data.get("appreciation_rate_pct", 3.0) / 100
    base_value = property_data.get("current_market_value", property_data.get("purchase_price", 0.0))
    market_value = base_value * (1 + app_rate)
    property_data["current_market_value"] = market_value
    equity = market_value - mortgage_balance

    # ---- Cash Flow ----
    cash_expenses = prop_tax + ins + maint + hoa + mgmt + util + other
    annual_mortgage_payment = monthly_payment * 12
    cash_flow = net_rent - cash_expenses - annual_mortgage_payment

    return RentalPropertyYearResult(
        year=calendar_year,
        property_id=prop_id,
        property_name=prop_name,
        gross_rent=gross_rent,
        net_rent=net_rent,
        mortgage_interest=mortgage_interest,
        property_tax=prop_tax,
        insurance=ins,
        maintenance=maint,
        hoa=hoa,
        management_fee=mgmt,
        utilities=util,
        other_expenses=other,
        depreciation=depr,
        total_deductible_expenses=total_deductible,
        net_income_before_pal=net_income_before_pal,
        passive_loss_allowed=pal_deduction,
        net_taxable_income=net_taxable,
        mortgage_balance=mortgage_balance,
        market_value=market_value,
        equity=equity,
        accumulated_depreciation=accumulated_depr,
        cash_flow=cash_flow,
        mortgage_principal_paid=mortgage_principal_paid,
    )


def calculate_sale(
    property_data: dict,
    accumulated_depreciation: float,
    ltcg_rate: float = 0.15,
) -> PropertySaleResult:
    """
    Calculate tax consequences of selling a rental property.

    ltcg_rate — the applicable long-term capital gains rate (0, 0.15, or 0.20)
    """
    sale_price = property_data.get("expected_sale_price") or property_data.get("current_market_value", 0.0)
    closing_cost_pct = property_data.get("closing_cost_pct", 7.0) / 100
    gross_proceeds = sale_price * (1 - closing_cost_pct)

    original_basis = property_data.get("purchase_price", 0.0)
    adjusted_basis = max(0.0, original_basis - accumulated_depreciation)

    total_gain = gross_proceeds - adjusted_basis

    # Depreciation recapture (up to total gain)
    recapture_amount = min(accumulated_depreciation, max(0.0, total_gain))
    recapture_tax = recapture_amount * DEPRECIATION_RECAPTURE_RATE

    ltcg = max(0.0, total_gain - recapture_amount)
    ltcg_tax = ltcg * ltcg_rate

    estimated_tax = recapture_tax + ltcg_tax

    return PropertySaleResult(
        sale_price=sale_price,
        adjusted_basis=adjusted_basis,
        total_gain=total_gain,
        depreciation_recapture_amount=recapture_amount,
        depreciation_recapture_tax=recapture_tax,
        long_term_capital_gain=ltcg,
        gross_proceeds=gross_proceeds,
        net_proceeds_before_tax=gross_proceeds,
        estimated_tax=estimated_tax,
    )
