# BÁO CÁO ĐẶC TẢ NGUỒN DỮ LIỆU & KẾT QUẢ ĐỒNG BỘ THỰC TẾ — MODULE 2 & MODULE 3 (HỆ THỐNG TOÀN TRUNG CRM V2)

- **Đơn vị sử dụng**: Ban Giám đốc, Phòng Marketing, Bộ phận Quảng cáo (Ads) & Nội dung (SEO) — Công ty Cổ phần Điện tử Viễn thông Toàn Trung
- **Thời điểm trích xuất số liệu thực tế**: Ngày `19/11/2026` (Múi giờ `Asia/Ho_Chi_Minh`, kỳ đối chiếu 30 ngày gần nhất `21/10/2026 → 19/11/2026`)
- **Cơ chế kết nối**: Kết nối trực tiếp qua **Google OAuth 2.0** chính thức (`analytics.readonly`, `adwords`, `webmasters.readonly`, `gmail.readonly`), kết hợp cơ sở dữ liệu CRM nội bộ (`leads`, `marketing_tracking`, `platform_daily_metrics`, `seo_articles`). Tuyệt đối **không dùng số liệu giả lập (mock/demo)** khi đã kết nối.

---

## I. TỔNG QUAN HỆ SINH THÁI WEBSITE & TÀI KHOẢN ĐANG ĐỒNG BỘ

Hệ thống Toàn Trung V2 đang quản lý tập trung **04 website thương hiệu** và đối soát chéo giữa **4 nguồn dữ liệu độc lập**:

| STT | Tên chuyên trang | Tên miền (`websiteId`) | Mã GA4 Property | Google Search Console (`siteUrl`) | Tài khoản Google Ads |
| :-: | :--- | :--- | :---: | :--- | :---: |
| 1 | **Website Toàn Trung** | `toantrung.com.vn` | `512879968` | `https://toantrung.com.vn/` | `104-971-1191` |
| 2 | **Chuyên trang Màn hình LED** | `manhinhled.net.vn` | `509190194` | `https://manhinhled.net.vn/` | `104-971-1191` |
| 3 | **Chuyên trang Bảng LED** | `bangled.vn` | `538179128` | `https://bangled.vn/` | `104-971-1191` |
| 4 | **Chuyên trang Bảng điện tử** | `bangdientu.com.vn` | `508951192` | *(Chưa khai báo property GSC riêng)* | `104-971-1191` |

---

## II. MODULE 2 — CHIẾN DỊCH (`/tracking`): NHỮNG DỮ LIỆU ĐANG KÉO & CƠ CHẾ ĐỐI SOÁT

Module 2 trả lời câu hỏi quản trị: ***"Traffic và quảng cáo nào đang có hiệu quả? Kênh nào đem về khách hàng thực tế trong CRM?"***

### 1. Nguồn 1 — Google Analytics 4 Data API (`v1beta/properties/{propertyId}:batchRunReports` & `runRealtimeReport`)

Hệ thống kéo trực tiếp **7 nhóm báo cáo GA4** cho từng website và tổng hợp toàn hệ thống:

