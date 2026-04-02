"""Tests for database models and persistence helpers.

Uses SQLite in-memory for testing (no PostgreSQL required).
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from hpe.core.db_models import (
    Base,
    OperatingPointRecord,
    PerformanceDataPoint,
    Project,
    SimulationRun,
    SizingResultRecord,
)
from hpe.core.models import OperatingPoint
from hpe.core.persistence import (
    operating_point_to_record,
    sizing_result_to_record,
)
from hpe.sizing import run_sizing


@pytest.fixture
def db_session():
    """In-memory SQLite session for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    yield session
    session.close()


class TestDatabaseModels:
    def test_create_project(self, db_session: Session) -> None:
        project = Project(name="Test Pump", machine_type="centrifugal_pump")
        db_session.add(project)
        db_session.commit()

        result = db_session.query(Project).first()
        assert result is not None
        assert result.name == "Test Pump"
        assert result.id is not None

    def test_full_pipeline_persistence(self, db_session: Session) -> None:
        """Store a complete sizing pipeline in the database."""
        # 1. Create project
        project = Project(name="HPE-001", machine_type="centrifugal_pump")
        db_session.add(project)
        db_session.flush()

        # 2. Store operating point
        op = OperatingPoint(flow_rate=0.05, head=30.0, rpm=1750)
        op_record = operating_point_to_record(op, project.id)
        db_session.add(op_record)
        db_session.flush()

        # 3. Run sizing and store result
        sizing = run_sizing(op)
        sr_record = sizing_result_to_record(sizing, project.id, op_record.id)
        db_session.add(sr_record)
        db_session.flush()

        # 4. Create a simulation run
        sim_run = SimulationRun(
            sizing_result_id=sr_record.id,
            run_type="physics_1d",
            status="completed",
        )
        db_session.add(sim_run)
        db_session.flush()

        # 5. Store performance data points
        from hpe.physics.curves import generate_curves
        from hpe.core.persistence import performance_to_data_point

        curves = generate_curves(sizing, n_points=5)
        for i, metrics in enumerate(curves.metrics):
            dp = performance_to_data_point(
                metrics, sim_run.id, curves.flow_rates[i],
            )
            db_session.add(dp)

        db_session.commit()

        # Verify
        assert db_session.query(Project).count() == 1
        assert db_session.query(OperatingPointRecord).count() == 1
        assert db_session.query(SizingResultRecord).count() == 1
        assert db_session.query(SimulationRun).count() == 1
        assert db_session.query(PerformanceDataPoint).count() == 5

        # Verify data integrity
        stored_sizing = db_session.query(SizingResultRecord).first()
        assert stored_sizing.impeller_d2 == pytest.approx(sizing.impeller_d2)
        assert stored_sizing.blade_count == sizing.blade_count
        assert stored_sizing.velocity_triangles is not None

    def test_relationships(self, db_session: Session) -> None:
        project = Project(name="Test", machine_type="centrifugal_pump")
        db_session.add(project)
        db_session.flush()

        op_record = OperatingPointRecord(
            project_id=project.id,
            flow_rate=0.05, head=30.0, rpm=1750,
        )
        db_session.add(op_record)
        db_session.commit()

        # Navigate relationship
        assert len(project.operating_points) == 1
        assert project.operating_points[0].flow_rate == 0.05
