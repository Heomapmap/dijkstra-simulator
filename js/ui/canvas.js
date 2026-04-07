/**
 * canvas.js – Vẽ đồ thị và xử lý toàn bộ sự kiện chuột / bàn phím trên canvas
 */

import { dist, distPointToSegment, clamp } from '../utils/helpers.js';

const NODE_RADIUS  = 40;  // px – bán kính node
const EDGE_HIT     = 8;   // px – vùng click cạnh

// Màu theo trạng thái node
const NODE_COLORS = {
  default: { fill: '#2563eb', stroke: '#1d4ed8', label: '#fff' },
  source:  { fill: '#10b981', stroke: '#059669', label: '#fff' },
  current: { fill: '#f59e0b', stroke: '#d97706', label: '#fff' },
  visited: { fill: '#6366f1', stroke: '#4f46e5', label: '#fff' },
  path:    { fill: '#ef4444', stroke: '#dc2626', label: '#fff' },
  hover:   { fill: '#3b82f6', stroke: '#2563eb', label: '#fff' },
};

const EDGE_COLORS = {
  default: '#94a3b8',
  path:    '#ef4444',
  preview: '#3b82f6',
};

export class CanvasManager {
  constructor(canvas, graph, callbacks = {}) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.graph    = graph;
    this.callbacks = callbacks; // { onGraphChange, onSourceSet, onNodeDelete, onEdgeDelete }

    // Trạng thái tương tác
    this.hoveredNode  = null;
    this.hoveredEdge  = null;
    this.draggingNode = null;
    this.dragOffset   = { x: 0, y: 0 };
    this.edgeStart    = null;   // node bắt đầu vẽ cạnh
    this.mousePos     = { x: 0, y: 0 };
    this.isDrawingEdge = false;

    // Phím Shift giữ = kéo canvas (pan) thay vì thêm node
    this.shiftHeld = false;

