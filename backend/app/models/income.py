from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


IncomeType = Literal[
    "salary", "rental", "pension", "social_security",
    "part_time", "annuity", "other",
]

TaxTreatment = Literal["ordinary", "capital_gains", "exempt", "social_security"]


class IncomeSourceCreate(BaseModel):
    name: str
    income_type: IncomeType
    annual_amount: float = Field(default=0.0, ge=0.0)
    start_age: int | None = None
    end_age: int | None = None
    inflation_adjusted: bool = False
    tax_treatment: TaxTreatment = "ordinary"
    notes: str | None = None


class IncomeSourceUpdate(IncomeSourceCreate):
    pass


class IncomeSourceOut(IncomeSourceCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
