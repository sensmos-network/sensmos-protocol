// Generator wektora ws-enc.json — NIEZALEŻNA implementacja specyfikacji ws.md §1.2
// (bez kodu BE i FW), żeby wektor nie powtarzał błędu żadnej ze stron.
// Uruchomienie: node gen/ws-enc.js > ws-enc.json
const crypto = require('crypto');

const bePriv   = Buffer.from('11'.repeat(32), 'hex');
const nodePriv = Buffer.from('22'.repeat(32), 'hex');
const fwNonce  = Buffer.from('a0a1a2a3a4a5a6a7a8a9aaabacadaeaf', 'hex');
const beNonce  = Buffer.from('b0b1b2b3b4b5b6b7b8b9babbbcbdbebf', 'hex');

const be = crypto.createECDH('secp256k1');   be.setPrivateKey(bePriv);
const node = crypto.createECDH('secp256k1'); node.setPrivateKey(nodePriv);
const shared = be.computeSecret(node.getPublicKey());
if (!shared.equals(node.computeSecret(be.getPublicKey()))) throw new Error('ECDH');

const okm = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.concat([fwNonce, beNonce]),
                                         Buffer.from('sensmos-ws-v1'), 32));
const keys = { fw2be: okm.subarray(0, 16), be2fw: okm.subarray(16, 32) };

function frame(key, ver, seq, pt) {
    const hdr = Buffer.alloc(9); hdr[0] = ver; hdr.writeBigUInt64BE(BigInt(seq), 1);
    const iv = Buffer.concat([Buffer.alloc(4), hdr.subarray(1)]);
    const c = crypto.createCipheriv('aes-128-gcm', key, iv); c.setAAD(hdr);
    const ct = Buffer.concat([c.update(pt), c.final()]);
    return Buffer.concat([hdr, c.getAuthTag(), ct]).toString('hex');
}

const frames = [
    { dir: 'fw2be', ver: 1, seq: 0, pt: '{"type":"ping","device_id":"x","free":1}' },
    { dir: 'fw2be', ver: 1, seq: 1, pt: '{"type":"check_assign"}' },
    { dir: 'be2fw', ver: 1, seq: 0, pt: '{"type":"check_jobs","jobs":[]}' },
    { dir: 'be2fw', ver: 2, seq: 1, pt_hex: '0007deadbeef' },
].map(f => {
    const pt = f.pt_hex ? Buffer.from(f.pt_hex, 'hex') : Buffer.from(f.pt, 'utf8');
    return { ...f, frame: frame(keys[f.dir], f.ver, f.seq, pt) };
});

const bad = [
    { opis: 'zmieniony bajt wersji (AAD)', dir: 'fw2be', frame: '02' + frames[0].frame.slice(2) },
    { opis: 'zmieniony bajt szyfrogramu', dir: 'fw2be',
      frame: frames[0].frame.slice(0, -2) + (frames[0].frame.slice(-2) === '00' ? '01' : '00') },
];

process.stdout.write(JSON.stringify({
    spec: 'protokol/ws.md §1.2',
    be_priv: bePriv.toString('hex'),
    be_pub: be.getPublicKey('hex', 'uncompressed'),
    node_priv: nodePriv.toString('hex'),
    node_pub: node.getPublicKey('hex', 'uncompressed'),
    fw_nonce: fwNonce.toString('hex'),
    be_nonce: beNonce.toString('hex'),
    shared_x: shared.toString('hex'),
    key_fw2be: keys.fw2be.toString('hex'),
    key_be2fw: keys.be2fw.toString('hex'),
    frames, bad,
}, null, 2) + '\n');
