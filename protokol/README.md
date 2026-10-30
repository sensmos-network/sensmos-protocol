# Protokół Sensmos

Jedno źródło prawdy dla formatów, które implementują FW (C++), backend (JS), apka i PC (Dart) oraz HA (Python).

| Plik | Co | Wektor |
|---|---|---|
| `ws.md` | WS nod ↔ BE: katalog wiadomości, kanał szyfrowany | `wektory/ws-enc.json` |
| `tunel.md` | tunel v2 telefon ↔ nod | `wektory/tunel-v2.json` |

Wektory generuje niezależna implementacja w `wektory/gen/*.js` (`node gen/<nazwa>.js > <nazwa>.json`).
Testy po stronach czytają je z `../kontrakt/protokol/wektory` albo z `SENSMOS_WEKTORY`:
- BE: `backend/test/wektory_*.test.js`
- apka: `aplikacja/test/wektory_*_test.dart`
