# Local dev convenience wrapper. Supabase runs in Docker (via the CLI); the
# backend and frontend run natively for a fast reload loop. See docs/secrets.md
# for what each env var is and where it lives.

.DEFAULT_GOAL := help
.PHONY: help dev supabase supabase-stop backend frontend install db-reset test health stop

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

dev: supabase ## Start everything: Supabase + backend + frontend (Ctrl-C stops backend & frontend)
	@echo "→ backend on :8000, frontend on :3000  (Ctrl-C to stop both)"
	@trap 'kill 0' INT TERM EXIT; \
		( cd backend && uv run uvicorn main:app --reload --port 8000 ) & \
		( cd frontend && npm run dev ) & \
		wait

supabase: ## Start the local Supabase stack (idempotent; needs Docker running)
	@supabase start >/dev/null 2>&1 || true
	@supabase status >/dev/null 2>&1 && echo "✓ Supabase up (API http://127.0.0.1:54321)" \
		|| echo "✗ Supabase not up — is Docker Desktop running?"

supabase-stop: ## Stop the local Supabase stack (data persists)
	@supabase stop

backend: ## Run only the backend (:8000)
	cd backend && uv run uvicorn main:app --reload --port 8000

frontend: ## Run only the frontend (:3000)
	cd frontend && npm run dev

install: ## Install backend + frontend dependencies
	cd backend && uv sync
	cd frontend && npm install

db-reset: ## Re-apply supabase/migrations to the LOCAL db (wipes local data)
	supabase db reset

test: ## Run backend + frontend tests
	cd backend && uv run pytest -q
	cd frontend && npm test

health: ## Quick check that backend + Supabase are reachable
	@curl -s localhost:8000/health || echo "backend not running"
	@echo ""
	@supabase status >/dev/null 2>&1 && echo "Supabase: up" || echo "Supabase: down"

stop: supabase-stop ## Stop Supabase and any stray dev servers
	@pkill -f "uvicorn main:app" 2>/dev/null || true
	@echo "✓ stopped"
