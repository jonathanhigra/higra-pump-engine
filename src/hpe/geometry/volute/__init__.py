"""Volute (spiral casing) parametric design module.

Equivalent to ADT TURBOdesign Volute. The volute has direct impact
on stage efficiency and pressure pulsations.

Features:
- Automatic volute area distribution
- Circumferential flow variation control at inlet
- Tongue radius definition for vibration control
- Single and twin entry volute support
- 3D surface export ready for CFD meshing
- Integration with runner meridional profile

Methods:
- Angular momentum conservation for initial sizing
- Streamline curvature method for outer contour
- Cross-section parametrization (circular, trapezoidal, rectangular)
"""
