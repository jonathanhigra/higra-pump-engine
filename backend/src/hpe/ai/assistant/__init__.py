"""Engineering assistant — result interpretation and design recommendations.

Usage:
    from hpe.ai.assistant import interpret_sizing, recommend_improvements
"""

from hpe.ai.assistant.interpreter import interpret_performance, interpret_sizing
from hpe.ai.assistant.recommender import Recommendation, recommend_improvements

__all__ = [
    "interpret_sizing",
    "interpret_performance",
    "recommend_improvements",
    "Recommendation",
]
