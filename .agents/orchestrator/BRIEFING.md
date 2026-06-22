# BRIEFING — 2026-06-15T17:12:30+07:00

## Mission
Tích hợp giao diện Kanban kéo thả, xuất hóa đơn PDF tự động, và đồng bộ Google Sheets cho Quản lý Zalo Group.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\KHOA MEDIA\OneDrive\Documents\Zalo Trình Quản lý Zalo Group Cá nhân\.agents\orchestrator
- Original parent: main agent
- Original parent conversation ID: c63481ea-d339-47ce-a701-e505e79700e4

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: c:\Users\KHOA MEDIA\OneDrive\Documents\Zalo Trình Quản lý Zalo Group Cá nhân\.agents\orchestrator\PROJECT.md
1. **Decompose**: Split request into independent milestone modules.
2. **Dispatch & Execute**:
   - **Delegate (sub-orchestrator)**: Spawn sub-orchestrators for milestones or tracks.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at spawn threshold (16 spawns).
- **Work items**:
  - Initial decomposition [pending]
  - Project execution [pending]
- **Current phase**: 1
- **Current focus**: Initial decomposition

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- Forensic Auditor verdict is CLEAN is a binary veto.
- Do not reuse a subagent after it has delivered its handoff.

## Current Parent
- Conversation ID: c63481ea-d339-47ce-a701-e505e79700e4
- Updated: not yet

## Key Decisions Made
- Use Project pattern with dual tracks (Implementation & E2E Testing).

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| Codebase Investigator | teamwork_preview_explorer | Explore codebase architecture | in-progress | f39d7c43-d441-4957-8a9b-0f8a16d246eb |

## Succession Status
- Succession required: no
- Spawn count: 1 / 16
- Pending subagents: [f39d7c43-d441-4957-8a9b-0f8a16d246eb]
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 933afbe3-9238-4f9d-9504-ba203c87ff34/task-23
- Safety timer: 933afbe3-9238-4f9d-9504-ba203c87ff34/task-51

## Artifact Index
- c:\Users\KHOA MEDIA\OneDrive\Documents\Zalo Trình Quản lý Zalo Group Cá nhân\.agents\orchestrator\ORIGINAL_REQUEST.md — Original User Request
- c:\Users\KHOA MEDIA\OneDrive\Documents\Zalo Trình Quản lý Zalo Group Cá nhân\.agents\orchestrator\BRIEFING.md — Current Briefing/Working Memory