    this._bindEvents();
    this.resize();
  }

  /* ===== RESIZE ===== */
  resize() {
    const wrapper = this.canvas.parentElement;
    this.canvas.width  = wrapper.clientWidth;
    this.canvas.height = wrapper.clientHeight;
    this.draw();
  }

  /* ===== EVENTS ===== */
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',  e => this._onMouseDown(e));
    c.addEventListener('mousemove',  e => this._onMouseMove(e));
    c.addEventListener('mouseup',    e => this._onMouseUp(e));
    c.addEventListener('mouseleave', e => this._onMouseLeave(e));
    c.addEventListener('contextmenu',e => e.preventDefault());
    c.addEventListener('dblclick',   e => this._onDblClick(e));

    // Touch
    c.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._onTouchMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._onTouchEnd(e));

    window.addEventListener('keydown', e => {
      this.shiftHeld = e.shiftKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input,textarea')) {
        this._deleteHovered();
      }
    });
    window.addEventListener('keyup', e => { this.shiftHeld = e.shiftKey; });
    window.addEventListener('resize', () => this.resize());
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / r.width;
    const scaleY = this.canvas.height / r.height;
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top)  * scaleY,
    };
  }

  _nodeAt(x, y) {
    return this.graph.nodes.find(n => dist(n.x, n.y, x, y) <= NODE_RADIUS) || null;
  }

  _edgeAt(x, y) {
    return this.graph.uniqueEdges.find(e =>
      distPointToSegment(x, y, e.from.x, e.from.y, e.to.x, e.to.y) < EDGE_HIT
    ) || null;
  }

  /* ===== MOUSE DOWN ===== */
  _onMouseDown(e) {
    const { x, y } = this._pos(e);
    const node = this._nodeAt(x, y);

    if (e.button === 2) {
      // Chuột phải → context menu
      this.callbacks.onContextMenu && this.callbacks.onContextMenu(e, node, this._edgeAt(x, y));
      return;
    }

    if (e.button !== 0) return;

    if (node) {
      if (e.shiftKey) {
        // Shift + click node → bắt đầu vẽ cạnh
        this.isDrawingEdge = true;
        this.edgeStart = node;
      } else {
        // Kéo node
        this.draggingNode = node;
        this.dragOffset = { x: x - node.x, y: y - node.y };
        this.canvas.style.cursor = 'grabbing';
      }
    } else {
      // Click vào khoảng trống → thêm node mới
      if (!e.shiftKey) {
        this.callbacks.onAddNode && this.callbacks.onAddNode(x, y);
      }
    }
  }

  /* ===== MOUSE MOVE ===== */
  _onMouseMove(e) {
    const { x, y } = this._pos(e);
    this.mousePos = { x, y };

    if (this.draggingNode) {
      this.draggingNode.x = clamp(x - this.dragOffset.x, NODE_RADIUS, this.canvas.width  - NODE_RADIUS);
      this.draggingNode.y = clamp(y - this.dragOffset.y, NODE_RADIUS, this.canvas.height - NODE_RADIUS);
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
      this.draw();
      return;
    }

    // Hover detection
    const prevNode = this.hoveredNode;
    const prevEdge = this.hoveredEdge;
    this.hoveredNode = this._nodeAt(x, y);
    this.hoveredEdge = !this.hoveredNode ? this._edgeAt(x, y) : null;

    // Cursor
    if (this.isDrawingEdge) {
      this.canvas.style.cursor = this.hoveredNode && this.hoveredNode !== this.edgeStart
        ? 'cell' : 'crosshair';
    } else if (this.hoveredNode) {
      this.canvas.style.cursor = e.shiftKey ? 'copy' : 'grab';
    } else if (this.hoveredEdge) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }

    // Tooltip
    this._updateTooltip(x, y);

    if (prevNode !== this.hoveredNode || prevEdge !== this.hoveredEdge || this.isDrawingEdge) {
      this.draw();
    }
  }

  /* ===== MOUSE UP ===== */
  _onMouseUp(e) {
    const { x, y } = this._pos(e);

    if (this.draggingNode) {
      this.draggingNode = null;
      this.canvas.style.cursor = 'crosshair';
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
      this.draw();
      return;
    }

    if (this.isDrawingEdge) {
      const target = this._nodeAt(x, y);
      if (target && target !== this.edgeStart) {
        this.callbacks.onAddEdge && this.callbacks.onAddEdge(this.edgeStart, target);
      }
      this.isDrawingEdge = false;
      this.edgeStart = null;
      this.draw();
    }
  }

  /* ===== MOUSE LEAVE ===== */
  _onMouseLeave() {
    this.hoveredNode = null;
    this.hoveredEdge = null;
    this._hideTooltip();
    if (this.isDrawingEdge) {
      this.isDrawingEdge = false;
      this.edgeStart = null;
    }
    this.draggingNode = null;
    this.canvas.style.cursor = 'crosshair';
    this.draw();
  }

  /* ===== DOUBLE CLICK: đổi tên node ===== */
  _onDblClick(e) {
    const { x, y } = this._pos(e);
    const node = this._nodeAt(x, y);
    if (node) {
      this.callbacks.onRenameNode && this.callbacks.onRenameNode(node);
    }
  }

  /* ===== TOUCH ===== */
  _touchXY(e) {
    const t = e.touches[0];
    return this._pos({ clientX: t.clientX, clientY: t.clientY });
  }

  _onTouchStart(e) {
    e.preventDefault();
    const { x, y } = this._touchXY(e);
    const node = this._nodeAt(x, y);
    if (node) {
      this.draggingNode = node;
      this.dragOffset = { x: x - node.x, y: y - node.y };
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (!this.draggingNode) return;
    const { x, y } = this._touchXY(e);
    this.draggingNode.x = clamp(x - this.dragOffset.x, NODE_RADIUS, this.canvas.width  - NODE_RADIUS);
    this.draggingNode.y = clamp(y - this.dragOffset.y, NODE_RADIUS, this.canvas.height - NODE_RADIUS);
    this.draw();
  }

  _onTouchEnd() {
    if (this.draggingNode) {
      this.draggingNode = null;
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
    }
  }

  /* ===== DELETE ===== */
  _deleteHovered() {
    if (this.hoveredNode) {
      this.callbacks.onNodeDelete && this.callbacks.onNodeDelete(this.hoveredNode);
    } else if (this.hoveredEdge) {
      this.callbacks.onEdgeDelete && this.callbacks.onEdgeDelete(this.hoveredEdge);
    }
  }

  /* ===== TOOLTIP ===== */
  _updateTooltip(x, y) {
    const tt = document.getElementById('tooltip');
    if (!tt) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width  / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    const cx = rect.left + x * scaleX;
    const cy = rect.top  + y * scaleY;

    if (this.hoveredNode) {
      const n = this.hoveredNode;
      const d = n.dist === Infinity ? '∞' : n.dist;
      tt.textContent = `${n.name}  dist: ${d}`;
      tt.style.left = `${cx + 16}px`;
      tt.style.top  = `${cy - 10}px`;
      tt.classList.add('visible');
    } else if (this.hoveredEdge) {
      const e = this.hoveredEdge;
      tt.textContent = `${e.from.name} ↔ ${e.to.name}  w: ${e.weight}`;
      tt.style.left = `${cx + 12}px`;
      tt.style.top  = `${cy - 10}px`;
      tt.classList.add('visible');
    } else {
      this._hideTooltip();
    }
  }

  _hideTooltip() {
    const tt = document.getElementById('tooltip');
    if (tt) tt.classList.remove('visible');
  }

  /* ===== DRAW ===== */
  draw() {
    const { ctx, canvas, graph } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vẽ grid nhẹ
    this._drawGrid();

    // Vẽ cạnh
    graph.edges.forEach(edge => {
      const isHover = edge === this.hoveredEdge || graph.edges.find(
        e => e !== edge && e.from === edge.to && e.to === edge.from && e === this.hoveredEdge
      );
      this._drawEdge(edge, isHover);
    });

    // Preview cạnh đang vẽ
    if (this.isDrawingEdge && this.edgeStart) {
      this._drawEdgePreview(this.edgeStart, this.mousePos);
    }

    // Vẽ node
    graph.nodes.forEach(node => {
      const isHover = node === this.hoveredNode && node !== this.draggingNode;
      this._drawNode(node, isHover);
    });

    // Hướng dẫn nhanh khi canvas trống
    if (graph.nodes.length === 0) {
      this._drawEmptyHint();
    }
  }

  _drawGrid() {
    const { ctx, canvas } = this;
    const step = 30;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawEdge(edge, isHover) {
    const { ctx } = this;
    const { from, to, weight, state } = edge;

    // Tránh vẽ trùng 2 chiều
    const drawn = this.graph.edges.find(
      e => e !== edge && e.from === to && e.to === from && e._drawn
    );
    if (drawn) return;
    edge._drawn = false;

    const color = state === 'path' ? EDGE_COLORS.path : EDGE_COLORS.default;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = isHover ? '#3b82f6' : color;
    ctx.lineWidth   = state === 'path' ? 4 : isHover ? 3 : 2;
    
    //Xóa nốt cái shadow của edge
    ctx.stroke();
    ctx.restore();

    // Trọng số
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = -dy / len * 12;
    const oy =  dx / len * 12;

    ctx.save();
    ctx.fillStyle   = 'white';
    ctx.shadowColor = 'rgba(0,0,0,.15)';
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    //Bán kính của vòng tròn thể hiện trọng số ở đây, 15
    ctx.arc(mx + ox, my + oy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle  = isHover ? '#2563eb' : '#334155';
    //kích thước của font trọng số ở đây, 20px
    ctx.font       = 'bold 20px Segoe UI';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(weight, mx + ox, my + oy);
    ctx.restore();

    edge._drawn = true;
    // Reset _drawn sau khi vẽ xong tất cả (sẽ được set lại lần sau)
  }

  _drawEdgePreview(fromNode, mousePos) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(mousePos.x, mousePos.y);
    ctx.strokeStyle = EDGE_COLORS.preview;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.restore();
  }

  _drawNode(node, isHover) {
    const { ctx } = this;
    const stateKey = isHover ? 'hover' : (node.state || 'default');
    const colors = NODE_COLORS[stateKey] || NODE_COLORS.default;
    const r = NODE_RADIUS + (isHover ? 3 : 0);

    //Xóa cái shadow đi cho đỡ mờ

    // Vòng tròn nền
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Tên node
    ctx.save();
    ctx.fillStyle   = colors.label;
    ctx.font        = `bold ${node.name.length > 4 ? 20 : 22}px Segoe UI`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y);
    ctx.restore();

    // Hiện distance
    if (node.dist !== Infinity) {
      ctx.save();
      ctx.fillStyle   = '#1e293b';
      ctx.font        = 'bold 1px Segoe UI';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      // Badge nhỏ bên trên
      const label = `d=${node.dist}`;
      const lw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.roundRect(node.x - lw / 2, node.y - r - 16, lw, 14, 4);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.fillText(label, node.x, node.y - r - 9);
      ctx.restore();
    }

    // Vòng nhấp nháy nếu là "current"
    if (node.state === 'current') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b88';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawEmptyHint() {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.fillStyle    = '#cbd5e1';
    ctx.font         = '14px Segoe UI';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Click để thêm node  |  Shift+kéo giữa 2 node để nối cạnh', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}
