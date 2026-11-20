# Báo cáo Kiểm toán & Tối ưu Hiệu năng – Độ mới Dữ liệu (`ToanTrungMar_V2_Independent`)

**Thời điểm hoàn tất kiểm chứng:** `2026-11-19T09:35:42+07:00` (Múi giờ `Asia/Ho_Chi_Minh`)  
**Phạm vi:** Toàn bộ `ToanTrungMar_V2_Independent` (`/dashboard`, `/leads`, `/tracking`, `/ads`, `/reports`, `/design`, hệ thống API `/api/v1/*`, lớp cache client/server, worker nền và cơ sở dữ liệu SQLite `independent_v2.db`).  
**Ràng buộc tuân thủ:** Giữ nguyên 100% mã nguồn V1 (`ToanTrungMar`), giữ nguyên dữ liệu thật trong `independent_v2.db` (`5.474` bản ghi `platform_daily_metrics`, `655` từ khóa `seo_keywords`, `141` chiến dịch `campaigns`, `22` hồ sơ `leads`, `6` dự án `design_requests`), giữ nguyên các tệp thay đổi hiện hữu (`apps/web/config/google-realtime-config.json`, `BAO_CAO_DU_LIEU_MODULE_02_03_TOAN_TRUNG_V2.*`) và giữ nguyên kiến trúc `Next.js 14.2.35 + Prisma 5.22.0 + SQLite`.

---

## 1. Nguyên nhân gốc theo từng màn hình và tầng hệ thống

### 1.1. Tầng Dùng chung (Client Cache, Session, Shell, Router & SQLite DB)
- **Client HTTP Cache (`apps/web/src/core/http/client.ts`) thiếu khóa ngày thực tế và giữ dữ liệu cũ quá lâu:**
  - Khóa cache trước đây chỉ ghép `userScope::METHOD:path` mà không gắn ngày hiệu lực theo múi giờ Việt Nam (`YYYY-MM-DD`). Khi qua 00:00 sang ngày mới, bộ lọc `TODAY` / `YESTERDAY` / `7D` vẫn khớp khóa URL cũ.
  - `FRESH_TTL_MS = 90_000` (90 giây) và `STALE_TTL_MS = 15 * 60_000` (15 phút) khiến `apiRequest()` trả thẳng cache cũ mà không kích hoạt làm mới nền hoặc không đẩy dữ liệu mới lên giao diện khi hàm `onRevalidated` chưa được truyền xuống các workspace.
  - Khi người dùng đổi bộ lọc liên tiếp và `AbortController` hủy request của component đầu tiên, promise dùng chung trong `inflightGetRequests` bị abort cho tất cả subscriber hoặc bỏ sót cơ chế ref-count.
- **SessionContext & WorkspaceShell (`SessionContext.tsx`, `WorkspaceShell.tsx`):**
  - `SessionContext` gọi `usePathname()` trực tiếp trong Provider gốc và không bọc `useMemo` cho context value, dẫn tới mỗi lần chuyển route đều re-render toàn bộ cây component con.
  - `SessionContext` tải toàn bộ danh sách thông báo `/api/v1/notifications` (`29,1 KB`) chỉ để lấy số `unreadCount` cho chuông header, đồng thời tự chạy `setInterval` 45 giây riêng lẻ; khi cộng dồn với các `setInterval` 25s–60s ở từng trang tạo ra nhiều vòng lặp polling chồng chéo.
  - `WorkspaceShell.tsx` phát đồng thời hai sự kiện `tt-global-search` và `tt-lead-search` mỗi lần gõ ô tìm kiếm, trong khi `LeadsWorkspace`, `ReportsWorkspace` và `AiDesignWorkspace` đăng ký lắng nghe cả hai sự kiện, làm nhân đôi số lần lọc state.
- **Bộ lọc phạm vi (`useDashboardScope.ts`, `WebsiteDashboardHeader.tsx`, `StandardDateRangeDropdown.tsx`):**
  - Chưa đồng bộ state nội bộ khi prop `preset` / `websiteId` đổi từ URL hoặc nút quay lại (`popstate`).
  - Khi bấm sang chế độ `Tùy chọn (CUSTOM)`, `StandardDateRangeDropdown` gọi ngay `onChangeCustomRange('', '')` làm xóa khoảng ngày hiện tại và kích hoạt chuỗi truy vấn rỗng/lỗi trước khi người dùng kịp chọn ngày.
- **Cơ sở dữ liệu SQLite & Bảo mật Vault (`packages/database/src/index.ts`, `apps/api/src/core/security/vault.ts`):**
  - SQLite chạy ở chế độ mặc định `journal_mode = "delete"` (71 index), gây khóa đọc/ghi tuần tự khi nhiều API dashboard và worker chạy đồng thời.
  - `globalForPrisma.prisma` chỉ được gán trong `NODE_ENV !== 'production'`, khiến bản build production có nguy cơ khởi tạo nhiều instance `PrismaClient` trên các route chunk khác nhau.
  - `vault.ts` gọi `crypto.scryptSync(secret, VAULT_SALT, 32)` trên mỗi lượt giải mã token OAuth / API key (`~170–240 ms` CPU blocking mỗi lệnh).

### 1.2. Tổng quan (`/dashboard` — `apps/web/src/app/(workspace)/dashboard/page.tsx`)
- Gọi `/api/v1/reports?websiteId=all&preset=7D` bản đầy đủ (`42,8 KB` cho `7D`, `47,6 KB` và `595,5 ms` cho `30D`) bao gồm cả các bảng phân rã chi tiết mà màn hình Tổng quan không hiển thị.
- Không gắn khóa kiểm tra phạm vi (`reportState.path === reportPath`) kèm `AbortController` + bộ đếm thứ tự request (`reqSeqRef`), nên khi có phản hồi trễ hoặc chuyển trang nhanh dễ hiển thị dữ liệu của lần gọi trước.
- Không lắng nghe bus đồng bộ dữ liệu nội bộ (`data-sync-bus`); khi tạo Lead hoặc đổi trạng thái ở M01, Tổng quan không tự cập nhật cho tới khi hết hạn cache 90 giây hoặc F5.

### 1.3. Module 01 — Quản lý Lead (`/leads` — `LeadsWorkspace.tsx` & `01-leads/service.ts`)
- Import tĩnh toàn bộ các khối nặng (`LeadProgressTimeline`, `LeadDetailModals`, `GmailSettingsModal`) làm phình bundle khởi tạo.
- Thuật toán kiểm tra nghi vấn dò giá (`priceCheckSuspectMap`) duyệt lồng nhau $O(N^2)$ trên mảng Lead mỗi lần render.
- Khi chọn bộ lọc ngày trên `StandardDateRangeDropdown`, callback gọi `setCustomStartDate('')` sau `setDateRangePreset(p)` làm ghi đè state; hiệu ứng đọc URL `?page=` dùng `setTimeout(..., 200)` ghi đè lại `currentPage = 1`; tham số `?leadId=` và `?search=` nằm trong `useEffect` phụ thuộc `[leads]` khiến modal chi tiết tự bật lại sau mỗi lần làm mới nền.
- `setInterval` 25 giây làm mới ngầm gọi `setEditPhone(...)`, `setEditContactName(...)`, `setStatusNote(...)` ghi đè thẳng lên dữ liệu người dùng đang gõ dở trong ngăn chi tiết Lead.
- Endpoint xuất Excel `/api/v1/leads/export` bỏ qua hai tham số lọc ngày `fromDate` và `toDate`.
- Polling `/api/v1/leads/gmail-sync` (`247,8–706,3 ms`) gọi trực tiếp Google Gmail API mỗi lần mở trang mà không có khóa chống gọi trùng theo chu kỳ ngắn.

