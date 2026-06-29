"""The answer key must never reach a candidate. These tests fail loudly if it does."""

from fastapi.testclient import TestClient

from app.core.config import TASKS_DIR
from app.services.task_loader import TaskNotFoundError, _read_within, _task_dir, load_task
from main import app

client = TestClient(app)

ANSWER_KEY_MARKER = "ANSWER_KEY"


def test_load_task_serves_only_candidate_files():
    task = load_task("v1-cart-discount")
    assert set(task.files) == {"src/cart.ts", "src/money.ts", "src/cart.test.ts"}
    assert task.entry == "src/cart.ts"


def test_answer_key_never_served():
    task = load_task("v1-cart-discount")
    blob = task.model_dump_json()
    # The answer key's contents and filename appear nowhere in the served payload.
    assert ANSWER_KEY_MARKER not in blob
    assert "src/ANSWER_KEY.md" not in task.files
    assert "ANSWER_KEY.md" not in task.files


def test_route_returns_task():
    resp = client.get("/api/v1/tasks/v1-cart-discount")
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_id"] == "v1-cart-discount"
    assert "src/cart.ts" in body["files"]
    assert ANSWER_KEY_MARKER not in resp.text


def test_route_404_on_unknown_task():
    assert client.get("/api/v1/tasks/does-not-exist").status_code == 404


def test_path_traversal_rejected():
    for bad in ["../tasks", "..", "foo/bar", ".hidden", "foo\\bar"]:
        try:
            load_task(bad)
            raised = False
        except TaskNotFoundError:
            raised = True
        assert raised, f"expected {bad!r} to be rejected"


def test_read_root_is_task_files_subdir():
    # The loader reads from <task>/task-files, not the task folder itself.
    base = _task_dir("v1-cart-discount")
    assert base.name == "task-files"
    assert base.parent.name == "v1-cart-discount"


def test_answer_key_lives_outside_read_root():
    # The file exists on disk one level ABOVE the read-root, so it is not even
    # under the directory the loader serves from.
    base = _task_dir("v1-cart-discount")
    assert (base.parent / "ANSWER_KEY.md").is_file()
    assert not (base / "ANSWER_KEY.md").exists()


def test_read_within_blocks_escaping_the_read_root():
    # Even a manifest that tried to name the answer key by relative path is rejected.
    base = _task_dir("v1-cart-discount")
    for escape in ["../ANSWER_KEY.md", "../../tasks/v1-cart-discount/ANSWER_KEY.md"]:
        try:
            _read_within(base, escape)
            raised = False
        except TaskNotFoundError:
            raised = True
        assert raised, f"expected {escape!r} to be blocked"


def test_tasks_dir_resolves():
    assert TASKS_DIR.is_dir()
