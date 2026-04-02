"""WebSocket endpoint for real-time optimization progress (#25).

Protocol:
    Client → sends one JSON message immediately after connect:
        { "flow_rate": float, "head": float, "rpm": float,
          "method": "nsga2"|"bayesian",
          "pop_size": int, "n_gen": int, "seed": int }

    Server → streams progress messages:
        { "type": "started",   "n_gen": int, "pop_size": int }
        { "type": "progress",  "gen": int, "n_gen": int,
          "n_pareto": int, "eta_max": float, "npsh_min": float,
          "elapsed_s": float, "total_evals": int }
        { "type": "done",      "pareto_front": [...], "n_evaluations": int,
          "best_efficiency": {...}, "best_npsh": {...}, "elapsed_s": float }
        { "type": "error",     "message": str }
"""

from __future__ import annotations

import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["optimize-ws"])

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hpe-opt")


@router.websocket("/ws/optimize")
async def ws_optimize(ws: WebSocket) -> None:
    """Stream NSGA-II or Bayesian optimization progress over WebSocket."""
    await ws.accept()

    try:
        # ── Receive parameters ────────────────────────────────────────────────
        raw = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
        params: Dict[str, Any] = json.loads(raw)

        flow_rate: float = float(params["flow_rate"])
        head: float = float(params["head"])
        rpm: float = float(params["rpm"])
        method: str = params.get("method", "nsga2")
        pop_size: int = int(params.get("pop_size", 20))
        n_gen: int = int(params.get("n_gen", 30))
        seed: int = int(params.get("seed", 42))

        # Basic sanity
        if flow_rate <= 0 or head <= 0 or rpm <= 0:
            await ws.send_json({"type": "error", "message": "Parâmetros inválidos."})
            await ws.close()
            return

        await ws.send_json({"type": "started", "n_gen": n_gen, "pop_size": pop_size, "method": method})

        # ── Asyncio queue for thread→coroutine communication ─────────────────
        queue: asyncio.Queue[Dict[str, Any] | None] = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def _progress(msg: Dict[str, Any]) -> None:
            """Called from optimizer thread — schedules enqueue in event loop."""
            loop.call_soon_threadsafe(queue.put_nowait, msg)

        def _run_optimization() -> Any:
            from hpe.core.models import OperatingPoint
            from hpe.optimization.problem import OptimizationProblem

            op = OperatingPoint(flow_rate=flow_rate, head=head, rpm=rpm)
            problem = OptimizationProblem.default(flow_rate, head, rpm)

            if method == "nsga2":
                from hpe.optimization.nsga2 import run_nsga2
                result = run_nsga2(
                    problem,
                    pop_size=pop_size,
                    n_gen=n_gen,
                    seed=seed,
                    progress_callback=_progress,
                )
                return {
                    "pareto_front": result.pareto_front,
                    "n_evaluations": result.all_evaluations,
                    "best_efficiency": result.best_efficiency,
                    "best_npsh": result.best_npsh,
                }
            else:
                from hpe.optimization.bayesian import run_bayesian
                result = run_bayesian(problem, n_trials=n_gen, seed=seed)
                return {
                    "pareto_front": [{"variables": result["best_params"],
                                      "objectives": {"efficiency": result["best_value"]}}],
                    "n_evaluations": result["n_trials"],
                    "best_efficiency": None,
                    "best_npsh": None,
                }

        # ── Run optimizer in thread, consume queue ────────────────────────────
        t0 = time.monotonic()
        future = loop.run_in_executor(_executor, _run_optimization)

        while not future.done():
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=0.2)
                await ws.send_json({"type": "progress", **msg})
            except asyncio.TimeoutError:
                pass  # no progress yet, loop again
            except WebSocketDisconnect:
                future.cancel()
                return

        # Drain any remaining progress messages
        while not queue.empty():
            try:
                msg = queue.get_nowait()
                await ws.send_json({"type": "progress", **msg})
            except asyncio.QueueEmpty:
                break

        # ── Send final result ─────────────────────────────────────────────────
        try:
            result_data = future.result()
        except Exception as exc:
            await ws.send_json({"type": "error", "message": str(exc)})
            await ws.close()
            return

        await ws.send_json({
            "type": "done",
            "elapsed_s": round(time.monotonic() - t0, 2),
            **result_data,
        })
        await ws.close()

    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        await ws.send_json({"type": "error", "message": "JSON inválido."})
        await ws.close()
    except asyncio.TimeoutError:
        await ws.send_json({"type": "error", "message": "Timeout aguardando parâmetros."})
        await ws.close()
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
            await ws.close()
        except Exception:
            pass