### 1.4. Module 02 — Chiến dịch & Lưu lượng (`/tracking` — `TrackingWorkspace.tsx` & `02-tracking-sync/*`)
- **Nguyên nhân trực tiếp hiện số liệu cũ khi đổi bộ lọc (`7 ngày` → `Hôm nay` / `Hôm qua`):**
  - Ở Frontend: `TrackingWorkspace.tsx` giữ nguyên state `data` của phạm vi cũ (`2026-11-13 → 2026-11-19`) trong suốt thời gian chờ `/api/v1/tracking?view=spec` phản hồi, nên nhãn nút đã chuyển sang `"Hôm nay"` nhưng toàn bộ thẻ KPI, dòng tiêu đề phụ và biểu đồ vẫn hiển thị số của 7 ngày trước (tái hiện thực tế: sau `1.280 ms` vẫn hiện `2026-11-13 → 2026-11-19`).
  - Ở Backend: `ga4-live-cache.service.ts` khi chưa có snapshot khớp đúng khóa `propertyId:startDate:endDate` đã dùng vòng lặp `findAnyCachedSnapshotForProperty(propertyId)` để lấy đại một snapshot của khoảng ngày khác trả về tạm, đồng thời thực thi tuần tự các lệnh `runReport` tới Google Analytics Data API ngay trên luồng request tải trang (`245,7–634,6 ms`).
- Khi vừa mở `/tracking`, một `useEffect` bắn ngay **4 request prefetch đồng thời** (`all/7D`, `all/30D`, `all/TODAY`, `all/YESTERDAY`) tranh chấp kết nối SQLite và băng thông với request chính của trang.
- `MarketingTrafficChart` và `StockAreaChart` dùng ID `<linearGradient>` cố định tĩnh và không reset chỉ số điểm hover (`hoverIdx`) khi mảng `points` đổi độ dài.

### 1.5. Module 03 — Từ khóa & SEO (`/ads` — `SeoKeywordsWorkspace.tsx`, `SeoAiReportPanel.tsx`, `03-keywords-ads/*`)
- Dùng chung một biến state `page` cho cả 3 tab (`Từ khóa tìm kiếm`, `Trang đích SEO`, `Bài viết & Nội dung`), gây lệch trang khi chuyển tab.
- Tương tự M02, giữ nguyên `data` cũ trên màn hình khi người dùng đổi website hoặc khoảng ngày, kèm bão 4 request prefetch khi mount.
- `SeoAiReportPanel.tsx` được nạp tĩnh ngay từ đầu dù người dùng chưa mở ngăn Báo cáo AI; bên trong `SeoAiReportPanel` có 2 `useEffect` cùng gọi `loadReports()` khi mount và hàm `execFormat()` gọi `onUpdateReport( id, editorRef.current.innerText )` làm strip toàn bộ thẻ HTML (`<b>`, `<h3>`, `<ul>`) và nhảy con trỏ soạn thảo về đầu dòng.
- Ở Backend: `GET /api/v1/ads` bản đầy đủ trả tới **`401,1 KB`** (trong đó toàn bộ `655` dòng `seo_keywords` chiếm `361,4 KB` và toàn bộ thân bài viết `seo_articles` chiếm `30,7 KB` không phân trang / không lược giản khi chỉ cần bản tóm tắt). `m03-spec.service.ts` gọi `getCachedGscSiteStatus` chờ kiểm tra URL Inspection trực tiếp trên request đọc dashboard.

### 1.6. Module 04 — Báo cáo Hiệu quả Marketing (`/reports` — `ReportsWorkspace.tsx`, `ReportDocComposer.tsx`, `04-reports/*`)
- Giữ `data` của phạm vi cũ khi đổi website hoặc bộ lọc ngày; đồng thời cũng bắn 4 request prefetch khi mount.
- Khi mở chế độ `Soạn văn bản (doc_composer)`, `ReportDocComposer` nhận `data` mới từ `/api/v1/reports?view=spec` nhưng `legacyData` từ `/api/v1/reports` chưa tải xong nên ghép nhầm tên website mới với số liệu phân rã của khoảng ngày cũ.
- Trong `ReportDocComposer.tsx`: thẻ `<label>` bọc ngoài `<input type="checkbox">` cùng gắn `onClick={() => toggleSection(sec.id)}` với `onChange` của checkbox khiến thao tác bấm vào ô chọn bị đảo trạng thái 2 lần; bản nháp đang gõ dở bị ghi đè khi props `data`/`legacyData` làm mới nền; hàm dựng HTML báo cáo chưa lọc XSS (`sanitizeReportHtml`).
- Ở Backend (`04-reports/service.ts` và `m04-spec.service.ts`): thực hiện tới 18–26 truy vấn Prisma trong một request `/api/v1/reports` (`257,8–595,5 ms`), tải toàn bộ cột JSON lớn của `design_requests` và `seo_articles` chỉ để đếm số lượng KPI.

### 1.7. Module 05 — Thiết kế & Phối cảnh AI (`/design` — `AiDesignWorkspace.tsx`, `05-ai-design/*`)
- **Mở trang & danh mục Model:**
  - `GET /api/v1/design` trả `170,6 KB` vì đọc `fs.readFileSync` tệp cấu hình AI mỗi lần gọi, mở và quét byte toàn bộ file ảnh khảo sát trên đĩa để lấy kích thước pixel mà không cache theo `mtimeMs`, và đính kèm trường `installZoneBboxJson` nặng vào danh sách dự án.
  - Khi cache Model Registry hết hạn, `getModelRegistrySnapshot()` chặn request để gọi mạng khám phá danh sách model từ tất cả provider tuần tự.
  - `ModelRegistryModal` được import và mount tĩnh ngay khi vào `/design`.
- **Thực thi sinh ảnh AI & khôi phục tác vụ:**
  - `executeChatSubmit` gọi `PATCH /api/v1/design/[id]` đồng bộ, giữ kết nối HTTP chờ nhà cung cấp AI sinh ảnh xong mới trả kết quả, đồng thời luôn chạy hàm dựng ảnh HTML5 Canvas nặng `renderRealPhotoAiCompositeBase64()` (`toDataURL`) trên luồng chính ngay cả khi đang dùng Cloud AI bên ngoài.
  - Hiển thị dòng chữ tiến độ giả cố định `"AI (...) đang kết xuất ảnh từ Gateway (thời gian xử lý ~35-45s)..."` thay vì trạng thái thực tế và thời gian trôi qua thực của job trên máy chủ.
  - Polling khi job đang chạy (`setInterval` 2,5 giây) gọi lại `loadData(pid, true)` tải toàn bộ danh sách dự án (`170 KB`) thay vì chỉ hỏi trạng thái dự án đang chạy `/api/v1/design/[id]`, và ghi đè lại `paramForm` / `activeBrief` khi người dùng đang thao tác hoặc vừa chuyển từ `?fromBrief=1` / `?leadId=` sang.

