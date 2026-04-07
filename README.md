# 🌐 Dijkstra Simulator

Mô phỏng thuật toán **Dijkstra** trong định tuyến mạng máy tính

## 🖱️ Cách sử dụng

| Thao tác | Kết quả |
|---|---|
| **Click** vào canvas | Thêm node mới |
| **Shift + kéo** từ node A → B | Nối cạnh có trọng số |
| **Kéo** node | Di chuyển node |
| **Double-click** node | Đổi tên |
| **Chuột phải** node | Menu: đặt nguồn / đổi tên / xóa |
| **Chuột phải** cạnh | Menu: đổi trọng số / xóa |
| **Chuột phải** canvas | Menu: sắp xếp / xóa tất cả |
| **Delete / Backspace** | Xóa node/cạnh đang hover |
| **Esc** | Đóng menu / hủy thao tác |

### Nhập từ văn bản

```
PC1 Switch1 10
Switch1 R1 5
R1 R2 3
Server1
```

Mỗi dòng: `TênA TênB TrọngSố` (cạnh) hoặc `TênNode` (node đơn).

---

## 📁 Cấu trúc dự án

```
dijkstra-simulator/
├── index.html
├── css/
│   ├── main.css          # Layout tổng thể, variables, toast, tooltip
│   ├── components.css    # Buttons, log, table, modal, canvas status
│   └── responsive.css    # Mobile / tablet
├── js/
│   ├── main.js           # Entry point – kết nối tất cả module
│   ├── core/
│   │   ├── dijkstra.js   # runDijkstra(), markShortestPath(), buildResult()
│   │   └── graph.js      # GraphManager, GraphNode – quản lý dữ liệu
│   ├── ui/
│   │   ├── canvas.js     # CanvasManager – vẽ + xử lý chuột/touch
│   │   ├── logger.js     # Logger – log panel
│   │   └── table.js      # TableRenderer – bảng định tuyến
│   └── utils/
│       └── helpers.js    # dist(), clamp(), defaultName(), debounce()…
└── assets/
    ├── images/
    └── fonts/
```

---

## ✨ Tính năng nổi bật

- **Kéo thả node** – di chuyển tự do trên canvas
- **Vẽ cạnh trực quan** – xem đường kẻ theo chuột khi Shift+kéo
- **Context menu** – chuột phải để đặt nguồn, đổi tên, xóa, đổi trọng số
- **Hover tooltip** – hiện thông tin node/cạnh khi di chuột qua
- **Toast notification** – phản hồi thao tác không làm gián đoạn
- **Animation từng bước** – node đổi màu theo tiến trình Dijkstra
- **Click bảng** – highlight đường đi ngắn nhất đến đích
- **Tốc độ tùy chỉnh** – thanh trượt 50 – 1500ms/bước
- **Nhập/Xuất text** – đồng bộ 2 chiều canvas ↔ textarea
- **Responsive** – hỗ trợ mobile / tablet

---

## 🛠️ Công nghệ

- Vanilla JavaScript (ES Modules)
- HTML5 Canvas API
- CSS Grid + Custom Properties
- Không có thư viện ngoài

---

*Môn: Mạng máy tính & Truyền số liệu*
