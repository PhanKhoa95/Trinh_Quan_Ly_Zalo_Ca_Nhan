---
id: SPEC-002
type: specification
title: Đặc Tả Kỹ Thuật Kanban Board, Hóa Đơn PDF & Test Harness
status: approved
approved_by: Human-Architect
created_at: 2026-07-30
target_agent: FullStack-Dev
source_ids:
  - RAW-002
---

# SPEC-002: Đặc Tả Kỹ Thuật Kanban Board, PDF Invoice & Sheets Sync

## Trạng Thái: Approved

## Hợp Đồng Giao Tiếp API / WebSockets
1. **HTTP PUT `/api/group-data/:id/status`**:
   - Request: `{ status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }`
   - Response: `{ success: true, data: GroupData }`
2. **WebSocket Event `group-data-update`**:
   - Payload: `{ id: string, status: string, updatedAt: string }`
3. **HTTP GET `/api/group-data/:id/invoice`**:
   - Chỉ cho phép tải PDF khi đơn hàng ở trạng thái `completed`. Trả về `400 Bad Request` nếu chưa hoàn thành.

## Bộ Kiểm Thử Tự Động (E2E Test Runner)
- Chạy qua lệnh: `node tests/run-e2e.js`
- Yêu cầu: Đạt 100% tỷ lệ vượt qua tất cả 4 Tier test cases.
