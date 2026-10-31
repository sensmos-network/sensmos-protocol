# Pomiar — jeden rekord dla całej sieci

Każdy wynik pomiaru w Sensmosie (ping do kotwicy, DNS, HTTP, punch, hop do własnej bramy, odczyt
czujnika, odbiór LoRa) jest zapisywany w BE jako jeden rekord w tabeli `measurements`
(`backend/src/db/migrations/015_measure.sql`). Z niego powstaje dzienny agregat `measure_daily`
(ASN × region × rodzaj) i ranking ISP. Watch, UpFromWhere, mapa i apka czytają te same liczby.

## 1. Rekord

| Pole | Typ | Opis |
|---|---|---|
| `ts` | liczba (s od 1970) | kiedy nod zmierzył; brak = czas odbioru w BE |
| `kind` | tekst ≤ 24 | rodzaj, tabela niżej |
| `target` | tekst ≤ 64, opcjonalne | cel: dla `net.*` dokładnie `host` z przydzielonego joba (adres kotwicy albo IP peera — BE dopina z joba pozycję i region celu), dla czujnika id encji |
| `tk` | tekst | rodzaj celu: `target` (kotwica), `peer`, `gateway` (własna brama/router), `monitor`, `sensor` |
| `ok` | bool | czy pomiar się udał |
| `rtt` | liczba ms, opcjonalne | czas odpowiedzi (mediana z próbek) |
| `jit` | liczba ms, opcjonalne | jitter |
| `loss` | liczba 0–100, opcjonalne | straty pakietów w % |
| `n` | liczba, opcjonalne | liczba próbek |
| `val` | liczba, opcjonalne | wartość (czujnik, RSSI dBm dla `net.wifi`) |
| `x` | obiekt, opcjonalne | pola rodzaju, przekazywane do checknetu bez zmian: pozycja celu (`to_region`, `to_lat`, `to_lon`), HTTP (`status_code`, `ttfb_ms`), DNS (`resolved_ip`, `match`), trasa (`lh_host`, `geo_ok`, `reached`, `hops[]`, `trace_ip`) |

BE dopisuje sam: `device_id` (z sesji), `asn` (z IP noda, lokalna baza ASN; IP nie jest zapisywane),
`region` (kraj noda, ISO2), `src` (skąd przyszło: `measure`, `check_result`, …).

| `kind` | Znaczenie |
|---|---|
| `net.icmp`, `net.dns`, `net.tcp`, `net.http` | pomiar łącza do celu (`tk` = `target` albo `peer`) |
| `net.punch` | UDP nod↔nod (`tk` = `peer`) |
| `net.trace` | trasa do celu (hopy w `x.hops`) |
| `net.lan` | hop do własnej bramy (`tk` = `gateway`) — filtr złego łącza domowego |
| `net.wifi` | RSSI WiFi noda w `val` |
| `net.monitor` | monitor R3 (`tk` = `monitor`) |
| `sensor.<encja>` | odczyt czujnika w `val` |
| `radio.lora` | odbiór LoRa (`val` = RSSI) |

## 2. Wiadomość WS `measure` (nod → BE)

```json
{ "type": "measure", "v": 1, "m": [ { "ts": 1761900000, "kind": "net.icmp", "target": "1.1.1.1", "tk": "target", "ok": true, "rtt": 12.4, "loss": 0, "n": 4 } ] }
```

BE przelicza rekordy `net.*` na wyniki checknetu (`measure/checknet.toResults`), więc `measure` daje to samo co `check_result`: bandy na mapie, podgląd na żywo, rejestr blokad ICMP. FW z `proto` 2 (checknet, punch) wysyła już tylko `measure`.

Najwyżej 64 rekordy w wiadomości; rekord z nieznanym `kind` albo bez `ok` jest pomijany (licznik
w logu), reszta wiadomości wchodzi. Do czasu FW, który wysyła `measure`, stare wiadomości
(`check_result`) zapisuje adapter w BE (`// EXPIRES: FW 1.10 na całej flocie`).

## 3. Agregat dzienny i ranking ISP

Dla każdego dnia UTC i każdej trójki (ASN, region, `kind`) z rekordów `tk = target` albo `kind = net.lan`:

- **nody o złym łączu domowym są pomijane w całym dniu:** mediana `net.lan` `rtt` > 20 ms albo mediana `net.wifi` `val` < −75;
- `p50`, `p95` — percentyl z interpolacją liniową (jak `percentile_cont` w Postgresie) po `rtt` rekordów z `ok = true`;
- `loss` — średnia `loss` po rekordach; rekord bez `loss` liczy się jako 0 (ok) albo 100 (nie ok);
- `nodes` — liczba różnych nodów, `samples` — liczba rekordów.

Ranking (`GET /v1/isp/ranking?region=PL&kind=net.icmp&days=7`) bierze dni z okna i składa je:
`p50`, `p95`, `loss` = średnie dzienne ważone liczbą próbek, `samples` = suma, `nodes` = największa
dzienna liczba nodów (dolna granica). ASN wchodzi do rankingu przy `nodes ≥ 5` i `samples ≥ 500`;
reszta jest zwracana osobno jako „za mało danych” z tymi samymi liczbami. Każda pozycja ma `nodes` i `samples`.

Wektor: `wektory/measure-daily.json` (gen: `wektory/gen/measure-daily.js`) — rekordy jednego dnia
i oczekiwane wiersze agregatu.
