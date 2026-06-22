# Execution Plan: Zalo Group Manager Enhancements

This document outlines the step-by-step execution plan for implementing Kanban drag-and-drop, PDF invoice generation, and Google Sheets synchronization.

## Phase 1: Planning and Exploration
1. **Initial Codebase Analysis**: Proactively explore existing structures of `app.js`, `index.html`, and `server/server.js` using an Explorer subagent.
2. **E2E Test Specification**: Establish E2E Test runner framework and test cases for each of the core requirements.

## Phase 2: Dual-Track Execution
We execute the project in two parallel tracks:

### Track 1: E2E Testing Track (E2E Testing Orchestrator)
- **Objective**: Build a complete, opaque-box, requirement-driven test suite (Tiers 1-4).
- **Deliverables**:
  - Test runner framework (e.g. using Playwright or simple HTTP + WebSocket scripts).
  - Tier 1: Feature coverage (Kanban UI columns, dragging state transitions, PDF generation on completed, Google Sheet config, sync logs).
  - Tier 2: Boundary & Corner cases (large data, invalid states, empty sheet ID, incorrect JSON creds, network drops).
  - Tier 3: Cross-feature combinations (multiple updates, concurrent dragging, rapid state changes).
  - Tier 4: Real-world workload simulation.
  - Publish `TEST_READY.md`.

### Track 2: Implementation Track (Implementation Track Orchestrator)
- **Milestone 2: Kanban UI & SQLite Sync**
  - Replace static table in "Dữ liệu nhóm" with a 4-column Kanban board.
  - Enable drag-and-drop.
  - Sync updates to SQLite DB using Prisma.
  - Implement WebSocket (Socket.io) broadcast to notify other connected users.
- **Milestone 3: PDF Invoices**
  - Trigger PDF generation on order updates to `completed`.
  - Format invoice with: invoice ID, customer (sender) name, source group, timestamp, order contents, estimated price.
  - Store PDFs in a server directory (e.g., `server/invoices/`).
  - Add download buttons on Kanban card and data table.
- **Milestone 4: Google Sheets Integration**
  - Add UI configuration for Spreadsheet ID and Credentials JSON.
  - Integrate with Google Sheets API to write/update records on change.
  - Implement mock sync and logging when credentials are not configured.

## Phase 3: Integration and Verification
- **Milestone 5: E2E Test Pass**
  - Combine Implementation with the E2E Test suite.
  - Fix any failures until all Tier 1-4 tests pass 100%.
- **Milestone 6: Adversarial Hardening (Tier 5)**
  - Spin up Challengers to find coverage gaps and generate adversarial inputs.
  - Hardening of codebase.
  - Run Forensic Auditor to certify clean implementation (no cheating, no dummy endpoints).
