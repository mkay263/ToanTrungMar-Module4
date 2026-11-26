# Handoff 04-reports — Báo cáo & Dashboard điều hành

Cập nhật: 06/11/2026.  
Nhóm 4 — Nguyễn Hoàng Minh Khôi.  
Nhánh Git: `feature/reports-dashboard`.  
Kho mã nguồn GitHub: `https://github.com/truongvanlong1905/ToanTrungMar` (nhánh `main`).

---

## 1. Hiện trạng & Nguồn nghiệp vụ chuẩn
- Đã tiếp nhận và phân tích toàn diện **Tài liệu đặc tả BA: UC04 (Xem Dashboard)** kèm Sơ đồ hoạt động, Sơ đồ tuần tự và BPMN As-is/To-be.
- Chi tiết đặc tả nghiệp vụ đầy đủ đã được ghi nhận tại [docs/modules/04-reports.md](../modules/04-reports.md).
- Mã nguồn hiện tại: Đã triển khai hoàn chỉnh (`apps/web/src/modules/04-reports/ReportsWorkspace.tsx`, `apps/api/src/modules/04-reports/service.ts`, `packages/contracts/src/04-reports/index.ts`), đồng bộ công thức L1/L2/L3 với M02, áp dụng bộ lọc thời gian (`7d`/`30d`/`custom`) trên toàn bộ nguồn dữ liệu, cảnh báo báo giá quá hạn >7 ngày và xuất Excel `.xlsx` / Google Sheets CSV.

---

## 2. Các nghiệp vụ trọng tâm đã chốt
1. **Dashboard Tổng quan cho Giám đốc (BOD)**:
   - Tổng Lead, phân bổ theo NVKD, trạng thái Pipeline (Vừa nhận, Đang soạn BG, Đã gửi BG, Chốt, Thất bại) và chỉ số tài chính.
   - Bộ lọc thời gian: 1 tuần, 30 ngày, tùy chọn khoảng thời gian.
   - Xuất dữ liệu: Hỗ trợ xuất ra **Excel (.xlsx)** hoặc **Google Sheets**.
2. **Dashboard chuyên biệt theo từng phân hệ**:
   - **Marketing & Ads**: Thống kê Lead theo nguồn/sản phẩm; chi phí Ads kết hợp số Lead thực tế từ Kinh doanh $\rightarrow$ chi phí/Lead (CPL); hiệu suất & tỷ lệ chốt Lead.
   - **Kinh doanh**: Hiệu suất và tỷ lệ chốt đơn của cá nhân NVKD; **danh sách khách hàng đã gửi báo giá nhưng chưa phản hồi** để bám sát.
   - **Thiết kế (Designer)**: Thống kê ấn phẩm hoàn thành theo loại (3D, Banner); thống kê thời gian và chi phí token AI.
3. **Bảo mật phạm vi dữ liệu & Database Contract**:
   - Tuân thủ ma trận phân quyền 8 vai trò; NVKD chỉ thấy số liệu cá nhân của mình, Giám đốc và Trưởng phòng xem toàn cảnh theo thẩm quyền (ẩn danh Lead cho Marketing/Ads theo [Q03](../decisions/OPEN_QUESTIONS.md#q03); chỉ số doanh thu/ROAS chờ chốt hiển thị tại [Q08](../decisions/OPEN_QUESTIONS.md#q08)).
   - Nhóm 4 là **Read-only consumer** trên các bảng chuẩn D1–D6 (`packages/database/prisma/models/04-reports.prisma` không tạo bảng riêng; bảng suy đoán `report_export_logs` đã được loại bỏ).

---

## 3. Nâng cấp MK01–MK07: Marketing Workbench & Đối chiếu hiệu quả (18/11/2026)
1. **Tiêu đề & Bố cục Desktop**:
   - Tiêu đề "Hiệu quả Marketing" kèm phạm vi website, khoảng ngày, so sánh kỳ trước và 1 trạng thái dữ liệu (freshness pill).
   - Lưới 6 KPI chuẩn (3 × 2): Chi phí quảng cáo, Lead tiếp nhận, Lead hợp lệ, CPL quảng cáo hợp lệ (mẫu số chỉ tính Lead quảng cáo hợp lệ đối soát), Chốt thành công, Tỷ lệ chốt.
   - Hàng biểu đồ 8/12 + 4/12: Diễn biến Lead tiếp nhận/hợp lệ theo ngày (phân biệt 0 vs null) và Cơ cấu kênh đem về Lead hợp lệ.
2. **Bảng Đối chiếu hiệu quả (Tablist accessible)**:
   - 3 tab: Website, Kênh, Chiến dịch với hỗ trợ WAI-ARIA tablist/arrow keys, phân loại rõ chiến dịch đa website `MULTI_WEBSITE_UNSPLIT` để không tính trùng chi phí vào 1 website lẻ.
3. **Nhận xét & Công việc đề xuất (Closed Loop)**:
   - Gắn kết trực tiếp với dữ liệu gốc, cho phép Marketing Lead tạo Brief thiết kế (`submit_marketing_brief`) gửi sang Studio Thiết kế AI theo đúng RBAC.
4. **Export đa định dạng đồng bộ**:
   - CSV, XLSX và DOCX cùng một scope số liệu, tuân thủ ẩn doanh thu theo Q08.



---

## 4. Nâng cấp Chuẩn Doanh Nghiệp Local — Enterprise Edition (24/11/2026)
- **Click-to-Audit Data Lineage xuyên suốt Dashboard & M04**: Tích hợp `KpiAuditLineageDrawer.tsx` + `/api/v1/reports/audit-lineage` vào `dashboard/page.tsx` và `ReportsWorkspace.tsx`, cho phép bấm trực tiếp vào từng thẻ KPI (`Lead tiếp nhận`, `Lead hợp lệ`, `Đang báo giá`, `Chốt thành công`, `Báo giá quá hạn`) để đối chiếu danh sách mã hồ sơ gốc theo đúng phân quyền 8 vai trò BA (ẩn danh SĐT/tên khách với `MKT_STAFF`/`ADS`, giới hạn Lead sở hữu với `SALES`, tuyệt đối chưa thêm doanh thu/giá bán khi Q08 mở).
- **Thanh Cảnh báo bất thường phễu (`FunnelAnomalyGuardStrip`) & Bảng điều hành ngân sách AI FinOps (`AiFinOpsControlPanel.tsx`)**: Hiển thị cảnh báo đứt gãy form/tỷ lệ spam/từ khóa tụt hạng và bảng theo dõi/khóa trần chi phí AI micro-USD ngày/tháng cho `BOD` (chỉ đọc) & `ADMIN` (cấu hình hạn mức).
- **Quản trị Doanh nghiệp tại `/settings?tab=governance`**: Bổ sung `EnterpriseGovernancePanel.tsx` + `/api/v1/admin/governance` gồm Nhật ký kiểm toán bất biến `Giá trị cũ → Giá trị mới`, Trạm chẩn đoán Local (DB ping, Vault AES-256-GCM, 5 worker, kết nối SSE) và Kiểm định toàn vẹn sao lưu SHA-256.
