/**
 * helpers.js – Hàm tính toán và tiện ích chung
 */

/** Khoảng cách Euclidean giữa 2 điểm */
export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Khoảng cách từ điểm P(px,py) đến đoạn thẳng AB */
export function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Tạo ID ngẫu nhiên ngắn */
export function uid() {
  return Math.random().toString(36).slice(2, 7);
}

/** Clamp số trong khoảng [min, max] */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Format số Infinity thành ký hiệu ∞ */
export function fmtDist(d) {
  return d === Infinity ? '∞' : d;
}

/** Tên mặc định theo thứ tự chữ cái: R0, R1, R2 ... */
export function defaultName(existingNames) {
  const prefixes = ['R', 'PC', 'SW', 'SV'];
  for (const p of prefixes) {
    for (let i = 0; i < 100; i++) {
      const name = `${p}${i}`;
      if (!existingNames.has(name)) return name;
    }
  }
  return 'Node' + uid();
}

/** Debounce: trì hoãn hàm fn ít nhất ms mili-giây */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
