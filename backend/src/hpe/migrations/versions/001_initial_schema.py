"""Initial schema — projects, sizing, geometry, simulations, performance.

Revision ID: 001
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("machine_type", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "operating_points",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("flow_rate", sa.Float, nullable=False),
        sa.Column("head", sa.Float, nullable=False),
        sa.Column("rpm", sa.Float, nullable=False),
        sa.Column("fluid_type", sa.String(50), server_default="water"),
        sa.Column("fluid_density", sa.Float, server_default="998.2"),
        sa.Column("fluid_viscosity", sa.Float, server_default="0.001003"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "sizing_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("operating_point_id", sa.String(36), sa.ForeignKey("operating_points.id"), nullable=True),
        sa.Column("specific_speed_nq", sa.Float, nullable=False),
        sa.Column("impeller_type", sa.String(50), nullable=True),
        sa.Column("impeller_d2", sa.Float, nullable=False),
        sa.Column("impeller_d1", sa.Float, nullable=False),
        sa.Column("impeller_b2", sa.Float, nullable=False),
        sa.Column("blade_count", sa.Integer, nullable=False),
        sa.Column("beta1", sa.Float, nullable=False),
        sa.Column("beta2", sa.Float, nullable=False),
        sa.Column("estimated_efficiency", sa.Float, nullable=False),
        sa.Column("estimated_power", sa.Float, nullable=False),
        sa.Column("estimated_npsh_r", sa.Float, nullable=False),
        sa.Column("sigma", sa.Float, nullable=False),
        sa.Column("velocity_triangles", sa.JSON, nullable=True),
        sa.Column("meridional_profile", sa.JSON, nullable=True),
        sa.Column("warnings", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "geometry_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("sizing_result_id", sa.String(36), sa.ForeignKey("sizing_results.id"), nullable=True),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("parameters", sa.JSON, nullable=False),
        sa.Column("file_path_step", sa.String(500), nullable=True),
        sa.Column("file_path_stl", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sizing_result_id", sa.String(36), sa.ForeignKey("sizing_results.id"), nullable=False),
        sa.Column("geometry_version_id", sa.String(36), sa.ForeignKey("geometry_versions.id"), nullable=True),
        sa.Column("run_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("solver_config", sa.JSON, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("wall_time_seconds", sa.Float, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "performance_data",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("simulation_run_id", sa.String(36), sa.ForeignKey("simulation_runs.id"), nullable=False),
        sa.Column("flow_rate", sa.Float, nullable=False),
        sa.Column("head", sa.Float, nullable=False),
        sa.Column("hydraulic_efficiency", sa.Float, nullable=True),
        sa.Column("volumetric_efficiency", sa.Float, nullable=True),
        sa.Column("mechanical_efficiency", sa.Float, nullable=True),
        sa.Column("total_efficiency", sa.Float, nullable=True),
        sa.Column("power", sa.Float, nullable=True),
        sa.Column("torque", sa.Float, nullable=True),
        sa.Column("npsh_required", sa.Float, nullable=True),
        sa.Column("min_pressure_coefficient", sa.Float, nullable=True),
        sa.Column("source", sa.String(50), server_default="physics_1d"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "test_bench_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("machine_model", sa.String(100), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("flow_rate", sa.Float, nullable=True),
        sa.Column("head", sa.Float, nullable=True),
        sa.Column("rpm", sa.Float, nullable=True),
        sa.Column("measured_efficiency", sa.Float, nullable=True),
        sa.Column("measured_power", sa.Float, nullable=True),
        sa.Column("measured_npsh", sa.Float, nullable=True),
        sa.Column("measured_vibration", sa.Float, nullable=True),
        sa.Column("raw_data", sa.JSON, nullable=True),
        sa.Column("test_date", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("test_bench_records")
    op.drop_table("performance_data")
    op.drop_table("simulation_runs")
    op.drop_table("geometry_versions")
    op.drop_table("sizing_results")
    op.drop_table("operating_points")
    op.drop_table("projects")
