# Theo dõi công việc Module 4

Repository dự án: https://github.com/truongvanlong1905/ToanTrungMar

Phân công: **FE** — nhóm trưởng; **BE** — thành viên còn lại; **Chung** — hai thành viên. Tất cả task bắt đầu ở trạng thái **Chưa làm**. Chưa gán thời hạn hoặc tài khoản GitHub vì chưa được cung cấp.

Cập nhật tiến độ: đánh dấu `[x]` khi hoàn thành; sửa trạng thái thành **Đang làm**, **Đang chờ**, **Cần kiểm tra** hoặc **Hoàn thành**; thêm liên kết PR và ghi chú trong mỗi mục. Chỉ đánh dấu hoàn thành khi đạt tiêu chí bên dưới.

## Mốc Pull Request sang dự án chính

Đây là kế hoạch đề xuất, không cần đợi hoàn thành toàn bộ Module 4. Hai bạn xác nhận nhánh đích, quyền và người review với trưởng dự án trước khi gửi PR. Có thể tách PR FE và BE nếu nhóm chính muốn review riêng; ghi rõ PR nào phụ thuộc PR nào.

| Mốc | Task liên quan | Điều kiện đề xuất để gửi sang dự án chính | Trạng thái / liên kết PR |
| --- | --- | --- | --- |
| PR 1 — Báo cáo Lead | 01–05 | Chốt nghiệp vụ và API; FE–BE kết nối; kiểm tra số liệu, bộ lọc, chi tiết và quyền. | Chưa làm · PR: — |
| PR 2 — Marketing & Ads | 06–07 | FE–BE kết nối; đối chiếu dữ liệu nguồn, KPI, quyền và trạng thái đồng bộ; ghi rõ dữ liệu thử nghiệm nếu còn dùng. | Chưa làm · PR: — |
| PR 3 — Dashboard Design | 08–09 | Thống nhất với Module 5; FE–BE hoạt động theo quyền; nêu rõ dữ liệu hoặc tích hợp còn chờ. | Chưa làm · PR: — |
| PR 4 — Xuất báo cáo | 10–11 | Kiểm tra xuất theo bộ lọc và quyền; ghi rõ kết quả Excel và tình trạng tích hợp Google Sheets. | Chưa làm · PR: — |
| Bàn giao toàn module | 12 | Kiểm thử lại các luồng đã tích hợp; ghi lỗi, phụ thuộc và phần chưa hoàn thành. | Chưa làm · PR: — |

### Quy trình làm việc của hai thành viên

1. Cùng thực hiện task 01–02; thống nhất API và dữ liệu mẫu trước khi code song song.
2. Mỗi người tạo nhánh riêng từ `main` của repository nhóm; FE và BE làm các task được phân công.
3. Push nhánh của mình, tạo PR vào repository nhóm để người còn lại xem và kiểm tra tích hợp.
4. Khi một mốc ở bảng trên sẵn sàng, đối chiếu thay đổi mới từ dự án chính, xử lý xung đột và đề xuất PR sang nhánh đích đã thống nhất.
5. Cập nhật trạng thái, đường dẫn PR và việc còn chờ vào bảng và task tương ứng; nhóm trưởng có thể phụ trách cập nhật file để giảm xung đột.

### Checklist trước mỗi PR sang dự án chính

- [ ] Chức năng trong PR đã được kiểm thử phù hợp và hai bạn đã đối chiếu kết quả FE–BE nếu có liên quan.
- [ ] Đã kiểm tra quyền, dữ liệu rỗng và lỗi liên quan đến phần thay đổi.
- [ ] Đã đối chiếu nhánh đích, thay đổi mới từ dự án chính và xử lý xung đột nếu có.
- [ ] Nội dung PR nêu mục đích, thay đổi, cách kiểm thử, kết quả và phụ thuộc hoặc giới hạn còn lại.
- [ ] Không đưa mật khẩu, file cấu hình cá nhân hoặc dữ liệu khách hàng thật vào Git.
- [ ] Áp dụng kiểm tra phạm vi và quy trình review của dự án chính; chỉ merge khi người có quyền chấp thuận.