| Nhóm dữ liệu GA4 | Trường gốc từ Google API (Dimensions & Metrics) | Ý nghĩa hiển thị trên hệ thống Toàn Trung V2 |
| :--- | :--- | :--- |
| **1. Tổng quan kỳ (Period Totals)** | `totalUsers`, `newUsers`, `activeUsers`, `sessions`, `screenPageViews`, `engagedSessions`, `engagementRate`, `userEngagementDuration` | • **Người dùng** & **Người dùng mới** (khử trùng lặp đúng theo kỳ chọn)<br>• **Phiên truy cập** & **Phiên có tương tác**<br>• **Lượt xem trang**<br>• **Tỷ lệ tương tác (%)**<br>• **Thời gian tương tác trung bình / người dùng hoạt động (giây)** |
| **2. Diễn biến theo ngày (Daily Time-Series)** | Dimension: `date`<br>Metrics: `sessions`, `screenPageViews`, `totalUsers` | Biểu đồ xu hướng Phiên truy cập, Lượt xem trang và Chiếu sâu đọc nội dung (*Trang/Phiên*) từng ngày; so sánh tăng/giảm `%` với kỳ trước có cùng độ dài. |
| **3. Cơ cấu Kênh Marketing** | Dimension: `sessionDefaultChannelGroup`<br>Metrics: `sessions`, `engagedSessions`, `engagementRate` | Chuẩn hóa về 6 nhóm kênh tiếng Việt: **Tìm kiếm tự nhiên (Organic Search)**, **Google Ads (Paid Search/Display/Cross-network)**, **Truy cập trực tiếp (Direct)**, **Website giới thiệu (Referral)**, **Mạng xã hội (Social)**, **Chưa xác định**. |
| **4. Trang đích (Landing Pages)** | Dimension: `landingPagePlusQueryString`<br>Metrics: `sessions`, `engagedSessions`, `engagementRate`, `conversions` | Xếp hạng trang thu hút truy cập thực tế, tỷ lệ tương tác từng trang và số sự kiện gửi biểu mẫu tại trang đó. |
| **5. Sự kiện hành vi (Events)** | Dimension: `eventName`<br>Metrics: `eventCount`, `totalUsers` | Bóc tách riêng sự kiện gửi form (`form_submit`, `generate_lead`, `contact_form_submit`), bấm gọi điện (`tel_click`, `phone_click`) và bấm Zalo (`zalo_click`). |
| **6. Thiết bị & Địa lý** | Dimensions: `deviceCategory`, `country`, `region`, `city`<br>Metrics: `sessions` | Phân bổ lưu lượng theo Desktop / Mobile / Tablet và Tỉnh/Thành phố. |
| **7. Thời gian thực (Realtime 30 phút)** | Endpoint: `:runRealtimeReport`<br>Dimension: `minutesAgo`, Metric: `activeUsers` | Hiển thị số người đang online trên website trong cửa sổ 30 phút hiện tại (tách biệt hoàn toàn khỏi bộ lọc lịch sử). |

#### Số liệu GA4 thực tế đang ghi nhận (30 ngày gần nhất: `21/10/2026 → 19/11/2026`):

| Phạm vi Website | Người dùng | Người dùng mới | Phiên truy cập | Phiên tương tác | Lượt xem trang | Tỷ lệ tương tác | TG tương tác TB |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Toàn hệ thống (4 web)** | **2.141** | **2.022** | **3.398** | **2.169** | **8.341** | **63,83%** | **56,4 giây** |
| `manhinhled.net.vn` | 1.001 | 945 | 1.452 | 996 | 3.245 | 68,60% | 47,9 giây |
| `toantrung.com.vn` | 818 | 775 | 1.294 | 826 | 3.177 | 63,83% | 62,0 giây |
| `bangled.vn` | 322 | 302 | 652 | 347 | 1.919 | 53,22% | 68,5 giây |
| `bangdientu.com.vn` | 0 | 0 | 0 | 0 | 0 | — | — |

#### Cơ cấu Kênh Marketing toàn hệ thống (30 ngày gần nhất):
1. **Tìm kiếm tự nhiên (Organic Search)**: `1.373` phiên (`988` phiên tương tác — tỷ lệ tương tác **71,96%**)
2. **Truy cập trực tiếp (Direct)**: `752` phiên (`340` phiên tương tác — tỷ lệ tương tác **45,21%**)
3. **Google Ads (Paid Search / CPC)**: `739` phiên (`468` phiên tương tác — tỷ lệ tương tác **63,33%**)
4. **Website giới thiệu (Referral)**: `370` phiên (`279` phiên tương tác — tỷ lệ tương tác **75,41%**)
5. **Mạng xã hội (Social)**: `119` phiên (`74` phiên tương tác — tỷ lệ tương tác **62,18%**)

---

### 2. Nguồn 2 — Google Ads API (`googleAds:searchStream`, Customer ID `104-971-1191`)

Hệ thống truy vấn trực tiếp qua GAQL (Google Ads Query Language) ở 4 cấp độ (`campaign`, `ad_group`, `keyword_view`, và `landing_page_view` / `final_urls`):

