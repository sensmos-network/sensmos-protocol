# Protokół Sensmos

Jedno źródło prawdy dla formatów, które implementują FW (C++), backend (JS), apka i PC (Dart) oraz HA (Python).

| Plik | Co | Wektor |
|---|---|---|
| `ws.md` | WS nod ↔ BE: katalog wiadomości, kanał szyfrowany | `wektory/ws-enc.json` |
| `tunel.md` | tunel v2 telefon ↔ nod | `wektory/tunel-v2.json` |
| (ldev.js / kom_frames.dart) | ramki LoRa E0 04 urządzeń i komunikatora | `wektory/ldev-e004.json` (gen: `backend/tools/ldev_fixture.js`) |
| (store_box.js / sensmos_store) | skrzynka Store | `wektory/store-box.json` (gen: `backend/tools/box_fixture.js`) |

Symulator noda: `backend/tools/nodesim.js` (identify, kanał szyfrowany, ping, checknet); test `backend/test/nodesim.test.js`.

Wektory generuje niezależna implementacja w `wektory/gen/*.js` (`node gen/<nazwa>.js > <nazwa>.json`).
Testy po stronach czytają je z `../kontrakt/protokol/wektory` albo z `SENSMOS_WEKTORY`:
- BE: `backend/test/wektory_*.test.js`
- apka: `aplikacja/test/wektory_*_test.dart`