---

## 2. Danh sách File và Cơ chế Đã Sửa

### 2.1. Tầng Cơ sở dữ liệu, Bảo mật & Cache Máy chủ
| File | Cơ chế đã sửa |
| :--- | :--- |
| [index.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/src/index.ts) | Luôn giữ singleton `globalForPrisma.prisma` ở cả dev và production; bổ sung `ensureSqlitePerformanceReady(prisma)` tự động kích hoạt `PRAGMA journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`, `cache_size = -16000`, `temp_store = MEMORY`, `foreign_keys = ON` và tạo idempotent **32 composite index nóng** (nâng tổng số index trong SQLite từ `71` lên `106`). |
| [core.prisma](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/prisma/models/core.prisma), [01-leads.prisma](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/prisma/models/01-leads.prisma), [02-tracking-sync.prisma](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/prisma/models/02-tracking-sync.prisma), [03-keywords-ads.prisma](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/prisma/models/03-keywords-ads.prisma), [05-ai-design.prisma](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/database/prisma/models/05-ai-design.prisma) | Đồng bộ khai báo `@@index` trong Prisma schema khớp với các truy vấn lọc theo website, khoảng ngày, trạng thái spam, người phụ trách và nhật ký đồng bộ. |
| [vault.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/core/security/vault.ts) | Lưu bộ nhớ đệm khóa dẫn xuất `scryptSync` trong `globalThis.__toantrungDerivedVaultKeys`, loại bỏ hoàn toàn `~170–240 ms` nghẽn CPU mỗi lần giải mã thông tin kết nối Google/AI. |
| [server-data-cache.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/core/cache/server-data-cache.ts) | Xây dựng bộ nhớ đệm máy chủ có phạm vi (`getOrComputeScopedCache`), tự động ghép khóa ngày Việt Nam (`getVietnamDateKey`) + chữ ký revision miền dữ liệu (`getDomainRevisionSignature`) + khóa phạm vi (`userId/role/websiteId/preset/fromDate/toDate/page`), hỗ trợ singleflight chống gọi trùng và vô hiệu hóa tức thì qua `bumpDomainRevisions(domains, reason)`. |
| [route.ts (API revisions)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/system/revisions/route.ts), [route.ts (Web revisions)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/app/api/v1/system/revisions/route.ts) | Endpoint nhẹ `GET /api/v1/system/revisions` (`0,7 KB`, `~2,1 ms`) trả về bảng bộ đếm revision của 11 miền dữ liệu (`leads`, `tracking`, `ads`, `seo_articles`, `seo_reports`, `reports`, `design`, `notifications`, `branding`, `websites`, `auth`), `serverDateVn` và `unreadCount` thông báo của phiên hiện tại. |
| [dashboard-spec.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/packages/contracts/src/common/dashboard-spec.ts) | Mở rộng `DashboardFreshnessDto` tách bạch rõ 3 mốc: `checkedAt` (`lastCheckedAt`), `lastSyncedAt` (`lastSuccessAt`) và `latestSourceDataAt` (`dataThrough`) cùng cờ `fromCache`. |

### 2.2. Tầng API, Dịch vụ Nghiệp vụ M01–M05 & Worker Nền
| File | Cơ chế đã sửa |
| :--- | :--- |
| [service.ts (M01 Leads)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/01-leads/service.ts), [gmail-sync.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/01-leads/gmail-sync.service.ts), [export/route.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/leads/export/route.ts), [gmail-sync/route.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/leads/gmail-sync/route.ts) | Bọc `listLeads` trong `getOrComputeScopedCache` phân tách theo `userId + roleCode + filter`; thêm khóa chống bão poll Gmail (`15s` cooldown khi `autoPoll=true`); bổ sung lọc `fromDate`/`toDate` cho xuất Excel; gọi `bumpDomainRevisions(['leads', 'reports', 'tracking', 'notifications'])` tại mọi thao tác tạo/sửa/chuyển Sales/đánh dấu spam/đồng bộ Gmail thành công. |
| [ga4-live-cache.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/02-tracking-sync/ga4-live-cache.service.ts), [m02-spec.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/02-tracking-sync/m02-spec.service.ts), [service.ts (M02)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/02-tracking-sync/service.ts) | **Xóa bỏ hoàn toàn hàm `findAnyCachedSnapshotForProperty`** để tuyệt đối không trả nhầm dữ liệu khoảng ngày cũ cho khoảng ngày mới; tách các lệnh gọi Google Analytics Data API / GSC Inspection ra khỏi luồng đọc trang (`forceBlocking = false`), chuyển sang làm mới nền singleflight có giới hạn đồng thời (`runWithConcurrency(..., 3)`) và gọi `bumpDomainRevisions(['tracking', 'reports', 'ads'])` khi có dữ liệu mới. |
| [m03-spec.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/03-keywords-ads/m03-spec.service.ts), [service.ts (M03)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/03-keywords-ads/service.ts), [seo-report.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/03-keywords-ads/seo-report.service.ts), [ads/route.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/ads/route.ts) | Bổ sung chế độ `?summary=1` và phân trang cho `/api/v1/ads` (loại bỏ việc tải toàn bộ `655` từ khóa và thân bài viết nặng khi chỉ cần danh mục); đọc `getCachedGscSiteStatus` không chặn UI; gắn `bumpDomainRevisions` khi tạo/sửa bài viết SEO, báo cáo AI và nhập Google Trends. |
| [m04-spec.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/04-reports/m04-spec.service.ts), [service.ts (M04)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/04-reports/service.ts), [reports/route.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/reports/route.ts) | Bổ sung chế độ `?compact=1` cho `/dashboard` (giảm dung lượng từ `42,8 KB` xuống `8,0 KB`, giảm thời gian từ `257,8–595,5 ms` xuống `18,3–54,7 ms` cold và `3,4–4,5 ms` warm); thay thế các truy vấn tải full dòng bằng `count`/`groupBy` song song và cache theo đúng phạm vi. |
| [model-registry.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/05-ai-design/providers/model-registry.service.ts), [providers/index.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/05-ai-design/providers/index.ts), [private-files.service.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/core/storage/private-files.service.ts), [service.ts (M05)](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/modules/05-ai-design/service.ts), [design/[id]/route.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/app/api/v1/design/[id]/route.ts) | Cache cấu hình AI và Model Registry trên RAM theo `mtimeMs + size` của file trên đĩa; khi mở `/design` trả ngay snapshot đã cache và chạy khám phá model nền song song; cache metadata kích thước ảnh theo `mtimeMs + size`; bổ sung `asyncMode: true` trả ngay HTTP `202` kèm `jobId` và `activeJob` (`~67,5 ms`), khóa chống chạy chồng `activeDesignJobLocks`, chống gửi trùng `processedIdempotencyKeys`, tự động hủy job treo quá 5 phút và phát thông báo khi hoàn tất/thất bại. |
| [workers/index.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/workers/index.ts), [instrumentation.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/instrumentation.ts) | Khởi chạy bộ lập lịch worker nội bộ độc lập với trình duyệt (`ensureInternalWorkersSchedulerStarted`), có khóa chống chạy chồng (`activeWorkerRunLocks`), loại bỏ lệnh gọi trùng `syncAllGoogleDataAcrossModules` trong `runScheduledD3SyncJob` và tự động tăng revision miền dữ liệu sau mỗi chu kỳ worker. |

