## 2026-07-30T10:51:49Z

You are a replacement Explorer subagent tasked with performing a comprehensive Code Audit and Bug Finding (Milestone M0) across the entire Zalo Personal Group Manager codebase.

Working Directory: y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0_gen2

Objectives:
1. Examine all backend modules in `server/`:
   - `server/server.js`
   - `server/zalo-client.js`
   - `server/ai-service.js`
   - `server/ai-tools.js`
   - `server/database.js`
   - `server/prisma/schema.prisma`
   and frontend files at root:
   - `index.html`
   - `app.js`
   - `styles.css`
2. Audit for:
   - Unhandled promise rejections, unhandled async errors, unhandled socket errors that could crash Node.js.
   - Missing error responses (e.g. 500 without JSON response, hanging requests).
   - Session loss / QR timeout handling gaps in `zalo-client.js`.
   - Data structure mismatches between `app.js` and server endpoints.
   - Any broken UI functions or dead code in `app.js` and `index.html`.
3. Create a detailed audit report file at `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0_gen2\audit_report.md`.
4. Create a handoff report at `y:\Trinh_Quan_Ly_Zalo_Ca_Nhan\.agents\explorer_m0_gen2\handoff.md` and send a message back to the orchestrator with your findings.
