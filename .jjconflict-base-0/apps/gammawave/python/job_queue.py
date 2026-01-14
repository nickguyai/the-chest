import asyncio
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, List

from config_manager import config
from gemini_transcriber import GeminiAudioTranscriber

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


@dataclass
class JobRecord:
    id: str
    status: JobStatus
    created_at: str
    updated_at: str
    provider: str = "gemini"
    audio_path: Optional[str] = None
    result_path: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status.value
        return data


class TranscriptionJobQueue:
    def __init__(self):
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self.transcriber = None  # Lazy init to avoid import-time API usage

    def _jobs_dir(self) -> Path:
        # Use the same recordings directory; each job lives in a timestamp directory
        return config.recordings_dir

    def _job_dir(self, job_id: str) -> Path:
        return self._jobs_dir() / job_id

    def _job_meta_path(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "job.json"

    def _write_job(self, record: JobRecord) -> None:
        d = self._job_dir(record.id)
        d.mkdir(parents=True, exist_ok=True)
        with open(self._job_meta_path(record.id), "w") as f:
            json.dump(record.to_dict(), f, indent=2)

    def _read_job(self, job_id: str) -> Optional[JobRecord]:
        p = self._job_meta_path(job_id)
        if not p.exists():
            return None
        try:
            with open(p, "r") as f:
                data = json.load(f)
            raw_status = (data.get("status") or "").lower()
            # Backward compatibility: treat 'queued' as 'pending'
            if raw_status == "queued":
                raw_status = "pending"
            return JobRecord(
                id=job_id,
                status=JobStatus(raw_status or "pending"),
                created_at=data.get("created_at", datetime.utcnow().isoformat()),
                updated_at=data.get("updated_at", datetime.utcnow().isoformat()),
                provider=data.get("provider", "gemini"),
                audio_path=data.get("audio_path"),
                result_path=data.get("result_path"),
                title=data.get("title"),
                summary=data.get("summary"),
                error=data.get("error"),
            )
        except Exception as e:
            logger.error(f"Failed reading job {job_id}: {e}")
            return None

    def _list_jobs(self) -> List[JobRecord]:
        jobs: List[JobRecord] = []
        base = self._jobs_dir()
        if not base.exists():
            return jobs
        for child in sorted(base.iterdir(), key=lambda x: x.name, reverse=True):
            meta = child / "job.json"
            if meta.exists():
                jr = self._read_job(child.name)
                if jr:
                    jobs.append(jr)
        return jobs

    async def enqueue(self, audio_path: Path, provider: str = "gemini") -> JobRecord:
        # Use timestamp as job id to match recordings dir semantics
        now = datetime.now()
        job_id = now.strftime("%Y-%m-%d_%H-%M-%S")
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        # Move audio into job dir
        dest_audio = job_dir / audio_path.name
        if audio_path != dest_audio:
            try:
                audio_path.replace(dest_audio)
            except Exception:
                # Fallback to copy if replace fails across FS
                import shutil
                shutil.copy2(audio_path, dest_audio)

        record = JobRecord(
            id=job_id,
            status=JobStatus.pending,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            provider=provider,
            audio_path=str(dest_audio),
        )
        self._write_job(record)
        await self.queue.put(job_id)
        logger.info(f"transcription job sent: {job_id}")
        return record

    # Public helpers for API layer
    def get_job_dir(self, job_id: str) -> Optional[Path]:
        d = self._job_dir(job_id)
        try:
            # Ensure the path is within the recordings directory
            base = self._jobs_dir().resolve()
            candidate = d.resolve()
            if not str(candidate).startswith(str(base)):
                return None
            return candidate if candidate.exists() else None
        except Exception:
            return None

    def delete_job(self, job_id: str) -> bool:
        record = self._read_job(job_id)
        if not record:
            return False
        # Do not allow deletion while pending/processing
        if record.status in {JobStatus.pending, JobStatus.processing}:
            raise RuntimeError("Job is in progress and cannot be deleted")
        d = self.get_job_dir(job_id)
        if not d:
            return False
        import shutil
        shutil.rmtree(d, ignore_errors=True)
        return True

    async def _ensure_transcriber(self):
        if self.transcriber is None:
            # Lazy-init transcriber
            self.transcriber = GeminiAudioTranscriber()

    async def _process_one(self, job_id: str):
        record = self._read_job(job_id)
        if not record:
            logger.warning(f"Job {job_id} disappeared before processing")
            return

        try:
            await self._ensure_transcriber()
            record.status = JobStatus.processing
            record.updated_at = datetime.utcnow().isoformat()
            self._write_job(record)
            logger.info(f"transcription job started: {job_id}")

            # Run transcription
            result = await self.transcriber.transcribe_audio(record.audio_path)

            # Save structured results into job dir (mirrors existing behavior)
            job_dir = self._job_dir(job_id)
            json_path = job_dir / "transcription.json"
            with open(json_path, "w") as f:
                json.dump({
                    "title": result.title,
                    "speech_segments": [seg.dict() for seg in result.speech_segments],
                    "summary": result.summary
                }, f, indent=2)

            # Save summary text
            summary_path = job_dir / "summary.txt"
            with open(summary_path, "w") as f:
                f.write(f"Title: {result.title}\n\nSummary:\n{result.summary}")

            record.status = JobStatus.completed
            record.result_path = str(json_path)
            record.title = result.title
            record.summary = result.summary
            record.updated_at = datetime.utcnow().isoformat()
            self._write_job(record)
            logger.info(f"transcription job completed: {job_id}")
        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            record.status = JobStatus.failed
            record.error = str(e)
            record.updated_at = datetime.utcnow().isoformat()
            self._write_job(record)

    async def worker_loop(self):
        logger.info("Transcription worker started")
        while not self._stop_event.is_set():
            try:
                job_id = await asyncio.wait_for(self.queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            try:
                await self._process_one(job_id)
            finally:
                self.queue.task_done()

        logger.info("Transcription worker stopped")

    async def start(self):
        # Requeue any jobs that are marked queued/processing on disk
        for job in self._list_jobs():
            if job.status in {JobStatus.pending, JobStatus.processing}:
                await self.queue.put(job.id)
                logger.info(f"Re-queued pending job {job.id}")
        self._stop_event.clear()
        if not self._worker_task or self._worker_task.done():
            self._worker_task = asyncio.create_task(self.worker_loop())

    async def stop(self):
        self._stop_event.set()
        if self._worker_task:
            await asyncio.sleep(0)  # yield to let loop check stop
            self._worker_task.cancel()
            try:
                await self._worker_task
            except Exception:
                pass

    # Public query helpers
    def get_job(self, job_id: str) -> Optional[JobRecord]:
        return self._read_job(job_id)

    def list_jobs(self) -> List[Dict[str, Any]]:
        return [j.to_dict() for j in self._list_jobs()]

    def read_job_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        p = self._job_dir(job_id) / "transcription.json"
        if not p.exists():
            return None
        try:
            with open(p, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed reading result for {job_id}: {e}")
            return None

    def search(self, query: str) -> List[Dict[str, Any]]:
        q = (query or "").strip().lower()
        if not q:
            return []
        results: List[Dict[str, Any]] = []
        for job in self._list_jobs():
            data = self.read_job_result(job.id)
            if not data:
                continue
            title = (data.get("title") or "").lower()
            summary = (data.get("summary") or "").lower()
            segments = data.get("speech_segments") or []
            match = False
            if q in title or q in summary:
                match = True
            else:
                for seg in segments:
                    if q in (seg.get("content") or "").lower():
                        match = True
                        break
            if match:
                results.append({
                    "job_id": job.id,
                    "title": data.get("title"),
                    "summary": data.get("summary"),
                })
        return results


# Global queue instance
job_queue = TranscriptionJobQueue()
