# Provenance Version B2

Дата фиксации: 2026-07-24.

## Источники

Канонический snapshot собран из изолированного рабочего контура
`C:\Projects\travel-assistant-teammate-stack`, использованного для B2 preview,
backend staging и Telegram release.

Source-only backup до Git-синхронизации:

- archive:
  `travel-assistant-b2-backups/20260724-004823-before-canonical-git-sync/travel-assistant-b2-source.zip`;
- SHA-256:
  `94f58dd7c9a150497365aff29143d0df3bf58041e103aa769a56167c1df75c9c`;
- 652 manifest entries, forbidden entries: 0.

Component source-tree hashes из manifest:

- backend:
  `848ba92827395a795dcaf0d213f761f173b5c9682b608375d53bcaf400e840c1`;
- frontend:
  `5c3e7038ba69e04946e01b1ed4e613706424532eae0a4b776ef3402e97db2e90`;
- telegram-bot:
  `cfa3fbb23abb9bf486b141a2297a3da83edd6ac93b9d760b3205eabc45f18b53`.

## Deployed artifacts

Frontend preview deployment:

- URL:
  <https://travel-assistant-teammate-preview-quon6nily-workd69s-projects.vercel.app>;
- Vercel deployment ID: `dpl_GY7QHees7VRJHDEyaxeY2e6x6Cbg`;
- десять ключевых served assets совпали с локальным B2 byte-for-byte.

Backend staging:

- URL:
  <https://travel-assistant-teammate-backend-b2-staging-staging-b2.up.railway.app>;
- Railway deployment ID: `3cc46779-19ec-4245-b64d-8d29a77f7208`;
- image digest:
  `sha256:fc86ba7c84bd0f4c117b878f0674a2096373ec00b45ca07306bd639ddc12364b`;
- persistent volume mount: `/data`.

Telegram release:

- release directory: `/opt/travel-assistant-bot-b2-3cc46779`;
- clean archive SHA-256:
  `7a069347fd73012fe8ad26874f962040e16b27a6c2f019a9582379b8cd7bb5b5`;
- service at audit: active, one MainPID, `NRestarts=0`.

## Публикация

Документация, CI, safe examples и secret-scan configuration добавлены только
для канонической публикации. Бизнес-код snapshot не заменялся старой версией.
Generated screenshots, platform metadata, базы, логи, `.env` и секреты в Git не
включаются. Создание canonical commit не выполняет deployment.

