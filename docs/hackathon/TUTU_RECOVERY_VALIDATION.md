# Tutu MCP recovery validation

Статус: **READY — red flags не обнаружены**

Проверка: **2026-08-17, 19:14–19:15 МСК** (`16:14–16:15Z`)

Baseline: `33b99a42a0b7b4737e03ac7c635f92e82f09547c`

Live endpoint: `https://mcp.tutu.ru/mcp`

MCP server: `tutu-mcp-server` **0.38.0**, protocol era `legacy`

Официальная страница хакатона подтверждает endpoint и заявленные transport capabilities: <https://hackathon2026.tutu.ru/>. Версия, tool schemas и результаты ниже получены непосредственно через live MCP discovery/calls существующим integrated client, а не со страницы.

## Вывод для Plan B

Основной demo-сценарий **Москва → Санкт-Петербург, flight, 20 августа 2026** пригоден. Live `search_avia` вернул 10 raw offers; все 10 без ошибок нормализовались в frozen `TransportOptionV1`, все имеют factual RUB price, carrier/service и checkout reference. Два checkout smoke завершились deeplink-результатом без покупки.

Для recovery demo следует:

1. получать disruption только как `CARRIER_CANCELLED`, `source = DEMO_SIMULATION`;
2. искать той же датой через frozen `SearchRequestV1`;
3. локально исключать options с `departureAt <= originalTrip.departureAt`;
4. показывать Fastest по минимальному **final arrival**, Cheapest по минимальной comparable factual price и Personalized как детерминированный порядок по выбранным supported chips;
5. перед pitch повторить smoke: provider inventory и цены изменчивы.

Не трактовать Tutu MCP как live disruption monitor и не утверждать cancellation/задержку/фактическое прибытие по этим данным.

## Contract facts

- V1: one-way, ровно 1 adult, children/infants = 0; flight использует provider-default Economy, cabin selector отсутствует.
- Frozen mapping для flight вызывает `search_avia` с `page = 1`, `page_size = 10`, `view = compact`.
- `TransportOptionV1` сохраняет scheduled segments, `departureAt`, `arrivalAt`, вычисленные `durationMinutes` и `transferCount`, factual provider price либо `null`, carrier/service либо `null`, availability либо `null`.
- `create_checkout_link` получает только opaque provider `checkout_ref`; генерация ссылки не является покупкой и не гарантирует неизменность цены/наличия.
- Empty, malformed, timeout/unavailable и checkout-unavailable paths покрыты focused tests; raw upstream body не выдаётся наружу.

### Exact primary SearchRequestV1

```json
{
  "schemaVersion": "1",
  "mode": "flight",
  "origin": "Москва",
  "destination": "Санкт-Петербург",
  "departureDate": "2026-08-20",
  "returnDate": null,
  "passengers": {
    "adults": 1,
    "children": 0,
    "infants": 0
  }
}
```

Mapped live call:

```json
{
  "tool": "search_avia",
  "arguments": {
    "origin": "Москва",
    "destination": "Санкт-Петербург",
    "departure_date": "2026-08-20",
    "adults": 1,
    "children": 0,
    "infants": 0,
    "page": 1,
    "page_size": 10,
    "view": "compact"
  }
}
```

## Observed demo evidence

Это наблюдения конкретного live smoke, не production assumptions.

| Сценарий | Tool | Raw | Normalized | Malformed/unsupported | Direct / transfer | Non-null prices | Availability |
|---|---|---:|---:|---:|---:|---:|---:|
| Primary flight: Москва → Санкт-Петербург, 2026-08-20 | `search_avia` | 10 | 10 | 0 | 10 / 0 | 10 RUB | 0 |
| Backup flight: Москва → Сочи, 2026-08-20 | `search_avia` | 10 | 10 | 0 | 10 / 0 | 10 RUB | 0 |
| Resilience only: train Москва → Санкт-Петербург, 2026-08-20 | `search_rail` | 10 | 10 | 0 | 10 / 0 | 10 RUB | 0 |

Primary prices ranged from **6 912,75 RUB** to **8 356,02 RUB** in the first page. Departures ranged from 06:30 to 23:30 МСК. Every primary option had one segment, non-null `carrierName`, non-null `serviceNumber` and a checkout reference.

### Representative primary normalized options

Values are shortened only by omitting hashes and repeated source metadata; no factual field was invented.

| Recovery role | Service | Schedule (МСК) | Duration | Transfers | Provider price | Availability |
|---|---|---|---:|---:|---:|---|
| Earliest arrival in unfiltered page | Аэрофлот `SU-6190`, VKO → LED | 20 Aug 06:30 → 08:00 | 90 min | 0 | 6 912,75 RUB | `null` |
| Earliest arrival after 12:05 boundary | Победа `DP-6823`, SVO → LED | 20 Aug 14:50 → 16:10 | 80 min | 0 | 7 075,57 RUB | `null` |
| Cheapest after 12:05 boundary | Аэрофлот `SU-6186`, VKO → LED | 20 Aug 23:30 → 21 Aug 01:00 | 90 min | 0 | 6 912,75 RUB | `null` |

Граница 12:05 МСК взята только как analysis input из существующей canonical Trip e2e fixture baseline. Это не provider fact и не новая product-константа: в demo фильтр обязан использовать реальный `originalTrip.departureAt`. При этой границе остаётся 7 factual later-departure options. SearchRequestV1 не получает скрытый `after`-параметр.