- **Trường dữ liệu kéo về**:
  - Định danh & trạng thái: `campaign.id`, `campaign.name`, `campaign.status` (`ENABLED` / `PAUSED`), `campaign.advertising_channel_type`.
  - Chi phí & hiệu suất: `metrics.cost_micros` (quy đổi chuẩn `cost_micros / 1.000.000` sang **VND**), `metrics.impressions`, `metrics.clicks`, `metrics.ctr`, `metrics.average_cpc`, `metrics.conversions` (giữ nguyên phần thập phân Data-Driven Attribution), `metrics.cost_per_conversion`.
  - URL đích để phân bổ website (`classifyCampaignWebsiteAttribution`): Đọc `ad_group_ad.ad.final_urls` và tên chiến dịch để phân loại chính xác chiến dịch thuộc website nào; nếu 1 chiến dịch chạy chung cho nhiều domain của công ty thì gắn nhãn **`MULTI_WEBSITE_UNSPLIT` (Chiến dịch đa website)** — **tuyệt đối không tự ý gán 100% chi phí vào 1 website lẻ hoặc chia đều giả tạo**.

#### Số liệu Google Ads thực tế đang ghi nhận (30 ngày gần nhất — Tài khoản `104-971-1191`):
- **Tổng chi phí quảng cáo thực tế**: **`42.496.630 ₫`**
- **Tổng lượt hiển thị (Impressions)**: **`9.496` lượt**
- **Tổng lượt nhấp (Clicks)**: **`750` click** (**CTR trung bình**: **`7,90%`**, **CPC trung bình**: **`56.662 ₫/click`**)
- **Chuyển đổi ghi nhận trên nền tảng Google Ads**: **`39` chuyển đổi** (**Chi phí / chuyển đổi Ads**: **`1.089.657 ₫`**)

| Top chiến dịch tiêu biểu | Trạng thái | Chi phí thực tế (VND) | Hiển thị | Click | CTR | CPC TB | Chuyển đổi Ads |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `LED_CPC_TT` | Đang chạy | 9.291.040 ₫ | 2.555 | 164 | 6,42% | 56.653 ₫ | 2 |
| `LED_CPC_New` | Tạm dừng | 8.516.371 ₫ | 944 | 95 | 10,06% | 89.646 ₫ | 9 |
| `LED_Exact_Time` | Tạm dừng | 5.723.799 ₫ | 1.860 | 116 | 6,24% | 49.343 ₫ | 6 |
| `LED_Indoor_TT` | Đang chạy | 4.704.470 ₫ | 1.106 | 85 | 7,69% | 55.347 ₫ | 7 |
| `LED_Indoor` | Tạm dừng | 4.692.911 ₫ | 683 | 58 | 8,49% | 80.912 ₫ | 8 |
| `Led_Outdoor_TT` | Đang chạy | 2.823.101 ₫ | 679 | 61 | 8,98% | 46.280 ₫ | 0 |
| `LED_Tỉnh` | Tạm dừng | 1.813.231 ₫ | 404 | 49 | 12,13% | 37.005 ₫ | 3 |
| `Led_Outdoor_20/8` | Tạm dừng | 1.732.597 ₫ | 491 | 39 | 7,94% | 44.426 ₫ | 3 |
| `Led_Điện Tử - Mobile` | Đang chạy | 1.550.715 ₫ | 356 | 41 | 11,52% | 37.822 ₫ | 0 |
| `Led_Điện Tử - Desk` | Đang chạy | 1.055.258 ₫ | 238 | 28 | 11,76% | 37.688 ₫ | 1 |

---

### 3. Nguồn 3 — Đối soát 3 tầng giữa Tracking Website, Google Ads và Hồ sơ Lead CRM (Module 1)

