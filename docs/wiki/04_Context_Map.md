# Wiki Context Map & Truy Vết Nguồn Dự Án Zalo Manager

> **Wiki Root**: `docs/wiki/`  
> **Cập nhật lần cuối**: 2026-07-31

---

## 🗺️ Ma Trận Truy Vết Nguồn (Traceability Matrix)

| Raw Requirement | Specification | Technical Document | Trạng Thái | File Liên Quan |
|---|---|---|---|---|
| [RAW-001](01_Raw_Requirements/RAW-001-AI-Failover-Matrix.md) | [SPEC-001](02_Specifications/SPEC-001-AI-Failover-Engine.md) | [TECH-001](03_Technical_Docs/TECH-001-AI-Service-Architecture.md) | `APPROVED / ACTIVE` | `server/ai-service.js`, `server/server.js` |
| [RAW-002](01_Raw_Requirements/RAW-002-Kanban-Group-Data.md) | [SPEC-002](02_Specifications/SPEC-002-Kanban-Invoice-Sync.md) | [TECH-002](03_Technical_Docs/TECH-002-Kanban-WebSocket-Contracts.md) | `APPROVED / ACTIVE` | `app.js`, `index.html`, `tests/run-e2e.js` |

---

## 🏗️ Cấu Trúc Dự Án & Phân Vai Agent (Agent Ownership)

1. **AI & Core Backend (`Backend-Dev`)**:
   - `server/ai-service.js`: Quản lý AI Multi-Provider Matrix Failover Engine.
   - `server/server.js`: API Server & WebSocket Gateway.
   - `server/database.js`: NeDB / Prisma persistence.

2. **Frontend UI & WebSockets (`Frontend-Dev`)**:
   - `index.html`: Dashboard Skeleton & Kanban HTML.
   - `app.js`: State manager & Socket.io client handlers.
   - `styles.css`: Glassmorphism dark-mode UI.

3. **QA & Automation (`QA-Tester`)**:
   - `tests/run-e2e.js`: Multi-tier E2E test harness.

---

## 🧪 Kết Quả Kiểm Thử Hệ Thống (System Validation)

- **AI Matrix Failover Test**: `PASSED (100%)`
- **Full E2E Test Suite**: `PASSED 12/12 (100%)` (725ms)
- **Local Dev Server**: Dang chay ngam tai `http://localhost:3000` (`status: ok`)
