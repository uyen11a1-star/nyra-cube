#!/usr/bin/env python3
"""Test Nyra Cube: mô phỏng khối Rubik bằng hình học 3D (độc lập với engine),
rồi kiểm tra engine C++ (qua ctypes) giải đúng.
Chạy: python3 test_cube.py /đường/dẫn/libnyracube.so [số_ván]"""
import ctypes, random, sys, time

SO = sys.argv[1] if len(sys.argv) > 1 else "./libnyracube.so"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 200

# ---------- mô phỏng vật lý ----------
# trục: x phải(R), y lên(U), z hướng về trước(F)
def sticker_pos(face, i):
    r, c = divmod(i, 3)
    if face == 'U': return (c - 1, 1, r - 1), (0, 1, 0)
    if face == 'R': return (1, 1 - r, 1 - c), (1, 0, 0)
    if face == 'F': return (c - 1, 1 - r, 1), (0, 0, 1)
    if face == 'D': return (c - 1, -1, 1 - r), (0, -1, 0)
    if face == 'L': return (-1, 1 - r, c - 1), (-1, 0, 0)
    if face == 'B': return (1 - c, 1 - r, -1), (0, 0, -1)

FACES = "URFDLB"
NORMAL = {'U': (0, 1, 0), 'R': (1, 0, 0), 'F': (0, 0, 1), 'D': (0, -1, 0), 'L': (-1, 0, 0), 'B': (0, 0, -1)}
SLOT = {}
for f in FACES:
    for i in range(9):
        SLOT[sticker_pos(f, i)] = FACES.index(f) * 9 + i

def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def rot_cw(v, n):  # xoay -90° quanh n (thuận chiều kim đồng hồ khi nhìn vào mặt)
    c = cross(n, v); d = dot(n, v)
    return (-c[0] + n[0]*d, -c[1] + n[1]*d, -c[2] + n[2]*d)

def apply_move(state, mv):
    f = mv[0]; k = 1
    if len(mv) > 1: k = 2 if mv[1] == '2' else 3
    n = NORMAL[f]
    new = list(state)
    for (pos, nor), idx in SLOT.items():
        if dot(pos, n) != 1: continue
        p, q = pos, nor
        for _ in range(k): p, q = rot_cw(p, n), rot_cw(q, n)
        new[SLOT[(p, q)]] = state[idx]
    return new

def apply_seq(s, seq):
    st = list(s)
    for m in seq.split(): st = apply_move(st, m)
    return "".join(st)

SOLVED = "".join(f * 9 for f in FACES)

# kiểm tra sim: R trên khối giải xong (chuỗi chuẩn đã biết)
assert apply_seq(SOLVED, "R") == "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB", "sim sai!"
for f in FACES:
    assert apply_seq(SOLVED, f"{f} {f} {f} {f}") == SOLVED

# ---------- engine ----------
lib = ctypes.CDLL(SO)
lib.nyra_cube_solve.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
lib.nyra_cube_apply.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p]
lib.nyra_cube_random.argtypes = [ctypes.c_uint, ctypes.c_char_p]

def solve(fl, maxlen=30, ms=100):
    buf = ctypes.create_string_buffer(256)
    r = lib.nyra_cube_solve(fl.encode(), maxlen, ms, buf, 256)
    return r, buf.value.decode()

def engine_apply(fl, mv):
    buf = ctypes.create_string_buffer(64)
    r = lib.nyra_cube_apply(fl.encode(), mv.encode(), buf)
    return r, buf.value.decode()

t = time.time()
print("init:", solve(SOLVED), f"{time.time()-t:.2f}s (gồm dựng bảng)")

# 1. engine apply == sim cho các nước đơn và chuỗi ngẫu nhiên
random.seed(1)
ALL = [f + s for f in FACES for s in ("", "2", "'")]
def to_sim(seq): return " ".join(m[0] + ("3" if m.endswith("'") else m[1:]) for m in seq.split())
for m in ALL:
    r, out = engine_apply(SOLVED, m)
    assert r == 0 and out == apply_seq(SOLVED, to_sim(m)), f"apply lệch ở {m}"