### Backup scenario

Backup: **Москва → Сочи, flight, 2026-08-20**, с тем же passenger scope. Получено 10/10 normalized direct options, 10 non-null RUB prices, диапазон 10 290–17 874 RUB, carrier/service заполнены, 2/2 checkout smoke успешны. Пример: Победа `DP-6949`, 19:30–23:10 МСК, 220 min, 0 transfers, 10 290 RUB.

Использовать backup только если pre-pitch smoke primary внезапно вернёт пустой/бедный set. Train на primary route — полезное resilience evidence, но не замена основного flight demo.

## Ranking feasibility

- **Fastest — YES.** Final arrival и duration factual и нормализованы. Для recovery рекомендуется минимальный final arrival после local later-departure filter. Не смешивать это с «shortest airborne duration»: в наблюдаемом set эти критерии могут выбрать разные рейсы.
- **Cheapest — YES.** В primary все 10 prices non-null, одна currency (`RUB`), один request scope (one-way, 1 adult). Не сравнивать `null`, разные currencies или несопоставимый исходный price.
- **Personalized — YES, с оговоркой.** Chips `быстрее` и `дешевле` реально различают primary options. `меньше пересадок` contract-supported, но в observed primary/backup/train pages у всех `transferCount = 0`, поэтому сейчас этот chip нейтрален. Не обещать transfer diversity.

Safe chip set остаётся: `быстрее`, `дешевле`, `меньше пересадок`. UI/backend должен уметь показать третий критерий как неразличающий варианты, а не создавать искусственный score.

## Impact feasibility

При наличии исходного canonical `TransportOptionV1`:

| Delta | Verdict | Условие |
|---|---|---|
| Arrival delta | **SUPPORTED** | сравнивать final segment `arrivalAt` |
| Duration delta | **SUPPORTED** | сравнивать `durationMinutes` |
| Transfer delta | **SUPPORTED** | сравнивать `transferCount` |
| Price delta | **SUPPORTED** | только оба prices non-null и currency совпадает; provider amount не переинтерпретировать |

`price.kind` в observed options равен `unknown`, поэтому delta — разность одинаково scoped provider amounts, но не заявление о тарифных условиях, багаже или финальной цене checkout.

## Checkout feasibility

- Primary flight: **2/2 success**, result `kind = deeplink`, host `mtp-deeplink.tutu.ru`, `search_results_url` present.
- Backup flight: **2/2 success**, тот же result type/host.
- Primary train resilience: **2/2 success**, `deeplink`, тот же host; returned checkout result did not include `search_results_url`.
- Покупка не выполнялась; полные URL и opaque references не сохранены.

## Contract fit and limitations

Все 30 checked live offers (10 primary flight + 10 backup flight + 10 primary train) нормализовались без semantic parser error. `segments`, transfer count, scheduled duration, price, carrier and service fit frozen V1. **REAL_MCP_RECOVERY_RED_FLAG отсутствует.**

Ограничения:

- compact response не дал availability/seats; `availability = null` корректно, придумывать наличие нельзя;
- первые 10 results во всех трёх probes были direct; transfer behavior подтверждён contract fixture, но не текущим live set;
- только первая page из 10 options проверена; это не доказательство полного inventory;
- конкретные flights, schedules и prices volatile и не должны hard-code'иться;
- search/checkout link не доказывают cancellation, operational status, purchasability или финальную цену;
- `price.kind = unknown`; baggage, fare conditions, reviews и cabin не входят в ranking;
- Tutu MCP server version `0.38.0` — live observation 2026-08-17, а не вечная гарантия.

## Failure-mode evidence and hygiene

Focused suite: **39/39 passed** после штатного `prisma generate` в clean worktree.

- valid empty provider collection → `options = []`;
- malformed/envelope error → stable `TUTU_INVALID_RESPONSE` / `TUTU_TOOL_ERROR` без raw leak;
- hang → stable retryable `TUTU_TIMEOUT`;
- connection failure → stable retryable `TUTU_UNAVAILABLE`;
- missing checkout reference → `TUTU_CHECKOUT_UNAVAILABLE`, MCP не вызывается.

Эти failure modes проверены локальными fixtures/fakes, без destructive calls к provider. Дополнительные fixtures не добавлены: существующее покрытие достаточно, а live raw dumps намеренно не сохранены.

## Final recommendation to Egor

В Plan B Core использовать primary **Москва → Санкт-Петербург / flight / 2026-08-20**, но на старте demo повторять read-only search. После simulated `CARRIER_CANCELLED` фильтровать factual options локально по actual original `departureAt`; затем выдавать:

- Fastest: earliest final arrival;
- Cheapest: lowest non-null price in the same currency;
- Personalized: lexicographic/deterministic ordering only over selected supported chips (`быстрее`, `дешевле`, `меньше пересадок`), без LLM scoring;
- Impact: four deltas above with null/currency guards.

Если primary set недостаточен, переключить demo на validated backup **Москва → Сочи / flight / 2026-08-20**. Не строить demo narrative вокруг transfer preference: live evidence на проверенных routes его не различает.

Production Plan B, frontend, Trip, transport adapter/contracts и security code не изменялись.
