from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, close_db
from .routers import (
    profile,
    accounts,
    income,
    expenses,
    scenarios,
    social_security,
    rental_properties,
    simulate,
    optimize,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    close_db()


app = FastAPI(
    title="Retirement Planner API",
    version="1.0.0",
    description="Personal retirement planning — projections, scenarios, Roth optimization, Monte Carlo.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router,             prefix="/api/profile",             tags=["profile"])
app.include_router(accounts.router,            prefix="/api/accounts",            tags=["accounts"])
app.include_router(income.router,              prefix="/api/income-sources",      tags=["income"])
app.include_router(expenses.router,            prefix="/api/expenses",            tags=["expenses"])
app.include_router(scenarios.router,           prefix="/api/scenarios",           tags=["scenarios"])
app.include_router(social_security.router,     prefix="/api/social-security",     tags=["social-security"])
app.include_router(rental_properties.router,   prefix="/api/rental-properties",   tags=["rental-properties"])
app.include_router(simulate.router,            prefix="/api/simulate",            tags=["simulate"])
app.include_router(optimize.router,            prefix="/api/optimize",            tags=["optimize"])


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}
