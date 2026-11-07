# Danh sách công việc Backend — Module 4

**Người phụ trách:** Thành viên Backend  
**Phạm vi:** Dữ liệu, API, phân quyền và xuất báo cáo  
**Bảng chung:** [Theo dõi công việc Module 4](MODULE_4_TASKS.md) · **Frontend:** [Danh sách task Frontend](TASKS_FRONTEND.md)

Đánh dấu `[x]` khi hoàn tất; cập nhật trạng thái, nhánh, PR và phần đang chờ tại từng mục. Bảng chung là nơi theo dõi tiến độ của cả hai thành viên.

**Trạng thái:** Chưa làm / Đang làm / Đang chờ / Cần kiểm tra / Hoàn thành

## Tổng quan

| Thứ tự | Việc của bạn | Task chung | Mốc dự kiến | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Chốt nghiệp vụ, khảo sát dữ liệu và API cùng FE | 01–02 | Trước khi code | Chưa làm |
| 2 | Tổng hợp Lead và phân quyền | 04 | PR 1 | Chưa làm |
| 3 | Dữ liệu Marketing & Ads | 06 | PR 2 | Chưa làm |
| 4 | Dữ liệu Dashboard Design | 08 | PR 3 | Chưa làm |
| 5 | Xuất Excel và Google Sheets | 10 | PR 4 | Chưa làm |
| 6 | Kiểm thử tích hợp và bàn giao | 12 | Mỗi PR và cuối module | Chưa làm |

## 1. Chốt nghiệp vụ, khảo sát dữ liệu và API

**Trạng thái:** Chưa làm · **Phối hợp:** FE, BA và các nhóm nguồn

- [ ] Đọc UC04, các phần liên quan của UC01, UC03 và ma trận phân quyền; ghi lại các quy tắc dữ liệu và quyền.
- [ ] Xác nhận cách xác định khách chưa phản hồi, tính Lead hiệu quả và các điểm khác nhau giữa tài liệu.
- [ ] Khảo sát API, xác thực, phân quyền, cấu trúc dữ liệu và các chức năng hiện có; xác định phần có thể dùng lại.
- [ ] Trao đổi với nhóm 1, 2, 3 và 5 về dữ liệu, cơ chế cung cấp, lịch cập nhật và các phụ thuộc.
- [ ] Cùng FE thống nhất chỉ số, bộ lọc, API, dữ liệu mẫu, giá trị trống, lỗi và thời điểm cập nhật.
- [ ] Thống nhất ranh giới module và public entry/contract dùng chung; không tự ý thay đổi schema hoặc API chung.

**Hoàn thành khi:** FE có dữ liệu mẫu; BE có thỏa thuận API, định nghĩa chỉ số và đầu mối dữ liệu rõ ràng.  
**Nhánh / PR / ghi chú:** —

## 2. Tổng hợp Lead và phân quyền

**Trạng thái:** Chưa làm · **Task chung:** 04 · **Phối hợp:** FE task 05, Module 1

- [ ] Cung cấp dữ liệu theo kỳ, nguồn, sản phẩm, trạng thái, khu vực và nhân viên theo phạm vi đã thống nhất.
- [ ] Tính Lead thô L1, Lead hiệu quả L2 và tỷ lệ đã duyệt; cung cấp danh sách chi tiết tương ứng.
- [ ] Xử lý Lead chưa phân công, chuyển giao, nhiều sản phẩm và mẫu số bằng 0 theo đặc tả đã chốt.
- [ ] Cung cấp dữ liệu khách đã gửi báo giá nhưng chưa phản hồi theo quy tắc đã xác nhận với BA và nhóm 1.
- [ ] Kiểm tra quyền đối với chỉ số, danh sách và từng trường thông tin ngay tại backend.
- [ ] Đối chiếu kết quả với dữ liệu mẫu và cung cấp API để FE kết nối.

**Hoàn thành khi:** số tổng hợp khớp dữ liệu và danh sách chi tiết; người không đủ quyền không truy cập được dữ liệu.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 1 — Báo cáo Lead

- [ ] Task chung 01–05 sẵn sàng trong phạm vi PR; FE và BE đã kiểm tra tích hợp.
- [ ] Kiểm tra số liệu, bộ lọc, quyền, Lead chuyển giao và các trạng thái lỗi liên quan.
- [ ] Thống nhất nhánh đích, người review và phụ thuộc với trưởng dự án.
- [ ] Ghi đường dẫn PR và kết quả kiểm thử: —

Có thể đề xuất PR backend trước và PR frontend sau nếu nhóm chính muốn review riêng; ghi rõ quan hệ phụ thuộc.

## 3. Dữ liệu Marketing & Ads

**Trạng thái:** Chưa làm · **Task chung:** 06 · **Phối hợp:** FE task 07, Module 2–3

