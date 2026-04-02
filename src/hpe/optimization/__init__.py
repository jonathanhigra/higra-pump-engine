"""HPE Optimization — Multi-objective design optimization with AI acceleration.

Combines classical algorithms with AI to efficiently explore the design space.

Algorithms:
- Evolutionary (NSGA-II, NSGA-III) for multi-objective optimization
- Bayesian Optimization for expensive search spaces (each eval = 1 CFD)
- Gradient (adjoint) via SU2 for continuous shape optimization
- Surrogate-assisted: AI models replace CFD for fast candidate evaluation

Objectives:
- Maximize design-point efficiency
- Minimize cavitation risk (maximize NPSH margin)
- Maximize robustness (multi-point performance)
- Minimize radial forces and pressure pulsations
- Meet manufacturing constraints (min thickness, draft angles)

Skills required:
- DEAP (NSGA-II/III)
- Optuna (Bayesian optimization)
- PyTorch (surrogate models)
- Multi-objective optimization theory
"""
