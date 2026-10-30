// Generator wektora tunel-v2.json — niezależna implementacja tunelu v2 (FW src/tunnel.cpp ↔
// apka lib/services/tunnel_crypto.dart). Spec: protokol/tunel.md.
// Uruchomienie: node gen/tunel-v2.js > tunel-v2.json
const crypto = require('crypto');

const pairKey = Buffer.from('5a'.repeat(32), 'hex');
const ts = 1761830000;
const key = crypto.createHash('sha256').update(Buffer.concat([pairKey, Buffer.from('sensmos-tun-v2')])).digest();

function aad(dir, seq) {
    const b = Buffer.alloc(4 + 4 + 1 + 8);
    b.write('tun2', 0, 'ascii'); b.writeUInt32BE(ts, 4); b[8] = dir; b.writeBigUInt64BE(BigInt(seq), 9);
    return b;
}

function frame(dir, seq, nonce, pt) {
    const c = crypto.createCipheriv('aes-256-gcm', key, nonce); c.setAAD(aad(dir, seq));
    const ct = Buffer.concat([c.update(pt), c.final()]);
    const s = Buffer.alloc(8); s.writeBigUInt64BE(BigInt(seq));
    return Buffer.concat([s, nonce, ct, c.getAuthTag()]).toString('hex');
}

const frames = [
    { dir: 0, opis: 'nod → apka', seq: 0, nonce: '000102030405060708090a0b', pt: 'SSH-2.0-dropbear\r\n' },
    { dir: 0, opis: 'nod → apka, dziura w seq dozwolona', seq: 5, nonce: '0c0d0e0f1011121314151617', pt: 'HTTP/1.1 200 OK\r\n\r\n' },
    { dir: 1, opis: 'apka → nod', seq: 0, nonce: 'f0f1f2f3f4f5f6f7f8f9fafb', pt: 'GET / HTTP/1.1\r\n\r\n' },
].map(f => ({ ...f, frame: frame(f.dir, f.seq, Buffer.from(f.nonce, 'hex'), Buffer.from(f.pt, 'utf8')) }));

process.stdout.write(JSON.stringify({
    spec: 'protokol/tunel.md',
    pair_key: pairKey.toString('hex'),
    ts,
    session_key: key.toString('hex'),
    frames,
    bad: [
        { opis: 'ramka nod → apka podana jako apka → nod (zły kierunek w AAD)', frame: frames[2].frame, open_as_dir: 0 },
        { opis: 'zmieniony seq (AAD)', frame: '00000000000000ff' + frames[0].frame.slice(16), open_as_dir: 0 },
    ],
}, null, 2) + '\n');
