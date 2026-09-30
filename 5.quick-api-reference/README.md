# 5. Quick API Reference

Extension "tra cứu nhanh API Chrome Extension" — kết hợp 3 API riêng biệt: `omnibox` (thanh địa chỉ), `storage.local` (lưu dữ liệu), và `content_scripts` + `alarms` (chèn nút "Tip" vào trang docs, cập nhật tip mỗi ngày).

## Mục tiêu
Hiểu 1 extension có thể gồm **nhiều tính năng độc lập** dùng chung hạ tầng (`service_worker` kiểu ES module, `storage.local`). Học API `omnibox` (gợi ý ngay trong thanh địa chỉ trình duyệt) và `alarms` (hẹn giờ chạy lại định kỳ). Phân biệt rõ 2 loại tên trong manifest/code: **tên field cố định do Chrome quy định** (vd `omnibox`, sai tên là mất luôn tính năng) vs **tên tự đặt, chỉ cần khớp nhau giữa nơi ghi và nơi đọc** (vd tên file import, tên key trong `storage.local`).

## Cấu trúc

- `manifest.json`: khai báo `background` (service worker dạng `module`, cho phép dùng `import`), `omnibox`, `content_scripts`, permissions `storage` + `alarms`.
- `worker/service-worker.js`: chỉ làm 1 việc — `import` 2 file con vào để chúng cùng chạy trong 1 service worker.
  ```js
  import './sw-omnibox.js';
  import './sw-tip.js';
  ```
- `worker/sw-omnibox.js`: xử lý toàn bộ logic omnibox.
- `worker/sw-tip.js`: xử lý lấy & lưu "tip" theo lịch, dùng `alarms`.
- `content.js`: chèn nút "Tip" vào nav bar của trang docs.

## Tính năng 1 — Tra API ngay từ thanh địa chỉ (`omnibox`)

1. Gõ `api` vào thanh địa chỉ Chrome rồi nhấn `Tab`/`Space` → vào "chế độ tìm kiếm riêng" của extension (giống chọn 1 search engine khác ngay trong address bar).
2. Gõ tiếp tên API (`onInputChanged`) → đọc danh sách gợi ý từ `storage.local` (key `dataSaved`), hiển thị dropdown ngay dưới thanh địa chỉ.
3. Nhấn Enter (`onInputEntered`) → mở tab mới tới `https://developer.chrome.com/docs/extensions/reference/<tên API>`, đồng thời lưu tên API đó vào **đầu** `dataSaved` (giữ tối đa 4 mục gần nhất) để lần sau gợi ý ưu tiên các API mới tra.
4. `onInputEntered` bắn ra dù bạn chọn gợi ý có sẵn hay tự gõ tên API hoàn toàn mới — không có kiểm tra hợp lệ, gõ sai tên vẫn được lưu vào lịch sử và vẫn mở tab (dẫn tới trang docs 404 nếu API không tồn tại).

Ban đầu (`onInstalled`), `dataSaved` được set sẵn 3 giá trị mặc định: `["tabs", "storage", "scripting"]`.

## Tính năng 2 — Nút "Tip" trên trang docs (`content_scripts` + `alarms`)

Độc lập hoàn toàn với omnibox, chỉ dùng chung `storage.local`:
1. `sw-tip.js` dùng `alarms.create` hẹn giờ: 1 phút sau khi cài đặt, rồi lặp lại mỗi 24 giờ (`periodInMinutes: 24*60`) — gọi `updateTip()` fetch 1 tip ngẫu nhiên từ `chrome.dev/f/extension_tips/` và lưu vào `storage.local` (key `tip`).
2. `content.js` được inject vào trang `developer.chrome.com/docs/extensions/reference/*` — tìm thanh nav (`.upper-tabs > nav`), chèn thêm 1 nút "Tip", đồng thời gửi message `{ greeting: 'tip' }` tới service worker để lấy nội dung tip đã lưu.
3. Nút "Tip" dùng thuộc tính HTML `popovertarget`/`popovertargetaction` (Popover API có sẵn của trình duyệt) — bấm vào tự hiện popover chứa tip, không cần viết thêm JS để show/hide.

## Các lỗi/bug đã gặp và sửa

- **`Service worker registration failed. Status code: 3`**: do `service-worker.js` import sai tên file (`./sw-tips.js` trong khi file thật là `sw-tip.js`) — với `"type": "module"`, 1 file import sai đường dẫn làm cả service worker fail đăng ký hoàn toàn.
- **Nút "Tip" không xuất hiện**: `content.js` đã viết sẵn nhưng ban đầu chưa được khai báo trong `manifest.json` (thiếu hẳn mục `content_scripts`) → chưa từng được Chrome inject vào trang.
- **`"trung": { "keyword": "api" }` trong manifest + `browser.trung.*` trong code**: gõ nhầm tên field/API — tên đúng là **`omnibox`** (đây là tên cố định do Chrome quy định, không phải tên tự đặt, đổi tên là mất luôn tính năng chứ không tự tạo ra API mới theo tên đó).
- **Lệch tên key trong `storage.local`**: lúc ghi dùng key `dataSaved`, lúc đọc lại dùng key `apiSuggestions` → luôn đọc ra `undefined`. Khác với `omnibox` (tên cố định), tên key trong `storage.local` là **tự đặt tự do**, chỉ cần đảm bảo nơi ghi và nơi đọc dùng chung 1 tên.

## Lưu ý về namespace API

Toàn bộ code (`sw-omnibox.js`, `sw-tip.js`, `content.js`) dùng `browser.*` (chuẩn WebExtension của Firefox). Trên Chrome, API chuẩn là `chrome.*` — nếu không có polyfill định nghĩa `browser`, sẽ lỗi `browser is not defined`. Nếu chạy trên Chrome mà gặp lỗi này, đổi toàn bộ `browser.` → `chrome.`.
