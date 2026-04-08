"""HPE PINN — Physics-Informed Neural Networks para turbomáquinas."""

from hpe.ai.pinn.model import PINNConfig, PINNResult, PumpPINN
from hpe.ai.pinn.losses import (
    euler_loss,
    continuity_loss,
    efficiency_bound_loss,
    total_pinn_loss,
)

__all__ = [
    "PINNConfig",
    "PINNResult",
    "PumpPINN",
    "euler_loss",
    "continuity_loss",
    "efficiency_bound_loss",
    "total_pinn_loss",
]
