"""
Pure calculation functions for the cycle results module.

All statistics use SAMPLE standard deviation (ddof=1, i.e. Excel's STDEV).
Ported unchanged from the original cycle-results module so results remain
bit-for-bit identical to before the merge.
"""
import statistics
from typing import List, Optional

Number = Optional[float]


def _clean(values: List[Number]) -> List[float]:
    """Drop missing replicates before computing statistics."""
    return [v for v in values if v is not None]


def compute_average(replicates: List[Number]) -> Optional[float]:
    vals = _clean(replicates)
    if not vals:
        return None
    return statistics.mean(vals)


def compute_std(replicates: List[Number]) -> Optional[float]:
    """Sample standard deviation. Undefined (None) for fewer than 2 points."""
    vals = _clean(replicates)
    if len(vals) < 2:
        return None
    return statistics.stdev(vals)


def compute_removal(baseline_value: Number, current_value: Number) -> Optional[float]:
    """((Baseline - Current) / Baseline) * 100, guarding against div-by-zero.

    "Baseline" is the stage_1 row's value (the reference/untreated
    sample — see app/schemas/cycle.py::BASELINE_STAGE_ROLE), whatever
    plant name the operator has given it for this cycle.
    """
    if baseline_value is None or current_value is None:
        return None
    if baseline_value == 0:
        return None
    return ((baseline_value - current_value) / baseline_value) * 100.0


def round_or_none(value: Optional[float], ndigits: int = 4) -> Optional[float]:
    if value is None:
        return None
    return round(value, ndigits)