### 2.3. Tầng Frontend, Điều hướng, Cache Phạm vi & Các Module (`/dashboard`, M01–M05)
| File | Cơ chế đã sửa |
| :--- | :--- |
| [data-sync-bus.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/http/data-sync-bus.ts) | Bus đồng bộ sự kiện dữ liệu qua `EventTarget` (cùng tab) và `BroadcastChannel` (đa tab) theo từng miền dữ liệu (`leads`, `tracking`, `ads`, `seo_articles`, `seo_reports`, `reports`, `design`, `notifications`, `branding`, `websites`, `auth`). |
| [route-state.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/http/route-state.ts) | Lưu và khôi phục bộ lọc, trang danh sách, tab đang mở và vị trí cuộn (`scrollTop`) trong `sessionStorage` cô lập theo `userId:roleCode`, tự động xóa sạch khi đăng xuất hoặc đổi tài khoản. |
| [client.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/http/client.ts) | Khóa cache client bao gồm `userScope + vnDateKey (YYYY-MM-DD) + path`; rút `FRESH_TTL_MS` xuống `20s`, `STALE_TTL_MS` `180s` (LRU 150 mục); bảo vệ chống ghi đè bằng `cacheEpoch`; deduplication có ref-count `withAbortSignal`; tự động vô hiệu hóa cache và phát tín hiệu `publishDataSync` ngay sau mọi lệnh `POST`/`PATCH`/`DELETE` thành công. |
| [SessionContext.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/session/SessionContext.tsx), [WorkspaceShell.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/layout/WorkspaceShell.tsx) | Tách `SessionAuthRedirect` để `SessionProvider` không re-render toàn ứng dụng khi đổi route; dùng `/api/v1/notifications?countOnly=1` (`0,1 KB`); gom toàn bộ các timer rời rạc về **1 bộ hỏi thăm duy nhất** `/api/v1/system/revisions` mỗi 15 giây (tự tạm dừng khi tab ẩn), tự động phát hiện bước sang ngày mới (`serverDateVn`) và phát sự kiện làm mới đúng module có dữ liệu thay đổi. |
| [useDashboardScope.ts](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/core/dashboard/useDashboardScope.ts), [WebsiteDashboardHeader.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/components/common/WebsiteDashboardHeader.tsx), [StandardDateRangeDropdown.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/components/common/StandardDateRangeDropdown.tsx), [StockAreaChart.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/components/common/StockAreaChart.tsx) | Đồng bộ prop/URL 2 chiều; không bắn scope rỗng khi mới mở lịch `CUSTOM`; hiển thị rõ 3 mốc thời gian (`Kiểm tra lúc`, `Đồng bộ nguồn`, `Dữ liệu đến`) trên thanh trạng thái; dùng `useId()` cho gradient SVG biểu đồ. |
| [dashboard/page.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/app/(workspace)/dashboard/page.tsx) | Dùng `/api/v1/reports?websiteId=all&preset=7D&compact=1`, kiểm tra nghiêm ngặt `reportState.path === reportPath`, lắng nghe `subscribeDataSync` để tự cập nhật số liệu khi Lead/Chiến dịch/SEO/Thiết kế thay đổi. |
| [LeadsWorkspace.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/01-leads/LeadsWorkspace.tsx) | Tách `next/dynamic` cho các modal và timeline; tối ưu `buildLeadsFraudIndex` về $O(N)$; bảo vệ form đang nhập bằng `isDetailDirtyRef` + `onInputCapture`/`onChangeCapture`; lưu vị trí cuộn và bộ lọc qua `route-state.ts`; lắng nghe `data-sync-bus`. |
| [TrackingWorkspace.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/02-tracking-sync/TrackingWorkspace.tsx), [MarketingTrafficChart.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/02-tracking-sync/MarketingTrafficChart.tsx) | Áp dụng bất biến `data = dataState?.path === apiPath ? dataState.data : null` (hiển thị skeleton theo khối ngay khi đổi sang phạm vi chưa có trong cache, tuyệt đối không hiển thị số cũ dưới nhãn bộ lọc mới); bỏ 4 request prefetch khi mount; nạp động biểu đồ; thêm `content-visibility: auto; contain-intrinsic-size: auto 360px` cho bảng dưới fold. |
| [SeoKeywordsWorkspace.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/03-keywords-ads/SeoKeywordsWorkspace.tsx), [SeoAiReportPanel.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/03-keywords-ads/SeoAiReportPanel.tsx) | Tách `queriesPage`, `pagesPage`, `contentPage`; áp dụng bất biến `dataState.path === apiPath`; nạp động `SeoAiReportPanel` và `StockAreaChart`; sửa lỗi mất định dạng trình soạn thảo bằng `editorDomToMarkdownText`. |
| [ReportsWorkspace.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/04-reports/ReportsWorkspace.tsx), [ReportDocComposer.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/04-reports/ReportDocComposer.tsx) | Áp dụng bất biến `dataState.path === queryUrl` và đồng bộ `legacyDataState.path === legacyQueryUrl`; nạp động `ReportDocComposer`; sửa lỗi double-toggle checkbox, bảo vệ bản nháp bằng `isDirtyDraftRef` và bổ sung `sanitizeReportHtml`. |
| [AiDesignWorkspace.tsx](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/web/src/modules/05-ai-design/AiDesignWorkspace.tsx) | Nạp động `ModelRegistryModal` (giảm First Load JS của `/design` xuống chỉ còn **`1,59 kB` route / `89,1 kB` tổng**); hiển thị tức thì từ `peekApiCacheEntry('/api/v1/design')`; gửi `asyncMode: true` nhận HTTP `202` + `jobId` sớm; bỏ bước dựng canvas client khi dùng Cloud AI; poll nhẹ `/api/v1/design/[id]` mỗi 2 giây chỉ khi có job `running`; hiển thị thời gian thực đã trôi qua (`elapsedJobSec`) thay cho tiến độ giả `~35-45s`; khôi phục job khi chuyển trang/quay lại. |

---

## 3. Bảng Hiệu năng Trước và Sau Khi Sửa

