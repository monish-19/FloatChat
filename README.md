# FloatChat

A cinematic ocean-intelligence dashboard prototype for the ORION-PS-01 challenge. The project includes a FastAPI ingestion and query backend plus a Next.js landing experience with a live 3D ocean background.

## Stack

- Backend: Python + FastAPI
- Semantic search: `sentence-transformers/all-MiniLM-L6-v2` + FAISS (metadata index is stored in `backend/data/faiss`)
- Frontend: Next.js + React Three Fiber + Tailwind
- Docs: architecture.md and architecture.svg

## Run locally

### Backend

```powershell
docker compose up -d postgres neo4j
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
python scripts\seed_data.py
python scripts/sync_graph.py
python app/main.py
```

Neo4j is an optional graph layer. `sync_graph.py` mirrors Postgres floats,
profiles, measured variables, regions, adjacency, and detected anomalies using
parameterized Cypher. If Neo4j is stopped or `NEO4J_ENABLED=false`, the API
continues using the Phase 1-5 semantic, SQL, and LLM paths. Questions that ask
about similar anomalies across adjacent/deployed regions use graph traversal
when Neo4j is available. The web UI and `QueryResponse` contract are unchanged;
graph/debug details are included in the existing `summary` metadata.

The first semantic query downloads the MiniLM model if it is not already
cached. Profile metadata is indexed from the SQL database, and ingestion
updates the persisted FAISS index incrementally. If the optional native
dependencies are unavailable, query classification falls back to keywords.

To pull real Indian Ocean Argo data manually after the database is running:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.ingestion.argo_pull --lookback-hours 24
```

The same command can be run from cron, Windows Task Scheduler, or another scheduler
for incremental ingestion. `POST /ingest` invokes the same pull-and-load cycle.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open:

- http://localhost:3000
- http://localhost:8000/docs

### Phase 8 benchmarks

Query timings are persisted in the `benchmark_runs` Postgres table. Run a
representative workload and regenerate the measured architecture docs with:

```powershell
cd backend
python scripts/benchmark.py --runs 60
python scripts/generate_architecture.py
```

`GET /metrics` returns live p50/p95 layer timings and the ten most recent
questions. The frontend proxies this endpoint at `/api/metrics`.