for _ in range(200):
    seq = " ".join(random.choice(ALL) for _ in range(random.randint(1, 30)))
    r, out = engine_apply(SOLVED, seq)
    assert r == 0 and out == apply_seq(SOLVED, to_sim(seq)), "apply chuỗi lệch"
print("OK: engine_apply khớp mô phỏng vật lý (18 nước đơn + 200 chuỗi ngẫu nhiên)")

# 2. giải các thế xáo bằng sim; kiểm tra lời giải bằng sim
lens, times = [], []
for i in range(N):
    scr = " ".join(random.choice(ALL) for _ in range(random.randint(20, 40)))
    st = apply_seq(SOLVED, to_sim(scr))
    t = time.time(); r, sol = solve(st, 30, 50); dt = time.time() - t
    assert r >= 0, f"giải lỗi {r} ở {scr}"
    assert len(sol.split()) == r
    assert apply_seq(st, to_sim(sol)) == SOLVED, f"lời giải sai: {scr} -> {sol}"
    lens.append(r); times.append(dt)
print(f"OK: {N} thế xáo — độ dài TB {sum(lens)/N:.2f}, max {max(lens)}, thời gian TB {1000*sum(times)/N:.0f}ms, max {1000*max(times):.0f}ms")

# 3. thế ngẫu nhiên đều (random-state)
buf = ctypes.create_string_buffer(64)
lens = []
for i in range(N):
    lib.nyra_cube_random(i + 12345, buf)
    st = buf.value.decode()
    r, sol = solve(st, 30, 50)
    assert r >= 0, f"random-state lỗi {r}"
    assert apply_seq(st, to_sim(sol)) == SOLVED
    lens.append(r)
print(f"OK: {N} thế random-state — độ dài TB {sum(lens)/N:.2f}, max {max(lens)}")

# 4. đã giải sẵn + thế 1 nước
assert solve(SOLVED) == (0, "")
r, sol = solve(apply_seq(SOLVED, "R")); assert (r, sol) == (1, "R'"), (r, sol)
print("OK: thế đã giải / 1 nước")

# 5. thế không hợp lệ phải báo lỗi đúng
def swap(s, i, j):
    l = list(s); l[i], l[j] = l[j], l[i]; return "".join(l)
# xoay 1 góc: đổi 3 ô của góc URF (8, 9, 20) vòng tròn
l = list(SOLVED); l[8], l[9], l[20] = SOLVED[9], SOLVED[20], SOLVED[8]; twist = "".join(l)
r, _ = solve(twist); assert r == -5, r
# lật 1 cạnh UR (5,10)
flip = swap(SOLVED, 5, 10); r, _ = solve(flip); assert r == -3, r
# đổi chỗ 2 cạnh UR, UF (parity lẻ)
l = list(SOLVED); l[5], l[7] = SOLVED[7], SOLVED[5]; l[10], l[19] = SOLVED[19], SOLVED[10]; par = "".join(l)
r, _ = solve(par); assert r == -6, r
# sai số lượng màu
bad = "U" + SOLVED[1:8] + "R" + SOLVED[9:]; r, _ = solve(bad); assert r == -1, r
# độ dài sai
r, _ = solve("UUU"); assert r == -1
print("OK: báo lỗi đúng cho thế không hợp lệ (twist -5, flip -3, parity -6, màu -1)")

# 6. ký tự màu tuỳ ý (xác định theo ô tâm)
st = apply_seq(SOLVED, to_sim("R U F' D2 L B"))
mp = dict(zip("URFDLB", "wrgyob"))
r, sol = solve("".join(mp[c] for c in st)); assert r >= 0
assert apply_seq(st, to_sim(sol)) == SOLVED
print("OK: dùng chữ màu w r g y o b")
print("TẤT CẢ ĐẠT")