Điểm cốt lõi của Module 2 là **không đánh đồng "Sự kiện gửi form trên web" hoặc "Chuyển đổi báo trên Google Ads" với "Khách hàng thật trong CRM"**:
1. **Sự kiện gửi biểu mẫu (Tracking GA4 / Webhook)**: Ghi nhận `11` sự kiện `form_submit` (từ `7` người dùng).
2. **Chuyển đổi nền tảng quảng cáo (Google Ads Conversions)**: Ghi nhận `39` lượt chuyển đổi trên Google Ads (bao gồm cả các tương tác vi mô do tài khoản Ads cài đặt).
3. **Lead CRM hợp lệ (L2 — Đã lọc spam) & Lead quảng cáo đối soát**:
   - Ghi nhận **`10` Lead biểu mẫu website hợp lệ (L2)** trong CRM.
   - Chỉ những hồ sơ Lead L2 có **bằng chứng quảng cáo xác thực** (`GCLID`, `utm_medium=cpc/paid`, `utm_campaign` khớp chiến dịch hoặc Google Lead Form) mới được tính vào mẫu số **CPL thực tế (Chi phí / Lead quảng cáo hợp lệ)**.

---

## III. MODULE 3 — TỪ KHÓA & SEO (`/ads`): NHỮNG DỮ LIỆU ĐANG KÉO & LUỒNG NỘI DUNG AI

Module 3 trả lời câu hỏi quản trị: ***"Trang đích và từ khóa tự nhiên nào cần cải thiện? Nhu cầu tìm kiếm thị trường đang tăng ở đâu để lên bài viết và thiết kế?"***

### 1. Nguồn 1 — Google Search Console Search Analytics API (`webmasters/v3/sites/{siteUrl}/searchAnalytics/query`)

Hệ thống kéo trực tiếp dữ liệu tìm kiếm tự nhiên từ Google Search Console cho `toantrung.com.vn`, `manhinhled.net.vn`, và `bangled.vn` theo **2 kỳ song song** (Kỳ hiện tại và Kỳ trước có cùng số ngày để tính chênh lệch thực tế):

| Loại truy vấn GSC | Dimensions kéo về | Metrics kéo về & Tính toán | Quy tắc chuẩn xác số liệu |
| :--- | :--- | :--- | :--- |
| **1. Cấp Tổngサイト (Site-level Totals)** | `date` | `clicks`, `impressions`, `ctr`, `position` | Tính tổng Click, tổng Hiển thị, CTR tổng và Vị trí trung bình có trọng số theo Hiển thị. **Không cộng dồn bảng top từ khóa làm tổng site** (tránh mất dữ liệu của các từ khóa đuôi dài / ẩn danh). |
| **2. Cấp Từ khóa (Search Queries)** | `query` | `clicks`, `impressions`, `ctr`, `position` + đối chiếu kỳ trước (`previousClicks`, `clickChange`, `ctrChangePctPt`, `positionImprovement`) | Xếp hạng từ khóa mang lại click cao nhất và tự động phát hiện **Ứng viên tối ưu tiêu đề** (từ khóa có Hiển thị cao $\ge 30$ nhưng CTR thấp $\le 3\%$). |
| **3. Cấp Trang đích (Landing Pages)** | `page` | `clicks`, `impressions`, `ctr`, `position` + so sánh kỳ trước | Xác định bài viết/trang sản phẩm nào đang lên hạng hoặc tụt click tự nhiên. |
| **4. Thiết bị & Quốc gia** | `device`, `country` | `clicks`, `impressions`, `ctr`, `position` | Phân tách hiệu suất tìm kiếm trên Mobile / Desktop / Tablet. |

#### Số liệu Google Search Console thực tế đang ghi nhận (30 ngày gần nhất):
- **Tổng lượt nhấp tìm kiếm tự nhiên (Organic Clicks)**: **`649` click**
- **Tổng lượt hiển thị tìm kiếm (Organic Impressions)**: **`29.601` lượt hiển thị**
- **Tỷ lệ nhấp tự nhiên trung bình (Organic CTR)**: **`2,19%`**
- **Vị trí trung bình trên Google (Average Position)**: **Hạng `8,38`**
- **Phiên truy cập tự nhiên đối chiếu từ GA4 (Organic Sessions)**: **`1.373` phiên** (Tỷ lệ tương tác đạt **`71,96%`**)