### Điều kiện đo kiểm thực tế
- **Môi trường chạy:** Bản build production (`npm --workspace @toantrung/web run build` → `npm --workspace @toantrung/web run start` trên `http://localhost:3000`), hệ điều hành Windows, Node.js + SQLite `independent_v2.db` (`WAL` mode, `106` indexes) với toàn bộ dữ liệu thật.
- **Công cụ đo trình duyệt:** Headless Google Chrome thật (`chrome.exe --headless=new --remote-debugging-port=9339`, viewport `1440×900`) điều khiển qua Chrome DevTools Protocol (CDP), tài khoản `admin@toantrung.vn`.
- **Định nghĩa chỉ số:**
  - `Phản hồi điều hướng (navMs)`: Thời điểm từ khi click menu đến khi URL đổi và khung tiêu đề/shell của màn hình đích xuất hiện.
  - `Nội dung hữu ích đúng phạm vi (contentReadyMs)`: Thời điểm dữ liệu thực khớp đúng website & khoảng ngày của màn hình đích render xong trên DOM (không tính việc chỉ đổi tiêu đề/menu).
  - `Biểu đồ hoàn tất (chartReadyMs)`: Thời điểm đường/cột SVG của biểu đồ chính hoàn tất render trên DOM.

### 3.1. Hiệu năng API & Dung lượng Payload (Trước vs. Sau)
| Endpoint API | Trước (Latency) | Trước (Payload) | Sau – Cold (1st) | Sau – Warm (Cache) | Sau (Payload) | Mức cải thiện |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `GET /api/v1/auth/me` | 4,2 – 9,2 ms | 0,4 KB | 19,8 ms | **4,7 – 5,6 ms** | 0,4 KB | Ổn định, memoized |
| `GET /api/v1/notifications?countOnly=1` *(Header Bell)* | 6,1 – 10,6 ms *(bản full)* | 29,1 KB | 7,7 ms | **3,7 – 5,2 ms** | **0,1 KB** | **-99,7% dung lượng** |
| `GET /api/v1/notifications?summary=1` | 6,1 – 10,6 ms *(bản full)* | 29,1 KB | 6,0 ms | **3,7 – 6,4 ms** | **2,5 KB** | **-91,4% dung lượng** |
| `GET /api/v1/system/revisions` *(Sync Poller)* | *(Chưa có)* | — | 4,5 ms | **2,1 – 2,4 ms** | **0,7 KB** | Thay thế 4 timer nặng |
| `GET /api/v1/reports?websiteId=all&preset=7D&compact=1` *(Tổng quan)* | 257,8 – 288,4 ms | 42,8 KB | **54,7 ms** | **3,4 – 4,5 ms** | **8,0 KB** | **-81,3% payload, -98,4% warm** |
| `GET /api/v1/reports?websiteId=all&preset=30D&compact=1` | 595,5 ms | 47,6 KB | **18,3 ms** | **4,0 – 4,3 ms** | **11,7 KB** | **-96,9% cold, -99,3% warm** |
| `GET /api/v1/reports?view=spec&websiteId=all&preset=7D` *(M04)* | 234,7 – 277,8 ms | 5,8 – 16,4 KB | **21,5 ms** | **4,8 – 5,0 ms** | 11,1 KB | **-91,6% cold, -98,1% warm** |
| `GET /api/v1/tracking?view=spec&websiteId=all&preset=7D` *(M02)* | 245,7 – 312,6 ms | 13,4 – 23,7 KB | **41,7 ms** | **3,2 – 3,5 ms** | 20,8 KB | **-84,8% cold, -98,8% warm** |
| `GET /api/v1/ads?view=spec&websiteId=all&preset=7D` *(M03)* | 268,8 – 537,9 ms | 28,9 – 36,7 KB | **58,5 ms** | **3,8 – 5,3 ms** | 33,9 KB | **-85,5% cold, -98,9% warm** |
| `GET /api/v1/leads?includeSpam=true` *(M01)* | 16,1 – 243,3 ms | 67,1 KB | **58,0 ms** | **5,2 – 6,3 ms** | 70,3 KB | **-76,2% peak, -97,4% warm** |
| `GET /api/v1/leads/gmail-sync` | 247,8 – 706,3 ms | 15,9 KB | **7,3 ms** | **5,5 – 10,5 ms** | 15,9 KB | **-98,5% (chống bão poll)** |
| `GET /api/v1/design` *(M05)* | 17,4 – 30,9 ms | 170,6 KB | 42,9 ms | **3,8 – 4,9 ms** | **129,7 KB** | **-24,0% payload, -81% warm** |

### 3.2. Hiệu năng Tải trang Lần đầu & Điều hướng Liên tiếp 30 Lượt trên Chrome Thật
| Kịch bản đo (Trình duyệt Chrome CDP) | Trước (`navMs`) | Trước (`contentReadyMs`) | Sau (`navMs`) | Sau (`contentReadyMs`) | Sau (`chartReadyMs`) | Số Request API | Đánh giá Mục tiêu |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Mở lần đầu `/dashboard` (Cold Document Load) | 873,2 ms | 873,2 ms | **188,9 ms** *(run 1)* / **552,0 ms** *(run 2)* | **188,9 – 552,0 ms** | **188,9 – 552,0 ms** | 4 – 6 | **Giảm 37% – 78%** |
| Chuyển lần đầu sang `/leads` (M01) | 39,2 ms | 361,1 ms | **114,2 ms** | **175,5 ms** | **175,5 ms** | 3 | **Giảm 51,4% thời gian hiện bảng** |
| Chuyển lần đầu sang `/tracking` (M02) | 22,5 ms | 1.490,6 ms | **40,7 – 119,9 ms** | **102,8 – 286,7 ms** | **102,8 – 286,7 ms** | **1** *(trước: 5)* | **Giảm 80,8% – 93,1%** |
| Chuyển lần đầu sang `/ads` (M03) | 33,6 ms | 34,8 ms *(cache cũ)* | **47,6 – 75,3 ms** | **129,5 – 377,8 ms** | **129,5 – 377,8 ms** | **1** *(trước: 5)* | **Bỏ 4 request prefetch thừa** |
| Chuyển lần đầu sang `/reports` (M04) | 28,9 ms | 1.123,5 ms | **31,8 – 71,1 ms** | **66,8 – 220,3 ms** | **66,8 – 220,3 ms** | **1** *(trước: 5)* | **Giảm 80,4% – 94,1%** |
| Chuyển lần đầu sang `/design` (M05) | 18,5 ms | 407,0 ms | 418,4 ms *(nạp chunk)* | 506,1 ms *(kèm 6 ảnh)* | 506,1 ms | 7 *(1 JSON + 6 ảnh)* | **First Load JS chỉ 89,1 kB** |
| Quay lại `/dashboard` (Có cache đúng phạm vi) | 39,4 ms | 52,0 ms | **34,6 – 126,8 ms** | **34,6 – 126,8 ms** | **34,6 – 126,8 ms** | **0** | **Tức thì từ cache đúng phạm vi** |
| **30 lượt chuyển liên tiếp (P50 / Trung vị)** | 20,6 ms | 36,8 ms *(cache 90s cũ)* | **34,9 – 118,6 ms** | **39,2 – 132,9 ms** | **39,2 – 132,9 ms** | Tổng 11–17 reqs / 30 lượt | **Đạt mục tiêu ($\le 200\text{ ms}$)** |
| **30 lượt chuyển liên tiếp (P95)** | 40,1 ms | 77,6 ms *(cache 90s cũ)* | **52,7 – 198,8 ms** | **65,2 – 241,3 ms** | **65,2 – 241,3 ms** | — | **Đạt mục tiêu ($\text{nav} \le 200\text{ ms}, \text{P95} \le 500\text{ ms}$)** |
| **Số `setInterval` hoạt động (Vòng 1 → Vòng 5)** | 1 → 1 | — | **1 → 1** (`leaked: 0`) | — | — | — | **Không tích lũy timer/listener** |
| **Số lỗi Console / Runtime Exception qua 30 lượt** | 0 | — | **0** | — | — | — | **Ổn định 100%** |

