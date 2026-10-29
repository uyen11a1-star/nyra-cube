// Worker: nạp engine, dựng bảng một lần, rồi trả lời yêu cầu từ giao diện
importScripts('nyra-cube.js?v=1');
let eng = null;
const ready = NyraCube.load('nyra-cube.wasm?v=1').then(e => { eng = e; postMessage({ type: 'ready', initMs: e.initMs }); })
  .catch(err => postMessage({ type: 'fatal', message: String(err) }));

onmessage = async (ev) => {
  await ready;
  if (!eng) return;
  const d = ev.data;
  if (d.type === 'solve') {
    const t = performance.now();
    const r = eng.solve(d.facelets, d.maxLen || 30, d.ms || 300);
    r.ms = performance.now() - t; r.id = d.id; r.type = 'solved';
    if (r.ok && d.states) {
      // trạng thái sau từng nước để giao diện tua
      r.states = [d.facelets];
      let cur = d.facelets;
      for (const m of r.moves) { cur = eng.apply(cur, m); r.states.push(cur); }
    }
    postMessage(r);
  } else if (d.type === 'random') {
    postMessage({ type: 'random', facelets: eng.random(d.seed), id: d.id });
  } else if (d.type === 'apply') {
    postMessage({ type: 'applied', facelets: eng.apply(d.facelets, d.moves), id: d.id });
  }
};
