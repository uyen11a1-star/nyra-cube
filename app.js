import * as THREE from './three.module.min.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const COLOR = { U: 0xF4F4EF, R: 0xD8342B, F: 0x1E9B58, D: 0xF1C40F, L: 0xF28C1B, B: 0x2A5BD7 };
const NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const FACE_DEF = { U: { axis: 'y', sign: 1 }, D: { axis: 'y', sign: -1 }, R: { axis: 'x', sign: 1 }, L: { axis: 'x', sign: -1 }, F: { axis: 'z', sign: 1 }, B: { axis: 'z', sign: -1 } };

const $ = (id) => document.getElementById(id);
const cv = $('cv'), statusEl = $('status'), msgEl = $('msg'), progEl = $('prog');
const btnSolve = $('btnSolve'), btnScramble = $('btnScramble'), btnReset = $('btnReset');

// ---------- Cảnh 3D ----------
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 12.4);
scene.add(new THREE.AmbientLight(0xffffff, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(3, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-5, -2, -3); scene.add(fill);

const view = new THREE.Group(); view.position.y = 0.3; scene.add(view);
const cubeGroup = new THREE.Group(); view.add(cubeGroup);
let yaw = -0.62, pitch = 0.5;
view.rotation.set(pitch, yaw, 0);

function roundedRect(w, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -w / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + w - r); s.absarc(x + w - r, y + w - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + w); s.absarc(x + r, y + w - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return new THREE.ShapeGeometry(s, 6);
}
const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.65, metalness: 0 });
const stGeo = roundedRect(0.82, 0.14);
const stMat = {}; for (const f in COLOR) stMat[f] = new THREE.MeshStandardMaterial({ color: COLOR[f], roughness: 0.4, metalness: 0 });

const cubies = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  const c = new THREE.Mesh(bodyGeo, bodyMat);
  c.position.set(x, y, z);
  c.userData.home = [x, y, z];
  c.userData.stickers = [];
  for (const f in NORMAL) {
    const n = NORMAL[f];
    if (n[0] * x + n[1] * y + n[2] * z !== 1) continue;  // chỉ mặt nằm ngoài khối
    const s = new THREE.Mesh(stGeo, stMat[f]);
    const nv = new THREE.Vector3(n[0], n[1], n[2]);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
    s.position.copy(nv).multiplyScalar(0.486);
    s.userData.n = nv; s.userData.letter = f;
    c.add(s); c.userData.stickers.push(s);
  }
  cubeGroup.add(c); cubies.push(c);
}

let dirty = true;
function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(cv.parentElement); resize();
(function loop() { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); })();

// kéo để xoay góc nhìn
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag.x) * 0.011; pitch += (e.clientY - drag.y) * 0.011;
  pitch = Math.max(-1.45, Math.min(1.45, pitch));
  drag.x = e.clientX; drag.y = e.clientY;
  view.rotation.set(pitch, yaw, 0); dirty = true;
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

