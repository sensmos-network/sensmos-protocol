# Protokół WS nod ↔ backend

Stan: 2026-10-30, spisany z kodu: FW `src/ws_client.cpp` (`WS_TABLE`) i nadawcy w `src/*.cpp`, BE `services/ws_handlers.js` (`HANDLERS`), `services/websocket.js`, `services/wsenc.js`.
Ten plik jest źródłem prawdy (plan przebudowy, etap 2). Zmiana w kodzie bez zmiany tutaj i w `wektory/` to błąd.

## 1. Połączenie

- Adres: `wss://sensmos.com/v1/ws`.
- Pierwsza wiadomość noda: `identify` (jawnym tekstem). Wszystko inne przed `identified` dostaje `{"type":"error","msg":"not identified"}`.
- Nieznany typ: `{"type":"error","msg":"unknown type: <typ>"}`.

### 1.1 `identify` (nod → BE, jawnie)

| Pole | Typ | Znaczenie |
|---|---|---|
| `device_id` | hex 64 | sha256 klucza publicznego noda |
| `timestamp` | u32 | czas noda (s) |
| `msg` | str | `identify:<device_id>:<timestamp>:e1:<enonce>` |
| `signature` | hex DER | ECDSA secp256k1 kluczem noda nad sha256(`msg`) |
| `enc` | 1 | żądanie kanału szyfrowanego (FW ≥ 0.61) |
| `enonce` | hex 32 | połowa soli klucza sesji od noda |
| `firmware` | str | wersja FW |
| `remote` | 1? | nod sparowany z telefonem (może otworzyć tunel) |
| `lora` | 1? | SX1262 wykryty przy starcie |
| `board` | str? | nazwa wykrytej płytki LoRa |
| `chip` | str | `<model> r<rev> @<MHz>MHz <MB>MB` |

Odpowiedź `identified` zawiera połowę soli BE; od niej obie strony mówią wyłącznie ramkami szyfrowanymi (1.2).
Brak pola `proto`: BE zgaduje możliwości po `firmware`. **Do zrobienia w etapie 2:** pole `proto` (liczba), BE odmawia `update_required` poniżej minimum.

### 1.2 Kanał szyfrowany (`wsenc.js` ↔ `ws_enc.cpp`)

- `shared = ECDH(BE_priv, node_pub).x` (secp256k1, 32 B). Klucz publiczny BE nod ma wbudowany w FW; BE zna klucz noda z rejestracji.
- `okm = HKDF-SHA256(shared, salt = enonce_fw ‖ enonce_be, info = "sensmos-ws-v1", 32)`.
- Klucz nod→BE = `okm[0:16]`, BE→nod = `okm[16:32]`.
- Ramka binarna: `ver(1) ‖ seq(8, BE) ‖ tag(16) ‖ ciphertext`, AES-128-GCM, `IV = 0x00000000 ‖ seq`, `AAD = ver ‖ seq`.
- `seq` rośnie od 0 w każdym kierunku osobno; odbiorca odrzuca `seq` ≤ ostatniego (anty-replay).
- `ver = 1` (VER_JSON): plaintext to JSON z tej specyfikacji. `ver = 2` (VER_TUN): plaintext to `tid(u16 BE) ‖ ramka tunelu v2` (BE tylko przekazuje, nie zna klucza).
- Wektor: `wektory/ws-enc.json`.

Legacy bez szyfrowania (FW < 0.61: K3, nonce komend, `sendSignedCommand`) — do usunięcia w etapie 2 po potwierdzeniu, że flota go nie używa.

## 2. Nod → BE (31 typów)

