"""Idempotent, fault-tolerant inventory & order event processor."""

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any

from app.database.connection import get_connection
from app.models.inventory_schemas import EventIngestionResponse, InventoryEventRequest


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_malformed_event(
    conn: sqlite3.Connection,
    event_id: str,
    event_type: str,
    entity_ref: str,
    payload: dict[str, Any],
    error_message: str,
    simulated: bool,
) -> None:
    now = _utc_now()
    conn.execute(
        """
        INSERT INTO inventory_events (
            event_id, event_type, entity_ref, payload_json, status, error_message, simulated, created_at
        ) VALUES (?, ?, ?, ?, 'MALFORMED', ?, ?, ?);
        """,
        (event_id, event_type, entity_ref, json.dumps(payload), error_message, int(simulated), now),
    )
    conn.execute(
        """
        INSERT INTO inventory_alerts (alert_type, severity, entity_id, message, acknowledged, created_at)
        VALUES ('FEED_FAILURE', 'HIGH', ?, ?, 0, ?);
        """,
        (event_id, f"Malformed event '{event_id}' ({event_type}): {error_message}", now),
    )


def process_raw_event(db_path: str, raw_data: dict[str, Any]) -> EventIngestionResponse:
    """Validate and process a raw event dict, quarantining malformed payloads."""
    event_id = str(raw_data.get("event_id") or f"malformed-{int(datetime.now(timezone.utc).timestamp() * 1000)}")
    event_type = str(raw_data.get("event_type") or "UNKNOWN")
    entity_ref = str(raw_data.get("entity_ref") or "UNKNOWN")
    simulated = bool(raw_data.get("simulated", False))

    try:
        event = InventoryEventRequest.model_validate(raw_data)
    except Exception as exc:
        with get_connection(db_path) as conn:
            dup = conn.execute(
                "SELECT status FROM inventory_events WHERE event_id = ?;", (event_id,)
            ).fetchone()
            if dup:
                return EventIngestionResponse(
                    event_id=event_id,
                    status="DUPLICATE",
                    message=f"Duplicate event '{event_id}' ignored.",
                    simulated=simulated,
                )
            _record_malformed_event(conn, event_id, event_type, entity_ref, raw_data, str(exc), simulated)
        return EventIngestionResponse(
            event_id=event_id,
            status="MALFORMED",
            message=f"Malformed event quarantined: {exc}",
            simulated=simulated,
        )

    return process_event(db_path, event)


def process_event(db_path: str, event: InventoryEventRequest) -> EventIngestionResponse:
    """Process a validated InventoryEventRequest transactionally and idempotently."""
    now = _utc_now()
    with get_connection(db_path) as conn:
        existing = conn.execute(
            "SELECT status FROM inventory_events WHERE event_id = ?;",
            (event.event_id,),
        ).fetchone()
        if existing:
            return EventIngestionResponse(
                event_id=event.event_id,
                status="DUPLICATE",
                message=f"Event '{event.event_id}' already recorded ({existing['status']}); skipped.",
                simulated=event.simulated,
            )

        try:
            _apply_event(conn, event, now)
        except ValueError as exc:
            _record_malformed_event(
                conn,
                event.event_id,
                event.event_type,
                event.entity_ref,
                event.payload,
                str(exc),
                event.simulated,
            )
            return EventIngestionResponse(
                event_id=event.event_id,
                status="MALFORMED",
                message=f"Event '{event.event_id}' failed validation: {exc}",
                simulated=event.simulated,
            )

        conn.execute(
            """
            INSERT INTO inventory_events (
                event_id, event_type, entity_ref, payload_json, status, error_message, simulated, created_at
            ) VALUES (?, ?, ?, ?, 'PROCESSED', NULL, ?, ?);
            """,
            (
                event.event_id,
                event.event_type,
                event.entity_ref,
                json.dumps(event.payload),
                int(event.simulated),
                now,
            ),
        )

    return EventIngestionResponse(
        event_id=event.event_id,
        status="PROCESSED",
        message=f"Event '{event.event_id}' ({event.event_type}) processed.",
        simulated=event.simulated,
    )


