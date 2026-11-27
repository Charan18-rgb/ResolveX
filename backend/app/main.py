"""ResolveX FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.alerts_routes import alerts_router
from app.api.analysis_routes import analysis_router
from app.api.evaluation_routes import evaluation_router
from app.api.inventory_routes import inventory_router
from app.api.purchase_order_routes import procurement_router
from app.api.routes import router
from app.config import get_settings
from app.database.connection import init_db
from app.inventory.allocation_engine import recalculate_allocations
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.seed import seed_demo_data
from app.inventory.shortage_detector import sync_inventory_alerts
from app.models.schemas import ErrorDetail, ErrorResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize database and seed demo data on application startup."""
    settings = get_settings()
    init_db(settings.database_path)
    seed_demo_data(settings.database_path)
    recalculate_allocations(settings.database_path)
    evaluate_order_risks(settings.database_path)
    sync_inventory_alerts(settings.database_path)
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="AI-powered Natural Language Ambiguity Identification and Resolution System",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """Return HTTP errors using the unified ErrorResponse envelope."""
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
        }
        payload = ErrorResponse(
            error=ErrorDetail(
                code=code_map.get(exc.status_code, f"HTTP_{exc.status_code}"),
                message=str(exc.detail),
                details=None,
            )
        )
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump())

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Return validation errors using the unified ErrorResponse envelope."""
        payload = ErrorResponse(
            error=ErrorDetail(
                code="VALIDATION_ERROR",
                message="Request validation failed.",
                details=jsonable_encoder(exc.errors()),
            )
        )
        return JSONResponse(status_code=422, content=payload.model_dump())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
        """Catch-all handler that never leaks internal stack traces or secrets."""
        payload = ErrorResponse(
            error=ErrorDetail(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal error occurred.",
                details=None,
            )
        )
        return JSONResponse(status_code=500, content=payload.model_dump())

    app.include_router(router)
    app.include_router(analysis_router)
    app.include_router(inventory_router)
    app.include_router(procurement_router)
    app.include_router(alerts_router)
    app.include_router(evaluation_router)
    return app


app = create_app()
