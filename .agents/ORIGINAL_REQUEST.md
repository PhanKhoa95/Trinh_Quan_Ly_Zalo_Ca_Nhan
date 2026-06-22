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
