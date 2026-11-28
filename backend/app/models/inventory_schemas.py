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
    description: str = ""
    category: str = "General"
    aliases: list[str] = Field(default_factory=list)
    data_origin: str = "SEEDED_DEMO"
    unit: str
    on_hand: float
    incoming: float
    allocated: float
    reserved: float = 0.0
    physical_available: float = 0.0
    net_availability: float
    projected_availability: float = 0.0
    reorder_threshold: float
    stock_status: Literal["HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"]
    lead_time_days: Optional[int] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    warehouse_locations: list[str] = Field(default_factory=list)


class MaterialStockUpdateRequest(BaseModel):
    """Operator request to update direct stock supply levels for a material."""

    on_hand: Optional[float] = Field(default=None, ge=0.0)
    incoming: Optional[float] = Field(default=None, ge=0.0)
    reorder_threshold: Optional[float] = Field(default=None, ge=0.0)
    reason: Optional[str] = Field(default=None, max_length=500)
    actor: Optional[str] = Field(default=None, max_length=120)


class InventoryOverviewResponse(BaseModel):
    """Aggregate inventory overview response."""

    total_materials: int
    low_stock_count: int
    out_of_stock_count: int
    materials: list[MaterialOverview]
