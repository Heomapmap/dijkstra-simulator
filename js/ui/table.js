/**
 * table.js – Render bảng định tuyến (routing table)
 */

import { fmtDist } from '../utils/helpers.js';

export class TableRenderer {
  constructor(containerEl, finalPathEl) {
    this.container  = containerEl;
    this.finalPath  = finalPathEl;
  }

  /** Render bảng từ Map kết quả Dijkstra */
  render(resultMap, sourceNode) {
    if (!resultMap || resultMap.size === 0) {
      this.showEmpty();
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Đích</th>
            <th>Cost</th>
            <th>Next Hop</th>
            <th>Đường đi</th>
          </tr>
        </thead>
        <tbody>
    `;

    resultMap.forEach(({ node, dist, nextHop, path }) => {
      const isSource  = node === sourceNode;
      const isReach   = dist !== Infinity;
      const rowClass  = isSource ? 'source-row' : '';
      const distCell  = isSource
        ? '<span class="cost-badge">0</span>'
        : isReach
          ? `<span class="cost-badge">${dist}</span>`
          : '<span style="color:#94a3b8">∞</span>';

      const pathStr = path.length > 0
        ? path.join(' → ')
        : '<span style="color:#94a3b8">Không thể đến</span>';

      html += `
        <tr class="${rowClass}" title="Click để xem đường đi" data-node="${node.name}">
          <td><b>${node.name}</b></td>
          <td>${distCell}</td>
          <td>${nextHop}</td>
          <td style="text-align:left;font-size:.72rem;">${pathStr}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    this.container.innerHTML = html;

    // Click row để highlight đường đi (event delegation)
    this.container.querySelectorAll('tr[data-node]').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        // Xóa highlight cũ
        this.container.querySelectorAll('tr').forEach(r => r.classList.remove('path-row'));
        row.classList.add('path-row');
        // Phát sự kiện để canvas highlight
        document.dispatchEvent(new CustomEvent('table:selectNode', {
          detail: { name: row.dataset.node }
        }));
      });
    });
  }

  /** Hiện bảng rỗng */
  showEmpty() {
    this.container.innerHTML = `
      <div class="empty-state">
        Chưa có dữ liệu.<br>
        Hãy chọn nút nguồn (chuột phải) và nhấn <b>Chạy Dijkstra</b>.
      </div>
    `;
    this.clearPath();
  }

  /** Hiện thống kê đường đi được chọn */
  showPath(name, info) {
    if (!info || info.dist === Infinity) {
      this.finalPath.innerHTML = `
        <div class="path-label">Đường ngắn nhất đến ${name}</div>
        <div class="path-display" style="color:#ef4444">Không thể đến được</div>
      `;
      return;
    }
    this.finalPath.innerHTML = `
      <div class="path-label">Đường ngắn nhất đến ${name}</div>
      <div class="path-display">
        ${info.path.join(' → ')}
        <span style="color:#059669;margin-left:8px;font-size:.75rem;">(cost: ${info.dist})</span>
      </div>
    `;
  }

  clearPath() {
    this.finalPath.innerHTML = '';
  }
}
