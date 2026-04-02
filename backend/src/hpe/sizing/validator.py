"""Physical input validation for sizing requests (#24).

Validates operating point parameters against physical bounds
before running any computation.
"""

from __future__ import annotations
from dataclasses import dataclass
from hpe.constants import Q_MIN, Q_MAX, H_MIN, H_MAX, RPM_MIN, RPM_MAX


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]
    warnings: list[str]


class PhysicsValidator:
    """Validates OperatingPoint parameters against physical limits."""

    @staticmethod
    def validate(flow_rate: float, head: float, rpm: float) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []

        if flow_rate <= 0:
            errors.append(f"Flow rate must be positive, got {flow_rate}")
        elif flow_rate < Q_MIN:
            errors.append(f"Flow rate {flow_rate:.2e} m³/s is below minimum {Q_MIN:.2e} m³/s")
        elif flow_rate > Q_MAX:
            errors.append(f"Flow rate {flow_rate:.1f} m³/s exceeds maximum {Q_MAX:.1f} m³/s")

        if head <= 0:
            errors.append(f"Head must be positive, got {head}")
        elif head < H_MIN:
            errors.append(f"Head {head:.2f} m is below minimum {H_MIN:.1f} m")
        elif head > H_MAX:
            errors.append(f"Head {head:.0f} m exceeds maximum {H_MAX:.0f} m")

        if rpm <= 0:
            errors.append(f"RPM must be positive, got {rpm}")
        elif rpm < RPM_MIN:
            errors.append(f"RPM {rpm:.0f} is below minimum {RPM_MIN:.0f}")
        elif rpm > RPM_MAX:
            errors.append(f"RPM {rpm:.0f} exceeds maximum {RPM_MAX:.0f}")

        # Warn on unusual combinations
        if not errors:
            from hpe.sizing.specific_speed import calc_specific_speed
            _, nq = calc_specific_speed(flow_rate, head, rpm)
            if nq < 5:
                warnings.append(f"Very low Nq={nq:.1f}. Correlation accuracy may be reduced.")
            if nq > 250:
                warnings.append(f"Very high Nq={nq:.1f}. Consider axial machine type.")

        return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
