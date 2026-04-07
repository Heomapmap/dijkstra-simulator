/**
 * graph.js – Quản lý dữ liệu Node, Edge và các phương thức đồ thị
 */

export class GraphNode {
  constructor(x, y, name) {
    this.x = x;
    this.y = y;
    this.name = name;
    // Trạng thái Dijkstra
    this.dist = Infinity;
    this.prev = null;
    // Trạng thái vẽ
    this.state = 'default'; // 'default' | 'source' | 'visited' | 'current' | 'path'
  }
}

export class GraphManager {
  constructor() {
    this.nodes = [];
    this.edges = []; // mỗi cạnh vô hướng lưu 2 chiều
  }

  /** Thêm node mới */
  addNode(x, y, name) {
    const node = new GraphNode(x, y, name);
    this.nodes.push(node);
    return node;
  }

  /** Xóa node và tất cả cạnh liên quan */
  removeNode(node) {
    this.edges = this.edges.filter(e => e.from !== node && e.to !== node);
    this.nodes = this.nodes.filter(n => n !== node);
  }

  /** Thêm cạnh hai chiều */
  addEdge(fromNode, toNode, weight) {
    // Tránh trùng cạnh
    const exists = this.edges.some(
      e => (e.from === fromNode && e.to === toNode) ||
           (e.from === toNode   && e.to === fromNode)
    );
    if (exists) return false;
    this.edges.push({ from: fromNode, to: toNode, weight, state: 'default' });
    this.edges.push({ from: toNode, to: fromNode, weight, state: 'default' });
    return true;
  }

  /** Xóa cạnh theo cặp node */
  removeEdge(nodeA, nodeB) {
    this.edges = this.edges.filter(
      e => !((e.from === nodeA && e.to === nodeB) ||
             (e.from === nodeB && e.to === nodeA))
    );
  }

  /** Trả về danh sách cạnh duy nhất (không trùng chiều) */
  get uniqueEdges() {
    const seen = new Set();
    return this.edges.filter(e => {
      const key = [e.from.name, e.to.name].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Lấy các cạnh đi ra từ node */
  neighborsOf(node) {
    return this.edges.filter(e => e.from === node);
  }

  /** Tìm node theo tên */
  findByName(name) {
    return this.nodes.find(n => n.name === name) || null;
  }

  /** Đặt lại trạng thái Dijkstra */
  resetDijkstraState() {
    this.nodes.forEach(n => {
      n.dist = Infinity;
      n.prev = null;
      if (n.state !== 'source') n.state = 'default';
    });
    this.edges.forEach(e => e.state = 'default');
  }

  /** Đặt lại toàn bộ trạng thái vẽ */
  resetVisualState() {
    this.nodes.forEach(n => n.state = 'default');
    this.edges.forEach(e => e.state = 'default');
  }

  /** Sắp xếp node theo hình tròn */
  arrangeCircle(cx, cy, radius) {
    this.nodes.forEach((n, i) => {
      const angle = (i / this.nodes.length) * 2 * Math.PI - Math.PI / 2;
      n.x = cx + radius * Math.cos(angle);
      n.y = cy + radius * Math.sin(angle);
    });
  }

  /** Reset hoàn toàn */
  clear() {
    this.nodes = [];
    this.edges = [];
  }

  /** Serialize ra text (dùng cho textarea) */
  toText() {
    let text = '';
    const connectedNames = new Set();
    const seenEdges = new Set();

    this.uniqueEdges.forEach(e => {
      const key = [e.from.name, e.to.name].sort().join('-');
      if (!seenEdges.has(key)) {
        text += `${e.from.name} ${e.to.name} ${e.weight}\n`;
        seenEdges.add(key);
        connectedNames.add(e.from.name);
        connectedNames.add(e.to.name);
      }
    });

    this.nodes.forEach(n => {
      if (!connectedNames.has(n.name)) text += `${n.name}\n`;
    });

    return text.trim();
  }

  /** Build từ text */
  buildFromText(text, canvasWidth, canvasHeight) {
    const lines = text.split('\n');
    const newNodesMap = new Map();
    const newEdges = [];

    // Giữ vị trí cũ
    const oldPos = new Map();
    this.nodes.forEach(n => oldPos.set(n.name, { x: n.x, y: n.y }));
    const isNew = oldPos.size === 0;

    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (!parts.length || (parts.length === 1 && !parts[0])) return;

      // Tạo node
      parts.forEach((name, idx) => {
        if (idx >= 2) return;
        if (!isNaN(name) || !name) return;
        if (newNodesMap.has(name)) return;
        const pos = oldPos.get(name) || {
          x: 60 + Math.random() * (canvasWidth  - 120),
          y: 60 + Math.random() * (canvasHeight - 120),
        };
        newNodesMap.set(name, new GraphNode(pos.x, pos.y, name));
      });

      // Tạo cạnh
      if (parts.length >= 3) {
        const weight = parseInt(parts[2]);
        const from = newNodesMap.get(parts[0]);
        const to   = newNodesMap.get(parts[1]);
        if (from && to && !isNaN(weight) && weight > 0) {
          const key = [from.name, to.name].sort().join('|');
          if (!newEdges.some(e => [e.from.name, e.to.name].sort().join('|') === key)) {
            newEdges.push({ from, to, weight, state: 'default' });
            newEdges.push({ from: to, to: from, weight, state: 'default' });
          }
        }
      }
    });

    this.nodes = Array.from(newNodesMap.values());
    this.edges = newEdges;

    if (isNew && this.nodes.length > 1) {
      this.arrangeCircle(canvasWidth / 2, canvasHeight / 2,
        Math.min(canvasWidth, canvasHeight) / 2 - 55);
    }
  }
}