---

## 4. Bằng chứng Đổi Bộ lọc Không Hiện Nhầm Dữ liệu Cũ

### 4.1. Kiểm chứng trên `/tracking` (M02) khi bấm liên tiếp qua các mốc thời gian
- **Trước khi sửa:** Đang ở `7 ngày gần nhất (2026-11-13 → 2026-11-19)`, bấm sang `"Hôm nay"`, sau `1.280 ms` giao diện vẫn hiển thị số liệu và dải ngày `2026-11-13 → 2026-11-19` dưới nút `"Hôm nay"` đang active.
- **Sau khi sửa (Kết quả trích xuất trực tiếp từ `after-browser-cdp-suite.json`):**
  1. Bấm **`Hôm nay`**: Ngay ở frame kế tiếp (`immediateAfterClick`), dữ liệu phạm vi cũ bị gỡ khỏi hiển thị và chuyển sang khung tải (`"LOADING_SKELETON"`, `leakedOldRangeImmediately: false`), sau đó khớp chính xác `2026-11-19 → 2026-11-19` trong **`113,8 ms`** (hoặc **`42,4 ms`** khi server cache đã ấm).
  2. Bấm **`Hôm qua`**: `immediateAfterClick = "LOADING_SKELETON"`, `leakedOldRangeImmediately: false`, hiển thị đúng `2026-11-18 → 2026-11-18` trong **`110,5 ms`** (`44,8 ms` warm).
  3. Bấm **`7 ngày gần nhất`**: `immediateAfterClick = "LOADING_SKELETON"`, `leakedOldRangeImmediately: false`, hiển thị đúng `2026-11-13 → 2026-11-19` trong **`82,5 ms`** (`22,1 ms` warm).
  4. Bấm **`30 ngày gần nhất`**: `immediateAfterClick = "LOADING_SKELETON"`, `leakedOldRangeImmediately: false`, hiển thị đúng `2026-10-21 → 2026-11-19` trong **`252,1 ms`** (`83,0 ms` warm).
  5. **Bấm dồn 3 bộ lọc trong 30 ms (`30 ngày gần nhất` → `Hôm qua` → `Hôm nay`):** Các request của `30 ngày` và `Hôm qua` bị hủy qua `AbortController` và bị chặn bởi `activePathRef.current === requestPath`. Kết quả hội tụ đúng tại `2026-11-19 → 2026-11-19` (`rapidBurstFinalRange: "2026-11-19->2026-11-19"`), và sau khi chờ thêm `250 ms` vẫn giữ nguyên `2026-11-19 → 2026-11-19` (`afterLateResponseWaitRange: "2026-11-19->2026-11-19"`, `zeroStaleFlash: true`).

