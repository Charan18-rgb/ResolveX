"""
Evaluation API routes — language and inventory benchmark endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.ops_routes import require_operator
from app.config import Settings, get_settings
from app.database import operations as db_ops

evaluation_router = APIRouter(prefix="/api/evaluation", tags=["Evaluation"])


@evaluation_router.get("/ps6")
def get_ps6_evaluation(
    run_now: bool = False,
    adversarial_only: bool = False,
    _role: str = Depends(require_operator),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Return the latest language evaluation record from the database.
    Pass ?run_now=true to trigger a fresh evaluation run (or ?adversarial_only=true
    for the focused adversarial suite; requires GEMINI_API_KEY for best results).
    """
    if run_now:
        try:
            from app.evaluation.ps6_evaluator import run_ps6_evaluation
            result = run_ps6_evaluation(
                settings.database_path, adversarial_only=adversarial_only
            )
            return {"source": "fresh_run", "evaluation": result}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Language evaluation failed: {exc}")

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
    _role: str = Depends(require_operator),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Return the latest deterministic inventory evaluation result.
    Pass ?run_now=true to run a fresh evaluation (no Gemini required).
    """
    if run_now:
        try:
            from app.evaluation.ps2_evaluator import run_ps2_evaluation
            result = run_ps2_evaluation(settings.database_path)
            return {"source": "fresh_run", "evaluation": result}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Inventory evaluation failed: {exc}")

    # Inventory evaluation is always deterministic — always run on demand
    try:
        from app.evaluation.ps2_evaluator import run_ps2_evaluation
        result = run_ps2_evaluation(settings.database_path)
        return {"source": "computed", "evaluation": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inventory evaluation failed: {exc}")
