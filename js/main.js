/**
 * main.js – Entry point: khởi tạo app và kết nối các module
 */

import { GraphManager }   from './core/graph.js';
import { runDijkstra, markShortestPath, buildResult } from './core/dijkstra.js';
import { CanvasManager }  from './ui/canvas.js';
import { Logger }         from './ui/logger.js';
import { TableRenderer }  from './ui/table.js';
import { defaultName, debounce } from './utils/helpers.js';

/* ===== DOM REFS ===== */
const networkInput    = document.getElementById('networkInput');
const logDiv          = document.getElementById('log');
const tableContainer  = document.getElementById('routing-table-container');
const finalPathEl     = document.getElementById('final-path');
const canvasEl        = document.getElementById('networkCanvas');
const ctxMenu         = document.getElementById('context-menu');
const toastContainer  = document.getElementById('toast-container');
const statusBar       = document.getElementById('canvas-status');

/* ===== CORE INSTANCES ===== */
const graph   = new GraphManager();
const logger  = new Logger(logDiv);
const table   = new TableRenderer(tableContainer, finalPathEl);

let sourceNode  = null;
let isRunning   = false;
let resultMap   = null;
let speedMs     = 400;

/* ===== CANVAS ===== */
const canvasMgr = new CanvasManager(canvasEl, graph, {
  onAddNode(x, y) {
    if (isRunning) return;
    showModal('Tên thiết bị:', defaultName(new Set(graph.nodes.map(n => n.name))), name => {
      if (!name) return;
      if (graph.findByName(name)) { toast('Tên đã tồn tại!', 'warn'); return; }
      graph.addNode(x, y, name);
      syncTextarea();
      canvasMgr.draw();
      toast(`Đã thêm node "${name}"`, 'success');
    });
  },

  onAddEdge(fromNode, toNode) {
    if (isRunning) return;
    showModal('Trọng số cạnh:', '10', val => {
      const w = parseInt(val);
      if (isNaN(w) || w <= 0) { toast('Trọng số phải là số dương!', 'error'); return; }
      const ok = graph.addEdge(fromNode, toNode, w);
      if (!ok) { toast('Cạnh đã tồn tại!', 'warn'); return; }
      syncTextarea();
      canvasMgr.draw();
      toast(`Đã nối ${fromNode.name} ↔ ${toNode.name} (w=${w})`, 'success');
    });
  },

  onContextMenu(e, node, edge) {
    showContextMenu(e, node, edge);
  },

  onNodeDelete(node) {
    if (isRunning) return;
    if (node === sourceNode) sourceNode = null;
    graph.removeNode(node);
    syncTextarea();
    canvasMgr.draw();
    toast(`Đã xóa node "${node.name}"`, 'warn');
  },

  onEdgeDelete(edge) {
    if (isRunning) return;
    graph.removeEdge(edge.from, edge.to);
    syncTextarea();
    canvasMgr.draw();
    toast(`Đã xóa cạnh ${edge.from.name} ↔ ${edge.to.name}`, 'warn');
  },

  onRenameNode(node) {
    if (isRunning) return;
    showModal('Tên mới:', node.name, name => {
      if (!name) return;
      if (name !== node.name && graph.findByName(name)) { toast('Tên đã tồn tại!', 'warn'); return; }
      node.name = name;
      syncTextarea();
      canvasMgr.draw();
    });
  },

  onGraphChange: debounce(() => syncTextarea(), 300),
});