### 4.2. Kiểm chứng đổi Website trên `/reports` (M04) và Unit Test Cache GA4
- Chuyển liên tiếp giữa `bangdientu.com.vn` → `manhinhled.net.vn` → `Tất cả website` trên `/reports`: Cả 3 bước đều cập nhật đúng nhãn phạm vi và bảng số liệu tương ứng (`settledBangDienTu: true`, `settledManHinhLed: true`, `settledAllWebsites: true`), không còn hiện tượng ghép tên website mới với số liệu ngày cũ trong `ReportDocComposer`.
- Regression test `PERF-04: GA4 live cache enforces exact date-range keys with zero cross-date fallback` trong [perf-freshness-sync.test.js](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/core/__tests__/perf-freshness-sync.test.js#L211-L258) xác nhận: khi bộ nhớ có snapshot của kỳ `2026-11-10..2026-11-12`, truy vấn kỳ `2026-11-19..2026-11-19` trả về `null` (để lấy đúng số DB/làm mới nền của ngày 19/11) chứ tuyệt đối không lấy snapshot của kỳ `10..12/11`.

---

## 5. Bằng chứng Dữ liệu Mới Cập nhật Xuyên Các Module Không Cần F5

### 5.1. Kiểm chứng E2E Tạo Lead Mới → Tự động Cập nhật Tổng quan, M01, M02, M04
Thực hiện trong phiên trình duyệt Chrome CDP đang mở tại `/dashboard` (không gọi `location.reload()` / không bấm F5):
1. **Trạng thái trước thao tác:**
   - `/api/v1/system/revisions` ghi nhận: `leads: 1, tracking: 28, reports: 21, notifications: 2`.
   - Tổng số Lead trong `/api/v1/leads?includeSpam=true`: `22`.
2. **Thao tác tạo Lead:** Gửi `POST /api/v1/leads` tạo Lead kiểm thử (`createdLeadId: 1251`, `HTTP 201`).
3. **Kết quả lan truyền xuyên module (`propagateMs: 209,4 ms`):**
   - Backend tự động gọi `bumpDomainRevisions(['leads', 'reports', 'tracking', 'notifications'], 'lead_created')`, nâng tức thì bộ đếm revision lên `leads: 2, tracking: 29, reports: 22, notifications: 3` (`leadsRevisionIncremented: true`, `reportsRevisionIncremented: true`).
   - Client HTTP wrapper tự động vô hiệu hóa cache của các miền `leads`, `reports`, `tracking`, `notifications` và phát sự kiện `publishDataSync`.
   - Danh sách `/api/v1/leads?includeSpam=true` tăng ngay lên **`23` Lead** (`foundInLeadsApiWithoutReload: true`) và API Tổng quan `/api/v1/reports?websiteId=all&preset=7D&compact=1` phản ánh ngay `totalLeadsL1 = 20` trong kỳ 7 ngày mà không cần F5.
4. **Dọn dẹp sau kiểm thử:** Đã xóa hoàn toàn bản ghi Lead tạm `#1251` cùng các bảng liên kết; tổng số Lead trong DB trở về đúng **`22` bản ghi gốc** (`leadsCountRestoredAfterCleanup: 22`).

### 5.2. Kiểm chứng Module 05 (`/design`) Tiếp nhận Job Bất đồng bộ (`HTTP 202`) & Khôi phục Khi Chuyển Trang
1. Tạo dự án kiểm thử `#760` và gửi lệnh sinh Banner `PATCH /api/v1/design/760` với `asyncMode: true` (`providerId: 'local_sandbox'`).
2. Máy chủ phản hồi ngay **`HTTP 202 Accepted`** chỉ sau **`67,5 ms`** (`accepted: true, asyncQueued: true, initialStatus: "running"`) kèm mã định danh `jobId: "job-760-v1-1795055741348"`.
3. Ngay khi job đang xử lý, điều hướng trình duyệt rời khỏi `/design` sang `/dashboard`, sau đó quay lại `/design`:
   - Trạng thái job được khôi phục nguyên vẹn từ DB (`recoveredJobId: "job-760-v1-1795055741348"`, `recoveredStatus: "succeeded"`, `recoveredVersionsCount: 1`, `recoveredResultVersionNo: 1`).
4. Regression test `PERF-05` trong [perf-freshness-sync.test.js](file:///c:/ToanTrungMar_Ready_20261105/ToanTrungMar_V2_Independent/apps/api/src/core/__tests__/perf-freshness-sync.test.js#L260-L390) xác nhận gửi trùng yêu cầu với cùng `idempotencyKey` trả về `idempotentReplay: true` và chỉ tạo đúng **1 phiên bản ảnh duy nhất** (không tính phí lặp). Dự án tạm `#760` đã được xóa sạch sau khi đo (`designCountRestoredAfterCleanup: 6`).

### 5.3. Kiểm chứng Phân quyền RBAC & Xóa Cache Nhạy cảm Khi Đăng xuất
- Đăng nhập song song bằng tài khoản `sales@toantrung.vn` (vai trò `SALES`):
  - Chỉ nhìn thấy **`10` Lead** thuộc phạm vi phụ trách (so với **`22` Lead** của `ADMIN`) nhờ khóa cache máy chủ tách biệt theo `userId + roleCode`.
  - Truy cập `/api/v1/ads?view=spec` bị chặn đúng quyền với **`HTTP 403`**.
- Khi bấm **Đăng xuất** trên trình duyệt:
  - Toàn bộ `10` khóa trạng thái `tt_route_state_v1:*` trong `sessionStorage` và bộ nhớ đệm `responseCache` trên client bị xóa sạch về **`0`** (`routeStateKeysBeforeLogout: 10` → `routeStateKeysAfterLogout: 0`), phiên chuyển hướng về `/login` và `/api/v1/auth/me` trả về **`HTTP 401`**.

---

## 6. Lịch Cập nhật Thực tế và Giới hạn Độ mới của Nguồn Bên ngoài

Hệ thống đã tách hoàn toàn việc **đọc dữ liệu nội bộ khi mở trang** khỏi việc **đồng bộ nguồn bên ngoài**. Dưới đây là chu kỳ làm mới nội bộ và giới hạn độ trễ thực tế của từng nguồn bên ngoài:

| Nguồn dữ liệu | Cơ chế & Chu kỳ làm mới nội bộ (V2) | Giới hạn độ mới thực tế từ nhà cung cấp bên ngoài | Có cập nhật theo từng phút được không? |
| :--- | :--- | :--- | :--- |
| **Dữ liệu Nội bộ CRM (Leads, Báo cáo, Bài viết SEO, Thiết kế AI, Thông báo)** | **Tức thì (`< 250 ms`)** ngay sau thao tác trên cùng trình duyệt qua `data-sync-bus` + `BroadcastChannel`; **15 giây/lần** giữa các máy trạm khác nhau qua `/api/v1/system/revisions` (tự tạm dừng khi tab ẩn). | Không phụ thuộc nguồn ngoài; ghi trực tiếp vào SQLite `WAL` (`independent_v2.db`). | **CÓ** (Cập nhật tức thì / theo giây). |
| **Worker Nội bộ (`instrumentation.ts` / `workers/index.ts`)** | Chạy độc lập với trình duyệt: <br>• `5 phút/lần`: Xuất bản bài viết SEO đến lịch (`runScheduledSeoPublishingJob`).<br>• `60 phút/lần`: Đối soát lại GCLID/gaClientId khuyết (`runGclidAttributionRetryJob`).<br>• `08:00 sáng hàng ngày (VN)`: Quét cảnh báo Lead quá hạn báo giá > 7 ngày (`runDailyOverdueQuoteReminderJob`). | Chạy trên tiến trình Node.js server; có khóa `activeWorkerRunLocks` (TTL 300s) chống chạy chồng. | **CÓ** (Theo lịch worker nội bộ). |
| **Gmail Lead Intake (`gmail-sync.service.ts`)** | Webhook Push (`/api/v1/leads/gmail-push`) hoặc worker/auto-poll có khóa cooldown **15 giây** chống gọi trùng khi nhiều Sales cùng mở `/leads`. | Phụ thuộc độ trễ chuyển thư của Gmail API & Google Cloud Pub/Sub (thường **5–30 giây** sau khi khách gửi form). | **CÓ** (Gần thời gian thực, cooldown 15s). |
| **Google Analytics 4 — Realtime (`runRealtimeReport`)** | Cache RAM trên server **60 giây** (`REALTIME_TTL_MS = 60_000`), singleflight không chặn tải trang; hiển thị ở ô riêng `"Đang hoạt động (cửa sổ 30 phút hiện tại)"`. | GA4 Realtime API chỉ cung cấp số người dùng hoạt động trong cửa sổ trượt **30 phút gần nhất**. | **CÓ** (Độ mới ~1 phút cho chỉ số Realtime 30 phút). |
| **Google Analytics 4 — Báo cáo Chuẩn (`runReport`: Sessions, Users, Channels, Landing Pages)** | Warmer nền chạy ngầm mỗi **4 phút** (`ensureM02M04BackgroundWarmerStarted`) + cache snapshot bền vững **10 phút** (`CACHE_TTL_MS`), không chặn request mở trang. | **Giới hạn của Google GA4:** Dữ liệu báo cáo chuẩn trong ngày (`TODAY`) của GA4 có độ trễ xử lý nội bộ (intraday processing lag) từ **4 – 24 giờ** (và có thể hiệu chỉnh lại trong 24–48 giờ). Do đó số liệu `Hôm nay` của GA4 luôn phải gắn trạng thái `PRELIMINARY` (*Số liệu trong ngày đang tạm tính*). | **KHÔNG** (Giới hạn kiến trúc của Google Analytics 4 đối với bảng phân rã lịch sử). |
| **Google Search Console (`searchAnalytics.query` & `urlInspection`)** | Đồng bộ nền theo lô qua worker D3 / warmer nền; URL Inspection được cache **6 giờ** trong DB để không vượt quota Google. | **Giới hạn của Google Search Console:** Dữ liệu lượt nhấp, hiển thị, CTR và thứ hạng từ khóa tự nhiên trên GSC luôn có độ trễ công bố từ **24 – 72 giờ** (2–3 ngày) tính từ ngày phát sinh tìm kiếm. Ngày `Hôm nay` và `Hôm qua` thường chưa được Google chốt sổ (`PRELIMINARY` / `NO_DATA`). | **KHÔNG** (Giới hạn toàn cầu của Google Search Console). |
| **Google Ads (`googleAds:searchStream`)** | Đồng bộ nền theo chu kỳ worker D3 hoặc nút đồng bộ chủ động của Admin/MKT; frontend đọc từ bảng `platform_daily_metrics` và `campaigns`. | **Giới hạn của Google Ads:** Chỉ số lượt nhấp/chi phí trong ngày của Google Ads có độ trễ từ **15 phút – 3 giờ** và Google có thể điều chỉnh lại sau khi lọc click không hợp lệ (invalid clicks) vào cuối ngày. Ngoài ra tài khoản cần `GOOGLE_ADS_DEVELOPER_TOKEN` đã duyệt Basic/Standard Access để kéo trực tiếp qua REST API. | **KHÔNG** (Cập nhật theo chu kỳ 15 phút – vài giờ của Google Ads). |
| **Google Trends (`03-keywords-ads`)** | Cache và lưu bảng `seo_keywords` / `platform_daily_metrics`; cập nhật khi chạy đồng bộ hoặc nhập CSV / SerpApi. | Google không cung cấp Official Public REST API miễn phí cho chỉ số Trends 0–100; hệ thống lấy tự động qua RSS/Suggest VN (chu kỳ vài giờ/ngày) hoặc qua khóa `SERPAPI_API_KEY` / file CSV. | **KHÔNG** (Dữ liệu xu hướng tính theo ngày/tuần). |
| **Nhà cung cấp Sinh ảnh AI (`Google Imagen/Gemini`, `OpenAI DALL·E`, `FLUX`, `Stability`, `Custom`)** | Danh mục Model Registry cache **6 giờ** trên đĩa + RAM (kiểm tra `mtimeMs + size`); tác vụ sinh ảnh trả `jobId` ngay (`HTTP 202`, `~67,5 ms`) và poll trạng thái dự án mỗi **2 giây**. | Thời gian mở trang `/design` đã tách rời hoàn toàn (`~42 ms` API / `< 250 ms` warm UI), nhưng thời gian thực tế để GPU của nhà cung cấp AI bên ngoài kết xuất 1 bức ảnh phụ thuộc vào từng model (thường **8 – 45 giây** đối với Cloud AI, hoặc **< 0,3 giây** với `Studio Engine` cục bộ). | **Tách biệt rõ:** Mở trang & nhận `jobId` dưới 100 ms; thời gian GPU sinh ảnh hiển thị theo bộ đếm giây thực tế. |

---

## 7. Trạng thái Kiểm tra và Các Hạng mục Bàn giao (`PASS / PARTIAL / BLOCKED / NOT_RUN`)

| Mã | Hạng mục yêu cầu | Trạng thái | Bằng chứng & Ghi chú chi tiết |
| :---: | :--- | :---: | :--- |
| **1** | Tìm đúng nguyên nhân chậm và hiện số cũ xuyên suốt Frontend → Router → Cache → API → DB → Worker | **PASS** | Đã xác định và ghi nhận đầy đủ nguyên nhân gốc cho cả 6 màn hình (`/dashboard`, M01–M05), SQLite `journal_mode`, `vault.ts` scrypt, client/server cache và GA4 cross-date fallback tại Mục 1. |
| **2** | Chuyển module nhanh ($\text{nav} \le 200\text{ ms}$, cache đúng phạm vi $\text{P95} \le 500\text{ ms}$), giữ shell ổn định, nạp động chart/modal, không rò rỉ timer qua $\ge 30$ lượt chuyển | **PASS** | Đo thực tế 30 lượt chuyển liên tiếp trên Chrome CDP: `navMs` **P50 = 34,9–118,6 ms, P95 = 52,7–198,8 ms** ($\le 200\text{ ms}$); `contentReadyMs` **P50 = 39,2–132,9 ms, P95 = 65,2–241,3 ms** ($\le 500\text{ ms}$); `activeIntervals` giữ nguyên `1 → 1` (`leakedIntervals = 0`); `0` lỗi console. |
| **3** | Sửa triệt để việc hiển thị nhầm dữ liệu cũ khi đổi website/thời gian, hủy response muộn, xử lý qua ngày mới, xóa cache khi đăng xuất, bảo vệ dữ liệu đang nhập | **PASS** | Đã kiểm chứng trên Chrome CDP (`trackingFilterCheck.zeroStaleFlash = true`, `reportsWebsiteSwitchCheck` đạt 100%, `logoutProof` xóa sạch `10 -> 0` route-state keys, `isDetailDirtyRef` / `isDirtyDraftRef` / `isParamFormDirtyRef` bảo vệ form đang nhập, `PERF-04` chặn cross-date fallback). |
| **4** | Đồng bộ cập nhật giữa Tổng quan và M01–M05 không bắt người dùng F5 | **PASS** | Đã kiểm chứng E2E tạo Lead `#1251` (`HTTP 201`) tự động tăng revision (`leads: 1→2`, `reports: 21→22`, `tracking: 28→29`), vô hiệu hóa cache và cập nhật số liệu `/leads`, `/dashboard`, `/reports` trong `209,4 ms` không cần F5. |
| **5** | Tối ưu đồng bộ nền độc lập trình duyệt & tối ưu Module 05 (`/design` mở nhanh, trả `jobId` sớm `HTTP 202`, khôi phục job khi chuyển trang, không dùng tiến độ giả, chống gửi trùng) | **PASS** | Worker chạy độc lập qua `instrumentation.ts`; `/design` First Load JS chỉ còn `89,1 kB`; `PATCH /api/v1/design/[id]` trả `HTTP 202` + `jobId` trong `67,5 ms`; chuyển sang `/dashboard` rồi quay lại khôi phục đúng `jobId` và phiên bản ảnh `v1`; regression test `PERF-05` xác nhận idempotency. |
| **6** | Kiểm tra `typecheck`, `test:core` (66 tests), `next build` production và giữ ứng dụng chạy ở dev/staging (`http://localhost:3000`) | **PASS** | `npm run db:generate` (0 lỗi), `npm run typecheck` (0 lỗi trên cả 4 workspace), `npm run test:core` (**66/66 PASS, 0 FAIL, 0 SKIP**), `npm --workspace @toantrung/web run build` (48/48 routes thành công), server đang chạy ổn định tại `http://localhost:3000`. |
| **7** | Đồng bộ trực tiếp Google Ads qua REST API theo từng phút và sinh ảnh thực tế từ mọi Cloud AI trả phí bên ngoài | **PARTIAL** *(Giới hạn nguồn ngoài)* | Hệ thống đã hỗ trợ đầy đủ luồng đồng bộ nền, lưu trữ, đối soát và job bất đồng bộ `HTTP 202`. Tuy nhiên độ mới theo từng phút của GA4 Standard / GSC / Google Ads bị giới hạn bởi chính kiến trúc trễ 4–72 giờ của Google (đã nêu rõ tại Mục 6), và các provider AI đám mây bên ngoài chưa gắn khóa trả phí/quota sẽ tự động báo trạng thái thực hoặc chuyển về `Studio Engine` cục bộ theo cấu hình. |