// ---------- Xoay lớp ----------
function snap(c) {
  c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion), e = m.elements;
  for (let i = 0; i < 16; i++) e[i] = Math.abs(e[i]) < 1e-3 ? 0 : Math.round(e[i]);
  c.quaternion.setFromRotationMatrix(m); c.updateMatrix();
}
function turnMove(m, dur) {
  return new Promise((resolve) => {
    const f = m[0], q = m[1] === '2' ? 2 : m[1] === "'" ? -1 : 1, d = FACE_DEF[f];
    const layer = cubies.filter(c => Math.round(c.position[d.axis]) === d.sign);
    const pivot = new THREE.Group(); cubeGroup.add(pivot);
    layer.forEach(c => pivot.attach(c));
    const target = -d.sign * q * Math.PI / 2, t0 = performance.now(), total = dur * (q === 2 ? 1.5 : 1);
    (function step(now) {
      const t = Math.min(1, (now - t0) / total), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      pivot.rotation[d.axis] = target * e; dirty = true;
      if (t < 1) { requestAnimationFrame(step); return; }
      pivot.rotation[d.axis] = target; pivot.updateMatrixWorld(true);
      layer.forEach(c => { cubeGroup.attach(c); snap(c); });
      cubeGroup.remove(pivot); dirty = true; resolve();
    })(t0);
  });
}
// vị trí + hướng của ô thứ i trên mặt f (cùng quy ước với engine)
function slot(f, i) {
  const r = Math.floor(i / 3), c = i % 3;
  switch (f) {
    case 'U': return { p: [c - 1, 1, r - 1], n: [0, 1, 0] };
    case 'R': return { p: [1, 1 - r, 1 - c], n: [1, 0, 0] };
    case 'F': return { p: [c - 1, 1 - r, 1], n: [0, 0, 1] };
    case 'D': return { p: [c - 1, -1, 1 - r], n: [0, -1, 0] };
    case 'L': return { p: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    default: return { p: [1 - c, 1 - r, -1], n: [0, 0, -1] };
  }
}
// đọc trạng thái thật từ khối 3D -> chuỗi 54 ô
function read3d() {
  let out = '';
  const v = new THREE.Vector3();
  for (const f of 'URFDLB') for (let i = 0; i < 9; i++) {
    const { p, n } = slot(f, i);
    const c = cubies.find(cb => cb.position.x === p[0] && cb.position.y === p[1] && cb.position.z === p[2]);
    let ch = '?';
    for (const s of c.userData.stickers) {
      v.copy(s.userData.n).applyQuaternion(c.quaternion);
      if (Math.round(v.x) === n[0] && Math.round(v.y) === n[1] && Math.round(v.z) === n[2]) { ch = s.userData.letter; break; }
    }
    out += ch;
  }
  return out;
}
function resetCube() {
  cubies.forEach(c => { c.position.set(...c.userData.home); c.quaternion.identity(); c.updateMatrix(); });
  dirty = true;
}

// ---------- Điều khiển ----------
let ready = false, busy = false, solving = false, cancel = false, moveMs = 380, thinkMs = 400;
function showMsg(t, info) { msgEl.hidden = !t; msgEl.textContent = t || ''; msgEl.classList.toggle('info', !!info); }
function setBusy(b, isSolving) {
  busy = b; solving = !!isSolving;
  btnScramble.disabled = btnReset.disabled = b || !ready;
  btnSolve.disabled = !ready || (b && !solving);
  btnSolve.textContent = solving ? 'Dừng' : 'Giải';
}

btnReset.onclick = () => { if (busy) return; resetCube(); progEl.textContent = ''; showMsg(''); };
btnScramble.onclick = async () => {
  if (busy || !ready) return;
  showMsg(''); setBusy(true); progEl.textContent = 'Đang xáo…';
  const F = 'URFDLB'; let last = -1; const seq = [];
  while (seq.length < 20) {
    const f = Math.floor(Math.random() * 6); if (f === last) continue; last = f;
    seq.push(F[f] + ['', '2', "'"][Math.floor(Math.random() * 3)]);
  }
  for (const m of seq) await turnMove(m, 85);
  progEl.textContent = ''; setBusy(false);
};
btnSolve.onclick = () => {
  if (!ready) return;
  if (solving) { cancel = true; return; }
  if (busy) return;
  showMsg('');
  const fl = read3d();
  if (fl === SOLVED) { showMsg('Khối đang nguyên rồi. Bấm “Xáo ngẫu nhiên” để thử.', true); return; }
  setBusy(true, true); progEl.textContent = 'AI đang tính…';
  worker.postMessage({ type: 'solve', facelets: fl, maxLen: 30, ms: thinkMs });
};
document.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.seg-b').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
  b.classList.add('on'); b.setAttribute('aria-checked', 'true'); moveMs = +b.dataset.ms; thinkMs = +b.dataset.think;
}));

async function playSolution(moves) {
  cancel = false;
  for (let i = 0; i < moves.length; i++) {
    if (cancel) { progEl.textContent = 'Đã dừng'; setBusy(false); return; }
    progEl.textContent = 'Bước ' + (i + 1) + '/' + moves.length;
    await turnMove(moves[i], moveMs);
  }
  progEl.textContent = 'Xong, giải trong ' + moves.length + ' nước';
  setBusy(false);
}

// ---------- Worker (engine wasm) ----------
let worker;
function fatal(t) {
  statusEl.textContent = 'Lỗi engine'; statusEl.className = 'status err';
  showMsg('Không nạp được engine. Hãy mở trang qua http(s), không mở trực tiếp bằng file://. (' + t + ')');
}
try { worker = new Worker('cube-worker.js?v=2'); } catch (e) { fatal(String(e)); }
if (worker) {
  worker.onerror = (e) => fatal(e.message || 'worker');
  worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.type === 'ready') {
      ready = true; setBusy(false);
      statusEl.textContent = 'Engine sẵn sàng'; statusEl.className = 'status ok';
      statusEl.title = 'Dựng bảng tra ' + Math.round(d.initMs) + ' ms';
    } else if (d.type === 'fatal') { fatal(d.message); }
    else if (d.type === 'solved') {
      if (!d.ok) { setBusy(false); progEl.textContent = ''; showMsg('Không tìm được lời giải (mã ' + d.err + ').'); return; }
      playSolution(d.moves);
    }
  };
}
setBusy(false); btnSolve.disabled = btnScramble.disabled = btnReset.disabled = true;
window.__nyra = { read: read3d, get busy() { return busy; }, turn: turnMove, resetCube };