#### Top 10 Từ khóa tìm kiếm tự nhiên thực tế (30 ngày gần nhất):

| Hạng | Từ khóa tìm kiếm (`query`) | Click | Hiển thị | CTR | Vị trí TB | Thay đổi Click vs kỳ trước | Nhận định hành động |
| :-: | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | `led toàn trung` | **66** | 245 | 26,94% | 3,49 | +64 (+3.200%) | Từ khóa thương hiệu chủ lực |
| 2 | `tiệm vàng mai vân tỷ giá` | **18** | 112 | 16,07% | 5,05 | +18 (Mới) | Case study bảng giá vàng hút traffic |
| 3 | `màn hình livestream` | **17** | 176 | 9,66% | 5,23 | +17 (Mới) | Nhu cầu mới tăng nhanh |
| 4 | `công ty cổ phần điện tử viễn thông toàn trung` | **17** | 138 | 12,32% | 3,23 | +14 (+466,7%) | Từ khóa thương hiệu |
| 5 | `màn hình led phòng họp` | **14** | 1.144 | **1,22%** | **4,01** | +13 (+1.300%) | **Cơ hội vàng**: Đã ở Top 4 với 1.144 hiển thị nhưng CTR mới 1,22% $\rightarrow$ Cần tối ưu Title/Meta & Banner |
| 6 | `tiệm vàng kim hùng quận 5` | **14** | 120 | 11,67% | 5,07 | +12 (+600%) | Case study bảng điện tử tiệm vàng |
| 7 | `màn hình led indoor` | **14** | 75 | 18,67% | 10,99 | +14 (Mới) | Sát trang 1 (hạng 10,9) $\rightarrow$ Đẩy internal link lên Top 5 |
| 8 | `màn hình led` | **13** | 640 | 2,03% | 28,30 | +12 (+1.200%) | Từ khóa ngành rộng, cần cụm bài trụ cột |
| 9 | `màn hình led trong nhà` | **13** | 508 | 2,56% | 18,68 | +11 (+550%) | Đang ở trang 2, cần bổ sung bảng báo giá & thông số P2/P2.5 |
| 10 | `thi công màn hình led` | **10** | 1.357 | **0,74%** | **6,68** | +8 (+400%) | **Cơ hội vàng**: Hạng 6,68 với 1.357 hiển thị nhưng CTR 0,74% $\rightarrow$ Cần viết lại Title kèm cam kết bảo hành 36T |

#### Top Trang đích SEO có lượng Click tự nhiên cao nhất:
1. Trang chủ `/` (`136` click · `630` hiển thị · CTR `21,59%` · Vị trí `3,93`)
2. `/bang-dien-tu-gia-vang-dntn-mai-van-Q1.html` (`19` click · `460` hiển thị · CTR `4,13%` · Vị trí `6,79`)
3. `/bang-led-thi-dau-the-thao` (`19` click · `240` hiển thị · CTR `7,92%` · Vị trí `4,46`)
4. `/bao-gia-man-hinh-led-p2-trong-nha.html` (`18` click · `224` hiển thị · CTR `8,04%` · Vị trí `5,97`)
5. `/don-vi-lap-dat-man-hinh-led-ngoai-troi-uy-tin-chuyen-nghiep-tai-ho-chi-minh/` (`17` click · `937` hiển thị · CTR `1,81%` · Vị trí `3,89`)
6. `/hien-tuong-gon-song-soc-van-khi-quay-chup-man-hinh-led-nguyen-nhan-va-cach-khac-phuc` (`16` click · `409` hiển thị · CTR `3,91%` · Vị trí `5,43`)

---

### 2. Nguồn 2 — Google Search Console URL Inspection API (`searchconsole.googleapis.com/v1/urlInspection/index:inspect`)

