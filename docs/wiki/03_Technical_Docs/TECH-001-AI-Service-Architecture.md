---
id: TECH-001
type: technical_doc
title: Kiến Trúc Phân Hệ AI Service & Matrix Failover Engine
status: active
created_at: 2026-07-31
target_agent: Backend-Dev
source_ids:
  - SPEC-001
---

# TECH-001: Kiến Trúc Phân Hệ AI Service & Matrix Failover Engine

## Đường Dẫn Mã Nguồn Liên Quan
- `server/ai-service.js`: Hàm `askAI(...)` và `executeAskAI(...)`.
- `server/server.js`: Endpoints `/api/ai/config` (GET & POST).
- `server/database.js`: NeDB wrapper lưu trữ bộ sưu tập `aiSetting`.

## Cấu Trúc Dữ Liệu Config AI
```json
{
  "aiEnabled": true,
  "aiProvider": "gemini",
  "aiProviderPriority": ["gemini", "openai", "anthropic", "deepseek", "ollama-online", "ollama"],
  "aiApiKeyPool": {
    "gemini": ["AIzaSy..."],
    "openai": ["sk-proj-..."]
  },
  "aiModelPool": {
    "gemini": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
    "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]
  },
  "aiModel": "gemini-2.5-flash"
}
```

## Lệnh Kiểm Thử Chẩn Đoán
```bash
node "C:\Users\KHOA MEDIA\.gemini\antigravity\brain\c8f44631-03a1-4cd7-9556-2edb2650a173\scratch\test_ai_matrix_failover.js"
```
