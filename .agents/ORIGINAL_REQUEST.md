# Original User Request

## Initial Request — 2026-06-15T10:12:15Z

Tích hợp giao diện quản lý dạng bảng Kanban kéo thả trực quan cho tab Dữ liệu nhóm, hỗ trợ tự động xuất hóa đơn dạng tệp PDF khi hoàn thành đơn hàng và đồng bộ dữ liệu với Google Sheets.

Working directory: c:\Users\KHOA MEDIA\OneDrive\Documents\Zalo Trình Quản lý Zalo Group Cá nhân
Integrity mode: development

## Requirements

### R1. Giao diện bảng Kanban kéo thả trực quan cho Dữ liệu nhóm
- Thay thế danh sách bảng tĩnh hiện tại ở tab phụ "Dữ liệu nhóm" thành giao diện Kanban 4 cột: `⏳ Chờ xử lý` (pending), `⚙️ Đang xử lý` (in_progress), `✅ Đã xong` (completed), và `❌ Đã hủy` (cancelled).
- Hỗ trợ kéo thả (Drag and Drop) các thẻ dữ liệu giữa các cột. Trạng thái mới phải được tự động lưu vào SQLite (cập nhật bảng `GroupData` trong cơ sở dữ liệu) và đồng bộ thời gian thực đến tất cả các tab trình duyệt đang kết nối qua Socket.io.

### R2. Tự động sinh và tải hóa đơn PDF cho Đơn hàng
- Khi một đơn hàng (dataType là 'order') được cập nhật trạng thái thành `Đã xong` (completed), hệ thống phải tự động tạo hóa đơn tệp PDF chuyên nghiệp.
- Hóa đơn PDF hiển thị đầy đủ thông tin: Mã hóa đơn, Tên khách hàng (Thành viên gửi), Nhóm nguồn Zalo, Thời gian tạo, Nội dung đặt hàng, và Tổng tiền ước tính.
- Cung cấp nút tải hóa đơn PDF trực tiếp trên thẻ Kanban và bảng dữ liệu để người dùng tải về máy.

### R3. Đồng bộ dữ liệu tự động với Google Sheets
- Cho phép người dùng cấu hình Google Sheet ID và Google Service Account Credentials trên trang Cấu hình/Tích hợp.
- Khi có bản ghi dữ liệu nhóm mới được tạo hoặc cập nhật trạng thái (Kanban, Phê duyệt Zalo), hệ thống tự động ghi/cập nhật dòng tương ứng trên Google Sheets. Nếu chưa cấu hình credentials, hệ thống chạy ở chế độ giả làm (mock sync) và ghi log tiến trình đầy đủ.

## Acceptance Criteria

### Giao diện & Kéo thả Kanban
- [ ] Tab phụ "Dữ liệu nhóm" hiển thị dạng cột Kanban với màu sắc thiết kế hiện đại, đồng bộ giao diện dark theme hiện tại.
- [ ] Thao tác kéo thả thẻ giữa các cột hoạt động mượt mà và cập nhật chính xác trạng thái trong SQLite DB.
- [ ] Socket.io phát sự kiện cập nhật trạng thái thành công và các client khác đồng bộ cột Kanban tương ứng ngay lập tức.

### Hóa đơn PDF
- [ ] Khi đơn hàng đổi trạng thái sang "Đã xong", tệp PDF được tự động sinh ra và lưu trữ thành công trong thư mục hóa đơn của server.
- [ ] Nhấn nút tải trên giao diện tải xuống đúng tệp PDF tương ứng với thông tin hiển thị chính xác.

### Đồng bộ Google Sheets
- [ ] Dữ liệu được đẩy lên Google Sheets tự động khi có thay đổi trạng thái hoặc trích xuất mới.
- [ ] Bản ghi log hệ thống ghi nhận chính xác các lượt đồng bộ thành công hoặc trạng thái giả lập nếu chưa cấu hình API.

## Follow-up — 2026-06-24T06:53:40Z

Complete the planned milestones (M1 to M6) for the Zalo Personal Group Manager application. Turn the simulated dashboard into a functional implementation with a real Kanban board, automated PDF invoices, and synced Google Sheets.

