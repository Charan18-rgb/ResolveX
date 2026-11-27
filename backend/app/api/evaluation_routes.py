"""
Evaluation API routes — PS6 and PS2 benchmark endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.database import operations as db_ops

evaluation_router = APIRouter(prefix="/api/evaluation", tags=["Evaluation"])


@evaluation_router.get("/ps6")
def get_ps6_evaluation(
    run_now: bool = False,
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Return the latest PS6 evaluation record from the database.
    Pass ?run_now=true to trigger a fresh evaluation run (requires GEMINI_API_KEY for best results).
    """
    if run_now:
        try:
            from app.evaluation.ps6_evaluator import run_ps6_evaluation
            result = run_ps6_evaluation(settings.database_path)
            return {"source": "fresh_run", "evaluation": result}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"PS6 evaluation failed: {exc}")

    record = db_ops.get_latest_evaluation_record(settings.database_path)
    if record is None:
        return {
            "source": "no_record",
            "message": "No evaluation has been run yet. POST ?run_now=true to trigger one.",
            "evaluation": None,
        }

    return {"source": "latest_record", "evaluation": record}


@evaluation_router.get("/ps2")
def get_ps2_evaluation(
    run_now: bool = False,
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Return the latest PS2 deterministic evaluation result.
    Pass ?run_now=true to run a fresh evaluation (no Gemini required).
    """
    if run_now:
        try:
            from app.evaluation.ps2_evaluator import run_ps2_evaluation
            result = run_ps2_evaluation(settings.database_path)
            return {"source": "fresh_run", "evaluation": result}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"PS2 evaluation failed: {exc}")

    # PS2 evaluation is always deterministic — always run on demand
    try:
        from app.evaluation.ps2_evaluator import run_ps2_evaluation
        result = run_ps2_evaluation(settings.database_path)
        return {"source": "computed", "evaluation": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PS2 evaluation failed: {exc}")
