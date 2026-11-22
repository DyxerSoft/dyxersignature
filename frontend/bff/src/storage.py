import os
from pathlib import Path
from typing import Optional

STORAGE_ROOT = Path(os.getenv("STORAGE_PATH", "./data/storage"))

class StorageManager:
    def __init__(self, root: Optional[Path] = None):
        self.root = root or STORAGE_ROOT
        self.scans_dir = self.root / "scans"
        self.crops_dir = self.root / "crops"
        self.scans_dir.mkdir(parents=True, exist_ok=True)
        self.crops_dir.mkdir(parents=True, exist_ok=True)

    def save_scan(self, job_id: str, filename: str, content: bytes) -> Path:
        job_scan_dir = self.scans_dir / job_id
        job_scan_dir.mkdir(parents=True, exist_ok=True)
        target_path = job_scan_dir / filename
        target_path.write_bytes(content)
        return target_path

    def get_scan_path(self, job_id: str) -> Optional[Path]:
        job_scan_dir = self.scans_dir / job_id
        if not job_scan_dir.exists():
            return None
        files = list(job_scan_dir.glob("*"))
        return files[0] if files else None

    def save_crop(self, job_id: str, signature_id: str, content: bytes) -> Path:
        job_crop_dir = self.crops_dir / job_id
        job_crop_dir.mkdir(parents=True, exist_ok=True)
        target_path = job_crop_dir / f"{signature_id}.png"
        target_path.write_bytes(content)
        return target_path

    def get_crop_path(self, job_id: str, signature_id: str) -> Optional[Path]:
        crop_path = self.crops_dir / job_id / f"{signature_id}.png"
        return crop_path if crop_path.exists() else None
