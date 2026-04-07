/**
 * dijkstra.js – Thuật toán Dijkstra với hỗ trợ step-by-step và callback
 */

/**
 * Chạy Dijkstra với animation (async, dừng theo bước)
 *
 * @param {import('./graph.js').GraphManager} graph
 * @param {import('./graph.js').GraphNode} source
 * @param {{
 *   onVisit:   (node) => void,
 *   onRelax:   (from, to, newDist) => void,
 *   onStep:    () => Promise<void>,
 *   onFinish:  (result: Map) => void,
 * }} callbacks
 */
export async function runDijkstra(graph, source, callbacks) {
  const { onVisit, onRelax, onStep, onFinish } = callbacks;

  // Reset trạng thái
  graph.nodes.forEach(n => {
    n.dist = Infinity;
    n.prev = null;
    n.state = 'default';
  });
  graph.edges.forEach(e => e.state = 'default');

  source.dist = 0;
  source.state = 'source';

  const unvisited = new Set(graph.nodes);

  while (unvisited.size > 0) {
    // Lấy node có dist nhỏ nhất trong unvisited
    let u = null;
    for (const n of unvisited) {
      if (u === null || n.dist < u.dist) u = n;
    }

    if (!u || u.dist === Infinity) break; // Các node còn lại không thể đến

    unvisited.delete(u);
    u.state = 'current';
    onVisit && onVisit(u);
    await onStep();

    // Relax các cạnh
    const neighbors = graph.neighborsOf(u);
    for (const edge of neighbors) {
      const v = edge.to;
      if (!unvisited.has(v)) continue;

      const alt = u.dist + edge.weight;
      if (alt < v.dist) {
        v.dist = alt;
        v.prev = u;
        onRelax && onRelax(u, v, alt);
      }
    }

    u.state = 'visited';
    await onStep();
  }

  onFinish && onFinish(buildResult(graph, source));
}

/**
 * Đánh dấu đường đi ngắn nhất đến target trên đồ thị
 */
export function markShortestPath(graph, source, target) {
  // Reset path state
  graph.nodes.forEach(n => {
    if (n.state === 'path') n.state = 'visited';
  });
  graph.edges.forEach(e => {
    if (e.state === 'path') e.state = 'default';
  });

  if (!target || target === source) return;

  let curr = target;
  while (curr && curr !== source) {
    curr.state = 'path';
    const prev = curr.prev;
    if (prev) {
      // Đánh dấu cạnh
      const edge = graph.edges.find(e => e.from === prev && e.to === curr);
      const edgeRev = graph.edges.find(e => e.from === curr && e.to === prev);
      if (edge) edge.state = 'path';
      if (edgeRev) edgeRev.state = 'path';
    }
    curr = prev;
  }
  if (source) source.state = 'source';
}

/**
 * Xây dựng kết quả routing table
 */
export function buildResult(graph, source) {
  const result = new Map();

  graph.nodes.forEach(node => {
    let nextHop = '-';
    let path = [];

    if (node === source) {
      nextHop = 'Local';
      path = [source.name];
    } else if (node.dist !== Infinity) {
      // Truy ngược để lấy đường đi đầy đủ
      const fullPath = [];
      let curr = node;
      while (curr) {
        fullPath.unshift(curr.name);
        curr = curr.prev;
      }
      path = fullPath;

      // Next hop = node ngay sau source
      let hop = node;
      while (hop.prev && hop.prev !== source) hop = hop.prev;
      nextHop = hop.name;
    }

    result.set(node.name, { node, dist: node.dist, nextHop, path });
  });

  return result;
}

/**
 * Chạy đồng bộ (không animation) – dùng nội bộ
 */
export function runDijkstraSync(graph, source) {
  graph.nodes.forEach(n => { n.dist = Infinity; n.prev = null; });
  source.dist = 0;
  const unvisited = new Set(graph.nodes);

  while (unvisited.size > 0) {
    let u = null;
    for (const n of unvisited) {
      if (!u || n.dist < u.dist) u = n;
    }
    if (!u || u.dist === Infinity) break;
    unvisited.delete(u);

    graph.neighborsOf(u).forEach(edge => {
      const v = edge.to;
      if (!unvisited.has(v)) return;
      const alt = u.dist + edge.weight;
      if (alt < v.dist) { v.dist = alt; v.prev = u; }
    });
  }

  return buildResult(graph, source);
}