Task 12 là kiểm thử tổng thể và bàn giao; mỗi PR trước đó vẫn phải tự kiểm thử phần việc của mình. Repository nhóm hiện là bản sao riêng: cần xác nhận cách tạo PR giữa hai repository hoặc cách đưa nhánh sang dự án chính với người quản lý repository.

## 01 — Chốt nghiệp vụ và phụ thuộc

**Phụ trách:** Chung, FE điều phối · **Trạng thái:** Chưa làm

- [ ] Đối chiếu UC04, UC01, UC03 và ma trận phân quyền với BA.
- [ ] Thống nhất thời gian lọc, cách tính L1, L2, tỷ lệ chốt và quy tắc Lead chuyển nhân viên.
- [ ] Làm rõ quan hệ giữa trạng thái khách chưa phản hồi do Sales nhập và ngưỡng chờ trong UC01.
- [ ] Xác nhận quyền xem, xuất và dữ liệu từ Module 1, 2, 3, 5.
- [ ] Ghi lại các quyết định và vấn đề còn chờ.

**Hoàn thành khi:** có danh sách yêu cầu, công thức và người cung cấp dữ liệu được hai bên thống nhất.

## 02 — Khảo sát dự án và chốt API

**Phụ trách:** Chung · **Trạng thái:** Chưa làm · **Phụ thuộc:** 01

- [ ] Kiểm tra cấu trúc dự án, tính năng hiện có, cách đăng nhập và phân quyền.
- [ ] Thống nhất API, bộ lọc, dữ liệu trả về, lỗi, thời điểm cập nhật và dữ liệu mẫu.
- [ ] Phân biệt dữ liệu chưa có, bằng 0 và chỉ số không tính được.

**Hoàn thành khi:** FE có dữ liệu mẫu để làm giao diện và BE có hợp đồng API để triển khai.

## 03 — FE: Khung Dashboard và bộ lọc

**Phụ trách:** FE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 02

- [ ] Xây dựng khung Dashboard theo vai trò và bộ chọn tuần, 30 ngày, khoảng tùy chọn.
- [ ] Làm thẻ chỉ số, biểu đồ, bảng và trạng thái tải, trống, lỗi, không đủ quyền.
- [ ] Hiển thị thời điểm cập nhật và cảnh báo nguồn chưa cập nhật khi API cung cấp.
- [ ] Kiểm tra ngày bắt đầu không sau ngày kết thúc và bố cục dễ đọc.

**Hoàn thành khi:** các thành phần chạy được bằng dữ liệu mẫu và tương thích API đã chốt.

## 04 — BE: Tổng hợp Lead và phân quyền

**Phụ trách:** BE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 01, 02; dữ liệu Module 1

- [ ] Cung cấp dữ liệu Lead theo kỳ, nguồn, sản phẩm, trạng thái và nhân viên.
- [ ] Tính L1, L2 và tỷ lệ đã thống nhất; trả dữ liệu chi tiết tương ứng.
- [ ] Xử lý Lead chưa phân công, chuyển giao, nhiều sản phẩm và mẫu số bằng 0.
- [ ] Kiểm tra quyền đối với chỉ số, danh sách và các trường thông tin.

**Hoàn thành khi:** số tổng hợp khớp dữ liệu mẫu và người không có quyền không truy cập được dữ liệu.

## 05 — FE: Báo cáo Lead và Dashboard Kinh doanh

**Phụ trách:** FE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 02, 03; kết nối 04

- [ ] Làm bảng tổng hợp Lead theo nhân viên và bảng chi tiết theo mẫu.
- [ ] Hiển thị trạng thái, tỷ lệ chốt và khách đã gửi báo giá nhưng chưa phản hồi theo dữ liệu được cung cấp.
- [ ] Kết nối bộ lọc, xem chi tiết, phân trang và liên kết hồ sơ theo quyền.
- [ ] Không hiển thị giá tiền báo giá; trang báo cáo đọc toàn trang.

**Hoàn thành khi:** giao diện kết nối API và kết quả bảng chi tiết khớp bộ lọc.

## 06 — BE: Dữ liệu Marketing và Ads

**Phụ trách:** BE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 01, 02; Module 2, 3

