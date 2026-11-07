# Danh sách công việc Frontend — Module 4

**Người phụ trách:** Nhóm trưởng / Frontend  
**Phạm vi:** Dashboard và báo cáo trên web  
**Bảng chung:** [Theo dõi công việc Module 4](MODULE_4_TASKS.md)

Đánh dấu `[x]` khi hoàn tất; cập nhật trạng thái, nhánh, PR và phần đang chờ tại từng mục. Các task và mốc PR dưới đây liên kết với bảng chung; bảng chung là nơi theo dõi tiến độ của cả hai thành viên.

**Trạng thái:** Chưa làm / Đang làm / Đang chờ / Cần kiểm tra / Hoàn thành

## Tổng quan

| Thứ tự | Việc của bạn | Task chung | Mốc dự kiến | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Chốt nghiệp vụ và dữ liệu cùng BE | 01–02 | Trước khi code | Chưa làm |
| 2 | Khung Dashboard và bộ lọc | 03 | PR 1 | Chưa làm |
| 3 | Báo cáo Lead và Dashboard Kinh doanh | 05 | PR 1 | Chưa làm |
| 4 | Dashboard Marketing & Ads | 07 | PR 2 | Chưa làm |
| 5 | Dashboard Design | 09 | PR 3 | Chưa làm |
| 6 | Trang báo cáo và giao diện xuất | 11 | PR 4 | Chưa làm |
| 7 | Kiểm thử tích hợp và bàn giao | 12 | Mỗi PR và cuối module | Chưa làm |

## 1. Chốt nghiệp vụ và dữ liệu cùng Backend

**Trạng thái:** Chưa làm · **Phối hợp:** BE, BA và các nhóm nguồn

- [ ] Đọc UC04, phần liên quan của UC01, UC03 và ma trận phân quyền; xác định nội dung mỗi vai trò được xem.
- [ ] Xác nhận với BA cách xác định khách chưa phản hồi, quyền xem chi phí và các điểm còn khác nhau giữa tài liệu.
- [ ] Cùng BE thống nhất danh sách chỉ số, bộ lọc, dữ liệu trả về, trạng thái lỗi và thời điểm cập nhật.
- [ ] Khảo sát giao diện, cách đăng nhập và cấu trúc mã nguồn hiện có; ghi nhận phần có thể dùng lại.
- [ ] Cùng BE chuẩn bị dữ liệu mẫu và ghi lại những gì phải chờ Module 1, 2, 3 hoặc 5.

**Hoàn thành khi:** có danh sách màn hình, dữ liệu mẫu và thỏa thuận API đủ để FE–BE làm song song.  
**Nhánh / PR / ghi chú:** —

## 2. Xây dựng khung Dashboard và bộ lọc

**Trạng thái:** Chưa làm · **Task chung:** 03 · **Phụ thuộc:** mục 1

- [ ] Xây dựng khung Dashboard hiển thị nội dung phù hợp vai trò.
- [ ] Làm bộ lọc 1 tuần, 30 ngày và khoảng thời gian tùy chọn; kiểm tra ngày bắt đầu và kết thúc.
- [ ] Làm các thành phần cần dùng: thẻ số, biểu đồ, bảng và bộ lọc.
- [ ] Hiển thị trạng thái đang tải, không có dữ liệu, lỗi và không đủ quyền.
- [ ] Hiển thị thời điểm cập nhật hoặc cảnh báo nguồn chưa cập nhật khi API cung cấp.
- [ ] Kiểm tra chữ dễ đọc, không bị cắt và bố cục phù hợp màn hình.

**Hoàn thành khi:** giao diện chạy được bằng dữ liệu mẫu và dùng được cấu trúc API đã thỏa thuận.  
**Nhánh / PR / ghi chú:** —

## 3. Báo cáo Lead và Dashboard Kinh doanh

**Trạng thái:** Chưa làm · **Task chung:** 05 · **Phối hợp:** BE task 04

- [ ] Làm bảng tổng hợp Lead theo nhân viên: tổng Lead, trạng thái và tỷ lệ chốt theo định nghĩa được duyệt.
- [ ] Làm danh sách Lead chi tiết theo quyền; kết nối bộ lọc và phân trang khi cần.
- [ ] Hiển thị danh sách khách đã gửi báo giá nhưng chưa phản hồi theo dữ liệu và quy tắc được thống nhất.
- [ ] Kết nối API BE; đối chiếu số tổng hợp với danh sách chi tiết.
- [ ] Không hiển thị giá tiền báo giá; trang báo cáo có thể đọc toàn trang.

**Hoàn thành khi:** lọc, xem tổng hợp và xem chi tiết hoạt động đúng với API và quyền.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 1 — Báo cáo Lead

- [ ] Task chung 01–05 đã sẵn sàng trong phạm vi PR; FE và BE đã kiểm tra tích hợp.
- [ ] Đã kiểm tra bộ lọc, số liệu, danh sách chi tiết, quyền và các trạng thái lỗi.
- [ ] Đã thống nhất nhánh đích, người review và các phụ thuộc với trưởng dự án.
- [ ] Ghi đường dẫn PR và kết quả kiểm thử: —

