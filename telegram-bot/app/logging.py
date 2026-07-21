"""Безопасное логирование: токены и секреты маскируются в каждой записи."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from app.services.security.masking import mask_sensitive

LOG_FILE = "bot.log"


class SecretMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = mask_sensitive(str(record.getMessage()))
            record.args = ()
        except Exception:
            pass
        return True


def setup_logging(level: str = "INFO", log_file: str = LOG_FILE) -> str:
    root = logging.getLogger()
    root.setLevel(level.upper())
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(fmt)
    stream.addFilter(SecretMaskingFilter())

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(fmt)
    file_handler.addFilter(SecretMaskingFilter())

    root.handlers.clear()
    root.addHandler(stream)
    root.addHandler(file_handler)
    return str(Path(log_file).resolve())