- [ ] Cung cấp Lead L1/L2 theo nguồn và chiến dịch, tách Lead lặp theo đặc tả.
- [ ] Cung cấp KPI Ads đã thống nhất, nguồn dữ liệu và thời gian cập nhật.
- [ ] Xử lý nguồn chưa xác định, số liệu chưa chốt, đồng bộ lỗi và mẫu số bằng 0.
- [ ] Đối chiếu dữ liệu chiến dịch và quyền với các nhóm nguồn.

**Hoàn thành khi:** số liệu có nguồn xác định, đúng quy tắc và phản ánh tình trạng đồng bộ.

## 07 — FE: Dashboard Marketing và Ads

**Phụ trách:** FE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 03, 06

- [ ] Hiển thị Lead theo nguồn, chiến dịch và sản phẩm; KPI Ads theo quyền.
- [ ] Hiển thị nguồn chưa xác định, dữ liệu chưa chốt và cảnh báo đồng bộ theo API.
- [ ] Kết nối bộ lọc và danh sách chi tiết được phép xem.

**Hoàn thành khi:** biểu đồ và bảng khớp API khi thay đổi bộ lọc.

## 08 — BE: Dữ liệu Dashboard Design

**Phụ trách:** BE · **Trạng thái:** Chưa làm · **Phụ thuộc:** Module 5, 01, 02

- [ ] Chốt với Module 5 dữ liệu ấn phẩm, thời gian, token và chi phí.
- [ ] Cung cấp số tổng hợp và chi tiết theo kỳ, có thông tin thiếu dữ liệu.
- [ ] Kiểm tra quyền Designer, Admin và Giám đốc theo xác nhận BA.

**Hoàn thành khi:** API dùng được với dữ liệu mẫu và sẵn sàng tích hợp dữ liệu Module 5.

## 09 — FE: Dashboard Design

**Phụ trách:** FE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 03, 08

- [ ] Hiển thị ấn phẩm theo loại, thời gian và token/chi phí theo quyền.
- [ ] Kết nối bộ lọc, API và trạng thái chưa có dữ liệu.

**Hoàn thành khi:** Dashboard đúng vai trò và phản ánh dữ liệu API.

## 10 — BE: Xuất Excel và Google Sheets

**Phụ trách:** BE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 01, 02, dữ liệu các báo cáo

- [ ] Xuất Excel theo bộ lọc và quyền; ghi thời điểm số liệu.
- [ ] Thống nhất tài khoản, quyền và cách tạo Google Sheets; triển khai khi đã có tích hợp.
- [ ] Xử lý dữ liệu trống và lỗi; không xuất giá tiền báo giá trái yêu cầu BA.

**Hoàn thành khi:** nội dung xuất khớp dữ liệu được phép xem và người dùng nhận được file hoặc liên kết.

## 11 — FE: Giao diện xuất và trang đọc báo cáo

**Phụ trách:** FE · **Trạng thái:** Chưa làm · **Phụ thuộc:** 05, 10

- [ ] Xây dựng giao diện đọc báo cáo toàn trang, chọn định dạng và nút xuất.
- [ ] Kết nối API xuất, thông báo tiến độ, thành công và lỗi.
- [ ] Kiểm tra bộ lọc đang chọn được giữ khi xuất.

**Hoàn thành khi:** xuất Excel và mở Google Sheets hoạt động theo kết quả backend, trong phạm vi tích hợp sẵn sàng.

## 12 — Kiểm thử tích hợp và bàn giao

**Phụ trách:** Chung · **Trạng thái:** Chưa làm · **Phụ thuộc:** các chức năng đã triển khai

- [ ] Kiểm thử từng vai trò, quyền xem/chi tiết/xuất và truy cập trực tiếp API.
- [ ] Đối chiếu Dashboard, bảng chi tiết và file xuất trên cùng bộ dữ liệu.
- [ ] Kiểm thử thời gian không hợp lệ, dữ liệu trống, mẫu số bằng 0 và nguồn lỗi.
- [ ] Kiểm tra Lead nhiều sản phẩm, chuyển Sales, không hợp lệ và phản hồi chưa xác nhận.
- [ ] Ghi lỗi, sửa lỗi, chuẩn bị dữ liệu demo và hướng dẫn sử dụng.

**Hoàn thành khi:** các luồng đã hoàn thành được kiểm thử, lỗi và phụ thuộc còn lại được ghi rõ để bàn giao.
