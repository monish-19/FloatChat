"""Run the optional Postgres -> Neo4j graph synchronization job."""

from app.db.session import SessionLocal
from app.graph_sync import sync_graph


def main() -> None:
    db = SessionLocal()
    try:
        print(sync_graph(db).as_dict())
    finally:
        db.close()


if __name__ == "__main__":
    main()
