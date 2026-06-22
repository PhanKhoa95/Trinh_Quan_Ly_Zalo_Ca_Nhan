# Project: Zalo Group Manager Enhancements

## Architecture
This project is a Node.js web application:
- **Frontend**: Single-page application (`index.html`, `app.js`, `styles.css`) using Socket.io-client for real-time updates.
- **Backend**: Express API server (`server.js`), Prisma client (`database.js`, `schema.prisma`) connected to a SQLite database (`zalo_manager.db`).
- **Communication**: HTTP APIs and WebSockets (Socket.io) for real-time updates of group data.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | E2E Testing Suite | Create E2E test harness and opaque-box test cases for Kanban UI, PDF invoices, and Google Sheets sync (Tiers 1-4). | None | PLANNED |
| M2 | Kanban Board UI & Sync | Replace Group Data static list with 4-column drag-and-drop Kanban Board; sync to SQLite database and real-time Socket.io. | None | PLANNED |
| M3 | PDF Invoice Generation | Auto-generate PDF invoice when order status updates to `completed`. Store on server, and add download button on Kanban card / data table. | M2 | PLANNED |
| M4 | Google Sheets Sync | Google Sheet integration configuration UI, backend credentials configuration, sync/mock logic, and logging. | M2 | PLANNED |
| M5 | E2E Integration Pass | Integrate E2E test suite, run E2E test harness, fix bugs, and ensure 100% of Tiers 1-4 tests pass. | M1, M2, M3, M4 | PLANNED |
| M6 | Adversarial Hardening | White-box testing, coverage analysis, adversarial test generation (Tier 5), and codebase hardening. | M5 | PLANNED |

## Interface Contracts
### Client ↔ Server (Kanban Drag and Drop Sync)
- **WS Event**: `group-data-update`
  - Sent when a card is dragged and dropped.
  - Payload: `{ id: string, status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }`
- **HTTP PUT /api/group-data/:id/status**:
  - Request body: `{ status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }`
  - Response body: `{ success: true, data: GroupData }`

### Client ↔ Server (PDF Invoice Download)
- **HTTP GET /api/group-data/:id/invoice**:
  - Response: PDF file download stream or error message.

### Client ↔ Server (Google Sheets Configuration)
- **HTTP GET /api/config/google-sheets**:
  - Response body: `{ spreadsheetId: string, clientEmail: string, hasKey: boolean }`
- **HTTP POST /api/config/google-sheets**:
  - Request body: `{ spreadsheetId: string, credentials: { client_email: string, private_key: string, ... } }`
  - Response body: `{ success: true }`

## Code Layout
- `index.html`: Contains UI skeleton, tabs, and Kanban structures.
- `app.js`: Contains frontend application state, Socket.io event listeners, rendering logic for Group Data tab, drag-and-drop handlers, and HTTP fetch wrappers.
- `styles.css`: CSS styling for the dark theme, cards, Kanban columns, drag hover effects.
- `server/server.js`: Server routing, Socket.io connection and event handling.
- `server/database.js`: Prisma client database wrapper. Add `GroupData` wrapper if needed.
- `server/prisma/schema.prisma`: Database model for GroupData.
