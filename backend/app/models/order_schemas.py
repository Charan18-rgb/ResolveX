"""Pydantic schemas for PS2 orders, allocations, and CRD risk."""

from typing import Literal, Optional
from pydantic import BaseModel


RiskCategory = Literal["ON_TRACK", "AT_RISK", "DELAYED", "BLOCKED"]


class MissingMaterialDetail(BaseModel):
    """Shortage breakdown for a single material on an order."""

    material_id: str
    material_name: str
    required_qty: float
    allocated_qty: float
    shortage_qty: float
    expected_available_date: Optional[str] = None


class OrderRiskItem(BaseModel):
    """CRD risk & projected ship date assessment for an order."""

    order_id: str
    customer_name: str
    product_code: str
    quantity: int
    customer_request_date: str
    status: str
    risk_category: RiskCategory
    projected_ship_date: Optional[str] = None
    ship_date_status: Literal["CALCULATED", "ESTIMATED", "UNAVAILABLE"]
    missing_materials: list[MissingMaterialDetail] = []
    explanation: str
    data_timestamp: str


class AllocationRecord(BaseModel):
    """Deterministic material allocation record."""

    order_id: str
    material_id: str
    required_qty: float
    allocated_qty: float
    priority_reason: str
    updated_at: str
