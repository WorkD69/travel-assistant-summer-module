"""Verify that a release ZIP is portable and contains no runtime artifacts."""
from __future__ import annotations

import argparse
import stat
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile


FORBIDDEN_PARTS = {
    ".env",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "bot.pid",
    "logs",
    "tmp",
}
FORBIDDEN_SUFFIXES = {".db", ".log", ".pyc", ".pyo", ".sqlite", ".sqlite3"}


def validate_archive(archive_path: Path, expected_root: str | None = None) -> list[str]:
    errors: list[str] = []
    try:
        with ZipFile(archive_path) as archive:
            members = archive.infolist()
            if not members:
                return ["archive is empty"]

            roots: set[str] = set()
            for info in members:
                member = PurePosixPath(info.filename)
                parts = member.parts
                if not parts:
                    continue
                roots.add(parts[0])

                if member.is_absolute() or ".." in parts or "\\" in info.filename:
                    errors.append(f"unsafe path: {info.filename}")
                if any(part.lower() in FORBIDDEN_PARTS for part in parts):
                    errors.append(f"runtime artifact: {info.filename}")
                if member.suffix.lower() in FORBIDDEN_SUFFIXES:
                    errors.append(f"runtime file: {info.filename}")

                unix_mode = info.external_attr >> 16
                if stat.S_ISLNK(unix_mode):
                    errors.append(f"symbolic link: {info.filename}")

            if len(roots) != 1:
                errors.append(f"expected one top-level directory, found: {sorted(roots)}")
            elif expected_root and roots != {expected_root}:
                errors.append(
                    f"expected top-level directory {expected_root!r}, found {next(iter(roots))!r}"
                )
    except (BadZipFile, OSError) as exc:
        return [f"cannot read archive: {exc}"]

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--root", dest="expected_root")
    args = parser.parse_args()

    errors = validate_archive(args.archive, args.expected_root)
    if errors:
        for error in errors:
            print(f"[ERROR] {error}")
        return 1

    print(f"[OK] Clean archive: {args.archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