Working directory: y:\Trinh_Quan_Ly_Zalo_Ca_Nhan
Integrity mode: demo

## Requirements

### R1. Kanban Board UI & Synchronization
Replace the static Group Data list view on the frontend (`index.html`, `app.js`, `styles.css`) with a modern 4-column drag-and-drop Kanban Board (columns: `pending`, `in_progress`, `completed`, `cancelled`).
- Drag-and-drop actions must trigger a `PUT /api/group-data/:id/status` request to update the SQLite database.
- State changes must propagate in real-time to all other open clients via Socket.io using the `group-data-update` event.
- Preserve the existing glassmorphism aesthetic.

### R2. Automatic PDF Invoice Generation
When an order/group status transitions to `completed`:
- The backend must generate a PDF invoice using a lightweight PDF library (such as `pdfkit` or a custom layout writer).
- Store the generated PDF file on the server.
- Add a visible download button on both the Kanban card and the Group Data table allowing the user to download the PDF via `GET /api/group-data/:id/invoice`.

### R3. Google Sheets Synchronization (Dual Mode)
Add a Google Sheets configuration panel in the API Integrations tab.
- Allow users to enter a Google Spreadsheet ID and Service Account Credentials (JSON).
- When a status transition occurs, sync the update to the configured spreadsheet.
- **Dual-mode fallback**: If credentials are not provided or invalid, the backend must operate in a simulated/mocked sheet sync mode, logging the synchronized data clearly in the server console and the application's "Nhật ký Logs" tab.

### R4. Automated E2E Testing Suite (Playwright/Puppeteer)
Create a programmatic E2E testing suite in the workspace using Playwright or Puppeteer.
- Write tests that open the UI, perform drag-and-drop status changes, verify that the SQLite database is updated, verify that the Socket.io event is emitted, and verify that a PDF invoice is successfully generated and downloadable.

### R5. Codebase Hardening and Error Handling
Ensure the application is robust:
- The server must not crash when handling invalid inputs, missing configurations, database locks, or network timeouts.
- Provide clear error feedback in the UI and the application logs.

## Acceptance Criteria

### Kanban Board & Sync
- [ ] Drag-and-drop UI functions smoothly across all 4 columns.
- [ ] Dragging updates the SQLite database immediately.
- [ ] Real-time synchronization works across multiple open tabs via Socket.io.

### PDF Invoices
- [ ] Moving a card to "Completed" triggers backend PDF creation.
- [ ] Downloading the invoice returns a valid PDF file.
- [ ] A download button is visible on Kanban cards in the "Completed" column and in the data table.

### Google Sheets Sync
- [ ] The configuration UI accepts Google Sheets settings and saves them to SQLite.
- [ ] When credentials are valid, data syncs to the real Google Sheet.
- [ ] When credentials are absent/invalid, the app logs the synchronized data successfully in simulated mode without throwing uncaught exceptions.

### Testing & Robustness
- [ ] The E2E test suite can be run via npm script and passes 100% of integration cases.
- [ ] No server crashes are observed under invalid operations.

## Follow-up — 2026-07-30T10:48:00Z

Audit, fix, redesign and complete the **Zalo Personal Group Manager** — a production Node.js web dashboard for managing Zalo chat groups via personal accounts. The system already has a working backend (Express + Socket.io + Prisma/SQLite + zca-js) and a feature-rich frontend (HTML/CSS/JS SPA). The team must: (1) audit and fix all existing bugs, (2) completely redesign the UI/UX with a modern premium look, (3) complete the 5 planned milestones (Kanban Board, PDF Invoices, Google Sheets Sync, E2E Testing, Adversarial Hardening), and (4) package the product as production-ready with Docker and 1-Click launcher.

Working directory: Y:\Trinh_Quan_Ly_Zalo_Ca_Nhan
Integrity mode: development

## Requirements

### R1. Code Audit & Bug Fix
Audit the entire existing codebase — frontend (`index.html`, `app.js`, `styles.css`) and backend (`server/server.js`, `server/zalo-client.js`, `server/ai-service.js`, `server/ai-tools.js`, `server/database.js`, and all other server modules). Identify and fix bugs, dead code, error handling gaps (e.g., unhandled promise rejections that crash the server), performance bottlenecks, and security issues. The server must remain stable under all failure scenarios (QR expiry, session loss, network errors, API timeouts).

