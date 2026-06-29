from fastapi import APIRouter, HTTPException

from app.models.trace import TaskManifest
from app.services.task_loader import TaskNotFoundError, load_task

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskManifest)
def get_task(task_id: str) -> TaskManifest:
    try:
        return load_task(task_id)
    except TaskNotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
