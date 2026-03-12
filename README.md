# PrintPrice OS Phase 9 - Execution Runtime Bootstrap

This directory contains the runnable skeleton for the PrintPrice OS Phase 9 Distributed Execution Fabric, adapted for MySQL 8 and Kubernetes/Plesk parity.

## Directory Structure
- `api-gateway/`: Express.js Edge. Runs Admission Control and triggers Temporal workflows.
- `workers/`: Node.js Temporal Workers. Contains Activities (MySQL sync, Preflight) and the GlobalJobWorkflow.
- `observability/`: OpenTelemetry Collector and Prometheus configs.
- `mysql-init/`: MySQL 8 initialization scripts (DDL).

## Instructions to Run Locally

### 1. Start the Dependencies
Launch the underlying platform engines (Temporal, MySQL, RabbitMQ, Observability):
```bash
docker compose -f docker-compose.temporal.yml up -d
docker compose -f docker-compose.local.yml up -d
```

### 2. Verify Infrastructure
- **Temporal Web UI**: `http://localhost:8080`
- **RabbitMQ Management**: `http://localhost:15672` (guest/guest)
- **Grafana**: `http://localhost:3000` (admin/admin)
- **Prometheus**: `http://localhost:9090`

### 3. Simulate a PrintPrice OS Job
The API Gateway exposes `POST /jobs` to ingest a new PDF requirement.

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -H "x-tier: PREMIUM" \
  -d '{
    "assetUrl": "s3://printprice-assets/test.pdf",
    "specs": { "cover": "hardcover", "pages": 120 }
  }'
```

### 4. Watch the Saga Execute
1. Check the **Temporal UI** at `http://localhost:8080` to see the workflow `job-workflow-<UUID>` transition through `PREFLIGHTING`, `PRICING`, and `MATCHMAKING`.
2. Connect to the MySQL instance (Port `3306`, User `ppos_user`, Pass `ppos_pass`) and query the `canonical_job_registry`:
   ```sql
   SELECT current_stage FROM printprice_os.canonical_job_registry;
   ```
