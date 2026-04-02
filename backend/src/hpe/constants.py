"""HPE Engineering Constants — single source of truth for all named values.

All magic numbers used across sizing, geometry, and physics modules are
declared here. Import from this module instead of hardcoding literals.

References:
    - Gulich, J.F. (2014). Centrifugal Pumps, 3rd ed. Springer.
    - Stepanoff, A.J. (1957). Centrifugal and Axial Flow Pumps.
    - Pfleiderer, C. (1961). Die Kreiselpumpen. Springer.
    - Wiesner, F.J. (1967). A Review of Slip Factors for Centrifugal Impellers.
    - Surek, D. & Stempin, S. (2010). Angewandte Strömungsmechanik.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
G: float = 9.80665          # m/s² — standard gravity (ISO 80000-3)
RHO_WATER: float = 998.2    # kg/m³ — water at 20 °C
MU_WATER: float = 1.003e-3  # Pa·s  — dynamic viscosity at 20 °C
P_VAP_WATER: float = 2338.0 # Pa    — vapour pressure at 20 °C

# ---------------------------------------------------------------------------
# Blockage factors (Gulich 2014, §3.2.2)
# ---------------------------------------------------------------------------
BLOCKAGE_INLET: float = 0.90   # tau_1 — blade blockage at inlet
BLOCKAGE_OUTLET: float = 0.88  # tau_2 — blade blockage at outlet

# ---------------------------------------------------------------------------
# Hub geometry
# ---------------------------------------------------------------------------
D1_HUB_RATIO: float = 0.35     # d_nabe / d1  (Pfleiderer, §2.3)

# ---------------------------------------------------------------------------
# Blade geometry
# ---------------------------------------------------------------------------
BLADE_THICKNESS_DEFAULT: float = 0.003  # m — default thickness (3 mm)
BLADE_THICKNESS_RATIO: float = 0.03     # t / D2  for thickness estimation
AXIAL_LENGTH_FACTOR: float = 0.80       # L_axial / (r2 − r1)

# ---------------------------------------------------------------------------
# Inlet width
# ---------------------------------------------------------------------------
B1_ACCEL_FACTOR: float = 0.85   # b1 ≈ b2·(D2/D1)·factor (slight acceleration)

# ---------------------------------------------------------------------------
# Head coefficient — Gulich (2014), Table 3.1
# ---------------------------------------------------------------------------
PSI_MIN: float = 0.35
PSI_MAX: float = 1.30
PSI_SLOPE: float = 0.77       # ψ = 1.21 − PSI_SLOPE·(Nq/100)
PSI_INTERCEPT: float = 1.21
PSI_MIXED_FLOW: float = 0.50  # ψ for Nq ≥ 100

# ---------------------------------------------------------------------------
# Slip factor bounds (Wiesner 1967, Gulich §3.3)
# ---------------------------------------------------------------------------
SLIP_SIGMA_MIN: float = 0.50
SLIP_SIGMA_MAX: float = 0.95

# ---------------------------------------------------------------------------
# Blade angle limits [deg]
# ---------------------------------------------------------------------------
BETA1_MIN: float = 8.0
BETA1_MAX: float = 40.0
BETA2_MIN: float = 15.0
BETA2_MAX: float = 40.0

# ---------------------------------------------------------------------------
# Blade count (Pfleiderer correlation)
# ---------------------------------------------------------------------------
BLADE_COUNT_MIN: int = 5
BLADE_COUNT_MAX: int = 12
BLADE_COUNT_PFLEIDERER: float = 6.5  # coefficient in Pfleiderer formula

# ---------------------------------------------------------------------------
# Specific speed classification [Nq, metric, rpm·m³/s·m]
# ---------------------------------------------------------------------------
NQ_RADIAL_SLOW_MAX: float = 25.0
NQ_RADIAL_MAX: float = 70.0
NQ_MIXED_MAX: float = 160.0

# ---------------------------------------------------------------------------
# Cavitation
# ---------------------------------------------------------------------------
THOMA_C: float = 900.0       # Thoma correlation constant  σ = (Nq/C)^(4/3)
NPSH_LAMBDA: float = 1.10    # inlet NPSH coefficient λ_c (Gulich §6.2)
NPSH_HIGH_LIMIT: float = 8.0 # m — high NPSHr warning threshold

# ---------------------------------------------------------------------------
# Warning thresholds
# ---------------------------------------------------------------------------
U2_EROSION_LIMIT: float = 50.0  # m/s — tip speed erosion/noise threshold
W_RATIO_LIMIT: float = 1.40     # w1/w2 deceleration ratio limit (Gulich §3.6)
BETA2_LOW_LIMIT: float = 17.0   # deg — risk of diffuser separation below this

# ---------------------------------------------------------------------------
# Efficiency baseline (Gulich 2014, §3.9 — reference machine at Nq=35)
# ---------------------------------------------------------------------------
ETA_H_BASE: float = 0.92
ETA_V_BASE: float = 0.98
ETA_M_BASE: float = 0.975

# ---------------------------------------------------------------------------
# Uncertainty margins for correlation results (±fraction of nominal value)
# These reflect the scatter band of the correlations used.
# ---------------------------------------------------------------------------
UNCERTAINTY_D2: float = 0.03    # ±3 %
UNCERTAINTY_ETA: float = 0.05   # ±5 %
UNCERTAINTY_NPSH: float = 0.15  # ±15 %
UNCERTAINTY_BETA: float = 0.08  # ±8 % on blade angles
UNCERTAINTY_B2: float = 0.06    # ±6 % on outlet width

# ---------------------------------------------------------------------------
# Input validation bounds (physical limits)
# ---------------------------------------------------------------------------
Q_MIN: float = 1e-6   # m³/s
Q_MAX: float = 50.0   # m³/s
H_MIN: float = 0.5    # m
H_MAX: float = 5000.0 # m
RPM_MIN: float = 100.0
RPM_MAX: float = 25000.0
NQ_ABS_MIN: float = 2.0
NQ_ABS_MAX: float = 300.0
