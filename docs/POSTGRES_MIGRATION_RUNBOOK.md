# Quy trình Chuyển đổi SQLite → PostgreSQL & Vận hành (`DB-01` → `DB-05`)

Tài liệu này ghi nhận kết quả kiểm kê thực tế (`DB-01`), bộ schema & script chuyển đổi (`DB-02`, `DB-03`) và quy trình bàn giao/khôi phục/rollback (`DB-05`) cho hệ thống **Toàn Trung MarTech**.

---

## 1. Kết quả Kiểm kê Dữ liệu (`DB-01`)

- **File SQLite đang dùng**: `packages/database/prisma/independent_v2.db` (`2,215,936` bytes), cấu hình bởi `.env` (`DATABASE_URL="file:./independent_v2.db"`).
- **Tổng số bản ghi kiểm kê**: **3,666 bản ghi** (chạy `node scripts/pg-inventory-and-migrate.js --inventory`):
  - `user`: `9` | `product`: `25` | `campaign`: `109` | `systemSetting`: `17` | `notification`: `38`
  - `lead`: `13` (giữ SĐT dạng chuỗi có số `0` đầu, vd `0364759204`, `0908100223`) | `leadProduct`: `3` | `leadActivity`: `31` | `marketingTracking`: `13`
  - `platformDailyMetric`: `2,582` | `platformSyncLog`: `72`
  - `seoKeyword`: `490` | `seoArticle`: `5`
  - `designRequest`: `6` | `designAssetVersion`: `7` | `aiUsageLog`: `246`
  - `leadAttachment`: `0` | `priceCheckAlert`: `0` | `leadReconciliation`: `0` | `webhookIntakeErrorLog`: `0`
- **Vị trí tệp đính kèm & tài sản vật lý (`STORAGE_ROOT="./storage_independent_v2"`)**:
  - `design/`: `364` tệp (khớp khóa `storageObjectKey` trong `design_asset_versions`, vd `design/ai-draft-req-148-v1-b318a375-897ee077.png`)
  - `leads/`: `2` tệp | `branding/`: `2` tệp | `avatars/`: `1` tệp | `config/`: `1` tệp | `backups/`: `4` tệp
- **Các điểm cần chuyển đổi SQLite → PostgreSQL**:
  1. Đổi `datasource db` sang `provider = "postgresql"`, `url = env("DATABASE_URL")` (đã chuẩn bị tại `packages/database/prisma-postgres/schema.prisma`, đã kiểm chứng `prisma validate` thành công).
  2. Giữ nguyên `BigInt` (micros/VNĐ), `DateTime` ISO và `String` (SĐT không mất số `0` đầu).
  3. Sau khi insert giữ nguyên `id` gốc, phải chạy `setval(pg_get_serial_sequence(...))` để sequence tự tăng không đụng khóa chính cũ (đã tích hợp sẵn trong `scripts/pg-inventory-and-migrate.js --import-pg`).
  4. Sao chép nguyên vẹn thư mục `STORAGE_ROOT` sang máy chủ mới để mọi `storageObjectKey` và `fileUrl` hoạt động bình thường.

---

## 2. Quy trình Chuyển đổi Chính thức (`DB-02` → `DB-04`)

### Bước 1: Sao lưu trước khi chuyển (Bắt buộc)
1. Tạm dừng dịch vụ web để không phát sinh ghi mới trong lúc chốt snapshot.
2. Sao lưu file `packages/database/prisma/independent_v2.db` và nén toàn bộ thư mục `storage_independent_v2/`.
3. Xuất snapshot JSON từ bản sao SQLite:
   ```bash
   node scripts/pg-inventory-and-migrate.js --export-json storage_independent_v2/backups/sqlite_snapshot.json
   ```

### Bước 2: Khởi tạo Schema PostgreSQL (`DB-02`)
1. Tạo database PostgreSQL trống (ví dụ `toantrung_martech`).
2. Cấu hình `DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/toantrung_martech?schema=public"`.
3. Đẩy schema & generate Prisma Client cho PostgreSQL:
   ```bash
   npx prisma db push --schema=packages/database/prisma-postgres/schema.prisma
   npx prisma generate --schema=packages/database/prisma-postgres/schema.prisma
   ```

### Bước 3: Nhập dữ liệu & Đối chiếu (`DB-03`)
1. Chạy import theo đúng thứ tự quan hệ cha → con và tự động cập nhật sequence:
   ```bash
   node scripts/pg-inventory-and-migrate.js --import-pg storage_independent_v2/backups/sqlite_snapshot.json
   ```
2. Chạy đối chiếu số lượng bản ghi toàn bộ các bảng:
   ```bash
   node scripts/pg-inventory-and-migrate.js --verify-pg storage_independent_v2/backups/sqlite_snapshot.json
   ```
   Kết quả bắt buộc: `"ok": true, "mismatches": []`.

### Bước 4: Kiểm thử vận hành trên PostgreSQL (`DB-04`)
Trước khi mở cho toàn công ty, kiểm tra trên môi trường chạy PostgreSQL:
- Đăng nhập song song nhiều vai trò (`ADMIN`, `SALES_LEAD`, `SALES`, `MARKETING_SEO`, `DESIGNER`).
- Kiểm tra Gmail Auto-Sync, đồng bộ Google OAuth (`GA4`, `Search Console`), tạo Lead thủ công, lọc website nguồn, xuất `.xlsx`/`.docx` báo cáo và tạo/chỉnh sửa SEO AI + AI Design không mất lịch sử hoặc tạo dữ liệu trùng.

---

## 3. Sao lưu, Thử khôi phục, OAuth & Phương án Quay lại (`DB-05`)

- **Sao lưu định kỳ PostgreSQL + Tệp**:
  - DB: `pg_dump -Fc "$DATABASE_URL" -f backup_toantrung_$(date +%F).dump`
  - Tệp: đồng bộ định kỳ thư mục `STORAGE_ROOT` (`storage_independent_v2/`).
- **Thử khôi phục (Restore Drill)**:
  - Tạo DB thử `toantrung_restore_test`, chạy `pg_restore -d "$RESTORE_DB_URL" backup_toantrung_YYYY-MM-DD.dump`, đối chiếu lại `node scripts/pg-inventory-and-migrate.js --inventory`.
- **Cấu hình Google OAuth khi chuyển máy chủ / tên miền**:
  - Cập nhật **Authorized redirect URIs** trong Google Cloud Console (ví dụ `https://<ten-mien-moi>/api/v1/auth/google/callback`).
  - Giữ nguyên `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` trong `.env`. Nếu giữ nguyên `SystemSetting` (`google_oauth_connection`) từ snapshot thì refresh token Google hiện tại tiếp tục hoạt động.
- **Phương án Quay lại (Rollback về SQLite)**:
  1. Dừng tiến trình ứng dụng đang trỏ PostgreSQL.
  2. Khôi phục `.env` (`DATABASE_URL="file:./independent_v2.db"`) và chạy `npx prisma generate --schema=packages/database/prisma/schema.prisma`.
  3. Khởi động lại dịch vụ trên bản sao SQLite đã chốt ở Bước 1.

