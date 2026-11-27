"""Pydantic schemas for PS2 inventory, materials, and events."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


EventType = Literal[
    "STOCK_RECEIVED",
    "STOCK_ADJUSTED",
    "STOCK_RESERVED",
    "STOCK_RELEASED",
    "PURCHASE_ORDER_CREATED",
    "PURCHASE_ORDER_RECEIVED",
    "ORDER_CREATED",
    "ORDER_UPDATED",
    "ORDER_CANCELLED",
]


class InventoryEventRequest(BaseModel):
    """Incoming inventory or order event payload."""

    event_id: str = Field(..., min_length=1, max_length=128)
    event_type: EventType
    entity_ref: str = Field(..., min_length=1, max_length=128)
    timestamp: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    simulated: bool = False


class EventIngestionResponse(BaseModel):
    """Result of processing an inventory/order event."""

    event_id: str
    status: Literal["PROCESSED", "DUPLICATE", "MALFORMED"]
    message: str
    simulated: bool = False


class MaterialOverview(BaseModel):
    """Deterministic material balance and availability view."""

    id: str
    sku: str
    name: str
    unit: str
    on_hand: float
    incoming: float
    allocated: float
    net_availability: float
    reorder_threshold: float
    stock_status: Literal["HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"]
    lead_time_days: Optional[int] = None
    supplier_name: Optional[str] = None


class InventoryOverviewResponse(BaseModel):
    """Aggregate inventory overview response."""

    total_materials: int
    low_stock_count: int
    out_of_stock_count: int
    materials: list[MaterialOverview]
