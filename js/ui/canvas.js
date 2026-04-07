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
  hover:   '#6366f1',
  path:    '#ef4444',
  preview: '#3b82f6',
};

export class CanvasManager {
  constructor(canvas, graph, callbacks = {}) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.graph     = graph;
    this.callbacks = callbacks; // { onGraphChange, onSourceSet, onNodeDelete, onEdgeDelete... }

    // --- Hệ thống Zoom & Pan ---
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.2;
    this.maxZoom = 5;

    // Trạng thái tương tác
    this.hoveredNode  = null;
    this.hoveredEdge  = null;
    this.draggingNode = null;
    this.dragOffset   = { x: 0, y: 0 };
    this.isPanning    = false;
    this.panStart     = { x: 0, y: 0 };
    this.edgeStart    = null;   // node bắt đầu vẽ cạnh
    this.isDrawingEdge = false;
    this.mousePosWorld = { x: 0, y: 0 }; // Vị trí chuột trong tọa độ đồ thị
    this.mousePosScreen = { x: 0, y: 0 }; // Vị trí chuột trên màn hình canvas

    this._bindEvents();
    this.resize();
  }

  /* ===== COORDINATE CONVERSION (Chuyển đổi tọa độ) ===== */
  
  // Chuyển từ tọa độ màn hình sang tọa độ thế giới (đồ thị)
  _toWorld(screenX, screenY) {
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom
    };
  }

  // Chuyển từ tọa độ thế giới sang màn hình
  _toScreen(worldX, worldY) {
    return {
      x: worldX * this.zoom + this.panX,
      y: worldY * this.zoom + this.panY
    };
  }

  /* ===== RESIZE & SETUP ===== */
  resize() {
    const wrapper = this.canvas.parentElement;
    const width  = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    // Tối ưu cho màn hình Retina/High-DPI
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    this.draw();
  }

  /* ===== EVENTS ===== */
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',  e => this._onMouseDown(e));
    c.addEventListener('mousemove',  e => this._onMouseMove(e));
    c.addEventListener('mouseup',    e => this._onMouseUp(e));
    c.addEventListener('mouseleave', e => this._onMouseLeave(e));
    c.addEventListener('wheel',      e => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('dblclick',   e => this._onDblClick(e));

    // Touch events (Hỗ trợ Pinch Zoom)
    c.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._onTouchMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._onTouchEnd(e));

    window.addEventListener('keydown', e => {
      this.shiftHeld = e.shiftKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input,textarea')) {
        this._deleteHovered();
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.resetView();
      }
    });
    window.addEventListener('resize', () => this.resize());
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _nodeAt(worldX, worldY) {
    return this.graph.nodes.find(n => dist(n.x, n.y, worldX, worldY) <= NODE_RADIUS) || null;
  }

  _edgeAt(screenX, screenY) {
    return this.graph.uniqueEdges.find(e => {
      const p1 = this._toScreen(e.from.x, e.from.y);
      const p2 = this._toScreen(e.to.x, e.to.y);
      return distPointToSegment(screenX, screenY, p1.x, p1.y, p2.x, p2.y) < EDGE_HIT;
    }) || null;
  }

  /* ===== MOUSE ACTIONS ===== */
  _onMouseDown(e) {
    const screenPos = this._getMousePos(e);
    const worldPos = this._toWorld(screenPos.x, screenPos.y);
    const node = this._nodeAt(worldPos.x, worldPos.y);

    if (e.button === 2) { // Chuột phải
      this.callbacks.onContextMenu && this.callbacks.onContextMenu(e, node, this._edgeAt(screenPos.x, screenPos.y));
      return;
    }

    // Nút giữa hoặc Alt + Click -> Kéo canvas (Pan)
    if (e.button === 1 || e.altKey) {
      this.isPanning = true;
      this.panStart = { x: screenPos.x - this.panX, y: screenPos.y - this.panY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    if (node) {
      if (e.shiftKey) { // Shift + Click -> Vẽ cạnh
        this.isDrawingEdge = true;
        this.edgeStart = node;
      } else { // Kéo node
        this.draggingNode = node;
        this.dragOffset = { x: worldPos.x - node.x, y: worldPos.y - node.y };
        this.canvas.style.cursor = 'grabbing';
      }
    } else {
      // Click vào khoảng trống -> Thêm node
      this.callbacks.onAddNode && this.callbacks.onAddNode(worldPos.x, worldPos.y);
    }
  }

  _onMouseMove(e) {
    const screenPos = this._getMousePos(e);
    const worldPos = this._toWorld(screenPos.x, screenPos.y);
    this.mousePosScreen = screenPos;
    this.mousePosWorld = worldPos;

    if (this.isPanning) {
      this.panX = screenPos.x - this.panStart.x;
      this.panY = screenPos.y - this.panStart.y;
      this.draw();
      return;
    }

    if (this.draggingNode) {
      this.draggingNode.x = worldPos.x - this.dragOffset.x;
      this.draggingNode.y = worldPos.y - this.dragOffset.y;
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
      this.draw();
      return;
    }

    // Phát hiện Hover
    const prevNode = this.hoveredNode;
    const prevEdge = this.hoveredEdge;
    this.hoveredNode = this._nodeAt(worldPos.x, worldPos.y);
    this.hoveredEdge = !this.hoveredNode ? this._edgeAt(screenPos.x, screenPos.y) : null;

    // Cập nhật con trỏ chuột
    if (this.isDrawingEdge) {
      this.canvas.style.cursor = (this.hoveredNode && this.hoveredNode !== this.edgeStart) ? 'cell' : 'crosshair';
    } else if (this.hoveredNode) {
      this.canvas.style.cursor = e.shiftKey ? 'copy' : 'grab';
    } else if (this.hoveredEdge) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = e.altKey ? 'grab' : 'crosshair';
    }

    this._updateTooltip(screenPos.x, screenPos.y);
    if (prevNode !== this.hoveredNode || prevEdge !== this.hoveredEdge || this.isDrawingEdge) {
      this.draw();
    }
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (this.draggingNode) {
      this.draggingNode = null;
      this.canvas.style.cursor = 'crosshair';
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
      this.draw();
      return;
    }

    if (this.isDrawingEdge) {
      const screenPos = this._getMousePos(e);
      const worldPos = this._toWorld(screenPos.x, screenPos.y);
      const target = this._nodeAt(worldPos.x, worldPos.y);
      
      if (target && target !== this.edgeStart) {
        this.callbacks.onAddEdge && this.callbacks.onAddEdge(this.edgeStart, target);
      }
      this.isDrawingEdge = false;
      this.edgeStart = null;
      this.draw();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const screenPos = this._getMousePos(e);
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    this._zoomAt(zoomFactor, screenPos.x, screenPos.y);
  }

  _onDblClick(e) {
    const screenPos = this._getMousePos(e);
    const worldPos = this._toWorld(screenPos.x, screenPos.y);
    const node = this._nodeAt(worldPos.x, worldPos.y);
    if (node) this.callbacks.onRenameNode && this.callbacks.onRenameNode(node);
  }

  /* ===== ZOOM API ===== */
  _zoomAt(factor, centerX, centerY) {
    const newZoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    // Tính toán pan để zoom tập trung vào vị trí chuột
    this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
    this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this._updateZoomBadge();
    this.draw();
  }

  resetView() {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this._updateZoomBadge();
    this.draw();
  }

  fitView() {
    if (this.graph.nodes.length === 0) return;
    const padding = 50;
    const xs = this.graph.nodes.map(n => n.x);
    const ys = this.graph.nodes.map(n => n.y);
    const minX = Math.min(...xs) - NODE_RADIUS - padding;
    const maxX = Math.max(...xs) + NODE_RADIUS + padding;
    const minY = Math.min(...ys) - NODE_RADIUS + padding;
    const maxY = Math.max(...ys) + NODE_RADIUS + padding;

    const canvasW = this.canvas.clientWidth;
    const canvasH = this.canvas.clientHeight;
    
    const newZoom = clamp(Math.min(canvasW / (maxX - minX), canvasH / (maxY - minY)), this.minZoom, this.maxZoom);
    this.zoom = newZoom;
    this.panX = (canvasW - (minX + maxX) * newZoom) / 2;
    this.panY = (canvasH - (minY + maxY) * newZoom) / 2;
    this._updateZoomBadge();
    this.draw();
  }

  _updateZoomBadge() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(this.zoom * 100) + '%';
  }

  /* ===== TOUCH SUPPORT (PINCH ZOOM) ===== */
  _onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      this._lastPinch = this._getPinchData(e);
      this.draggingNode = null;
    } else {
      const t = e.touches[0];
      const screenPos = this._getMousePos(t);
      const worldPos = this._toWorld(screenPos.x, screenPos.y);
      const node = this._nodeAt(worldPos.x, worldPos.y);
      if (node) {
        this.draggingNode = node;
        this.dragOffset = { x: worldPos.x - node.x, y: worldPos.y - node.y };
      }
    }
  }

  _getPinchData(e) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const rect = this.canvas.getBoundingClientRect();
    return {
      dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
      cx: (t1.clientX + t2.clientX) / 2 - rect.left,
      cy: (t1.clientY + t2.clientY) / 2 - rect.top
    };
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && this._lastPinch) {
      const p = this._getPinchData(e);
      const factor = p.dist / this._lastPinch.dist;
      this._zoomAt(factor, p.cx, p.cy);
      this._lastPinch = p;
    } else if (this.draggingNode) {
      const t = e.touches[0];
      const screenPos = this._getMousePos(t);
      const worldPos = this._toWorld(screenPos.x, screenPos.y);
      this.draggingNode.x = worldPos.x - this.dragOffset.x;
      this.draggingNode.y = worldPos.y - this.dragOffset.y;
      this.draw();
    }
  }

  _onTouchEnd() {
    this._lastPinch = null;
    if (this.draggingNode) {
      this.draggingNode = null;
      this.callbacks.onGraphChange && this.callbacks.onGraphChange();
    }
  }

  /* ===== TOOLTIP ===== */
  _updateTooltip(sx, sy) {
    const tt = document.getElementById('tooltip');
    if (!tt) return;
    const rect = this.canvas.getBoundingClientRect();

    if (this.hoveredNode) {
      const n = this.hoveredNode;
      tt.textContent = `${n.name} | dist: ${n.dist === Infinity ? '∞' : n.dist}`;
      tt.style.left = (rect.left + sx + 15) + 'px';
      tt.style.top = (rect.top + sy - 15) + 'px';
      tt.classList.add('visible');
    } else if (this.hoveredEdge) {
      const e = this.hoveredEdge;
      tt.textContent = `${e.from.name} ↔ ${e.to.name} | w: ${e.weight}`;
      tt.style.left = (rect.left + sx + 15) + 'px';
      tt.style.top = (rect.top + sy - 15) + 'px';
      tt.classList.add('visible');
    } else {
      tt.classList.remove('visible');
    }
  }

  /* ===== DRAWING CORE ===== */
  draw() {
    const { ctx, canvas, graph } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    // Reset transform về đơn vị CSS để clear và vẽ grid
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this._drawGrid(width, height);

    // Bắt đầu áp dụng Zoom & Pan cho các đối tượng đồ thị
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Vẽ cạnh (Edges)
    const drawnKeys = new Set();
    graph.edges.forEach(edge => {
      const key = [edge.from.name, edge.to.name].sort().join('-');
      if (drawnKeys.has(key)) return;
      drawnKeys.add(key);

      const isHover = (edge === this.hoveredEdge) || 
        graph.edges.some(e => e !== edge && e.from === edge.to && e.to === edge.from && e === this.hoveredEdge);
      this._drawEdge(edge, isHover);
    });

    // Preview cạnh đang vẽ
    if (this.isDrawingEdge && this.edgeStart) {
      this._drawEdgePreview(this.edgeStart, this.mousePosWorld);
    }

    // Vẽ Node
    graph.nodes.forEach(node => {
      this._drawNode(node, node === this.hoveredNode && node !== this.draggingNode);
    });

    ctx.restore();

    if (graph.nodes.length === 0) this._drawEmptyHint(width, height);
  }

  _drawGrid(w, h) {
    const step = 40;
    const offsetX = (this.panX % step);
    const offsetY = (this.panY % step);
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    this.ctx.lineWidth = 1;
    for (let x = offsetX; x < w; x += step) {
      this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h); this.ctx.stroke();
    }
    for (let y = offsetY; y < h; y += step) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(w, y); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  _drawEdge(edge, isHover) {
    const { ctx } = this;
    const { from, to, weight, state } = edge;
    const isPath = state === 'path';
    
    const color = isPath ? EDGE_COLORS.path : (isHover ? EDGE_COLORS.hover : EDGE_COLORS.default);
    const width = (isPath ? 4 : (isHover ? 3 : 2)) / this.zoom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = isHover ? '#3b82f6' : color;
    ctx.lineWidth   = state === 'path' ? 4 : isHover ? 3 : 2;
    
    //Xóa nốt cái shadow của edge
    ctx.stroke();
    ctx.restore();

    // Vẽ trọng số (Weight Badge)
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    
    // Tính offset vuông góc để text không đè lên đường kẻ
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * (20 / this.zoom);
    const oy = (dx / len) * (20 / this.zoom);

    ctx.save();
    const fontSize = Math.max(10, 12 / this.zoom);
    ctx.font = `bold ${fontSize}px Segoe UI`;
    const tw = ctx.measureText(weight).width;
    const padding = 6 / this.zoom;
    const bw = tw + padding * 2, bh = fontSize + padding;

    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 4 / this.zoom;
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
  }

  _drawEdgePreview(fromNode, mouseWorld) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(mouseWorld.x, mouseWorld.y);
    ctx.strokeStyle = EDGE_COLORS.preview;
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
    ctx.stroke();
    ctx.restore();
  }

  _drawNode(node, isHover) {
    const { ctx } = this;
    const stateKey = isHover ? 'hover' : (node.state || 'default');
    const colors = NODE_COLORS[stateKey] || NODE_COLORS.default;
    const r = NODE_RADIUS + (isHover ? 3 / this.zoom : 0);

    //Xóa cái shadow đi cho đỡ mờ

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Label
    ctx.save();
    ctx.fillStyle   = colors.label;
    ctx.font        = `bold ${node.name.length > 4 ? 20 : 22}px Segoe UI`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y);
    ctx.restore();

    // Distance Badge
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

    // Vòng nhấp nháy cho Current Node
    if (node.state === 'current') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 6 / this.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b88';
      ctx.lineWidth = 2 / this.zoom;
      ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawDistanceBadge(node, r) {
    const { ctx } = this;
    const label = `d=${node.dist}`;
    ctx.save();
    const fontSize = 10 / this.zoom;
    ctx.font = `bold ${fontSize}px Segoe UI`;
    const tw = ctx.measureText(label).width + 8 / this.zoom;
    const bh = 14 / this.zoom;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(node.x - tw / 2, node.y - r - 18 / this.zoom, tw, bh, 4 / this.zoom);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1 / this.zoom;
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText(label, node.x, node.y - r - 11 / this.zoom);
    ctx.restore();
  }

  _drawEmptyHint(w, h) {
    this.ctx.save();
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = '14px Segoe UI';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Click để thêm node | Shift + Kéo để nối cạnh | Cuộn chuột để Zoom', w / 2, h / 2);
    this.ctx.restore();
  }

  _deleteHovered() {
    if (this.hoveredNode) this.callbacks.onNodeDelete?.(this.hoveredNode);
    else if (this.hoveredEdge) this.callbacks.onEdgeDelete?.(this.hoveredEdge);
  }
}