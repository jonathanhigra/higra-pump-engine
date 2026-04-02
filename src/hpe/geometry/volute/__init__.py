"""Volute (spiral casing) parametric design module.

Usage:
    from hpe.geometry.volute import generate_volute_from_sizing
    volute = generate_volute_from_sizing(sizing_result)
"""

def __getattr__(name: str):  # type: ignore[no-untyped-def]
    if name in ("generate_volute", "generate_volute_from_sizing"):
        from hpe.geometry.volute.volute_3d import generate_volute, generate_volute_from_sizing
        return {"generate_volute": generate_volute, "generate_volute_from_sizing": generate_volute_from_sizing}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["generate_volute", "generate_volute_from_sizing"]
