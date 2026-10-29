// Nyra Cube — bộ giải Rubik 3x3 (thuật toán hai pha kiểu Kociemba), một file C++.
// Build native (test):  g++ -O2 -shared -fPIC -o libnyracube.so nyra_cube.cpp
// Build wasm: xem BUILD.txt
//
// Quy ước (giống chuẩn Kociemba):
//  - Chuỗi 54 ô theo thứ tự mặt U R F D L B, mỗi mặt 9 ô đọc từ trái->phải, trên->dưới
//    (U nhìn từ trên với B ở phía trên; D nhìn từ dưới với F ở phía trên).
//  - Màu của mỗi ô được xác định theo ô tâm của mặt đó, nên có thể dùng 6 ký tự bất kỳ khác nhau.
//  - Nước đi: U R F D L B, hậu tố "'" (ngược chiều) hoặc "2" (xoay đôi).
#include <cstdint>
#include <cstring>
#include <chrono>
#include <vector>
#include <algorithm>

#if defined(__wasm__)
#define NYRA_EXPORT(name) __attribute__((export_name(name)))
#else
#define NYRA_EXPORT(name)
#endif

namespace {

typedef uint8_t u8;
typedef uint16_t u16;

enum { FU, FR, FF, FD, FL, FB };
enum { URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB };
enum { UR, UF, UL, UB, DR, DF, DL, DB, FRe, FLe, BLe, BRe };

struct Cubie { u8 cp[8], co[8], ep[12], eo[12]; };

// Chỉ số ô: U 0-8, R 9-17, F 18-26, D 27-35, L 36-44, B 45-53
const int cornerFacelet[8][3] = {
  {8, 9, 20}, {6, 18, 38}, {0, 36, 47}, {2, 45, 11},
  {29, 26, 15}, {27, 44, 24}, {33, 53, 42}, {35, 17, 51}};
const int edgeFacelet[12][2] = {
  {5, 10}, {7, 19}, {3, 37}, {1, 46}, {32, 16}, {28, 25},
  {30, 43}, {34, 52}, {23, 12}, {21, 41}, {50, 39}, {48, 14}};
const int cornerColor[8][3] = {
  {FU, FR, FF}, {FU, FF, FL}, {FU, FL, FB}, {FU, FB, FR},
  {FD, FF, FR}, {FD, FL, FF}, {FD, FB, FL}, {FD, FR, FB}};
const int edgeColor[12][2] = {
  {FU, FR}, {FU, FF}, {FU, FL}, {FU, FB}, {FD, FR}, {FD, FF},
  {FD, FL}, {FD, FB}, {FF, FR}, {FF, FL}, {FB, FL}, {FB, FR}};

void setIdentity(Cubie& c) {
  for (int i = 0; i < 8; i++) { c.cp[i] = (u8)i; c.co[i] = 0; }
  for (int i = 0; i < 12; i++) { c.ep[i] = (u8)i; c.eo[i] = 0; }
}
void cornerMul(const Cubie& a, const Cubie& b, Cubie& c) {
  u8 p[8], o[8];
  for (int i = 0; i < 8; i++) { p[i] = a.cp[b.cp[i]]; o[i] = (u8)((a.co[b.cp[i]] + b.co[i]) % 3); }
  memcpy(c.cp, p, 8); memcpy(c.co, o, 8);
}
void edgeMul(const Cubie& a, const Cubie& b, Cubie& c) {
  u8 p[12], o[12];
  for (int i = 0; i < 12; i++) { p[i] = a.ep[b.ep[i]]; o[i] = (u8)((a.eo[b.ep[i]] + b.eo[i]) % 2); }
  memcpy(c.ep, p, 12); memcpy(c.eo, o, 12);
}
void mul(const Cubie& a, const Cubie& b, Cubie& c) { cornerMul(a, b, c); edgeMul(a, b, c); }

Cubie baseMove[6];
Cubie moveAll[18];  // face*3 + (0: quay thuận, 1: 180°, 2: ngược)

void buildMoves() {
  struct Def { u8 cp[8], co[8], ep[12], eo[12]; };
  const Def defs[6] = {
    // U
    {{UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB}, {0, 0, 0, 0, 0, 0, 0, 0},
     {UB, UR, UF, UL, DR, DF, DL, DB, FRe, FLe, BLe, BRe}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
    // R
    {{DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR}, {2, 0, 0, 1, 1, 0, 0, 2},
     {FRe, UF, UL, UB, BRe, DF, DL, DB, DR, FLe, BLe, UR}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
    // F
    {{UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB}, {1, 2, 0, 0, 2, 1, 0, 0},
     {UR, FLe, UL, UB, DR, FRe, DL, DB, UF, DF, BLe, BRe}, {0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0}},
    // D
    {{URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR}, {0, 0, 0, 0, 0, 0, 0, 0},
     {UR, UF, UL, UB, DF, DL, DB, DR, FRe, FLe, BLe, BRe}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
    // L
    {{URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB}, {0, 1, 2, 0, 0, 2, 1, 0},
     {UR, UF, BLe, UB, DR, DF, FLe, DB, FRe, UL, DL, BRe}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
    // B
    {{URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL}, {0, 0, 1, 2, 0, 0, 2, 1},
     {UR, UF, UL, BRe, DR, DF, DL, BLe, FRe, FLe, UB, DB}, {0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1}}};
  for (int f = 0; f < 6; f++) {
    memcpy(baseMove[f].cp, defs[f].cp, 8); memcpy(baseMove[f].co, defs[f].co, 8);
    memcpy(baseMove[f].ep, defs[f].ep, 12); memcpy(baseMove[f].eo, defs[f].eo, 12);
  }
  for (int f = 0; f < 6; f++) {
    moveAll[f * 3] = baseMove[f];
    mul(baseMove[f], baseMove[f], moveAll[f * 3 + 1]);
    mul(moveAll[f * 3 + 1], baseMove[f], moveAll[f * 3 + 2]);
  }
}

// ---------- Tọa độ ----------
int binom[13][13];
int sliceMask[495];
const int NTWIST = 2187, NFLIP = 2048, NSLICE = 495, NPERM8 = 40320, NSP = 24;
const int P2MOVES[10] = {0, 1, 2, 4, 7, 9, 10, 11, 13, 16};  // U U2 U' R2 F2 D D2 D' L2 B2

int twistOf(const Cubie& c) { int t = 0; for (int i = 0; i < 7; i++) t = 3 * t + c.co[i]; return t; }
void setTwist(Cubie& c, int t) {
  int s = 0;
  for (int i = 6; i >= 0; i--) { c.co[i] = (u8)(t % 3); s += t % 3; t /= 3; }
  c.co[7] = (u8)((3 - s % 3) % 3);
}
int flipOf(const Cubie& c) { int f = 0; for (int i = 0; i < 11; i++) f = 2 * f + c.eo[i]; return f; }
void setFlip(Cubie& c, int f) {
  int s = 0;
  for (int i = 10; i >= 0; i--) { c.eo[i] = (u8)(f % 2); s += f % 2; f /= 2; }
  c.eo[11] = (u8)(s % 2);
}
int sliceFromMask(int mask) {
  int a = 0, x = 0;
  for (int j = 11; j >= 0; j--) if ((mask >> j) & 1) { a += binom[11 - j][x + 1]; x++; }
  return a;
}
int sliceOf(const Cubie& c) {
  int a = 0, x = 0;
  for (int j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += binom[11 - j][x + 1]; x++; }
  return a;
}
void setSlice(Cubie& c, int s) {
  int mask = sliceMask[s], nextSlice = 8, nextOther = 0;
  for (int j = 0; j < 12; j++) c.ep[j] = ((mask >> j) & 1) ? (u8)nextSlice++ : (u8)nextOther++;
}
int encPerm(const u8* p, int n) {
  int idx = 0;
  for (int i = 0; i < n; i++) {
    int c = 0;
    for (int j = i + 1; j < n; j++) if (p[j] < p[i]) c++;
    idx = idx * (n - i) + c;
  }
  return idx;
}
void decPerm(int idx, u8* p, int n) {
  int dig[8];
  for (int i = n - 1; i >= 0; i--) { dig[i] = idx % (n - i); idx /= (n - i); }
  bool used[8] = {false};
  for (int i = 0; i < n; i++) {
    int k = dig[i];
    for (int v = 0; v < n; v++) if (!used[v]) { if (k == 0) { p[i] = (u8)v; used[v] = true; break; } k--; }
  }
}
int cpOf(const Cubie& c) { return encPerm(c.cp, 8); }
int ep8Of(const Cubie& c) { return encPerm(c.ep, 8); }
int spOf(const Cubie& c) { u8 t[4]; for (int i = 0; i < 4; i++) t[i] = (u8)(c.ep[8 + i] - 8); return encPerm(t, 4); }

// ---------- Bảng chuyển & bảng cắt tỉa ----------
std::vector<u16> twistMove, flipMove, sliceMove, cpMove, epMove;
std::vector<u8> spMove;
std::vector<u8> pruneST, pruneSF, pruneCS, pruneES;
bool g_ready = false;

template <class FA, class FB>
void buildPrune(std::vector<u8>& t, int nA, int nB, int nMoves, FA mA, FB mB) {
  size_t total = (size_t)nA * nB;
  t.assign(total, 255);
  t[0] = 0;
  size_t done = 1;
  for (int depth = 0; done < total; depth++) {
    size_t added = 0;
    for (size_t i = 0; i < total; i++) {
      if (t[i] != depth) continue;
      int a = (int)(i / nB), b = (int)(i % nB);
      for (int m = 0; m < nMoves; m++) {
        size_t j = (size_t)mA(a, m) * nB + mB(b, m);
        if (t[j] == 255) { t[j] = (u8)(depth + 1); added++; }
      }
    }
    if (added == 0) break;
    done += added;
  }
}

void initTables() {
  if (g_ready) return;
  for (int n = 0; n < 13; n++) { binom[n][0] = 1; for (int k = 1; k < 13; k++) binom[n][k] = (n == 0) ? 0 : binom[n - 1][k - 1] + binom[n - 1][k]; }
  for (int m = 0; m < 4096; m++) if (__builtin_popcount(m) == 4) sliceMask[sliceFromMask(m)] = m;
  buildMoves();

  twistMove.resize(NTWIST * 18); flipMove.resize(NFLIP * 18); sliceMove.resize(NSLICE * 18);
  for (int t = 0; t < NTWIST; t++) for (int m = 0; m < 18; m++) {
    Cubie c; setIdentity(c); setTwist(c, t); cornerMul(c, moveAll[m], c); twistMove[t * 18 + m] = (u16)twistOf(c);
  }
  for (int f = 0; f < NFLIP; f++) for (int m = 0; m < 18; m++) {
    Cubie c; setIdentity(c); setFlip(c, f); edgeMul(c, moveAll[m], c); flipMove[f * 18 + m] = (u16)flipOf(c);
  }
  for (int s = 0; s < NSLICE; s++) for (int m = 0; m < 18; m++) {
    Cubie c; setIdentity(c); setSlice(c, s); edgeMul(c, moveAll[m], c); sliceMove[s * 18 + m] = (u16)sliceOf(c);
  }
  cpMove.resize((size_t)NPERM8 * 10); epMove.resize((size_t)NPERM8 * 10); spMove.resize(NSP * 10);
  for (int p = 0; p < NPERM8; p++) for (int k = 0; k < 10; k++) {
    Cubie c; setIdentity(c);
    decPerm(p, c.cp, 8); cornerMul(c, moveAll[P2MOVES[k]], c); cpMove[(size_t)p * 10 + k] = (u16)cpOf(c);
    setIdentity(c); decPerm(p, c.ep, 8); edgeMul(c, moveAll[P2MOVES[k]], c); epMove[(size_t)p * 10 + k] = (u16)ep8Of(c);
  }
  for (int p = 0; p < NSP; p++) for (int k = 0; k < 10; k++) {
    Cubie c; setIdentity(c); u8 t[4]; decPerm(p, t, 4);
    for (int i = 0; i < 4; i++) c.ep[8 + i] = (u8)(8 + t[i]);
    edgeMul(c, moveAll[P2MOVES[k]], c); spMove[p * 10 + k] = (u8)spOf(c);
  }

  buildPrune(pruneST, NSLICE, NTWIST, 18,
             [](int a, int m) { return (int)sliceMove[a * 18 + m]; }, [](int b, int m) { return (int)twistMove[b * 18 + m]; });
  buildPrune(pruneSF, NSLICE, NFLIP, 18,
             [](int a, int m) { return (int)sliceMove[a * 18 + m]; }, [](int b, int m) { return (int)flipMove[b * 18 + m]; });
  buildPrune(pruneCS, NSP, NPERM8, 10,
             [](int a, int m) { return (int)spMove[a * 10 + m]; }, [](int b, int m) { return (int)cpMove[(size_t)b * 10 + m]; });
  buildPrune(pruneES, NSP, NPERM8, 10,
             [](int a, int m) { return (int)spMove[a * 10 + m]; }, [](int b, int m) { return (int)epMove[(size_t)b * 10 + m]; });
  g_ready = true;
}

// ---------- Chuyển đổi 54 ô <-> cubie ----------
int parity(const u8* p, int n) { int inv = 0; for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) if (p[i] > p[j]) inv++; return inv & 1; }

int parseFacelets(const char* s, Cubie& c) {
  if (!s || strlen(s) != 54) return -1;
  int map[256]; for (int i = 0; i < 256; i++) map[i] = -1;
  static const int centers[6] = {4, 13, 22, 31, 40, 49};
  for (int f = 0; f < 6; f++) { u8 ch = (u8)s[centers[f]]; if (map[ch] != -1) return -1; map[ch] = f; }
  int col[54], cnt[6] = {0};
  for (int i = 0; i < 54; i++) { int v = map[(u8)s[i]]; if (v < 0) return -1; col[i] = v; cnt[v]++; }
  for (int f = 0; f < 6; f++) if (cnt[f] != 9) return -1;
  for (int i = 0; i < 8; i++) {
    int ori = 0;
    for (; ori < 3; ori++) { int cc = col[cornerFacelet[i][ori]]; if (cc == FU || cc == FD) break; }
    if (ori == 3) return -4;
    int c1 = col[cornerFacelet[i][(ori + 1) % 3]], c2 = col[cornerFacelet[i][(ori + 2) % 3]];
    bool ok = false;
    for (int j = 0; j < 8; j++) if (c1 == cornerColor[j][1] && c2 == cornerColor[j][2]) { c.cp[i] = (u8)j; c.co[i] = (u8)ori; ok = true; break; }
    if (!ok) return -4;
  }
  for (int i = 0; i < 12; i++) {
    bool ok = false;
    int a = col[edgeFacelet[i][0]], b = col[edgeFacelet[i][1]];
    for (int j = 0; j < 12 && !ok; j++) {
      if (a == edgeColor[j][0] && b == edgeColor[j][1]) { c.ep[i] = (u8)j; c.eo[i] = 0; ok = true; }
      else if (a == edgeColor[j][1] && b == edgeColor[j][0]) { c.ep[i] = (u8)j; c.eo[i] = 1; ok = true; }
    }
    if (!ok) return -2;
  }
  // kiểm tra tính hợp lệ
  int seen[12] = {0};
  for (int i = 0; i < 12; i++) seen[c.ep[i]]++;
  for (int i = 0; i < 12; i++) if (seen[i] != 1) return -2;
  int fs = 0; for (int i = 0; i < 12; i++) fs += c.eo[i];
  if (fs % 2) return -3;
  int seenc[8] = {0};
  for (int i = 0; i < 8; i++) seenc[c.cp[i]]++;
  for (int i = 0; i < 8; i++) if (seenc[i] != 1) return -4;
  int ts = 0; for (int i = 0; i < 8; i++) ts += c.co[i];
  if (ts % 3) return -5;
  if (parity(c.ep, 12) != parity(c.cp, 8)) return -6;
  return 0;
}

void toFacelets(const Cubie& c, char* out /*54*/) {
  static const char L[6] = {'U', 'R', 'F', 'D', 'L', 'B'};
  for (int f = 0; f < 6; f++) for (int k = 0; k < 9; k++) out[f * 9 + k] = L[f];
  for (int i = 0; i < 8; i++) for (int n = 0; n < 3; n++)
    out[cornerFacelet[i][(n + c.co[i]) % 3]] = L[cornerColor[c.cp[i]][n]];
  for (int i = 0; i < 12; i++) for (int n = 0; n < 2; n++)
    out[edgeFacelet[i][(n + c.eo[i]) % 2]] = L[edgeColor[c.ep[i]][n]];
}

int applyMoveString(Cubie& c, const char* s) {
  const char* faces = "URFDLB";
  while (*s) {
    while (*s == ' ' || *s == '\n' || *s == '\t' || *s == ',') s++;
    if (!*s) break;
    const char* p = strchr(faces, *s);
    if (!p || !*s) return -7;
    int f = (int)(p - faces), k = 0;
    s++;
    if (*s == '2') { k = 1; s++; }
    else if (*s == '\'') { k = 2; s++; }
    else if (*s == '3') { k = 2; s++; }
    mul(c, moveAll[f * 3 + k], c);
  }
  return 0;
}

// ---------- Tìm kiếm hai pha ----------
inline double nowMs() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

struct Solver {
  Cubie start;
  int maxTotal;
  double t0, softMs, hardMs;
  bool haveSol, stop, timedOut;
  int sol[48], solLen;
  int mv[48], tw[48], fl[48], sl[48], mv2[48];
  unsigned long nodes;
} S;

inline void tick() {
  if ((++S.nodes & 0x3FFF) != 0) return;
  double el = nowMs() - S.t0;
  if (S.haveSol) { if (el >= S.softMs) S.stop = true; }
  else if (el >= S.hardMs) { S.stop = true; S.timedOut = true; }
}

inline bool isG1Move(int m) {
  int f = m / 3;
  return f == FU || f == FD || (m % 3) == 1;
}

bool dfs2(int cp, int ep, int sp, int remain, int depth, int last) {
  if (remain == 0) return cp == 0 && ep == 0 && sp == 0;
  tick();
  if (S.stop) return false;
  for (int k = 0; k < 10; k++) {
    int m = P2MOVES[k], f = m / 3;
    if (last >= 0) { int lf = last / 3; if (f == lf) continue; if (f % 3 == lf % 3 && f < lf) continue; }
    int ncp = cpMove[(size_t)cp * 10 + k], nep = epMove[(size_t)ep * 10 + k], nsp = spMove[sp * 10 + k];
    int h = std::max((int)pruneCS[(size_t)nsp * NPERM8 + ncp], (int)pruneES[(size_t)nsp * NPERM8 + nep]);
    if (h > remain - 1) continue;
    S.mv2[depth] = m;
    if (dfs2(ncp, nep, nsp, remain - 1, depth + 1, m)) return true;
    if (S.stop) return false;
  }
  return false;
}

void phase2(int d1, int last) {
  Cubie c = S.start;
  for (int i = 0; i < d1; i++) mul(c, moveAll[S.mv[i]], c);
  int cp = cpOf(c), ep = ep8Of(c), sp = spOf(c);
  int limit = std::min(S.maxTotal - d1, 18);
  if (limit < 0) return;
  int h = std::max((int)pruneCS[(size_t)sp * NPERM8 + cp], (int)pruneES[(size_t)sp * NPERM8 + ep]);
  for (int d2 = h; d2 <= limit; d2++) {
    if (dfs2(cp, ep, sp, d2, 0, last)) {
      int total = d1 + d2;
      for (int i = 0; i < d1; i++) S.sol[i] = S.mv[i];
      for (int i = 0; i < d2; i++) S.sol[d1 + i] = S.mv2[i];
      S.solLen = total; S.haveSol = true; S.maxTotal = total - 1;
      return;
    }
    if (S.stop) return;
  }
}

void dfs1(int depth, int remain, int last) {
  if (remain == 0) {
    if (S.tw[depth] == 0 && S.fl[depth] == 0 && S.sl[depth] == 0 && (last < 0 || !isG1Move(last))) phase2(depth, last);
    return;
  }
  tick();
  if (S.stop) return;
  for (int m = 0; m < 18; m++) {
    int f = m / 3;
    if (last >= 0) { int lf = last / 3; if (f == lf) continue; if (f % 3 == lf % 3 && f < lf) continue; }
    int nt = twistMove[S.tw[depth] * 18 + m], nf = flipMove[S.fl[depth] * 18 + m], ns = sliceMove[S.sl[depth] * 18 + m];
    int h = std::max((int)pruneST[ns * NTWIST + nt], (int)pruneSF[ns * NFLIP + nf]);
    if (h > remain - 1) continue;
    S.mv[depth] = m; S.tw[depth + 1] = nt; S.fl[depth + 1] = nf; S.sl[depth + 1] = ns;
    dfs1(depth + 1, remain - 1, m);
    if (S.stop) return;
  }
}

// Trả về số nước (>=0) hoặc mã lỗi âm: -8 không tìm thấy trong giới hạn, -9 quá thời gian
int solveCubie(const Cubie& c, int maxTotal, int softMs, char* out, int cap) {
  if (maxTotal < 0) maxTotal = 0;
  if (maxTotal > 30) maxTotal = 30;
  S.start = c; S.maxTotal = maxTotal; S.t0 = nowMs();
  S.softMs = softMs < 0 ? 0 : softMs; S.hardMs = std::max(8000.0, 10.0 * softMs);
  S.haveSol = S.stop = S.timedOut = false; S.solLen = 0; S.nodes = 0;
  S.tw[0] = twistOf(c); S.fl[0] = flipOf(c); S.sl[0] = sliceOf(c);
  for (int d1 = 0; d1 <= S.maxTotal && !S.stop; d1++) {
    int h = std::max((int)pruneST[S.sl[0] * NTWIST + S.tw[0]], (int)pruneSF[S.sl[0] * NFLIP + S.fl[0]]);
    if (h > d1) continue;
    dfs1(0, d1, -1);
  }
  if (!S.haveSol) return S.timedOut ? -9 : -8;
  static const char F[6] = {'U', 'R', 'F', 'D', 'L', 'B'};
  int pos = 0;
  for (int i = 0; i < S.solLen; i++) {
    int m = S.sol[i], f = m / 3, k = m % 3;
    int need = (i ? 1 : 0) + 1 + (k ? 1 : 0);
    if (pos + need + 1 > cap) return -10;
    if (i) out[pos++] = ' ';
    out[pos++] = F[f];
    if (k == 1) out[pos++] = '2'; else if (k == 2) out[pos++] = '\'';
  }
  out[pos] = 0;
  return S.solLen;
}

uint64_t rngState = 88172645463325252ULL;
uint64_t rnd() { rngState ^= rngState << 13; rngState ^= rngState >> 7; rngState ^= rngState << 17; return rngState; }

}  // namespace

extern "C" {

NYRA_EXPORT("nyra_cube_init") int nyra_cube_init() { initTables(); return 0; }

// Giải. facelets: 54 ký tự. Trả về số nước (>=0) hoặc mã lỗi âm:
// -1 chuỗi/màu sai, -2 cạnh sai, -3 cạnh lật lẻ, -4 góc sai, -5 góc xoay lệch, -6 lệch parity, -8 hết giới hạn, -9 quá thời gian, -10 buffer nhỏ
NYRA_EXPORT("nyra_cube_solve")
int nyra_cube_solve(const char* facelets, int maxTotal, int softMs, char* out, int cap) {
  initTables();
  Cubie c; int e = parseFacelets(facelets, c);
  if (e < 0) return e;
  return solveCubie(c, maxTotal, softMs, out, cap);
}

// Áp chuỗi nước đi lên trạng thái. out: >= 55 byte.
NYRA_EXPORT("nyra_cube_apply")
int nyra_cube_apply(const char* facelets, const char* moves, char* out) {
  initTables();
  Cubie c; int e = parseFacelets(facelets, c);
  if (e < 0) return e;
  e = applyMoveString(c, moves);
  if (e < 0) return e;
  toFacelets(c, out); out[54] = 0;
  return 0;
}

// Tạo trạng thái ngẫu nhiên hợp lệ (đều trên toàn bộ không gian). out: >= 55 byte.
NYRA_EXPORT("nyra_cube_random")
int nyra_cube_random(unsigned seed, char* out) {
  initTables();
  rngState ^= ((uint64_t)seed << 32) | (seed * 2654435761u + 1); if (!rngState) rngState = 88172645463325252ULL;
  for (int i = 0; i < 8; i++) rnd();
  Cubie c; setIdentity(c);
  for (int i = 7; i > 0; i--) { int j = (int)(rnd() % (i + 1)); std::swap(c.cp[i], c.cp[j]); }
  for (int i = 11; i > 0; i--) { int j = (int)(rnd() % (i + 1)); std::swap(c.ep[i], c.ep[j]); }
  if (parity(c.cp, 8) != parity(c.ep, 12)) std::swap(c.ep[0], c.ep[1]);
  int s = 0; for (int i = 0; i < 7; i++) { c.co[i] = (u8)(rnd() % 3); s += c.co[i]; } c.co[7] = (u8)((3 - s % 3) % 3);
  s = 0; for (int i = 0; i < 11; i++) { c.eo[i] = (u8)(rnd() & 1); s += c.eo[i]; } c.eo[11] = (u8)(s & 1);
  toFacelets(c, out); out[54] = 0;
  return 0;
}

NYRA_EXPORT("nyra_alloc") void* nyra_alloc(int n) { return ::operator new((size_t)n); }
NYRA_EXPORT("nyra_free") void nyra_free(void* p) { ::operator delete(p); }

}  // extern "C"
