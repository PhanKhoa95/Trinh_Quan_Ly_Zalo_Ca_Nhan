---
id: RAW-001
type: raw_requirement
title: Yêu cầu AI Failover Ma Trận 3 Chiều (n Key x n Model x n NCC)
status: analyzed
created_at: 2026-07-31
target_agent: AI-Architect
source_ids:
  - INBOX-2026-07-31-01
---

# RAW-001: AI Failover Ma Trận 3 Chiều (N Key x N Model x N NCC)

## Mô tả Yêu cầu
Hệ thống bot Zalo trợ lý cá nhân cần hoạt động liên tục 24/7 không bị gián đoạn do lỗi API Rate Limit (429), model lỗi thời (404/410), hoặc nhà cung cấp bị ngắt kết nối (503).

## Chi Tiết Yêu Cầu
1. Hỗ trợ cấu hình nhiều API Key cho từng nhà cung cấp (OpenAI, Gemini, Anthropic, DeepSeek, Ollama, Ollama Online).
2. Khi 1 Key bị Rate Limit 429, tự động xoay sang Key tiếp theo trong Key Pool.
3. Khi 1 Model bị trả về lỗi 404/410/429, tự động nhảy sang Model dự phòng tiếp theo trong Model Pool của Provider đó.
4. Khi toàn bộ Key/Model của Provider chính bị cạn Quota, tự động Failover sang Provider kế tiếp theo chuỗi ưu tiên (`aiProviderPriority`).
