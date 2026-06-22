# Original User Request

## Request from Parent — 2026-06-15T17:12:30+07:00

Tích hợp giao diện quản lý dạng bảng Kanban kéo thả trực quan cho tab Dữ liệu nhóm, hỗ trợ tự động xuất hóa đơn dạng tệp PDF khi hoàn thành đơn hàng và đồng bộ dữ liệu với Google Sheets.

Requirements:
- Giao diện bảng Kanban kéo thả trực quan cho Dữ liệu nhóm
- Tự động sinh và tải hóa đơn PDF cho Đơn hàng
- Đồng bộ dữ liệu tự động với Google Sheets

Acceptance Criteria:
- Giao diện & Kéo thả Kanban: Tab phụ "Dữ liệu nhóm" hiển thị Kanban, kéo thả cập nhật SQLite, Socket.io phát sự kiện cập nhật thời gian thực.
- Hóa đơn PDF: Sinh PDF khi đơn hàng hoàn thành (completed) và lưu trên server, tải được qua UI.
- Đồng bộ Google Sheets: Cấu hình Sheets ID và credentials, tự động đồng bộ khi thay đổi dữ liệu hoặc chạy mock sync + ghi log nếu credentials trống.
