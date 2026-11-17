# Phạm vi Nâng cấp Toàn Trung V2 (`UPGRADE_SCOPE.md`)

Tài liệu làm việc ghi nhận phạm vi nâng cấp trên codebase `ToanTrungMar_V2_Independent` (nhánh `main`, HEAD `ffbdb4c`). Tài liệu này bổ sung cho quy trình triển khai, **không thay thế hoặc chỉnh sửa tài liệu BA** trong `docs/modules/`, `docs/PERMISSIONS.md`, `docs/DATA_SAFETY.md`.

## 1. Nguồn nghiệp vụ & Quy chuẩn bắt buộc
- **Phân quyền & Vai trò:** Giữ nguyên 8 vai trò (`SALES`, `MKT_STAFF`, `DESIGNER`, `ADS`, `MKT_LEAD`, `SALES_LEAD`, `BOD`, `ADMIN`) và 12 quyền theo `docs/PERMISSIONS.md`, bao gồm ẩn danh SĐT/Email/Địa chỉ Lead ở UC01 cho nhóm Marketing/Ads theo phân quyền backend.
- **Pipeline & Chống trùng:** Giữ nguyên 5 trạng thái (`new_lead`, `quoting`, `quote_sent`, `won`, `lost`); tách biệt trạng thái tiếp nhận, phân công, trùng lặp (`duplicate_red`, `won_returning`, `lost_returning`) và spam. Chống lặp Webhook/Gmail theo `(intakeSourceProvider, intakeSourceAccountKey, externalSubmissionId)`.
- **An toàn dữ liệu & AI:** Không gửi SĐT, Email hoặc thông tin nhận dạng khách hàng sang AI (`docs/DATA_SAFETY.md`). Ghi nhận log sử dụng AI (`AiUsageLog`) theo từng lượt gọi thật; không tạo số liệu giả khi thiếu kết nối hoặc lỗi provider.
- **Giới hạn kỹ thuật:**
  - Monorepo 4 workspaces: `apps/web`, `apps/api`, `packages/database`, `packages/contracts`.
  - Không sửa các file migration SQLite/Prisma đã áp dụng; không tự reset DB hoặc xóa dữ liệu thật.
  - Không tự push Git hay deploy lên môi trường ngoài khi chưa có yêu cầu.

## 2. Mục tiêu các gói nâng cấp (P1 → P6)
- **P1 — Gmail tự tiếp nhận & tạo Lead; chống xử lý trùng:** Tự động quét thư mới từ 2 website (`bangled.vn`, `toantrung.com.vn`) và email khách gửi vào Gmail mà không cần người dùng bấm nút Đồng bộ; xử lý lại không tạo bản ghi trùng; hỗ trợ địa chỉ hành chính cũ & mới (Tỉnh/TP – Quận/Huyện – Phường/Xã – Thôn/Số nhà).
- **P2 — Kết nối, đồng bộ & số liệu nhất quán M02–M04:** Đảm bảo chỉ số L1/L2/L3, GA4, Search Console, Google Ads nhất quán giữa Tracking (M02), Từ khóa/Ads (M03) và Báo cáo/Tổng quan (M04); xử lý độ trễ chốt sổ 24–48h của Google khi lọc "Hôm nay".
- **P3 — Hiển thị bộ dữ liệu thiết yếu & liên kết nguồn với hành trình Lead:** Phân bổ rõ dữ liệu kéo về cho từng Module 2–3–4 trên giao diện và gắn kết nguồn tiếp nhận với hành trình Lead.
- **P4 — Báo cáo SEO bằng AI dựa trên số liệu đã tính & có dẫn chứng:** Đảm bảo phần phân tích/đề xuất SEO & báo cáo Word/Excel dựa trên metric thật từ DB, có dẫn chứng nguồn & từ khóa cụ thể.
- **P5 — Cải thiện AI Design (M05):** Hỗ trợ ảnh tham chiếu công trình + ảnh sản phẩm, vùng chỉnh sửa 4 góc/điểm chạm, chọn & fallback model thông minh không lỗi `Failed to fetch`, loại bỏ ảnh mẫu cứng không liên quan prompt, giữ lịch sử phiên bản sạch khi lỗi.
- **P6 — Kiểm thử liên module, phân quyền & xuất báo cáo:** Kiểm chứng toàn bộ `typecheck`, `test:core`, build production và kiểm tra bảo mật phân quyền/xuất báo cáo.

