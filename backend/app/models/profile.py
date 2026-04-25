from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


FilingStatus = Literal["single", "married_jointly", "married_separately", "head_of_household"]


class ProfileCreate(BaseModel):
    name: str = "Me"
    birth_date: date
    filing_status: FilingStatus = "single"
    state: str = "NV"
    retirement_age: int = Field(default=65, ge=40, le=90)
    life_expectancy: int = Field(default=95, ge=50, le=120)
    inflation_rate: float = Field(default=3.0, ge=0.0, le=20.0)


class ProfileUpdate(ProfileCreate):
    pass


class ProfileOut(ProfileCreate):
    id: int = 1
    created_at: str | None = None

    class Config:
        from_attributes = True
