# UI Polish changelog

Дата прохода: 20 июля 2026.

## Реально изменённые UI-файлы

- `assets/js/account-pages.js` — auth-разметка, единый куб-логотип, единый `passwordField`.
- `assets/css/account-pages.css` — центральная auth-карточка, password-toggle, компактные согласия.
- `assets/js/trip-pages.js` — Home trip rows, drafts, fallback success-card, куб-иконка.
- `assets/css/trip-pages.css` — Home/Drafts сетки, wizard layout, destructive draft link.
- `assets/css/app-shell.css` — единая плотность header/logo/avatar.
- `assets/js/app-shell.js` — куб-логотип в общем header.
- `trip-overview.html` — куб в workspace header, компактный Monitoring top, дополнительные Settings-группы.
- `assets/css/trip-monitoring.css` — компактный Monitoring header/status row.
- `assets/css/trip-messages.css` — 38/62 layout, scroll details, compact metadata.
- `features/trip-settings.css` — упрощённая Settings-сетка, warning/destructive styling.
- `assets/js/trip-messages.js` — metadata объединены, history вынесена перед grid.
- `features/trip-settings.js` — кнопка удаления локальной копии стала destructive.

## Изменённые блоки интерфейса

- Вход и регистрация: удалён левый информационный блок из DOM, оставлена одна центральная карточка.
- Password fields: `login`, `register`, `password recovery`, `profile password change` используют общий shell/toggle pattern.
- Главная: вместо тяжёлой hero-карточки — обычный page-header; карточки поездок показывают понятные подписи.
- Черновики: карточка получила нормальную ширину заголовка, текст `38% заполнено · 1 сегмент`, тихую ссылку `Удалить черновик`.
- Мастер: сохранены две области `stepper | form`; постоянная сводка скрыта, кнопки `Действия` нет.
- Monitoring: кнопка `Обновить` вынесена в header, status row содержит только статус, время и источник.
- Messages: история вынесена перед рабочей сеткой; metadata объединены в один блок.
- Settings: добавлены короткие группы `Доступ и участники` и `Мониторинг и уведомления`; destructive actions красные.

## Переработанные селекторы и компоненты

- `.account-auth-layout-simple`, `.account-form-panel`, `.account-logo`
- `.account-password-shell`, `.account-password-toggle`, `.account-consents`, `.account-check`
- `.tp-page-head`, `.trip-row`, `.trip-row-stats`, `.draft-row`, `.draft-progress`
- `.wizard-layout-v2`, `.wizard-step-button`, `.wizard-summary`
- `#app-shell-header .brand-mark`, `#app-shell-header .btn-icon`, `#app-shell-header .avatar`
- `.monitoring-top`, `.monitoring-status-strip`, `.monitoring-main-grid`
- `.messages-grid`, `.messages-detail`, `.messages-detail-meta-card`, `.messages-history`
- `.settings-grid`, `.settings-card--compact`, `.settings-complete-panel`, `.settings-danger-zone`

## SHA-256 до и после

