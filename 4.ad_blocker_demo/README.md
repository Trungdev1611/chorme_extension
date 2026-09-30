# 4. Ad Blocker Demo

Extension minh hoạ cách một ad blocker thực tế hoạt động — khác hẳn cơ chế `activeTab` của Focus Mode ([3.service_worker](../3.service_worker/README.md)): loại này phải tự động chạy trên **mọi trang, mọi lúc**, không chờ user bấm gì cả.

## Mục tiêu
So sánh 2 mô hình permission (`activeTab` vs `host_permissions` rộng) để thấy khi nào cần cái nào. Hiểu sâu về `run_at` trong `content_scripts` — thời điểm chèn script ảnh hưởng thế nào đến việc DOM đã sẵn sàng hay chưa, và vì sao CSS với JS "chịu" được `document_start` khác nhau. Biết thêm ad blocker thật cần kết hợp thêm API nào (`declarativeNetRequest`) ngoài việc ẩn bằng CSS/DOM.

## Vì sao không dùng `activeTab` như Focus Mode
`activeTab` chỉ cấp quyền khi user chủ động bấm icon — không phù hợp với ad blocker vì quảng cáo cần bị ẩn **ngay khi trang vừa load**, không thể chờ user thao tác. Nên phải dùng `content_scripts` với `matches: ["<all_urls>"]` để tự động chạy trên mọi trang.

## Vì sao cần `run_at` (không phải content script tự nhiên "luôn chạy ngay")
Content script luôn được chèn vào trang, nhưng **thời điểm chèn trong vòng đời load trang** thì khác nhau tuỳ giá trị `run_at`:

| Giá trị | Chạy lúc nào | Đặc điểm |
|---|---|---|
| `document_start` | Ngay sau khi có `<html>`, **trước khi** DOM parse xong, trước khi ảnh/CSS/quảng cáo tải | Sớm nhất — CSS ẩn quảng cáo áp dụng được ngay cả trước khi phần tử render, tránh hiện tượng "nháy" quảng cáo |
| `document_end` | Sau khi DOM parse xong, tài nguyên khác có thể chưa tải hết | DOM đã có sẵn để query |
| `document_idle` (mặc định nếu không khai báo) | Gần cuối quá trình load | An toàn nhất nhưng muộn nhất — quảng cáo có thể đã kịp hiện ra trước khi bị ẩn |

→ Extension này cố tình chọn `document_start` để giảm tối đa độ trễ trước khi quảng cáo bị ẩn.

## Vì sao CSS và JS ở `document_start` lại "đối xử" khác nhau

- **`blocker.css`**: hoạt động tốt ngay từ `document_start`, vì CSS chỉ cần định nghĩa sẵn rule (`display: none !important`) — trình duyệt tự áp dụng style này **ngay khi phần tử được tạo ra sau đó**, không cần DOM đã tồn tại từ trước.
- **`blocker.js`**: ở `document_start`, `document.body` **chưa tồn tại** (DOM còn đang parse dở) → nếu gọi `document.querySelectorAll(...)` ngay lập tức sẽ không tìm thấy gì (DOM rỗng). Vì vậy script phải tự đợi:
  ```js
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  ```
  Đây là điểm dễ nhầm nhất khi mới học: tưởng `run_at: document_start` nghĩa là "DOM đã sẵn sàng để thao tác", thực ra ngược lại — nó chạy sớm đến mức DOM còn chưa có gì.

## Vì sao có thêm `MutationObserver`
Nhiều trang chèn quảng cáo **muộn hơn** lúc trang load xong (lazy-load, load qua AJAX/SPA sau khi user cuộn hoặc tương tác). Quét 1 lần lúc `DOMContentLoaded` sẽ bỏ sót các quảng cáo này, nên cần tiếp tục theo dõi DOM để xoá cả những phần tử được thêm vào sau.

## Thực tế ad blocker còn dùng thêm gì
Ví dụ này chỉ minh hoạ phần "ẩn bằng CSS/xoá DOM". Ad blocker thật thường kết hợp thêm:
- **`declarativeNetRequest`**: chặn request tải quảng cáo ở tầng network (theo domain/pattern) — hiệu quả hơn vì chặn từ gốc, không để quảng cáo tải về rồi mới ẩn, tiết kiệm băng thông và tránh nháy hình.
- **`host_permissions: ["<all_urls>"]`**: bắt buộc phải có, tương ứng với việc content script chạy trên mọi trang — đây cũng là lý do khi cài các extension chặn quảng cáo, Chrome luôn cảnh báo mạnh kiểu "đọc và thay đổi dữ liệu trên mọi trang web bạn truy cập".
