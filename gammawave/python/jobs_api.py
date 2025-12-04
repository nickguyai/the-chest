import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, UploadFile, HTTPException, Query
import platform
import subprocess
from pydantic import BaseModel, Field

from config_manager import config
from job_queue import job_queue

logger = logging.getLogger(__name__)


class JobSummary(BaseModel):
    id: str
    status: str
    title: Optional[str] = None
    summary: Optional[str] = None
    created_at: str
    updated_at: str
    error: Optional[str] = None


class EnqueueResponse(BaseModel):
    job: JobSummary


class ReadabilityUpdateRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Enhanced readability text")


router = APIRouter(prefix="/api/v1", tags=["jobs"])


@router.post("/transcription_jobs", response_model=EnqueueResponse)
async def enqueue_transcription_job(file: UploadFile):
    """Create a transcription job and return immediately."""
    # Ensure directories
    config.ensure_directories()

    # Persist uploaded file to a temporary path under recordings; job_queue will move it
    tmp_dir = config.recordings_dir / "_incoming"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    # Generate a unique filename to avoid collisions
    orig_name = (file.filename or "audio.wav")
    ext = ''.join(Path(orig_name).suffixes) or '.wav'
    unique = datetime.now().strftime('%Y%m%d_%H%M%S_%f') + '_' + uuid4().hex
    tmp_path = tmp_dir / f"upload_{unique}{ext}"
    try:
        with open(tmp_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        logger.error(f"Failed saving uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

    # Enqueue for processing
    record = await job_queue.enqueue(tmp_path)
    job = JobSummary(
        id=record.id,
        status=record.status.value,
        title=record.title,
        summary=record.summary,
        created_at=record.created_at,
        updated_at=record.updated_at,
        error=record.error,
    )
    return EnqueueResponse(job=job)


@router.get("/transcription_jobs", response_model=List[JobSummary])
async def list_jobs():
    jobs = job_queue.list_jobs()
    return [JobSummary(**j) for j in jobs]


@router.get("/transcription_jobs/{job_id}")
async def get_job(job_id: str) -> Dict[str, Any]:
    record = job_queue.get_job(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")
    data = record.to_dict()
    # Attach result if available
    result = job_queue.read_job_result(job_id)
    if result:
        data["result"] = result
    return data


@router.get("/transcriptions/search")
async def search_transcriptions(q: str = Query("", description="Search text")) -> Dict[str, Any]:
    results = job_queue.search(q)
    return {"results": results}


@router.delete("/transcription_jobs/{job_id}")
async def delete_job(job_id: str) -> Dict[str, Any]:
    try:
        ok = job_queue.delete_job(job_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"status": "ok"}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/transcription_jobs/{job_id}/open")
async def open_job_folder(job_id: str) -> Dict[str, Any]:
    d = job_queue.get_job_dir(job_id)
    if not d:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        system = platform.system().lower()
        if "darwin" in system or system == "macos" or system == "darwin":
            subprocess.Popen(["open", str(d)])
        elif "windows" in system:
            subprocess.Popen(["explorer", str(d)])
        else:
            subprocess.Popen(["xdg-open", str(d)])
        return {"status": "ok", "path": str(d)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {e}")


@router.post("/transcription_jobs/{job_id}/readability")
async def save_readability(job_id: str, payload: ReadabilityUpdateRequest) -> Dict[str, Any]:
    record = job_queue.get_job(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        readability = job_queue.update_readability(job_id, payload.text)
        return {"status": "ok", "readability": readability}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Transcription result not found")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcription_jobs/{job_id}/retry")
async def retry_job(job_id: str) -> Dict[str, Any]:
    """Retry a failed transcription job using the same audio file and provider."""
    record = job_queue.get_job(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if record.status.value != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")
    
    if not record.audio_path:
        raise HTTPException(status_code=400, detail="Job audio file not found")
    
    try:
        # Retry the job by re-enqueuing it
        retry_record = await job_queue.retry_job(job_id)
        job = JobSummary(
            id=retry_record.id,
            status=retry_record.status.value,
            title=retry_record.title,
            summary=retry_record.summary,
            created_at=retry_record.created_at,
            updated_at=retry_record.updated_at,
            error=retry_record.error,
        )
        return {"status": "ok", "job": job}
    except Exception as e:
        logger.error(f"Failed to retry job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retry job: {str(e)}")
