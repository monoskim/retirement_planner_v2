from __future__ import annotations

from pydantic import BaseModel, Field


class ScenarioCreate(BaseModel):
    name: str
    description: str | None = None
    is_base: bool = False
    base_scenario_id: str | None = None


class ScenarioUpdate(ScenarioCreate):
    pass


class ScenarioOut(ScenarioCreate):
    id: str
    created_at: str | None = None

    class Config:
        from_attributes = True


class ScenarioOverrideCreate(BaseModel):
    entity_type: str = Field(
        description="One of: account, income, expense, profile, social_security, rental_property"
    )
    entity_id: str = Field(
        description="UUID of the entity to override (use 'profile' or 'ss' for singletons)"
    )
    field_name: str = Field(description="Field name to override (e.g. expected_return_pct)")
    override_value: str = Field(description="JSON-encoded new value (e.g. '10.0' or '\"active\"')")


class ScenarioOverrideOut(ScenarioOverrideCreate):
    id: str
    scenario_id: str
    created_at: str | None = None

    class Config:
        from_attributes = True
