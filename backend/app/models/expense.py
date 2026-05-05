from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


ExpenseCategory = Literal[
    "housing", "travel", "medical", "food", "insurance",
    "taxes", "transportation", "entertainment", "other",
]


class ExpensePeriod(BaseModel):
    annual_amount: float = Field(default=0.0, ge=0.0)
    start_age: int | None = None
    end_age: int | None = None

    @model_validator(mode="after")
    def validate_age_window(self):
        if self.start_age is not None and self.end_age is not None and self.end_age < self.start_age:
            raise ValueError("end_age must be greater than or equal to start_age")
        return self


class ExpenseCreate(BaseModel):
    name: str
    category: ExpenseCategory
    annual_amount: float = Field(default=0.0, ge=0.0)
    start_age: int | None = None
    end_age: int | None = None
    inflation_adjusted: bool = True
    notes: str | None = None
    periods: list[ExpensePeriod] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_periods(self):
        if not self.periods:
            return self

        normalized = []
        for period in self.periods:
            start = 0 if period.start_age is None else period.start_age
            end = 999 if period.end_age is None else period.end_age
            if end < start:
                raise ValueError("Each period must have end_age >= start_age")
            normalized.append((start, end))

        normalized.sort(key=lambda x: (x[0], x[1]))
        for i in range(1, len(normalized)):
            prev_start, prev_end = normalized[i - 1]
            curr_start, _ = normalized[i]
            if curr_start <= prev_end:
                raise ValueError("Expense periods cannot overlap")

        return self


class ExpenseUpdate(ExpenseCreate):
    pass


class ExpenseOut(ExpenseCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