| Typ | Nadawca FW | Handler BE | Pola |
|---|---|---|---|
| `identify` | `ws_client.cpp:160` | `onIdentify` | 1.1 |
| `ping` | `data_sender.cpp:54` | `onPing` | `device_id`, `free`, `largest`, … (heartbeat, stan RAM) |
| `batch` | `data_sender.cpp:174` | `onBatch` | paczka danych encji |
| `mon_batch` | `data_sender.cpp:219` | `onMonBatch` | paczka pomiarów monitorowanych encji |
| `message` | `http_messages.cpp:65` | `onMessage` | wiadomość do innego noda/konta |
| `push` | `ws_client.cpp:812` | `onPush` | `push_title`, `push_body` |
| `node_config` | `http_config.cpp:66,79,92` | `onNodeConfig` | `gps_lat`,`gps_lon`,`fuzz` / `fuzz` / `location_mode` |
| `check_assign` | `checknet.cpp:332` | `onCheckAssign` | — (prośba o joby) |
| `check_result` | `checknet.cpp:186`, `punch.cpp:174` | `onCheckResult` | `results[]` (`id`,`kind`,`host`,…) |
| `checknow_result` | `checknow.cpp:97` | `onChecknowResult` | `id`,`ok`,`rtt_ms`,`status` |
| `monitor_alert` | `monitors.cpp:86` | `onMonitorAlert` | `id`,`state`,`last_ms`,`fails` |
| `monitor_report` | `monitors.cpp:115` | `onMonitorReport` | `id`,`bucket`,`ok`,`fail`,… |
| `monitor_status` | `monitors.cpp:131` | `onMonitorStatus` | `m[]` |
| `script_report` | `script_actions.cpp:356` | `onScriptReport` | |
| `script_async_result` | `script_actions.cpp:30,45` | `onScriptAsyncResult` | |
| `tun_state` | `tunnel.cpp:313,375`, `ws_client.cpp:482` | `terminal.fromNode` | `tid`,`st`,`msg` |
| `tun_data` | (ramka VER_TUN) | `terminal.fromNode` | |
| `data_query` | `http_remote.cpp:28` | `routes/data.wsQuery` | `to`,`prefix` — **do odcięcia (etap 4)** |
| `data_subscribe` | `http_remote.cpp:60` | `routes/data.wsSubscribe` | `to`,`days`,`prefix` — **do odcięcia (etap 4)** |
| `lora_rx` | `lora_scan.cpp:1063` | `lora.onFrames` | `frames[]` |
| `lora_ch` | `lora_scan.cpp:1461,1487` | `lora.onChannel` | `ts`,`freq`,`bw`,`sf`,… |
| `lora_sweep` | `lora_scan.cpp:717` | `lora.onSweep` | `ts`,`busy`,`total`,`points[]` |
| `lora_camp` | `lora_scan.cpp:791` | `lora.onCamp` | `ts`,`freq`,`secs`,`noise`,… |
| `lora_send` | `lora_scan.cpp:537` | `lora.onSendRequest` | `dst`,`sub`,`hex` |
| `lora_sent` | `lora_scan.cpp:560` | `service_fees.chargeDaily` | `dst`,`sub`,`len`,`aes` |
| `lora_data_rcpt` | `lora_scan.cpp:665` | `lora.onDataReceipt` | `sub`,`via`,`len` |
| `lora_emerg_cfg` | `lora_scan.cpp:596` | `onLoraEmergCfg` | `eids[]` |
| `ext_auth_req` | `ext_auth.cpp:76` | `attachments.onAuthRequest` | `req`,`kind`,`name`,`scopes` |
| `fwd_resp` | `fw_digest.cpp:110` | `fw_digest.onResponse` | `nonce`,`fw`,`chip`,`ok` |
| `ws_outage` | `ws_client.cpp:272` | `onWsOutage` | `start_epoch`,`ff_epoch`,… |
| `wifi_env` | `wifi_env.cpp:64` | `onWifiEnv` | `n[]` (hashe sieci) |

### 2.1 Niezgodności znalezione przy spisie

| Co | Skutek | Naprawa |
|---|---|---|
| FW wysyła `event` (`script_actions.cpp:379`, UserScript „wyślij do noda”), BE nie ma handlera | BE odpowiada `unknown type`, akcja skryptu nigdy nie dociera | FW: `message` (komentarz w kodzie mówi „Etap E: → message”); UserScript jest zamrożony, więc w etapie 6 razem z FW 1.10 |
| BE obsługuje `wallet_request`, `user_script_fired` | żaden FW ich nie wysyła | wyrzucić z BE (etap 3) |

## 3. BE → nod (31 typów w `WS_TABLE`)

| Typ | Nadawca BE | Handler FW |
|---|---|---|
| `identified` | `ws_handlers.js` | `on_identified` |
| `error` | `ws_handlers.js`, `websocket.js` | `on_error` |
| `message`, `message_sent` | `ws_handlers.js`, `routes/messages.js` | `on_message_recv`, `on_message_sent` |
| `batch_ack`, `batch_error` | `ws_handlers.js` | `on_batch_ack`, `on_batch_error` |
| `tasks_update` | `services/scripts.js` | `on_tasks_update` |
| `tasks_clear` | `routes/scripts_admin.js` | `on_tasks_clear` |
| `reboot` | `index.js` | `on_reboot` |
| `deleted` | `device_delete.js`, `ws_handlers.js` | `on_deleted` |
| `subscription_push` | `routes/batch.js`, `routes/data.js` | `on_subscription_push` |
| `check_jobs` | `ws_handlers.js` | `on_check_jobs` |
| `check` | `checkqueue.js`, `ws_handlers.js` | `on_check` |
| `cn_config` | `services/scripts.js` | `on_cn_config` |
| `cn_stun`, `cn_punch` | `punch.js` | `on_cn_stun`, `on_cn_punch` |
| `monitor_set`, `monitor_clear` | `monitors.js` | `on_monitor_set`, `on_monitor_clear` |
| `ota` | `websocket.js:197,209` | `on_ota` (`version`, `targets`, opcjonalnie `nonce` legacy) |
| `tun_open`, `tun_close` | `terminal.js` | `on_tun_open`, `on_tun_close` |
| `fw_digest` | `fw_digest.js` | `fw_digest_on_ws` |
| `ext_auth_grant`, `ext_auth_deny` | `attachments.js` | `on_ext_auth_*` |
| `lora_cfg`, `lora_scan`, `lora_camp`, `lora_frame`, `lora_frame_tx` | `lora.js` | `on_lora_*` (tylko nody z `lora:1`) |
| `lora_listen`, `lora_cad`, `lora_hunt`, `lora_bg` | `lora.js:754-762` (`requestJob`) | `on_lora_*` |
| `lora_msg_seed` | `messaging.js` | `on_lora_msg_seed` |
| `lora_tx` | `ldev.js`, `messaging.js` | `on_lora_tx` |

## 4. Kierunek po przebudowie

- Etap 2: pole `proto`, schemat JSON każdego typu w `protokol/schemat/`, BE odrzuca ramkę spoza schematu z logiem.
- Etap 4: raporty pomiarowe (`check_result`, `checknow_result`, `monitor_*`, wynik punch, trace) zbiegają się w jedną wiadomość `measure` (plan, rozdz. 2). Stare typy obsługuje adapter do wydania FW 1.10 na całej flocie.
