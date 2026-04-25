from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ExpenseCategory = Literal[
    "housing", "travel", "medical", "food", "insurance",
    "taxes", "transportation", "entertainment", "other",
]


class ExpenseCreate(BaseModel):
    name: str
    category: ExpenseCategory
    annual_amount: float = Field(default=0.0, ge=0.0)
    start_age: int | None = None
    end_age: int | None = None
    inflation_adjusted: bool = True
    notes: str | None = None


class ExpenseUpdate(ExpenseCreate):
    pass


class ExpenseOut(ExpenseCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