### R2. Complete UI/UX Redesign
Redesign the entire web dashboard with a fresh, premium, modern aesthetic. The current Dark Glassmorphism theme can be kept as inspiration or replaced entirely — the team decides. The redesign must cover all existing tabs/panels plus the new features from R3-R5. The dashboard must be fully responsive, visually stunning, and feel production-grade. All interactive elements must have smooth animations and transitions.

### R3. Kanban Board UI & Real-time Sync (Milestone M2)
Replace the static Group Data list with a 4-column drag-and-drop Kanban Board (pending → in_progress → completed → cancelled). Cards must sync to the SQLite database via HTTP PUT and broadcast updates in real-time via Socket.io `group-data-update` events. Follow the interface contracts defined in `PROJECT.md`.

### R4. PDF Invoice Generation (Milestone M3)
Auto-generate a PDF invoice when an order status updates to `completed`. Store generated PDFs on the server filesystem. Add a download button on each Kanban card and data table row. Serve via `GET /api/group-data/:id/invoice` as defined in `PROJECT.md`.

### R5. Google Sheets Sync (Milestone M4)
Build a configuration UI for Google Sheets integration (spreadsheet ID, service account credentials). Implement backend sync logic that pushes group data to a designated Google Sheet. Follow the `GET/POST /api/config/google-sheets` contracts in `PROJECT.md`. Include a mock/stub mode for testing without real Google credentials.

### R6. E2E Testing Suite (Milestones M1 & M5)
Create an end-to-end test harness covering the Kanban UI, PDF invoice generation, and Google Sheets sync. Tests must be runnable via a single command and produce a clear pass/fail report.

### R7. Production Packaging
Package the application for easy deployment:
- A `run.bat` that auto-installs dependencies and launches the server + opens the browser (already partially exists, improve it)
- A working `docker-compose.yml` + `Dockerfile` for containerized deployment
- All environment variables documented in a `.env.example`

## Acceptance Criteria

### Stability
- [ ] Server starts successfully and serves the dashboard at `http://localhost:3000` without crashes
- [ ] Server remains running after Zalo session expiry, QR timeout, network errors, or API failures — no unhandled rejections crash the process
- [ ] All existing functionality (multi-account management, group settings, member moderation, automation campaigns, AI services) continues to work after changes

### UI/UX Quality
- [ ] Dashboard loads in under 3 seconds on a modern browser
- [ ] All pages/tabs are fully responsive (desktop, tablet, mobile widths)
- [ ] All interactive elements (buttons, drag-drop, toggles, modals) have visible hover/active states and smooth transitions
- [ ] A non-technical user can navigate and understand the dashboard without documentation

### Kanban Board (M2)
- [ ] Dragging a card between columns updates the database and broadcasts the change via WebSocket
- [ ] A second browser tab connected via Socket.io sees the card move in real-time within 2 seconds
- [ ] Cards display relevant group data (name, status, timestamp, summary)

### PDF Invoices (M3)
- [ ] Changing a card status to `completed` auto-generates a PDF file on the server
- [ ] `GET /api/group-data/:id/invoice` returns a valid PDF download
- [ ] Generated PDF contains correct order data (group name, items, amounts, dates)

### Google Sheets Sync (M4)
- [ ] Configuration UI allows entering spreadsheet ID and service account credentials
- [ ] `POST /api/config/google-sheets` stores config securely (private key never logged or exposed)
- [ ] Mock mode works without real Google credentials and produces a verifiable sync log

### Testing (M1 & M5)
- [ ] All E2E tests pass when run via a single `npm test` or equivalent command
- [ ] Test output clearly indicates pass/fail per test case with descriptive names
- [ ] Tests cover: Kanban drag-drop sync, PDF generation, Sheets config save, server stability under error conditions

### Production Packaging (M7)
- [ ] `run.bat` successfully starts the application on a fresh Windows machine with only Node.js installed
- [ ] `docker-compose up` builds and runs the application in a container accessible at `localhost:3000`
- [ ] `.env.example` documents all required and optional environment variables

