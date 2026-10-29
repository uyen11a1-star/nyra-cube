// Nyra Cube — bộ nạp WebAssembly (dùng trong Worker qua importScripts, hoặc Node qua require)
(function (root) {
  async function load(source) {
    let mem = null;
    const wasi = {
      clock_time_get(id, prec, out) {
        new DataView(mem.buffer).setBigUint64(out, BigInt(Math.floor(performance.now() * 1e6)), true);
        return 0;
      },
      fd_write(fd, iovs, n, outp) {
        const dv = new DataView(mem.buffer); let total = 0;
        for (let i = 0; i < n; i++) total += dv.getUint32(iovs + i * 8 + 4, true);
        dv.setUint32(outp, total, true); return 0;
      },
      fd_close() { return 0; },
      fd_seek() { return 70; }
    };
    let inst;
    if (typeof source === 'string') {
      const resp = await fetch(source);
      const buf = await resp.arrayBuffer();
      inst = (await WebAssembly.instantiate(buf, { wasi_snapshot_preview1: wasi })).instance;
    } else {
      inst = (await WebAssembly.instantiate(source, { wasi_snapshot_preview1: wasi })).instance;
    }
    const x = inst.exports; mem = x.memory;
    x._initialize();
    const enc = new TextEncoder(), dec = new TextDecoder();
    const put = (s) => { const b = enc.encode(s + '\0'); const p = x.nyra_alloc(b.length); new Uint8Array(mem.buffer, p, b.length).set(b); return p; };
    const get = (p) => { const u = new Uint8Array(mem.buffer); let e = p; while (u[e]) e++; return dec.decode(u.subarray(p, e)); };

    const t0 = performance.now();
    x.nyra_cube_init();
    const initMs = performance.now() - t0;

    return {
      initMs,
      // -> { ok, moves: [..], err }
      solve(facelets, maxLen, ms) {
        const a = put(facelets), o = x.nyra_alloc(256);
        const r = x.nyra_cube_solve(a, maxLen, ms, o, 256);
        const s = r >= 0 ? get(o) : '';
        x.nyra_free(a); x.nyra_free(o);
        return r >= 0 ? { ok: true, moves: s ? s.split(' ') : [] } : { ok: false, err: r };
      },
      apply(facelets, moves) {
        const a = put(facelets), m = put(moves), o = x.nyra_alloc(64);
        const r = x.nyra_cube_apply(a, m, o);
        const s = r === 0 ? get(o) : null;
        x.nyra_free(a); x.nyra_free(m); x.nyra_free(o);
        return s;
      },
      random(seed) {
        const o = x.nyra_alloc(64);
        x.nyra_cube_random(seed >>> 0, o);
        const s = get(o); x.nyra_free(o); return s;
      }
    };
  }
  const api = { load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NyraCube = api;
})(typeof self !== 'undefined' ? self : this);
