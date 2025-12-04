import pytest
from fastapi.testclient import TestClient
from realtime_server import app
from unittest.mock import MagicMock, patch

client = TestClient(app)


def test_save_readability_success():
    with patch('jobs_api.job_queue') as mock_queue:
        mock_queue.get_job.return_value = MagicMock()
        mock_queue.update_readability.return_value = {
            "text": "Enhanced text",
            "updated_at": "2024-01-01T00:00:00Z"
        }

        response = client.post(
            "/api/v1/transcription_jobs/demo-job/readability",
            json={"text": "Enhanced text"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["readability"]["text"] == "Enhanced text"
        mock_queue.update_readability.assert_called_once_with("demo-job", "Enhanced text")


def test_save_readability_job_missing():
    with patch('jobs_api.job_queue') as mock_queue:
        mock_queue.get_job.return_value = None

        response = client.post(
            "/api/v1/transcription_jobs/missing-job/readability",
            json={"text": "irrelevant"}
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Job not found"
