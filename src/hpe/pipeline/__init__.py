"""HPE Pipeline — Bidirectional CAE integration pipeline.

Inspired by ADT TURBOdesign Suite CAE integration. Automates the
full flow from geometry generation to CFD results without manual intervention.

Automated flow:
1. Geometry -> Mesh: Export STEP -> snappyHexMesh / cfMesh
2. Mesh -> Solver: BC configuration, numerical schemes, turbulence
3. Solver -> Execution: Queue submission (local or cloud)
4. Execution -> Post: Field extraction, surface integrals, metrics
5. Post -> Dashboard: Result visualization, comparison, report
6. Dashboard -> AI: Data feeds surrogate models and history

Differential vs ADT: HPE uses open-source solvers — zero software licensing cost.
"""
