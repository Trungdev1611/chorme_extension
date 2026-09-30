# 3. Service Worker (Focus Mode)

Ví dụ dùng **background service worker** thay vì content script — chạy nền, phản ứng theo sự kiện, không gắn cố định vào 1 trang cụ thể.

## Mục tiêu
Hiểu cách extension phản ứng theo **sự kiện user chủ động thao tác** (bấm icon) thay vì tự chạy khi trang load. Phân biệt permission `activeTab` (phạm vi hẹp, tạm thời, không cảnh báo) với permission truy cập rộng, hiểu vì sao 1 số trang đặc biệt (`chrome://...`) không cho đọc `tab.url` dù có `activeTab`, và nắm rõ `default_icon` nhiều kích thước không phải nhiều icon để chọn.

## Extension này làm gì
Khi đang ở trang `developer.chrome.com/docs/extensions` hoặc `/docs/webstore`, bấm vào icon extension sẽ bật/tắt "chế độ tập trung": chèn/gỡ file `focus-mode.css` vào tab đó.

## Cấu trúc manifest
- `"background": { "service_worker": "background.js" }` — chạy nền, không có popup.
- `"action"` chỉ có icon, **không có `default_popup`** → bấm icon sẽ kích hoạt sự kiện `onClicked` trong background script thay vì mở popup.
- `"permissions": ["activeTab", "scripting"]`:
  - `activeTab`: được thao tác với tab đang active khi user bấm icon, không cần xin quyền truy cập mọi trang.
  - `scripting`: dùng để chèn/gỡ CSS (`insertCSS`/`removeCSS`) vào trang theo lệnh.

## Logic trong background.js
1. Lúc cài đặt (`onInstalled`): set badge mặc định là `"OFF"`.
2. Lúc bấm icon (`onClicked`):
   - Chỉ xử lý nếu tab hiện tại đúng 2 trang docs ở trên.
   - Đọc badge text hiện tại của tab đó, đảo ngược `ON`/`OFF` — dùng chính badge làm nơi lưu trạng thái, không cần biến riêng hay storage.
   - `ON` → chèn CSS vào tab. `OFF` → gỡ CSS khỏi tab.

## `default_icon` có 4 kích thước — bấm vào cái nào?
```json
"default_icon": {
  "16": "images/icon-16.png",
  "32": "images/icon-32.png",
  "48": "images/icon-48.png",
  "128": "images/icon-128.png"
}
```
4 kích thước này **không phải 4 icon khác nhau để chọn bấm** — trên toolbar chỉ hiển thị **1 icon duy nhất**. Chrome tự chọn file kích thước phù hợp nhất tùy nơi hiển thị (icon nhỏ trên toolbar dùng bản 16/32px, icon lớn ở trang quản lý extension dùng bản 48/128px, màn hình độ phân giải cao (Retina/HiDPI) dùng bản lớn hơn để không bị vỡ nét). Dù hiển thị bản nào, click vào icon đó trên toolbar đều kích hoạt **cùng 1 sự kiện** `action.onClicked` trong `background.js` — không cần quan tâm đang hiển thị đúng size nào.

## Lưu ý quan trọng: namespace API
Code gốc dùng `browser.*` (namespace chuẩn WebExtension của **Firefox**). Trên Chrome, API chuẩn là `chrome.*` — nếu không có polyfill định nghĩa `browser`, service worker sẽ lỗi `browser is not defined`. Nếu chạy trên Chrome mà gặp lỗi này, đổi toàn bộ `browser.` → `chrome.` trong `background.js`.

## Thêm file khác vào thư mục
Các file không được khai báo trong `manifest.json` (vd `README.md`) sẽ bị Chrome **bỏ qua hoàn toàn** khi load unpacked, không gây lỗi gì.
