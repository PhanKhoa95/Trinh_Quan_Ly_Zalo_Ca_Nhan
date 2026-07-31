# Execution Plan: Zalo Personal Group Manager

This document outlines the step-by-step execution plan for auditing, fixing, redesigning, building features, testing, and packaging the Zalo Personal Group Manager application.

## Milestones Overview

| # | Milestone Name | Description & Key Deliverables | Dependencies | Status |
|---|---|---|---|---|
| M0 | Code Audit & Bug Fixes | Audit all backend/frontend files (`server.js`, `zalo-client.js`, `ai-service.js`, `ai-tools.js`, `database.js`, `app.js`, `index.html`, `styles.css`). Fix bugs, unhandled promise rejections, timeouts, QR expiry handling, session loss. Ensure server stability. | None | IN_PROGRESS |
| M1 | E2E Testing Suite Infrastructure | Build test runner & test cases for Kanban, PDF invoices, Google Sheets sync, and server robustness (Tiers 1-4). Publish `TEST_READY.md`. | M0 | PLANNED |
| M2 | UI/UX Redesign & Responsive Layout | Complete UI/UX redesign with modern premium glassmorphism/dark theme, responsive layout (desktop, tablet, mobile), smooth animations & transitions. | M0 | PLANNED |
| M3 | Kanban Board UI & Real-Time Sync | Implement 4-column drag-and-drop Kanban Board (`pending`, `in_progress`, `completed`, `cancelled`), DB persistence (`PUT /api/group-data/:id/status`), and Socket.io `group-data-update` broadcast. | M2 | PLANNED |
| M4 | PDF Invoice Generation | Auto-generate professional PDF invoices on `completed` status change, store on server, add download buttons on Kanban cards and data table (`GET /api/group-data/:id/invoice`). | M3 | PLANNED |
| M5 | Google Sheets Dual-Mode Sync | UI configuration tab for Spreadsheet ID and Credentials JSON (`GET/POST /api/config/google-sheets`), auto-sync on status/data update, dual-mode fallback to mock sync with full logging. | M3 | PLANNED |
| M6 | E2E Integration Pass & Verification | Run E2E test harness against implementation, verify 100% pass of Tiers 1-4 tests across all endpoints & UI actions. | M1, M3, M4, M5 | PLANNED |
| M7 | Adversarial Coverage Hardening & Forensic Audit | White-box testing, edge case verification, stress testing (Tier 5), Forensic Auditor integrity check (CLEAN verdict). | M6 | PLANNED |
| M8 | Production Packaging | Update 1-Click `run.bat` launcher, `docker-compose.yml`, `Dockerfile`, `.env.example`, verified fresh startup. | M7 | PLANNED |

## Execution Workflow (Project Pattern)

### Track 1: E2E Testing Track
- **Sub-orchestrator / Worker**: E2E Test Suite Engineer
- **Scope**: Build opaque-box, requirement-driven tests covering:
  1. Server stability & API status checks
  2. Kanban status update API & WebSocket propagation
  3. PDF invoice endpoint generation and download header validation
  4. Google Sheets configuration GET/POST and mock sync verification
  5. UI end-to-end interactions (Playwright/Puppeteer/HTTP+WS test runner)
  6. Publish `TEST_READY.md`.

### Track 2: Implementation Track
- **M0**: Explorer to audit codebase bugs → Worker to fix backend/frontend stability bugs.
- **M2**: Worker for UI/UX redesign & CSS styling framework + responsive layout.
- **M3**: Worker for Kanban Board frontend UI + `PUT /api/group-data/:id/status` endpoint + Socket.io event emission.
- **M4**: Worker for PDF generator module (pdfkit or lightweight writer) + file storage + `GET /api/group-data/:id/invoice` + UI download button.
- **M5**: Worker for Google Sheets config API (`GET/POST /api/config/google-sheets`) + Sheets sync module (dual mode: real Google API vs simulated log sync).
- **M6**: Worker + Reviewer to run E2E tests, fix failures, ensure 100% test pass.
- **M7**: Challenger for adversarial stress testing + Forensic Auditor for integrity verification.
- **M8**: Worker to refine `run.bat`, `Dockerfile`, `docker-compose.yml`, `.env.example` and test production launcher.

