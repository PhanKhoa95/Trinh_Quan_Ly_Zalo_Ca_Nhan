## 2026-07-30T10:48:48Z
You are an Explorer subagent tasked with performing a comprehensive Code Audit and Bug Finding (Milestone M0) across the entire Zalo Personal Group Manager codebase.

Working Directory: y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0

Objectives:
1. Examine all backend modules (server/server.js, server/zalo-client.js, server/ai-service.js, server/ai-tools.js, server/database.js, server/prisma/schema.prisma, etc.) and frontend files (index.html, app.js, styles.css).
2. Identify all existing bugs, unhandled promise rejections, missing error handling, potential crashes, QR timeout / session loss handling gaps, and edge cases.
3. Inspect how Group Data, socket.io events, API endpoints, and configuration options are structured.
4. Produce a detailed audit report at `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0\audit_report.md` detailing:
   - Summary of findings
   - Backend bugs & unhandled rejections with file paths and line numbers
   - Frontend bugs & state sync issues
   - Stability & error handling gaps
   - Recommended fixes for the Implementer Worker

Deliver your handoff report to `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0\handoff.md` and send a message back to the orchestrator.
