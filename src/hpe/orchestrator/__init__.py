"""HPE Orchestrator — Pipeline management, queues, and project versioning.

Manages the execution pipeline, controls simulation queues, coordinates
batch runs, and ensures traceability for each project.

Features:
- Pipeline management (sizing -> geometry -> CFD -> post)
- Batch simulation execution for parametric studies
- Execution queue control (local, cluster, cloud)
- Project versioning and parameter traceability
- Completion notification and failure alerts

Skills required:
- Celery + Redis task queue management
- PostgreSQL for project metadata
- Docker container orchestration
"""
