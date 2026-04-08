"""Root conftest — adds backend/src to sys.path so all tests can import hpe.*."""
import sys
from pathlib import Path

BACKEND_SRC = Path(__file__).parent / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))
