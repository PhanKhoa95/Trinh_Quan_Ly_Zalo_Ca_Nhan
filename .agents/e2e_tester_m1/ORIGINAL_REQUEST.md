## 2026-07-30T10:48:48Z

You are an E2E Testing Specialist subagent tasked with setting up Milestone M1: E2E Testing Suite for Zalo Personal Group Manager.

Working Directory: y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\e2e_tester_m1

Objectives:
1. Inspect the existing project setup, package.json, and server structure in `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan`.
2. Create an opaque-box, automated E2E testing harness (e.g. using Node.js script, `playwright`/`puppeteer`, or custom HTTP + WebSocket test runner script) that can be run via `npm test` or `node tests/run-e2e.js`.
3. Implement test cases across Tiers 1-4:
   - **Tier 1 (Feature Coverage)**: Kanban status update API (`PUT /api/group-data/:id/status`), Socket.io `group-data-update` broadcast event verification, PDF invoice download endpoint (`GET /api/group-data/:id/invoice`), Google Sheets config endpoint (`GET/POST /api/config/google-sheets`), server health endpoint check.
   - **Tier 2 (Boundary & Corner Cases)**: Invalid status transitions, missing IDs, missing or malformed JSON credentials, PDF request for non-completed order.
   - **Tier 3 (Cross-Feature & Concurrent)**: Rapid status changes, concurrent WebSocket client connections.
   - **Tier 4 (Real-World Workload)**: Simulated group data creation -> Kanban move -> PDF trigger -> Sheets sync log check.
4. Ensure `package.json` has `npm test` mapped to run the test harness.
5. Publish `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\TEST_READY.md` containing the test runner command and coverage summary.
6. Verify test execution by running the test suite and documenting the output in your handoff report at `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\e2e_tester_m1\handoff.md`.
