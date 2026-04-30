from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


PropertyType = Literal[
    "residential_single", "residential_multi", "condo", "commercial"
]
PropertyStatus = Literal["active", "sold", "planned"]
RentalExpenseCategory = Literal[
    "property_tax", "insurance", "maintenance", "hoa",
    "management_fee", "utilities", "other",
]


class RentalPropertyCreate(BaseModel):
    name: str
    purchase_date: date
    purchase_price: float = Field(default=0.0, ge=0.0)
    land_value: float = Field(default=0.0, ge=0.0,
        description="Portion of purchase price allocated to land (not depreciable)")
    building_value: float = Field(default=0.0, ge=0.0,
        description="Portion allocated to building (depreciable over 27.5 years)")
    current_market_value: float = Field(default=0.0, ge=0.0)
    appreciation_rate_pct: float = Field(default=3.0, ge=-20.0, le=50.0)
    property_type: PropertyType = "residential_single"
    status: PropertyStatus = "active"
    planned_sale_year: int | None = None
    expected_sale_price: float | None = None
    closing_cost_pct: float = Field(default=7.0, ge=0.0, le=30.0,
        description="Estimated closing costs as % of sale price")
    active_participation: bool = True
    is_primary_residence: bool = False
    notes: str | None = None


class RentalPropertyUpdate(RentalPropertyCreate):
    pass


class RentalPropertyOut(RentalPropertyCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True


# ---- Mortgage ----

class MortgageCreate(BaseModel):
    lender: str | None = None
    original_amount: float = Field(default=0.0, ge=0.0)
    interest_rate: float = Field(default=0.0, ge=0.0, le=30.0,
        description="Annual interest rate as percent (e.g. 6.5 for 6.5%)")
    term_years: int = Field(default=30, ge=1, le=50)
    start_date: date
    current_balance: float = Field(default=0.0, ge=0.0,
        description="Current outstanding balance (used as starting point)")
    current_balance_date: date | None = None
    extra_monthly_payment: float = Field(default=0.0, ge=0.0)
    property_tax: float = Field(default=0.0, ge=0.0, description="Annual property tax for escrow")
    insurance: float = Field(default=0.0, ge=0.0, description="Annual homeowner's insurance for escrow")
    actual_monthly_payment: float | None = Field(default=None, ge=0.0, description="Actual monthly payment (overrides calculation if provided)")
    notes: str | None = None


class MortgageUpdate(MortgageCreate):
    pass


class MortgageOut(MortgageCreate):
    id: str
    property_id: str
    created_at: str | None = None

    class Config:
        from_attributes = True


# ---- Rental Income ----

class RentalIncomeCreate(BaseModel):
    monthly_rent: float = Field(default=0.0, ge=0.0)
    vacancy_rate_pct: float = Field(default=5.0, ge=0.0, le=100.0)
    annual_rent_increase_pct: float = Field(default=3.0, ge=-10.0, le=50.0)
    start_date: date | None = None
    notes: str | None = None


class RentalIncomeUpdate(RentalIncomeCreate):
    pass


class RentalIncomeOut(RentalIncomeCreate):
    id: str
    property_id: str
    created_at: str | None = None

    class Config:
        from_attributes = True


# ---- Rental Expense ----

class RentalExpenseCreate(BaseModel):
    name: str
    category: RentalExpenseCategory
    annual_amount: float = Field(default=0.0, ge=0.0)
    inflation_adjusted: bool = True
    notes: str | None = None


class RentalExpenseUpdate(RentalExpenseCreate):
    pass


class RentalExpenseOut(RentalExpenseCreate):
    id: str
    property_id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