Có thể đề xuất PR backend trước và PR frontend sau nếu nhóm chính muốn review riêng; ghi rõ quan hệ phụ thuộc.

## 4. Dashboard Marketing & Ads

**Trạng thái:** Chưa làm · **Task chung:** 07 · **Phối hợp:** BE task 06; Module 2–3

- [ ] Hiển thị Lead theo nguồn, chiến dịch và sản phẩm; KPI Ads theo dữ liệu và quyền đã thống nhất.
- [ ] Hiển thị nguồn chưa xác định, số liệu chưa chốt và cảnh báo đồng bộ khi API trả về.
- [ ] Kết nối bộ lọc và danh sách chi tiết theo quyền.
- [ ] Đối chiếu số liệu, tên chỉ số và đơn vị với BE.

**Hoàn thành khi:** bảng và biểu đồ khớp API khi đổi bộ lọc; dữ liệu mẫu hoặc nguồn còn chờ được ghi rõ.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 2 — Marketing & Ads

- [ ] FE–BE đã kết nối và kiểm tra KPI, quyền, bộ lọc và trạng thái đồng bộ.
- [ ] Ghi rõ dữ liệu hoặc tích hợp còn chờ; ghi đường dẫn PR: —

## 5. Dashboard Design

**Trạng thái:** Chưa làm · **Task chung:** 09 · **Phối hợp:** BE task 08; Module 5

- [ ] Thống nhất với BE dữ liệu, quyền và trạng thái chờ từ Module 5.
- [ ] Hiển thị ấn phẩm theo loại, thời gian và token/chi phí theo quyền được xác nhận.
- [ ] Kết nối bộ lọc, API và các trạng thái chưa có dữ liệu hoặc lỗi.

**Hoàn thành khi:** Dashboard phản ánh đúng dữ liệu API và phạm vi quyền; phần còn chờ Module 5 được ghi rõ.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 3 — Dashboard Design

- [ ] Kiểm tra FE–BE, bộ lọc và quyền; nêu rõ dữ liệu thật hoặc tích hợp còn chờ.
- [ ] Ghi đường dẫn PR: —

## 6. Trang báo cáo và giao diện xuất

**Trạng thái:** Chưa làm · **Task chung:** 11 · **Phối hợp:** BE task 10

- [ ] Xây dựng trang đọc báo cáo toàn trang và dễ cuộn.
- [ ] Làm nút xuất Excel và Google Sheets theo quyền và khả năng tích hợp.
- [ ] Giữ bộ lọc khi gửi yêu cầu xuất; hiển thị đang xử lý, thành công và lỗi.
- [ ] Kiểm tra file hoặc liên kết nhận được phản ánh đúng bộ lọc đang chọn.

**Hoàn thành khi:** giao diện kết nối được chức năng xuất mà backend đã hỗ trợ; phần Google Sheets còn chờ được ghi rõ nếu chưa tích hợp.  
**Nhánh / PR / ghi chú:** —

### Mốc PR 4 — Xuất báo cáo

- [ ] Đã kiểm tra kết quả xuất và quyền; mô tả riêng tình trạng Excel và Google Sheets.
- [ ] Ghi đường dẫn PR: —

## 7. Kiểm thử và bàn giao

**Trạng thái:** Chưa làm · **Task chung:** 12 · **Phối hợp:** BE

- [ ] Kiểm tra từng vai trò, màn hình, bộ lọc, trạng thái tải/trống/lỗi và việc xem chi tiết.
- [ ] Đối chiếu Dashboard, danh sách và file xuất trên cùng dữ liệu và khoảng thời gian.
- [ ] Kiểm tra dữ liệu trống, mẫu số bằng 0, lỗi đồng bộ và xuất thất bại.
- [ ] Phối hợp BE ghi lỗi, sửa lỗi và chuẩn bị dữ liệu demo.
- [ ] Cập nhật bảng chung, liên kết PR, kết quả kiểm thử và các phần còn chờ.

**Hoàn thành khi:** các luồng trong phạm vi bàn giao được kiểm tra và các giới hạn còn lại được ghi rõ.  
**Nhánh / PR / ghi chú:** —

## Trước mỗi Pull Request

- [ ] Xem lại các file thay đổi; không đưa mật khẩu hoặc dữ liệu khách hàng thật vào Git.
- [ ] Kiểm thử phần việc trong PR và ghi kết quả thực tế.
- [ ] Đối chiếu thay đổi mới từ nhánh đích; tuân thủ kiểm tra phạm vi và review của dự án chính.
- [ ] Mô tả chức năng, cách kiểm thử, phần phụ thuộc và những gì còn chờ.

Task 12 là kiểm thử tổng thể; không cần chờ đến task 12 mới kiểm thử hoặc gửi từng PR.
