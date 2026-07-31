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

## Request — 2026-07-30T17:48:16+07:00

Objectives:
1. Audit and fix all existing bugs across backend and frontend (server.js, zalo-client.js, ai-service.js, ai-tools.js, database.js, app.js, index.html, styles.css, etc.). Ensure server stability and handle all unhandled promise rejections / timeouts / error scenarios cleanly.
2. Complete UI/UX Redesign of the entire web dashboard with a fresh, premium, modern look and responsive layout.
3. Implement Kanban Board UI with 4 columns (pending, in_progress, completed, cancelled), DB persistence via HTTP PUT, and real-time Socket.io sync (group-data-update).
4. Implement PDF Invoice Generation when status updates to completed, save PDF on server, add download buttons, serve via GET /api/group-data/:id/invoice.
5. Implement Google Sheets Sync (dual mode: real credentials or mock sync mode with full logging) with UI config and backend sync endpoint GET/POST /api/config/google-sheets.
6. Implement E2E Testing Suite (npm test / runnable script) verifying Kanban, PDF invoices, Google Sheets sync, and stability.
7. Package production readiness: update run.bat (1-Click launcher), docker-compose.yml, Dockerfile, .env.example.

