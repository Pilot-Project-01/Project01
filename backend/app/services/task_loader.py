"""Load a hand-authored task from /tasks for serving to a candidate.

Security posture: two independent guards. (1) The served files live in a
`task-files/` subfolder and that subfolder is the only read-root — ANSWER_KEY.md
sits one level up, in the task folder but OUTSIDE task-files/, so it is not even
under the directory we read from. (2) The manifest is an *allowlist*: only files
it names are ever read, and each resolved path is confirmed to stay inside
task-files/, so a malicious manifest can't path-traverse out.
"""

import json
from pathlib import Path

from app.core.config import TASKS_DIR
from app.models.trace import TaskManifest


class TaskNotFoundError(Exception):
    pass


def _task_dir(task_id: str) -> Path:
    # Reject anything that isn't a plain folder name (no traversal, no separators).
    if not task_id or "/" in task_id or "\\" in task_id or task_id.startswith("."):
        raise TaskNotFoundError(task_id)
    # The task folder is a direct child of /tasks; the served files (and only
    # those) live in its task-files/ subfolder, which is our read-root.
    task_folder = (TASKS_DIR / task_id).resolve()
    if task_folder.parent != TASKS_DIR.resolve():
        raise TaskNotFoundError(task_id)
    path = task_folder / "task-files"
    if not path.is_dir():
        raise TaskNotFoundError(task_id)
    return path


def _read_within(base: Path, relative: str) -> str:
    target = (base / relative).resolve()
    if base.resolve() not in target.parents:
        raise TaskNotFoundError(f"{relative} escapes task dir")
    return target.read_text(encoding="utf-8")


def load_task(task_id: str) -> TaskManifest:
    base = _task_dir(task_id)
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))

    files = {
        sandbox_path: _read_within(base, disk_name)
        for sandbox_path, disk_name in manifest["candidate_files"].items()
    }

    return TaskManifest(
        task_id=manifest["task_id"],
        prompt=_read_within(base, manifest["prompt_file"]),
        agent_note=_read_within(base, manifest["agent_note_file"]),
        files=files,
        entry=manifest["entry"],
    )