- Kiểm tra trực tiếp tình trạng lập chỉ mục (Index) thực tế trên Google cho từng URL trọng điểm của công ty:
  - **Trường kéo về**: `verdict` (*Hợp lệ / Đã lập chỉ mục*), `coverageState` (*Đã được gửi và lập chỉ mục*), `lastCrawlTime` (thời điểm Googlebot thu thập gần nhất), `googleCanonical`, `userCanonical`, `issuesToReview`.
  - **Kết quả kiểm tra thực tế**: Toàn bộ `7/7` URL tiêu biểu trên `toantrung.com.vn`, `manhinhled.net.vn`, `bangled.vn` đều đạt trạng thái **`Hợp lệ (Đã lập chỉ mục)`**, lần crawl gần nhất ngày `16–18/11/2026`, không có lỗi chặn thu thập dữ liệu.

---

### 3. Nguồn 3 — Google Trends Việt Nam & Google Suggest Ngành LED (`GET /api/v1/ads/trends`)

Hệ thống kết hợp 2 luồng dữ liệu xu hướng thực tế tại thị trường Việt Nam (`geo=VN`, `hl=vi`):
1. **Google Trends Daily RSS Việt Nam (`trends.google.com/trending/rss?geo=VN`)**:
   - Cập nhật các chủ đề đang bùng nổ tìm kiếm trong ngày tại Việt Nam kèm lưu lượng ước tính (`approxTrafficLabel`) và nguồn báo chí chính thống.
2. **Google Autocomplete / Suggest chuyên ngành Màn hình LED & Bảng điện tử**:
   - Tự động quét theo 4 cụm hạt giống cốt lõi của Toàn Trung (`màn hình led`, `bảng điện tử led`, `màn hình led hội trường`, `màn hình led ngoài trời`), thu về **32 cụm từ khóa ngách thực tế người mua đang gõ tìm kiếm** (ví dụ: *màn hình led hội trường p2.5*, *màn hình led ngoài trời bao nhiêu tiền m2*, *giá bảng điện tử led chạy chữ*, *sửa chữa bảng điện tử led*).

---

### 4. Nguồn 4 — Báo cáo Phân tích SEO bằng AI (`LIVE_AI`) & Quy trình Bài viết (`seo_articles`)

1. **Báo cáo SEO AI có căn cứ số liệu (`SeoAiReportPanel`)**:
   - **Backend tính toán số liệu chuẩn trước**: Đóng gói toàn bộ snapshot số liệu thật của kỳ hiện tại và kỳ trước (`649` clicks, `29.601` impressions, top từ khóa, top trang đích, số Lead từ website).
   - **Mô hình AI (`gemini-3-flash-preview`) phân tích trên snapshot thật**: Chỉ ra bằng chứng số liệu cụ thể, phân biệt rõ giữa *Bằng chứng thực tế* và *Giả thuyết cần kiểm chứng*, đồng thời đề xuất danh sách chủ đề bài viết ưu tiên theo 3 nhóm:
     * `HIGH_IMPRESSION_LOW_CTR`: Từ khóa hiển thị cao nhưng CTR thấp (như *màn hình led phòng họp*, *thi công màn hình led*).
     * `STRIKE_DISTANCE_POS_4_15`: Từ khóa đang ở hạng 4–15 có thể đẩy nhanh lên Top 3.
     * `RISING_DEMAND_LEAD_FIT`: Từ khóa gắn với dòng sản phẩm đang tạo ra Lead cho Kinh doanh.
2. **Khép kín từ Số liệu $\rightarrow$ Bài viết SEO $\rightarrow$ Brief Thiết kế AI**:
   - Từ mỗi từ khóa hoặc đề xuất của AI, nhân sự Marketing bấm **"Đưa vào nội dung"** để tạo ngay hồ sơ bài viết trong bảng `seo_articles` (lưu rõ lịch sử phiên bản `SeoArticleRevision`, website đích, từ khóa mục tiêu, người phụ trách và trạng thái duyệt đăng).
   - Hoặc bấm **"Tạo brief minh họa"** / **"Tạo brief"** để gửi ngay yêu cầu thiết kế banner/ảnh bài viết sang **Module 5 — Thiết kế AI** kèm theo snapshot số liệu gốc để đối chiếu hiệu quả trước và sau khi triển khai.