| Файл | До | После |
| --- | --- | --- |
| `assets/js/account-pages.js` | `2BEBE05217C1053E97DDAC36736BCA8663EEFF2AF28DEE824F887B7AB566E812` | `1AF29E71A243B62C6F75F774B65682EDD77224761F7BF13B7D4DEB91A61B0939` |
| `assets/css/account-pages.css` | `9B4B638747B21D602C1840DFD43BA3E86CFA511D5BD4A40609BD6849CE5DEA62` | `3CD1FC447B024EAF1B2E53B1C7F136CD2B14F7D0C4DE513F464D517AF970BA25` |
| `assets/js/trip-pages.js` | `7A7A454DF3D648AAB466D562C83F13786469995BC2358FF00340F5D2D2556735` | `E6A8F2EA5C4467AFDDAAA7A02BA48176A15081675068F0167605946E23960AB5` |
| `assets/css/trip-pages.css` | `67582140C31A439D6EBFEEE3E4899B11F84C9B7350E12F7451D362D328C5387A` | `76BB861B9250B80B080F2A3DD843B699DAC311FA359C606B2D6BACFA39B4118F` |
| `assets/css/app-shell.css` | `F5261DE75C2D7497368A3EFE14FF4BE5DBE335DB3AA107C342FF87619E90B4E7` | `5B03E116C2260327896A44FC9296F1A5466EF5E443211432AA7BED943A155010` |
| `assets/js/app-shell.js` | `E574471A5AD49A6EDDCB9FAEB227BC7ED59E828E63693FD3D321CCF7FDC1800B` | `5AE5C92C77F39DA9786C515157C93611CE6E58BE7FBDD630F8DBA8FB8C4104A5` |
| `trip-overview.html` | `B81AC65FF57AA6EE1485CDB21BA30FB17A00AAFBDB2FBADDF906334CEEF662F7` | `9F3379C1C6E1DBF90E501A963411DD5050AAAD4D7E9E68759E037F880B29608B` |
| `assets/css/trip-monitoring.css` | `2D7B7AE3FC561062CA7A2C834C5F039F83D6D83DE79D885A56F63EA7E8227030` | `013CF0458EA9C8CF50FB5796CA37FDF8A2ED5B7C20ABE4403CC910A74E120942` |
| `assets/css/trip-messages.css` | `BE43BE4DCDF8956A3CD3BDAD7B1E0ED7007646947116451D42C59695159B8871` | `75B4DFC8626D64365372908F84180EFC3CF4F2AD07BB282DF6B2B72457E416A9` |
| `features/trip-settings.css` | `F853400F6B2B31EE761A70F1E1CAE90D50D73D296FC43B5108FD3A5FF6986563` | `25FAD0F2ED67AC6C2AF811754FE02DFCA7BB6515C8F8A873F91FA8E93FD2A3B7` |

Дополнительные изменённые UI JS:

- `assets/js/trip-messages.js` после: `1473A8D88E834A77BC834F22AB07210F8DB456535D18FB362EAFDCB37F735DD8`
- `features/trip-settings.js` после: `0421C109583B40046711F129E49A5595D0249BF60F73BEC76D7CF756FFBE2930`

## Новые screenshots

Папка: `screenshots/ui-polish-v2/`

- `login-before-after-1440.png`
- `register-before-after-1440.png`
- `home-before-after-1440.png`
- `drafts-before-after-1440.png`
- `wizard-before-after-1440.png`
- `monitoring-before-after-1440.png`
- `messages-before-after-1440.png`
- `settings-before-after-1440.png`
- `login-390.png`
- `register-390.png`
- `home-390.png`
- `wizard-390.png`
- `messages-390.png`

## Browser-проверка

- Локальный сервер: `http://127.0.0.1:4179/`.
- Auth DOM: `.account-info-panel` и `account-product-panel` — 0 элементов; `.account-form-panel` — 1 элемент; ширина login card — 540 px.
- Password toggle: кнопка `Показать` находится внутри `.account-password-shell`.
- Home: hamburger/ellipsis-only buttons — 0; `док.` в карточках — 0; `фывцф`, `undefined`, `null`, `lorem ipsum` в видимом Home UI — 0.
- Drafts: карточка показывает `Семейная поездка в Турцию`, `Шаг 4 из 8 · Логистика`, `38% заполнено`, `1 сегмент`, `Удалить черновик`.
- Wizard: `.wizard-layout-v2` существует, grid `232px 912px`, видимая `.wizard-summary` — нет, кнопка `Действия` — 0.
- Messages: `.messages-grid` существует, grid `440.8px 703.2px`, один `.messages-detail-meta-card`, история идёт перед grid.
- Settings: `settings-access-members` и `settings-monitoring-notifications` существуют; destructive-кнопки включают `Удалить локальную копию` и `Удалить поездку`.
- Console/page errors во время browser-проверки: 0.
