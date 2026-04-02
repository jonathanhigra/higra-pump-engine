# Getting Started with HPE

## Installation

```bash
git clone https://github.com/jonathanhigra/higra-pump-engine.git
cd higra-pump-engine
pip install -e ".[dev]"
```

For geometry features (CadQuery):
```bash
pip install -e ".[geometry]"
```

For AI/ML features:
```bash
pip install -e ".[ai,optimization]"
```

## Your First Pump Design

### 1. Define the operating point

```python
from hpe.core.models import OperatingPoint

op = OperatingPoint(
    flow_rate=0.05,    # 50 L/s = 180 m3/h
    head=30.0,         # 30 meters
    rpm=1750,          # 1750 rev/min
)
```

### 2. Run 1D sizing

```python
from hpe.sizing import run_sizing

sizing = run_sizing(op)
print(f"D2 = {sizing.impeller_d2*1000:.0f} mm")
print(f"Nq = {sizing.specific_speed_nq:.0f}")
print(f"Efficiency = {sizing.estimated_efficiency:.1%}")
print(f"Power = {sizing.estimated_power/1000:.1f} kW")
```

### 3. Generate 3D geometry

```python
from hpe.geometry.runner import generate_runner_from_sizing
from hpe.geometry.runner.export import export_runner

runner = generate_runner_from_sizing(sizing)
export_runner(runner, "my_pump.step")
```

### 4. Analyze performance

```python
from hpe.physics import generate_curves, analyze_stability

curves = generate_curves(sizing)
stability = analyze_stability(sizing)

print(f"BEP flow: {stability.bep_flow*3600:.0f} m3/h")
print(f"BEP efficiency: {stability.bep_efficiency:.1%}")
```

### 5. Optimize

```python
from hpe.optimization import run_optimization
from hpe.optimization.problem import OptimizationProblem

problem = OptimizationProblem.default(0.05, 30.0, 1750)
result = run_optimization(problem, method="nsga2", pop_size=40, n_gen=50)

best = result.best_efficiency
print(f"Best efficiency: {best['objectives']['efficiency']:.1%}")
```

### 6. Get AI recommendations

```python
from hpe.ai.assistant import interpret_sizing, recommend_improvements
from hpe.physics.performance import evaluate_design_point

perf = evaluate_design_point(sizing)
print(interpret_sizing(sizing))

recs = recommend_improvements(sizing, perf)
for r in recs:
    print(f"[{r.priority}] {r.parameter}: {r.reason}")
```

## CLI Usage

All operations are available via command line:

```bash
# Quick sizing
hpe sizing -Q 0.05 -H 30 -n 1750

# With STEP export
hpe sizing -Q 0.05 -H 30 -n 1750 --export pump.step

# Performance curves (CSV output)
hpe curves -Q 0.05 -H 30 -n 1750 -o curves.csv

# Stability analysis
hpe analyze -Q 0.05 -H 30 -n 1750

# Optimization
hpe optimize -Q 0.05 -H 30 -n 1750 --method nsga2 --gen 50

# CFD case
hpe cfd -Q 0.05 -H 30 -n 1750 -o ./case_pump
```
