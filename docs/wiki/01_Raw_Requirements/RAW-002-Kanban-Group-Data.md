---
id: RAW-002
type: raw_requirement
title: Yêu cầu Kanban Board, PDF Invoice & Google Sheets Sync
status: analyzed
created_at: 2026-07-30
target_agent: FullStack-Dev
source_ids:
  - INBOX-2026-07-30-01
---

# RAW-002: Group Data Kanban Board, PDF Invoice & Sheets Sync

## Mô tả Yêu cầu
Quản lý đơn hàng / yêu cầu từ nhóm Zalo cá nhân qua giao diện Kanban drag-and-drop, xuất hóa đơn PDF tự động khi hoàn tất và đồng bộ về Google Sheets.

## Chi Tiết Yêu Cầu
1. Chuyển đổi danh sách Group Data thành Kanban 4 cột (`pending`, `in_progress`, `completed`, `cancelled`).
2. Kéo thả thẻ Kanban sẽ tự động gửi HTTP PUT + Socket.io event `group-data-update` tới tất cả client.
3. Xuất file PDF Invoice tự động khi đơn hàng chuyển sang trạng thái `completed` qua API `GET /api/group-data/:id/invoice`.
4. Cung cấp bộ test harness E2E 4 Tiers (`node tests/run-e2e.js`) đạt tỷ lệ đỗ 100%.