- [ ] Cung cấp Lead L1/L2 theo nguồn và chiến dịch, tách Lead lặp theo đặc tả.
- [ ] Cung cấp KPI Ads đã thống nhất, kèm nguồn dữ liệu và thời điểm cập nhật.
- [ ] Xử lý nguồn chưa xác định, dữ liệu chưa chốt, đồng bộ lỗi và mẫu số bằng 0.
- [ ] Đối chiếu với nhóm nguồn về cách liên kết Lead và chiến dịch, múi giờ và phạm vi quyền.
- [ ] Cung cấp API và dữ liệu mẫu cho FE; không nhầm chuyển đổi Ads với Lead CRM.

**Hoàn thành khi:** số liệu có nguồn xác định, đúng quy tắc và phản ánh trạng thái đồng bộ.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 2 — Marketing & Ads

- [ ] FE–BE đã kết nối và kiểm tra KPI, quyền, bộ lọc và trạng thái đồng bộ.
- [ ] Ghi rõ dữ liệu thử nghiệm hoặc tích hợp còn chờ; ghi đường dẫn PR: —

## 4. Dữ liệu Dashboard Design

**Trạng thái:** Chưa làm · **Task chung:** 08 · **Phối hợp:** FE task 09, Module 5

- [ ] Thống nhất với nhóm 5 dữ liệu ấn phẩm, thời gian, token, chi phí và thời điểm sẵn sàng.
- [ ] Cung cấp dữ liệu tổng hợp, chi tiết và trạng thái thiếu dữ liệu theo hợp đồng chung.
- [ ] Kiểm tra quyền Designer, Admin và Giám đốc theo xác nhận BA và ma trận quyền áp dụng.
- [ ] Cung cấp API hoặc dữ liệu mẫu đã thống nhất cho FE.

**Hoàn thành khi:** API được kiểm tra với dữ liệu mẫu và sẵn sàng tích hợp Module 5; giới hạn còn chờ được ghi rõ.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 3 — Dashboard Design

- [ ] Kiểm tra FE–BE, bộ lọc và quyền; nêu rõ dữ liệu thật hoặc tích hợp còn chờ.
- [ ] Ghi đường dẫn PR: —

## 5. Xuất Excel và Google Sheets

**Trạng thái:** Chưa làm · **Task chung:** 10 · **Phối hợp:** FE task 11

- [ ] Xuất Excel theo bộ lọc và quyền; ghi thời điểm dữ liệu trong báo cáo.
- [ ] Thống nhất tài khoản, quyền sở hữu và cách tạo Google Sheets; triển khai theo phương án tích hợp được duyệt.
- [ ] Xử lý dữ liệu trống và lỗi tạo file; cung cấp kết quả để FE hiển thị.
- [ ] Kiểm tra file xuất không chứa giá tiền báo giá trái yêu cầu BA hoặc dữ liệu ngoài quyền.
- [ ] Đối chiếu nội dung xuất với báo cáo và dữ liệu chi tiết cùng bộ lọc.

**Hoàn thành khi:** dữ liệu xuất khớp phạm vi được phép và người dùng nhận được file hoặc liên kết; phần chưa tích hợp được ghi rõ.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 4 — Xuất báo cáo

- [ ] Đã kiểm tra nội dung, bộ lọc và quyền; mô tả riêng tình trạng Excel và Google Sheets.
- [ ] Ghi đường dẫn PR: —

## 6. Kiểm thử và bàn giao

**Trạng thái:** Chưa làm · **Task chung:** 12 · **Phối hợp:** FE

- [ ] Kiểm tra quyền ở API, dữ liệu chi tiết và xuất với từng vai trò liên quan.
- [ ] Đối chiếu số tổng hợp, danh sách và dữ liệu xuất trên cùng dữ liệu thử nghiệm.
- [ ] Kiểm tra khoảng thời gian không hợp lệ, dữ liệu trống, mẫu số bằng 0 và nguồn đồng bộ lỗi.
- [ ] Kiểm tra Lead nhiều sản phẩm, chuyển Sales, không hợp lệ và trạng thái phản hồi chưa được xác nhận.
- [ ] Phối hợp FE ghi lỗi, sửa lỗi, chuẩn bị dữ liệu demo và cập nhật bảng chung.
- [ ] Ghi kết quả kiểm thử, phụ thuộc và giới hạn còn lại để bàn giao.

**Hoàn thành khi:** các luồng trong phạm vi bàn giao đã kiểm tra và phần còn lại được ghi rõ.  
**Nhánh / PR / ghi chú:** —

## Trước mỗi Pull Request

- [ ] Xem lại các file thay đổi; không đưa credential hoặc dữ liệu khách hàng thật vào Git.
- [ ] Kiểm thử phần việc trong PR và ghi kết quả thực tế.
- [ ] Đối chiếu thay đổi mới từ nhánh đích; tuân thủ kiểm tra phạm vi và review của dự án chính.
- [ ] Mô tả chức năng, cách kiểm thử, phần phụ thuộc và những gì còn chờ.

Task 12 là kiểm thử tổng thể; không cần chờ đến task 12 mới kiểm thử hoặc gửi từng PR.
