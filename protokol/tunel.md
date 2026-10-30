# Tunel v2 (telefon ↔ nod)

Stan: 2026-10-30, spisany z `aplikacja/lib/services/tunnel_crypto.dart` i FW `src/tunnel.cpp`.
Bajty tunelu (SSH, panel HA, panele LAN) idą przez BE w ramkach WS `VER_TUN` (ws.md §1.2), ale BE nie zna klucza.

- Klucz sesji: `K = SHA256(klucz_parowania ‖ "sensmos-tun-v2")`, AES-256-GCM. Klucz parowania powstaje w telefonie i trafia do noda wyłącznie po LAN.
- `ts`: znacznik z wiadomości `open`, ten sam dla całej sesji.
- Ramka: `seq(u64 BE) ‖ nonce(12, losowy) ‖ ciphertext ‖ tag(16)`; narzut 36 B.
- AAD: `"tun2" ‖ ts(u32 BE) ‖ dir(1) ‖ seq(u64 BE)`; `dir = 0` nod → apka, `dir = 1` apka → nod.
- Odbiorca wymaga ściśle rosnącego `seq` (dziury dozwolone); zły tag albo powtórka = zerwanie sesji.
- Nonce losowy, bo klucz sesji jest ten sam we wszystkich sesjach.

Wektor: `wektory/tunel-v2.json`.
