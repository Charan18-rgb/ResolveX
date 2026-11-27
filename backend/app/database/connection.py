"""SQLite database connectivity and schema initialization."""

from contextlib import contextmanager
import sqlite3
from pathlib import Path
from typing import Iterator

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    original_instruction TEXT NOT NULL,
    initial_context TEXT NULL,
    status TEXT NOT NULL,
    classification TEXT NULL,
    turn_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clarification_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    answered INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interpretations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resolved_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    resolved_instruction TEXT NOT NULL,
    direct_answer TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_drafts (
    conversation_id TEXT PRIMARY KEY,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    dataset_size INTEGER NOT NULL,
    precision REAL NOT NULL,
    recall REAL NOT NULL,
    f1_score REAL NOT NULL,
    resolution_accuracy REAL NOT NULL,
    false_clarification_rate REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confidence_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    assessment_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_confidence_conv_turn
    ON confidence_snapshots(conversation_id, turn_number, id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
    ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_turn
    ON messages(conversation_id, turn_number, id);

CREATE INDEX IF NOT EXISTS idx_clarifications_conv_norm
    ON clarification_questions(conversation_id, normalized_text);

CREATE INDEX IF NOT EXISTS idx_interpretations_conv_turn
    ON interpretations(conversation_id, turn_number);
"""


@contextmanager
def get_connection(db_path: str) -> Iterator[sqlite3.Connection]:
    """Yield a SQLite connection with foreign keys enabled, committing and closing safely."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: str) -> None:
    """Create database parent directory (if needed) and initialize tables/indexes."""
    path_obj = Path(db_path)
    if path_obj.parent and str(path_obj.parent) != ".":
        path_obj.parent.mkdir(parents=True, exist_ok=True)

    with get_connection(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.executescript(SCHEMA_SQL)

    from app.database.migrations import run_migrations

    run_migrations(db_path)


def check_db_connection(db_path: str) -> bool:
    """Verify SQLite connectivity with a lightweight query."""
    try:
        with get_connection(db_path) as conn:
            conn.execute("SELECT 1;").fetchone()
        return True
    except sqlite3.Error:
        return False
