# Contributing

1. Создайте ветку от актуального `main`.
2. Не добавляйте `.env`, токены, cookies, базы, логи, архивы и generated assets.
3. Сохраняйте совместимость frontend/backend/Telegram contract.
4. Для изменения схемы добавьте обратимый план и проверку на копии базы.
5. Выполните `scripts/verify.ps1` или `scripts/verify.sh`.
6. Выполните `scripts/secret-scan.ps1` либо эквивалентный Gitleaks scan.
7. Опишите изменение и ограничения в `CHANGELOG.md` и документации.

Pull request не должен автоматически разворачивать production или использовать
production credentials. Изменения Telegram polling требуют отдельного
операционного согласования и проверки, что второй consumer не запущен.

