// Wektor agregatu dziennego pomiarów (measure.md §3). Niezależna implementacja: sortowanie
// i percentyl liczone tu wprost, bez kodu backendu.   node gen/measure-daily.js > measure-daily.json
const recs = [];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const day = Date.UTC(2026, 9, 30) / 1000;

// ASN 5617 (PL): 6 nodów, w tym jeden ze złym WiFi i jeden z wolną siecią domową
for (let n = 0; n < 6; n++) {
    const id = 'pl' + n;
    for (let i = 0; i < 20; i++) {
        const ok = rnd() > 0.05;
        recs.push({ device_id: id, asn: 5617, region: 'PL', ts: day + i * 3000 + n, kind: 'net.icmp', tk: 'target',
            ok, rtt: ok ? +(15 + rnd() * 10 + (n === 4 ? 40 : 0)).toFixed(1) : null, loss: ok ? 0 : 100 });
    }
    recs.push({ device_id: id, asn: 5617, region: 'PL', ts: day + 10, kind: 'net.lan', tk: 'gateway', ok: true,
        rtt: n === 5 ? 35 : 2 + n * 0.5 });
    recs.push({ device_id: id, asn: 5617, region: 'PL', ts: day + 11, kind: 'net.wifi', tk: 'gateway', ok: true,
        val: n === 4 ? -82 : -60 });
}
// ASN 12741 (PL): 2 nody, mniej danych; pomiar peer nie wchodzi do agregatu
for (let n = 0; n < 2; n++) {
    for (let i = 0; i < 10; i++)
        recs.push({ device_id: 'nt' + n, asn: 12741, region: 'PL', ts: day + i * 5000, kind: 'net.dns', tk: 'target',
            ok: true, rtt: 30 + i, loss: null });
    recs.push({ device_id: 'nt' + n, asn: 12741, region: 'PL', ts: day + 7, kind: 'net.icmp', tk: 'peer', ok: true, rtt: 50 });
}
// rekord z następnego dnia — poza agregatem
recs.push({ device_id: 'pl0', asn: 5617, region: 'PL', ts: day + 86400, kind: 'net.icmp', tk: 'target', ok: true, rtt: 999 });

function pct(sorted, p) {
    if (!sorted.length) return null;
    const x = p * (sorted.length - 1), lo = Math.floor(x), hi = Math.ceil(x);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}
const inDay = recs.filter(r => r.ts >= day && r.ts < day + 86400);
const med = (id, kind, f) => pct(inDay.filter(r => r.device_id === id && r.kind === kind && f(r) != null).map(f).sort((a, b) => a - b), 0.5);
const bad = new Set();
for (const id of new Set(inDay.map(r => r.device_id))) {
    const lan = med(id, 'net.lan', r => (r.ok ? r.rtt : null)), wifi = med(id, 'net.wifi', r => r.val);
    if ((lan != null && lan > 20) || (wifi != null && wifi < -75)) bad.add(id);
}
const groups = new Map();
for (const r of inDay) {
    if (bad.has(r.device_id) || !(r.tk === 'target' || r.kind === 'net.lan')) continue;
    const k = [r.asn || 0, r.region || '', r.kind].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
}
const round = v => (v == null ? null : Math.round(v * 100) / 100);
const rows = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, rs]) => {
    const [asn, region, kind] = k.split('|');
    const rtts = rs.filter(r => r.ok && r.rtt != null).map(r => r.rtt).sort((a, b) => a - b);
    const loss = rs.reduce((s, r) => s + (r.loss != null ? r.loss : (r.ok ? 0 : 100)), 0) / rs.length;
    return { asn: +asn, region, kind, p50: round(pct(rtts, 0.5)), p95: round(pct(rtts, 0.95)), loss_pct: round(loss),
             nodes: new Set(rs.map(r => r.device_id)).size, samples: rs.length };
});

console.log(JSON.stringify({ day: '2026-10-30', excluded_nodes: [...bad].sort(), records: recs, daily: rows }, null, 1));
