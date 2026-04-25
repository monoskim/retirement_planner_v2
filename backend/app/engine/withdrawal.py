"""
Withdrawal strategy optimizer.
Determines which accounts to withdraw from and in what order,
targeting tax efficiency based on account type and current age.
"""
from __future__ import annotations

from dataclasses import dataclass, field


EARLY_WITHDRAWAL_PENALTY = 0.10
EARLY_WITHDRAWAL_AGE = 59.5

# Withdrawal order: taxable (no penalty), then tax-deferred, then Roth
# Roth principal can be withdrawn anytime; only earnings have the 5yr/59.5 rule
WITHDRAWAL_ORDER = [
    ("cash", "taxable", False),
    ("taxable", "taxable", False),
    ("pension", "tax_deferred", False),   # pension income is ordinary
    ("trad_ira", "tax_deferred", True),   # penalty if pre-59.5
    ("401k", "tax_deferred", True),
    ("403b", "tax_deferred", True),
    ("roth_401k", "roth", True),          # earnings penalty if pre-59.5
    ("roth_ira", "roth", False),          # principal OK anytime; simplified: no penalty
    ("hsa", "exempt", False),             # medical use is exempt; general use penalized pre-65
]

ACCOUNT_TYPE_TO_CATEGORY = {acc_type: cat for acc_type, cat, _ in WITHDRAWAL_ORDER}


@dataclass
class WithdrawalResult:
    taxable_withdrawn: float = 0.0
    tax_deferred_withdrawn: float = 0.0
    roth_withdrawn: float = 0.0
    hsa_withdrawn: float = 0.0
    penalty_paid: float = 0.0
    total_withdrawn: float = 0.0
    per_account: dict[str, float] = field(default_factory=dict)


def make_withdrawals(
    accounts: list[dict],
    balances: dict[str, float],
    net_amount_needed: float,
    age: float,
    marginal_tax_rate: float,
) -> WithdrawalResult:
    """
    Withdraw net_amount_needed from accounts in tax-efficient order.
    For tax-deferred accounts, grosses up the withdrawal to cover the tax cost
    so the net result matches what's needed.
    Modifies balances in-place.
    """
    result = WithdrawalResult()
    remaining = net_amount_needed

    if remaining <= 0:
        return result

    # Build lookup of accounts by type
    acc_by_type: dict[str, list[dict]] = {}
    for acc in accounts:
        acc_by_type.setdefault(acc["account_type"], []).append(acc)

    for acc_type, category, has_early_penalty in WITHDRAWAL_ORDER:
        if remaining <= 0:
            break

        accounts_of_type = acc_by_type.get(acc_type, [])
        for acc in accounts_of_type:
            if remaining <= 0:
                break

            acc_id = acc["id"]
            balance = balances.get(acc_id, 0.0)
            if balance <= 0:
                continue

            # Apply early withdrawal penalty
            penalty_rate = 0.0
            if has_early_penalty and age < EARLY_WITHDRAWAL_AGE:
                penalty_rate = EARLY_WITHDRAWAL_PENALTY

            # For tax-deferred, gross up: need to withdraw MORE to net the needed amount
            # net = gross * (1 - penalty_rate - tax_rate_on_withdrawal)
            # We only gross up for the penalty; taxes are accounted for in the projection engine
            effective_rate = penalty_rate
            if effective_rate > 0:
                gross_needed = remaining / (1 - effective_rate) if (1 - effective_rate) > 0 else remaining
            else:
                gross_needed = remaining

            withdrawal = min(balance, gross_needed)
            balances[acc_id] -= withdrawal

            penalty = withdrawal * penalty_rate
            net_from_withdrawal = withdrawal - penalty

            result.per_account[acc_id] = result.per_account.get(acc_id, 0.0) + withdrawal
            result.total_withdrawn += withdrawal
            result.penalty_paid += penalty

            if category == "taxable":
                result.taxable_withdrawn += withdrawal
            elif category == "tax_deferred":
                result.tax_deferred_withdrawn += withdrawal
            elif category == "roth":
                result.roth_withdrawn += withdrawal
            elif category == "exempt":
                result.hsa_withdrawn += withdrawal

            remaining -= net_from_withdrawal

    return result
