# Tích hợp Thông tin Nguồn tại Điểm Gửi Form Website (`M01-03`)

Tài liệu này hướng dẫn bổ sung metadata nguồn tại các website (`bangled.vn`, `toantrung.com.vn`, `manhinhled.net.vn`) mà **không làm thay đổi giao diện form hiện tại**. Dữ liệu nguồn đi xuyên suốt từ form → email hoặc webhook → Lead trong CRM, độc lập hoàn toàn với hộp thư Gmail nhận thông báo.

## 1. Các trường cần thu thập tự động (Hidden Fields)

Khi khách hàng gửi form, script gắn thêm các trường ẩn sau:
- `source_website`: Tên miền website (ví dụ `bangled.vn`, `toantrung.com.vn`, `manhinhled.net.vn`)
- `landing_page_url`: URL đầy đủ của trang gửi yêu cầu (`window.location.href`)
- `form_id`: Mã form trên website (ví dụ `cf7-bangled-bao-gia`, `toantrung-bao-gia-lap-dat`)
- `submission_id`: Mã lần gửi duy nhất (UUID / timestamp + random) để chống xử lý trùng
- `submitted_at`: Thời điểm gửi chuẩn ISO-8601 (`new Date().toISOString()`)
- `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `referrer_url` (lấy từ URL / `sessionStorage` / `document.referrer`)

## 2. Script gắn vào Website (Giữ nguyên giao diện Form)

```html
<!-- Đặt trước thẻ </body> trên bangled.vn, toantrung.com.vn, manhinhled.net.vn -->
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid'];
  keys.forEach(function (k) {
    var v = params.get(k);
    if (v) sessionStorage.setItem('tt_' + k, v);
  });
  if (document.referrer && !sessionStorage.getItem('tt_referrer')) {
    sessionStorage.setItem('tt_referrer', document.referrer);
  }

  function fillHiddenFields(form) {
    var map = {
      source_website: window.location.hostname.replace(/^www\./, ''),
      landing_page_url: window.location.href,
      form_id: form.getAttribute('data-form-id') || form.id || 'web-quote-form',
      submission_id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      submitted_at: new Date().toISOString(),
      utm_source: sessionStorage.getItem('tt_utm_source') || '',
      utm_medium: sessionStorage.getItem('tt_utm_medium') || '',
      utm_campaign: sessionStorage.getItem('tt_utm_campaign') || '',
      gclid: sessionStorage.getItem('tt_gclid') || '',
      referrer_url: sessionStorage.getItem('tt_referrer') || ''
    };
    Object.keys(map).forEach(function (name) {
      var input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
      input.value = map[name];
    });
  }

  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      fillHiddenFields(form);
    });
  });
})();
</script>
```

## 3. Mẫu nội dung Email thông báo Form (Khi đi qua Gmail Auto-Sync)

Trong cấu hình mẫu email của từng plugin form (Contact Form 7 / WPForms / Form tùy chỉnh), chèn thêm block metadata ở cuối nội dung thư (CRM đọc Tầng 1 `metadata_url`):

```text
Website: [source_website]
Trang gửi: [landing_page_url]
Mã form: [form_id]
Mã gửi: [submission_id]
Thời điểm gửi: [submitted_at]
UTM Source: [utm_source]
UTM Medium: [utm_medium]
UTM Campaign: [utm_campaign]
GCLID: [gclid]
Referrer: [referrer_url]
```

## 4. Payload Webhook trực tiếp (`POST /api/v1/tracking/webhook`)

Header: `x-webhook-secret: <WEBHOOK_SECRET>`

```json
{
  "intakeSourceProvider": "WEBSITE_FORM",
  "intakeSourceAccountKey": "bangled.vn",
  "sourceWebsite": "bangled.vn",
  "externalSubmissionId": "sub_1794680000_ab12cd",
  "formId": "cf7-bangled-bao-gia",
  "submittedAt": "2026-11-15T01:55:00.000Z",
  "phone": "0945348464",
  "contactName": "Nguyễn Văn A",
  "installationAddress": "Bình Dương",
  "projectName": "Bảng LED P10",
  "tracking": {
    "landingPageUrl": "https://www.bangled.vn/bao-gia-bang-led-p10?utm_source=google&utm_medium=cpc",
    "utmSource": "google",
    "utmMedium": "cpc",
    "utmCampaign": "led-p10-2026",
    "gclid": "Cj0KCQiA...",
    "referrerUrl": "https://www.google.com/"
  }
}
```



## 5. Đoạn tích hợp cụ thể theo từng Website & Tình trạng quyền triển khai

| Website | Nền tảng / Form | Cấu hình gửi kèm | Tình trạng quyền triển khai |
| :--- | :--- | :--- | :--- |
| **`bangled.vn`** | WordPress / Contact Form 7 | `source_website=bangled.vn`, `form_id=cf7-bangled-bao-gia`, `submission_id`, `landing_page_url`, `submitted_at`, UTM/GCLID | **Cần quyền Admin WordPress / Hosting `bangled.vn`** (chưa có trong repo) |
| **`toantrung.com.vn`** | WordPress / Form báo giá lắp đặt | `source_website=toantrung.com.vn`, `form_id=toantrung-bao-gia-lap-dat`, `submission_id`, `landing_page_url`, `submitted_at`, UTM/GCLID | **Cần quyền Admin WordPress / Hosting `toantrung.com.vn`** (chưa có trong repo) |
| **`manhinhled.net.vn`** | WordPress / Form liên hệ | `source_website=manhinhled.net.vn`, `form_id=manhinhled-bao-gia`, `submission_id`, `landing_page_url`, `submitted_at`, UTM/GCLID | **Cần quyền Admin WordPress / Hosting `manhinhled.net.vn`** (chưa có trong repo) |

### 5.1. Đoạn gắn riêng cho `bangled.vn` (Contact Form 7)
```text
[hidden source_website default:"bangled.vn"]
[hidden form_id default:"cf7-bangled-bao-gia"]
[hidden landing_page_url class:tt-landing-url]
[hidden submission_id class:tt-submission-id]
[hidden submitted_at class:tt-submitted-at]
[hidden utm_source class:tt-utm-source]
[hidden utm_medium class:tt-utm-medium]
[hidden utm_campaign class:tt-utm-campaign]
[hidden gclid class:tt-gclid]
[hidden referrer_url class:tt-referrer-url]
```

### 5.2. Đoạn gắn riêng cho `toantrung.com.vn` (Form báo giá lắp đặt)
```text
[hidden source_website default:"toantrung.com.vn"]
[hidden form_id default:"toantrung-bao-gia-lap-dat"]
[hidden landing_page_url class:tt-landing-url]
[hidden submission_id class:tt-submission-id]
[hidden submitted_at class:tt-submitted-at]
[hidden utm_source class:tt-utm-source]
[hidden utm_medium class:tt-utm-medium]
[hidden utm_campaign class:tt-utm-campaign]
[hidden gclid class:tt-gclid]
[hidden referrer_url class:tt-referrer-url]
```