/* ===== CONTEXT MENU ===== */
function showContextMenu(e, node, edge) {
  e.preventDefault();
  ctxMenu.innerHTML = '';

  if (node) {
    addCtxItem('🎯 Đặt làm nguồn', () => setSource(node));
    addCtxItem('✏️ Đổi tên', () => canvasMgr.callbacks.onRenameNode(node));
    addCtxDiv();
    addCtxItem('🗑️ Xóa node', () => canvasMgr.callbacks.onNodeDelete(node), true);
  } else if (edge) {
    addCtxItem('⚖️ Đổi trọng số', () => {
      showModal('Trọng số mới:', edge.weight, val => {
        const w = parseInt(val);
        if (isNaN(w) || w <= 0) { toast('Trọng số không hợp lệ!', 'error'); return; }
        // Cập nhật cả 2 chiều
        graph.edges.forEach(e2 => {
          if ((e2.from === edge.from && e2.to === edge.to) ||
              (e2.from === edge.to   && e2.to === edge.from)) {
            e2.weight = w;
          }
        });
        syncTextarea();
        canvasMgr.draw();
        toast(`Đã cập nhật trọng số thành ${w}`, 'success');
      });
    });
    addCtxDiv();
    addCtxItem('🗑️ Xóa cạnh', () => canvasMgr.callbacks.onEdgeDelete(edge), true);
  } else {
    addCtxItem('🔄 Sắp xếp tròn', () => {
      graph.arrangeCircle(canvasEl.width / 2, canvasEl.height / 2,
        Math.min(canvasEl.width, canvasEl.height) / 2 - 60);
      syncTextarea();
      canvasMgr.draw();
    });
    addCtxItem('🗑️ Xóa tất cả', () => resetAll(), true);
  }

  ctxMenu.style.left = `${Math.min(e.clientX, window.innerWidth  - 180)}px`;
  ctxMenu.style.top  = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  ctxMenu.classList.add('visible');
}

function addCtxItem(label, fn, isDanger = false) {
  const div = document.createElement('div');
  div.className = `ctx-item${isDanger ? ' danger' : ''}`;
  div.textContent = label;
  div.addEventListener('click', () => { hideCtxMenu(); fn(); });
  ctxMenu.appendChild(div);
}

function addCtxDiv() {
  const div = document.createElement('div');
  div.className = 'ctx-separator';
  ctxMenu.appendChild(div);
}

function hideCtxMenu() { ctxMenu.classList.remove('visible'); }
document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });

/* ===== SOURCE NODE ===== */
function setSource(node) {
  if (sourceNode) sourceNode.state = 'default';
  sourceNode = node;
  node.state = 'source';
  resultMap = null;
  table.showEmpty();
  updateStatus(`Nguồn: ${node.name}`);
  canvasMgr.draw();
  toast(`Đặt "${node.name}" làm nguồn`, 'success');
}

/* ===== BUILD FROM TEXT ===== */
function buildFromText() {
  if (isRunning) return;
  graph.buildFromText(networkInput.value, canvasEl.width, canvasEl.height);
  // Khôi phục source nếu vẫn còn
  if (sourceNode) {
    const s = graph.findByName(sourceNode.name);
    sourceNode = s || null;
    if (s) s.state = 'source';
  }
  resultMap = null;
  table.showEmpty();
  canvasMgr.draw();
  syncTextarea();
  toast('Đã cập nhật từ văn bản', 'success');
}

/* ===== SYNC TEXTAREA ===== */
function syncTextarea() {
  networkInput.value = graph.toText();
}

/* ===== DIJKSTRA ===== */
async function runDijkstraUI() {
  if (isRunning) return;
  if (!sourceNode || !graph.findByName(sourceNode.name)) {
    toast('Hãy chọn nút nguồn! (Chuột phải → Đặt làm nguồn)', 'error');
    return;
  }
  if (graph.nodes.length < 2) {
    toast('Cần ít nhất 2 node!', 'error');
    return;
  }

  isRunning = true;
  setButtonsDisabled(true);
  logger.clear();
  logger.info(`Bắt đầu từ <b>${sourceNode.name}</b>`);
  table.showEmpty();
  resultMap = null;

  await runDijkstra(graph, sourceNode, {
    onVisit(node) {
      logger.visit(`Đang xét: <b>${node.name}</b>  (dist=${node.dist})`);
      updateStatus(`Đang xét: ${node.name}`);
    },
    onRelax(from, to, newDist) {
      logger.update(`Cập nhật ${from.name}→${to.name}: dist=${newDist}`);
    },
    onStep() {
      canvasMgr.draw();
      return new Promise(r => setTimeout(r, speedMs));
    },
    onFinish(res) {
      resultMap = res;
      table.render(res, sourceNode);
      logger.done('Hoàn thành!');
      updateStatus('Hoàn thành – Click vào bảng để xem đường đi');
    },
  });

  isRunning = false;
  setButtonsDisabled(false);
  canvasMgr.draw();
}

