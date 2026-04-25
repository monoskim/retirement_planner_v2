"""
DuckDB connection management and schema initialization.
Uses a single global connection — appropriate for a local single-user app.
"""
from __future__ import annotations

from pathlib import Path

import duckdb

_conn: duckdb.DuckDBPyConnection | None = None

DB_PATH = Path(__file__).parent.parent / "data" / "retirement_planner.duckdb"


def init_db(db_path: Path | None = None) -> None:
    """Initialize the DuckDB connection and create tables if needed."""
    global _conn
    path = db_path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    _conn = duckdb.connect(str(path))
    _create_schema(_conn)


def close_db() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def get_db() -> duckdb.DuckDBPyConnection:
    """FastAPI dependency — returns the active connection."""
    if _conn is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _conn


def _create_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id         INTEGER PRIMARY KEY DEFAULT 1,
            name       VARCHAR NOT NULL DEFAULT 'Me',
            birth_date DATE    NOT NULL,
            filing_status VARCHAR NOT NULL
                CHECK (filing_status IN (
                    'single','married_jointly','married_separately','head_of_household'
                )),
            state          VARCHAR NOT NULL DEFAULT 'NV',
            retirement_age INTEGER NOT NULL DEFAULT 65,
            life_expectancy INTEGER NOT NULL DEFAULT 95,
            inflation_rate DOUBLE  NOT NULL DEFAULT 3.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id                    VARCHAR PRIMARY KEY,
            name                  VARCHAR NOT NULL,
            account_type          VARCHAR NOT NULL
                CHECK (account_type IN (
                    '401k','403b','trad_ira','roth_ira','roth_401k',
                    'taxable','hsa','pension','cash'
                )),
            balance               DOUBLE  NOT NULL DEFAULT 0.0,
            annual_contribution   DOUBLE  NOT NULL DEFAULT 0.0,
            employer_match_pct    DOUBLE  NOT NULL DEFAULT 0.0,
            employer_match_limit_pct DOUBLE NOT NULL DEFAULT 0.0,
            expected_return_pct   DOUBLE  NOT NULL DEFAULT 7.0,
            return_stddev_pct     DOUBLE  NOT NULL DEFAULT 15.0,
            cost_basis            DOUBLE  NOT NULL DEFAULT 0.0,
            notes                 VARCHAR,
            created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS income_sources (
            id               VARCHAR PRIMARY KEY,
            name             VARCHAR NOT NULL,
            income_type      VARCHAR NOT NULL
                CHECK (income_type IN (
                    'salary','rental','pension','social_security',
                    'part_time','annuity','other'
                )),
            annual_amount    DOUBLE  NOT NULL DEFAULT 0.0,
            start_age        INTEGER,
            end_age          INTEGER,
            inflation_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
            tax_treatment    VARCHAR NOT NULL DEFAULT 'ordinary'
                CHECK (tax_treatment IN ('ordinary','capital_gains','exempt','social_security')),
            notes            VARCHAR,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id               VARCHAR PRIMARY KEY,
            name             VARCHAR NOT NULL,
            category         VARCHAR NOT NULL
                CHECK (category IN (
                    'housing','travel','medical','food','insurance',
                    'taxes','transportation','entertainment','other'
                )),
            annual_amount    DOUBLE  NOT NULL DEFAULT 0.0,
            start_age        INTEGER,
            end_age          INTEGER,
            inflation_adjusted BOOLEAN NOT NULL DEFAULT TRUE,
            notes            VARCHAR,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_security (
            id                        INTEGER PRIMARY KEY DEFAULT 1,
            fra_monthly_benefit       DOUBLE  NOT NULL DEFAULT 0.0,
            fra_age                   INTEGER NOT NULL DEFAULT 67,
            claiming_age              INTEGER NOT NULL DEFAULT 67,
            spouse_fra_monthly_benefit DOUBLE NOT NULL DEFAULT 0.0,
            spouse_fra_age            INTEGER NOT NULL DEFAULT 67,
            spouse_claiming_age       INTEGER,
            notes                     VARCHAR,
            created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS scenarios (
            id               VARCHAR PRIMARY KEY,
            name             VARCHAR NOT NULL,
            description      VARCHAR,
            is_base          BOOLEAN NOT NULL DEFAULT FALSE,
            base_scenario_id VARCHAR REFERENCES scenarios(id),
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS scenario_overrides (
            id               VARCHAR PRIMARY KEY,
            scenario_id      VARCHAR NOT NULL REFERENCES scenarios(id),
            entity_type      VARCHAR NOT NULL
                CHECK (entity_type IN (
                    'account','income','expense','profile',
                    'social_security','rental_property'
                )),
            entity_id        VARCHAR NOT NULL,
            field_name       VARCHAR NOT NULL,
            override_value   VARCHAR NOT NULL,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS simulation_results (
            id           VARCHAR PRIMARY KEY,
            scenario_id  VARCHAR NOT NULL REFERENCES scenarios(id),
            run_type     VARCHAR NOT NULL
                CHECK (run_type IN ('deterministic','monte_carlo')),
            results_json VARCHAR NOT NULL,
            params_json  VARCHAR,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS rental_properties (
            id                   VARCHAR PRIMARY KEY,
            name                 VARCHAR NOT NULL,
            purchase_date        DATE    NOT NULL,
            purchase_price       DOUBLE  NOT NULL DEFAULT 0.0,
            land_value           DOUBLE  NOT NULL DEFAULT 0.0,
            building_value       DOUBLE  NOT NULL DEFAULT 0.0,
            current_market_value DOUBLE  NOT NULL DEFAULT 0.0,
            appreciation_rate_pct DOUBLE NOT NULL DEFAULT 3.0,
            property_type        VARCHAR NOT NULL DEFAULT 'residential_single'
                CHECK (property_type IN (
                    'residential_single','residential_multi','condo','commercial'
                )),
            status               VARCHAR NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','sold','planned')),
            planned_sale_year    INTEGER,
            expected_sale_price  DOUBLE,
            closing_cost_pct     DOUBLE  NOT NULL DEFAULT 7.0,
            active_participation BOOLEAN NOT NULL DEFAULT TRUE,
            notes                VARCHAR,
            created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS mortgages (
            id                    VARCHAR PRIMARY KEY,
            property_id           VARCHAR NOT NULL
                REFERENCES rental_properties(id),
            lender                VARCHAR,
            original_amount       DOUBLE  NOT NULL DEFAULT 0.0,
            interest_rate         DOUBLE  NOT NULL DEFAULT 0.0,
            term_years            INTEGER NOT NULL DEFAULT 30,
            start_date            DATE    NOT NULL,
            current_balance       DOUBLE  NOT NULL DEFAULT 0.0,
            current_balance_date  DATE,
            extra_monthly_payment DOUBLE  NOT NULL DEFAULT 0.0,
            notes                 VARCHAR,
            created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS rental_income (
            id                      VARCHAR PRIMARY KEY,
            property_id             VARCHAR NOT NULL
                REFERENCES rental_properties(id),
            monthly_rent            DOUBLE  NOT NULL DEFAULT 0.0,
            vacancy_rate_pct        DOUBLE  NOT NULL DEFAULT 5.0,
            annual_rent_increase_pct DOUBLE NOT NULL DEFAULT 3.0,
            start_date              DATE,
            notes                   VARCHAR,
            created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS rental_expenses (
            id                VARCHAR PRIMARY KEY,
            property_id       VARCHAR NOT NULL
                REFERENCES rental_properties(id),
            name              VARCHAR NOT NULL,
            category          VARCHAR NOT NULL
                CHECK (category IN (
                    'property_tax','insurance','maintenance','hoa',
                    'management_fee','utilities','other'
                )),
            annual_amount     DOUBLE  NOT NULL DEFAULT 0.0,
            inflation_adjusted BOOLEAN NOT NULL DEFAULT TRUE,
            notes             VARCHAR,
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()


def rows_to_dicts(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    """Convert the last query result into a list of dicts."""
    columns = [d[0] for d in conn.description]
    return [dict(zip(columns, row)) for row in conn.fetchall()]
