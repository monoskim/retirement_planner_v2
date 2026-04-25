from __future__ import annotations

from pydantic import BaseModel, Field


class SocialSecurityCreate(BaseModel):
    fra_monthly_benefit: float = Field(default=0.0, ge=0.0,
        description="Your estimated monthly benefit at Full Retirement Age (from ssa.gov)")
    fra_age: int = Field(default=67, ge=62, le=70,
        description="Your Full Retirement Age (usually 66 or 67 based on birth year)")
    claiming_age: int = Field(default=67, ge=62, le=70,
        description="Age at which you plan to claim Social Security")
    spouse_fra_monthly_benefit: float = Field(default=0.0, ge=0.0,
        description="Spouse's estimated monthly benefit at FRA (0 if not applicable)")
    spouse_fra_age: int = Field(default=67, ge=62, le=70)
    spouse_claiming_age: int | None = None
    notes: str | None = None


class SocialSecurityUpdate(SocialSecurityCreate):
    pass


class SocialSecurityOut(SocialSecurityCreate):
    id: int = 1
    created_at: str | None = None

    class Config:
        from_attributes = True


class SSClaimingAnalysis(BaseModel):
    claiming_age: int
    monthly_benefit: float
    annual_benefit: float
    cumulative_at_80: float
    cumulative_at_85: float
    cumulative_at_90: float
    reduction_pct: float