/* ===== TABLE ROW CLICK → highlight path ===== */
document.addEventListener('table:selectNode', e => {
  if (!resultMap) return;
  const info = resultMap.get(e.detail.name);
  if (!info) return;
  markShortestPath(graph, sourceNode, info.node);
  table.showPath(e.detail.name, info);
  canvasMgr.draw();
});

/* ===== RESET ===== */
function resetAll() {
  if (isRunning) return;
  graph.clear();
  sourceNode = null;
  resultMap  = null;
  networkInput.value = '';
  logger.ready();
  table.showEmpty();
  updateStatus('Sẵn sàng');
  canvasMgr.draw();
  toast('Đã xóa toàn bộ', 'warn');
}

/* ===== ARRANGE ===== */
function arrangeNodes() {
  if (!graph.nodes.length) return;
  graph.arrangeCircle(canvasEl.width / 2, canvasEl.height / 2,
    Math.min(canvasEl.width, canvasEl.height) / 2 - 60);
  syncTextarea();
  canvasMgr.draw();
}

/* ===== SPEED CONTROL ===== */
const speedInput = document.getElementById('speedInput');
if (speedInput) {
  speedInput.addEventListener('input', () => {
    speedMs = parseInt(speedInput.value) || 400;
    const label = document.getElementById('speedLabel');
    if (label) label.textContent = speedMs + 'ms';
  });
}

/* ===== STATUS BAR ===== */
function updateStatus(text) {
  if (statusBar) statusBar.textContent = text;
}

/* ===== TOAST ===== */
function toast(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = msg;
  toastContainer.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

/* ===== MODAL ===== */
function showModal(label, defaultVal, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h4>${label}</h4>
    <input type="text" id="modal-input" value="${defaultVal}" autocomplete="off" spellcheck="false">
    <div class="modal-actions">
      <button class="btn btn-cancel" id="modal-cancel">Hủy</button>
      <button class="btn btn-build"  id="modal-ok">OK</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = modal.querySelector('#modal-input');
  input.focus();
  input.select();

  const confirm = () => {
    overlay.remove();
    onConfirm(input.value.trim());
  };
  const cancel = () => overlay.remove();

  modal.querySelector('#modal-ok').addEventListener('click', confirm);
  modal.querySelector('#modal-cancel').addEventListener('click', cancel);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
}

/* ===== HELPERS ===== */
function setButtonsDisabled(val) {
  ['btn-run', 'btn-build', 'btn-reset', 'btn-arrange'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = val;
  });
}

/* ===== EXPOSE TO HTML ===== */
window.buildFromText  = buildFromText;
window.runDijkstra    = runDijkstraUI;
window.resetAll       = resetAll;
window.arrangeNodes   = arrangeNodes;
window._canvasMgr     = canvasMgr;  // dùng cho zoom buttons

/* ===== RESIZABLE PANELS ===== */
function initResizable() {
  function makeResizer(handleId, panelId, side) {
    const handle = document.getElementById(handleId);
    const panel  = document.getElementById(panelId);
    if (!handle || !panel) return;
    let startX, startW;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      handle.classList.add('dragging');
      startX = e.clientX;
      startW = panel.getBoundingClientRect().width;

      const onMove = ev => {
        const delta  = ev.clientX - startX;
        const newW   = Math.max(180, Math.min(520,
          side === 'left' ? startW + delta : startW - delta));
        panel.style.width = newW + 'px';
        canvasMgr.resize();
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);
        canvasMgr.resize();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
    });
  }

  makeResizer('resize-left',  'panel-left',  'left');
  makeResizer('resize-right', 'panel-right', 'right');
}
initResizable();

/* ===== INIT ===== */
logger.ready();
table.showEmpty();
updateStatus('Sẵn sàng – Click canvas để thêm node');
canvasMgr.draw();

// Tải ví dụ mặc định
const demo = `PC1 Switch1 10\nSwitch1 R1 5\nSwitch1 R2 15\nR1 R2 3\nR1 Server1 20\nR2 Server1 8`;
networkInput.value = demo;
buildFromText();
