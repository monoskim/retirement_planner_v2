from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AccountType = Literal[
    "401k", "403b", "trad_ira", "roth_ira", "roth_401k",
    "taxable", "hsa", "pension", "cash",
]


class AccountCreate(BaseModel):
    name: str
    account_type: AccountType
    balance: float = Field(default=0.0, ge=0.0)
    annual_contribution: float = Field(default=0.0, ge=0.0)
    contribution_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    employer_match_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    employer_match_limit_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    expected_return_pct: float = Field(default=7.0, ge=-50.0, le=100.0)
    return_stddev_pct: float = Field(default=15.0, ge=0.0, le=100.0)
    cost_basis: float = Field(default=0.0, ge=0.0)
    notes: str | None = None


class AccountUpdate(AccountCreate):
    pass


class AccountOut(AccountCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
