---
id: TECH-002
type: technical_doc
title: Hướng Dẫn Kỹ Thuật Kanban Board, PDF Invoice & Socket.io Realtime
status: active
created_at: 2026-07-30
target_agent: FullStack-Dev
source_ids:
  - SPEC-002
---

# TECH-002: Kanban Board, PDF Invoice & Realtime Socket.io

## Đường Dẫn Mã Nguồn Liên Quan
- `index.html`: Layout 4 cột Kanban Board.
- `app.js`: Xử lý sự kiện kéo thả HTML5 Drag-and-Drop và Socket.io.
- `styles.css`: Dark-mode Glassmorphism styling cho thẻ Kanban.
- `tests/run-e2e.js`: Standalone E2E Test Suite Runner.

## Lệnh Kiểm Thử E2E Suite
```bash
node tests/run-e2e.js
```
