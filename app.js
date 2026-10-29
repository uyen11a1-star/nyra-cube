(function () {
  'use strict';
  const ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const NAME = { U: 'Trắng', R: 'Đỏ', F: 'Xanh lá', D: 'Vàng', L: 'Cam', B: 'Xanh dương' };
  const FACE_VN = { U: 'trên', R: 'phải', F: 'trước', D: 'dưới', L: 'trái', B: 'sau' };
  const SOLVED = ORDER.map(f => f.repeat(9)).join('');
  const ERR = {
    '-1': 'Mỗi màu phải có đúng 9 ô. Xem số đếm dưới bảng màu.',
    '-2': 'Có cạnh không tồn tại trên khối thật (ví dụ cạnh có hai ô cùng màu, hoặc hai màu đối diện). Kiểm tra lại các ô cạnh.',
    '-3': 'Có một cạnh bị lật lẻ nên khối này không giải được. Kiểm tra lại màu các ô cạnh.',
    '-4': 'Có góc không tồn tại trên khối thật. Kiểm tra lại các ô góc.',
    '-5': 'Có một góc bị xoay lệch nên khối này không giải được. Kiểm tra lại màu các ô góc.',
    '-6': 'Hai cạnh hoặc hai góc bị đổi chỗ lẻ nên khối này không giải được. Kiểm tra lại các ô cạnh và góc.',
    '-8': 'Không tìm được lời giải trong giới hạn nước đi.',
    '-9': 'Tìm quá lâu, đã dừng. Thử lại hoặc chọn chế độ Nhanh.'
  };

  const $ = (id) => document.getElementById(id);
  const net = $('net'), paletteEl = $('palette'), statusEl = $('status'), msgEl = $('msg');
  const btnSolve = $('btnSolve'), btnRandom = $('btnRandom'), btnReset = $('btnReset');

  let cube = SOLVED.split('');         // trạng thái đang chỉnh sửa
  let paint = 'R';                     // màu đang chọn
  let ready = false, busy = false;
  let sol = null;                      // { moves, states, idx }
  let playTimer = null;
  let thinkMs = 60;

  // ---------- Dựng giao diện ----------
  const stickers = [];
  ORDER.forEach((f, fi) => {
    const face = document.createElement('div');
    face.className = 'face'; face.dataset.f = f;
    for (let k = 0; k < 9; k++) {
      const b = document.createElement('button');
      b.className = 'st' + (k === 4 ? ' center' : '');
      b.type = 'button';
      const idx = fi * 9 + k;
      b.dataset.i = idx;
      b.setAttribute('aria-label', 'Mặt ' + FACE_VN[f] + ', ô ' + (k + 1));
      if (k === 4) { b.textContent = f; b.tabIndex = -1; }
      b.addEventListener('click', () => onSticker(idx));
      face.appendChild(b); stickers.push(b);
    }
    net.appendChild(face);
  });
  const faceEls = {}; net.querySelectorAll('.face').forEach(e => faceEls[e.dataset.f] = e);

  const swEls = {};
  ORDER.forEach(f => {
    const b = document.createElement('button');
    b.className = 'sw'; b.type = 'button';
    b.setAttribute('aria-label', NAME[f]);
    b.innerHTML = '<i style="background-color:var(--c-' + f + ')"></i><span></span>';
    b.addEventListener('click', () => { paint = f; renderPalette(); });
    paletteEl.appendChild(b); swEls[f] = b;
  });

  function renderPalette() {
    const cnt = {}; ORDER.forEach(f => cnt[f] = 0);
    cube.forEach(c => cnt[c]++);
    ORDER.forEach(f => {
      swEls[f].setAttribute('aria-pressed', f === paint ? 'true' : 'false');
      swEls[f].querySelector('span').textContent = cnt[f] + '/9';
      swEls[f].classList.toggle('bad', cnt[f] !== 9);
    });
  }

  function view() { return sol ? sol.states[sol.idx].split('') : cube; }

  function render() {
    const v = view();
    for (let i = 0; i < 54; i++) stickers[i].dataset.c = v[i];
    renderPalette();
    ORDER.forEach(f => faceEls[f].classList.remove('turn'));
    if (sol) renderResult();
  }

  // ---------- Kết quả & tua ----------
  function moveText(m) { return m.replace("'", '\u2019'); }
  function moveCaption(m) {
    const f = m[0], s = m[1];
    const dir = s === '2' ? 'xoay 180°' : s === "'" ? 'ngược chiều kim đồng hồ' : 'thuận chiều kim đồng hồ';
    return 'Mặt ' + FACE_VN[f] + ', ' + dir;
  }
  function renderResult() {
    $('result').hidden = false;
    const n = sol.moves.length;
    $('count').textContent = n === 0 ? 'Khối đã giải xong' : n + ' nước';
    $('sub').textContent = sol.info;
    const nextEl = $('next');
    ORDER.forEach(f => faceEls[f].classList.remove('turn'));
    if (sol.idx < n) {
      const m = sol.moves[sol.idx];
      nextEl.innerHTML = '<div class="big"></div><div class="cap"></div>';
      nextEl.querySelector('.big').textContent = moveText(m);
      nextEl.querySelector('.cap').textContent = moveCaption(m);
      faceEls[m[0]].classList.add('turn');
    } else {
      nextEl.innerHTML = '<div class="cap">Xong. Khối đã về nguyên.</div>';
    }
    const chips = $('chips'); chips.innerHTML = '';
    sol.moves.forEach((m, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (i < sol.idx ? ' done' : '') + (i === sol.idx - 1 ? ' cur' : '');
      b.textContent = moveText(m);
      b.setAttribute('aria-label', 'Nước ' + (i + 1) + ': ' + moveText(m));
      b.addEventListener('click', () => { stopPlay(); go(i + 1); });
      li.appendChild(b); chips.appendChild(li);
    });
    $('cFirst').disabled = $('cPrev').disabled = sol.idx === 0;
    $('cNext').disabled = $('cLast').disabled = sol.idx >= n;
    $('cPlay').disabled = n === 0;
    const cur = chips.querySelector('.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function go(i) { if (!sol) return; sol.idx = Math.max(0, Math.min(sol.moves.length, i)); render(); }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    $('iPlay').innerHTML = '<path d="M8 5l11 7-11 7z"/>';
    $('cPlay').setAttribute('aria-label', 'Chạy tự động');
  }
  function startPlay() {
    if (!sol) return;
    if (sol.idx >= sol.moves.length) go(0);
    $('iPlay').innerHTML = '<path d="M7 5v14M17 5v14"/>';
    $('cPlay').setAttribute('aria-label', 'Tạm dừng');
    playTimer = setInterval(() => {
      if (!sol || sol.idx >= sol.moves.length) { stopPlay(); return; }
      go(sol.idx + 1);
      if (sol.idx >= sol.moves.length) stopPlay();
    }, 800);
  }
  $('cFirst').onclick = () => { stopPlay(); go(0); };
  $('cPrev').onclick = () => { stopPlay(); go(sol.idx - 1); };
  $('cNext').onclick = () => { stopPlay(); go(sol.idx + 1); };
  $('cLast').onclick = () => { stopPlay(); go(sol.moves.length); };
  $('cPlay').onclick = () => { playTimer ? stopPlay() : startPlay(); };
  $('btnCopy').onclick = async () => {
    const t = sol ? sol.moves.join(' ') : '';
    try { await navigator.clipboard.writeText(t); showMsg('Đã chép: ' + t, true); } catch (e) { showMsg(t, true); }
  };

  // ---------- Thao tác ----------
  function showMsg(t, info) { msgEl.hidden = !t; msgEl.textContent = t || ''; msgEl.classList.toggle('info', !!info); }
  function clearSolution() { stopPlay(); if (sol) { cube = sol.states[sol.idx].split(''); sol = null; $('result').hidden = true; } }
  function setBusy(b) {
    busy = b;
    btnSolve.disabled = btnRandom.disabled = btnReset.disabled = b || !ready;
    btnSolve.textContent = b ? 'Đang giải…' : 'Giải';
  }

  function onSticker(i) {
    if (i % 9 === 4 || busy) return;
    if (sol) { clearSolution(); }
    showMsg('');
    cube[i] = paint;
    render();
  }

  btnReset.onclick = () => { clearSolution(); sol = null; $('result').hidden = true; cube = SOLVED.split(''); showMsg(''); render(); };
  btnRandom.onclick = () => {
    if (!ready || busy) return;
    clearSolution(); showMsg('');
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    worker.postMessage({ type: 'random', seed });
  };
  btnSolve.onclick = () => {
    if (!ready || busy) return;
    const f = view().join('');
    stopPlay(); showMsg('');
    if (sol) { cube = f.split(''); sol = null; $('result').hidden = true; }
    const cnt = {}; cube.forEach(c => cnt[c] = (cnt[c] || 0) + 1);
    setBusy(true);
    worker.postMessage({ type: 'solve', facelets: cube.join(''), maxLen: 30, ms: thinkMs });
  };
  document.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg-b').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
    b.classList.add('on'); b.setAttribute('aria-checked', 'true'); thinkMs = +b.dataset.ms;
  }));

  // ---------- Worker ----------
  let worker;
  try { worker = new Worker('cube-worker.js?v=1'); } catch (e) { fatal(String(e)); }
  function fatal(t) {
    statusEl.textContent = 'Lỗi engine'; statusEl.className = 'status err';
    showMsg('Không nạp được engine. Hãy mở trang qua http(s), không mở trực tiếp bằng file://. (' + t + ')');
  }
  if (worker) {
    worker.onerror = (e) => fatal(e.message || 'worker');
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'ready') {
        ready = true; setBusy(false);
        statusEl.textContent = 'Engine sẵn sàng'; statusEl.className = 'status ok';
        statusEl.title = 'Dựng bảng tra ' + Math.round(d.initMs) + ' ms';
      } else if (d.type === 'fatal') { fatal(d.message); }
      else if (d.type === 'random') { cube = d.facelets.split(''); render(); }
      else if (d.type === 'solved') {
        setBusy(false);
        if (!d.ok) { showMsg(ERR[String(d.err)] || ('Lỗi ' + d.err)); return; }
        sol = { moves: d.moves, states: d.states, idx: 0, info: 'Tìm trong ' + Math.max(1, Math.round(d.ms)) + ' ms' };
        render();
        $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
  }
  setBusy(false); btnSolve.disabled = btnRandom.disabled = btnReset.disabled = true;
  render();
  window.__nyra = { get cube() { return cube.join(''); }, get sol() { return sol; } };
})();
