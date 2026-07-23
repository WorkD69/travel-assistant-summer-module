# B2 Canonical Publication Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Зафиксировать точный развернутый Version B2 как безопасный
канонический исходный код и синхронизировать один commit в GitHub и GitVerse без
изменения deployments.

**Architecture:** Сохранить историю существующего remote main, заменить его
рабочее содержимое source-only B2 snapshot в отдельном worktree, добавить
только эксплуатационную документацию/CI/secret hygiene, затем опубликовать
fast-forward release и main refs в оба remote.

**Tech Stack:** Git, Node.js 22, Express, Prisma/SQLite, static HTML/CSS/JS,
Python 3.12/aiogram, pytest, Gitleaks, GitHub Actions.

---

- [x] Зафиксировать deployment provenance и remote hashes.
- [x] Создать source-only backup и SHA-256 manifest.
- [x] Проверить исходный snapshot и доступную Git history Gitleaks.
- [x] Создать изолированный worktree и ветку `release/b2-canonical`.
- [x] Перенести точный B2 source без generated/platform/private artifacts.
- [x] Добавить безопасные examples, документацию, CI и verification scripts.
- [x] Выполнить backend/frontend/Telegram tests и Prisma validation.
- [x] Повторить staged tree и full-history secret scan.
- [ ] Создать canonical commit и tag `v0.2.0-b2`.
- [ ] Повторно fetch/compare remote refs и выполнить только fast-forward push.
- [ ] Проверить одинаковый commit hash в GitHub и GitVerse.
- [ ] Подтвердить, что deployment и Telegram service не изменялись.