def _apply_event(conn: sqlite3.Connection, event: InventoryEventRequest, now: str) -> None:
    """Apply deterministic inventory or order state mutation inside active transaction."""
    et = event.event_type
    p = event.payload

    if et in {
        "STOCK_RECEIVED",
        "STOCK_ADJUSTED",
        "STOCK_RESERVED",
        "STOCK_RELEASED",
        "PURCHASE_ORDER_CREATED",
        "PURCHASE_ORDER_RECEIVED",
    }:
        bal = conn.execute(
            "SELECT on_hand, incoming, allocated FROM inventory_balances WHERE material_id = ?;",
            (event.entity_ref,),
        ).fetchone()
        if not bal:
            raise ValueError(f"Unknown material_id '{event.entity_ref}'.")

        on_hand = float(bal["on_hand"])
        incoming = float(bal["incoming"])
        allocated = float(bal["allocated"])
        qty = float(p.get("quantity", 0))

        if et == "STOCK_RECEIVED":
            if qty <= 0:
                raise ValueError("STOCK_RECEIVED requires positive quantity.")
            on_hand += qty
        elif et == "STOCK_ADJUSTED":
            on_hand += qty
            if on_hand < 0 and not p.get("allow_negative_adjustment", False):
                raise ValueError("STOCK_ADJUSTED would result in negative on_hand.")
        elif et == "STOCK_RESERVED":
            if qty <= 0 or (on_hand - allocated) < qty:
                raise ValueError("Insufficient unallocated on_hand stock to reserve.")
            allocated += qty
        elif et == "STOCK_RELEASED":
            if qty <= 0 or allocated < qty:
                raise ValueError("Cannot release more than currently allocated.")
            allocated -= qty
        elif et == "PURCHASE_ORDER_CREATED":
            if qty <= 0:
                raise ValueError("PURCHASE_ORDER_CREATED requires positive quantity.")
            incoming += qty
        elif et == "PURCHASE_ORDER_RECEIVED":
            if qty <= 0:
                raise ValueError("PURCHASE_ORDER_RECEIVED requires positive quantity.")
            on_hand += qty
            incoming = max(0.0, incoming - qty)

        conn.execute(
            """
            UPDATE inventory_balances
            SET on_hand = ?, incoming = ?, allocated = ?, updated_at = ?
            WHERE material_id = ?;
            """,
            (on_hand, incoming, allocated, now, event.entity_ref),
        )
        return

    if et == "ORDER_CREATED":
        qty = int(p.get("quantity", 0))
        if qty <= 0 or not p.get("customer_name") or not p.get("product_code") or not p.get("customer_request_date"):
            raise ValueError("ORDER_CREATED requires customer_name, product_code, positive quantity, and customer_request_date.")
        conn.execute(
            """
            INSERT INTO orders (
                id, customer_name, product_code, quantity, customer_request_date,
                processing_days, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?);
            """,
            (
                event.entity_ref,
                str(p["customer_name"]),
                str(p["product_code"]),
                qty,
                str(p["customer_request_date"]),
                int(p.get("processing_days", 1)),
                now,
                now,
            ),
        )
        return

    if et == "ORDER_UPDATED":
        order = conn.execute("SELECT id FROM orders WHERE id = ?;", (event.entity_ref,)).fetchone()
        if not order:
            raise ValueError(f"Unknown order_id '{event.entity_ref}'.")
        conn.execute(
            """
            UPDATE orders
            SET quantity = COALESCE(?, quantity),
                customer_request_date = COALESCE(?, customer_request_date),
                updated_at = ?
            WHERE id = ?;
            """,
            (p.get("quantity"), p.get("customer_request_date"), now, event.entity_ref),
        )
        return

    if et == "ORDER_CANCELLED":
        order = conn.execute("SELECT id FROM orders WHERE id = ?;", (event.entity_ref,)).fetchone()
        if not order:
            raise ValueError(f"Unknown order_id '{event.entity_ref}'.")
        conn.execute(
            "UPDATE orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?;",
            (now, event.entity_ref),
        )
