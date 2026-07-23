"""Atomically update selected dotenv keys from a JSON object on stdin."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path


KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
LINE_PATTERN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")


def main() -> None:
    target = Path(sys.argv[1])
    updates = json.load(sys.stdin)
    if not isinstance(updates, dict):
        raise TypeError("stdin must contain a JSON object")

    clean_updates: dict[str, str] = {}
    for key, value in updates.items():
        if not isinstance(key, str) or not KEY_PATTERN.fullmatch(key):
            raise ValueError("invalid environment variable name")
        if not isinstance(value, str) or any(char in value for char in "\r\n\0"):
            raise ValueError(f"invalid value for {key}")
        clean_updates[key] = value

    original = target.read_text(encoding="utf-8").splitlines()
    written: set[str] = set()
    result: list[str] = []
    for line in original:
        match = LINE_PATTERN.match(line)
        key = match.group(1) if match else None
        if key in clean_updates:
            if key not in written:
                result.append(f"{key}={clean_updates[key]}")
                written.add(key)
            continue
        result.append(line)

    for key, value in clean_updates.items():
        if key not in written:
            result.append(f"{key}={value}")

    current_mode = target.stat().st_mode
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        dir=target.parent,
        prefix=f".{target.name}.",
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
        handle.write("\n".join(result) + "\n")
        handle.flush()
        os.fsync(handle.fileno())

    os.chmod(temporary, current_mode)
    os.replace(temporary, target)


if __name__ == "__main__":
    main()
