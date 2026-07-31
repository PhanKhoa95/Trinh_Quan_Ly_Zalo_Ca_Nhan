---
id: SPEC-001
type: specification
title: Đặc Tả Hệ Thống AI Failover Ma Trận 3D
status: approved
approved_by: Human-Architect
created_at: 2026-07-31
target_agent: Backend-Dev
source_ids:
  - RAW-001
---

# SPEC-001: Đặc Tả Kỹ Thuật AI Failover Ma Trận 3D

## Trạng Thái: Approved

## Quy Trình Xử Lý Thuật Toán Failover (Provider -> Key -> Model)

```mermaid
flowchart TD
    A[Nhận tin nhắn Zalo] --> B[Duyệt chuỗi Provider Priority]
    B --> C{Còn Provider?}
    C -- Có --> D[Lấy Key Pool của Provider]
    C -- Không --> Z[Trả về Lỗi / Failover thất bại]
    D --> E{Còn Key?}
    E -- Có --> F[Lấy Model Pool của Provider]
    E -- Không --> B
    F --> G{Còn Model?}
    G -- Có --> H[Gọi API AI Provider]
    G -- Không --> E
    H --> I{Kết quả HTTP}
    I -- 200 OK --> J[Trả về kết quả cho Bot Zalo]
    I -- 429 / 503 --> E
    I -- 404 / 410 --> G
```

## Các Quy Tắc Ranh Giới (Constraints & Guards)
1. **Loại bỏ Model Retired**: Không gọi các model tên cũ đã ngừng hoạt động như `gemma3:12b`, `gemini-1.5-flash`, `gemini-2.0-flash-lite-preview-02-05`.
2. **Key Masking**: Tất cả API Keys lưu trong database phải được che giấu (masked) trước khi phản hồi về giao diện Web Dashboard (`GET /api/ai/config`).
3. **Failover Success Log**: Khi tự động chuyển đổi thành công sang Provider backup, phải ghi log dạng `[AI Failover SUCCESS] Nhà cung cấp chính X bị lỗi, đã tự động chuyển đổi thành công sang Y.`
