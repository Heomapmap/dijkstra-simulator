/**
 * logger.js – Quản lý Log quá trình chạy thuật toán
 */

export class Logger {
  constructor(logEl) {
    this.el = logEl;
    this.lines = [];
  }

  _append(text, cls = '') {
    this.lines.push({ text, cls });
    const div = document.createElement('div');
    div.className = `log-line ${cls}`;
    div.innerHTML = text;
    this.el.appendChild(div);
    this.el.scrollTop = this.el.scrollHeight;
  }

  info(text)   { this._append(text, 'log-info'); }
  visit(text)  { this._append(`🔍 ${text}`, 'log-visit'); }
  update(text) { this._append(`↗ ${text}`, 'log-update'); }
  done(text)   { this._append(`✓ ${text}`, 'log-done'); }
  err(text)    { this._append(`✗ ${text}`, 'log-err'); }

  clear() {
    this.el.innerHTML = '';
    this.lines = [];
  }

  ready() {
    this.clear();
    this._append('Sẵn sàng...', 'log-info');
  }
}
