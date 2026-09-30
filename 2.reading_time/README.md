# 2. Reading Time

Content script: tự động chạy khi vào đúng trang khớp `matches`, không cần bấm icon (không có `action`/popup nào cả).

## Mục tiêu
Hiểu cơ chế `content_scripts` — loại extension tự động chèn code vào trang mà không cần user thao tác gì. Học cách debug khi content script "không thấy chạy" (reload extension + reload trang, kiểm tra Console/Sources đúng cách), xử lý vấn đề SPA (trang chuyển nội dung mà không load lại), và các lỗi thường gặp khi query/chèn DOM (`insertAdjacentElement`, selector sai phạm vi, style bị kế thừa từ trang lạ).

## Cách chạy
- Khai báo trong `manifest.json`:
  ```json
  "content_scripts": [{
    "js": ["scripts/content.js"],
    "matches": [
      "https://developer.chrome.com/docs/extensions/*",
      "https://developer.chrome.com/docs/webstore/*",
      "https://github.com/*"
    ]
  }]
  ```
- Chrome tự inject `content.js` vào mọi trang khớp `matches` ngay khi trang đó load xong (mặc định `document_idle`).
- Không có UI riêng — script chèn thẳng 1 thẻ `<p>` (badge "⏱️ X min read") vào ngay trong DOM của trang.

## Vì sao sửa code xong vẫn phải reload
Content script chỉ được Chrome nạp **1 lần lúc trang load**, sửa file trên đĩa không tự áp dụng. Sau mỗi lần sửa `content.js`, phải:
1. Vào `chrome://extensions` → bấm nút 🔄 reload trên card extension (để Chrome đọc lại code mới).
2. F5 (hoặc Ctrl+Shift+R) lại trang đích (để code mới được inject lại vào tab).

Chỉ đổi 1 trong 2 bước là chưa đủ.

## Cách kiểm tra chắc chắn script có chạy hay không
- Thêm 1 dòng `console.log(...)` ở **ngoài cùng, đầu file**, không nằm trong hàm/điều kiện nào — nếu dòng này không hiện trong Console thì chắc chắn file chưa được nạp.
- Kiểm tra tab **Sources** trong DevTools, tìm mục **"Content scripts"** — nếu `content.js` xuất hiện ở đó nghĩa là đã được inject.
- Console mặc định lọc theo context (`top`); nếu không thấy log, thử đổi dropdown context hoặc bỏ hết filter.

## Vấn đề SPA (Single Page App)
GitHub và developer.chrome.com đều là SPA — chuyển "trang" bằng JS (Turbo/pjax) mà **không load lại toàn bộ trang**, nên content script không tự chạy lại khi bấm link điều hướng nội bộ. Cách xử lý: theo dõi khi `location.href` đổi (chắc chắn đổi mỗi khi SPA chuyển trang) thay vì cố đoán DOM sẽ thêm thẻ nào, vì mỗi site có cấu trúc DOM thay đổi khác nhau:
```js
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    renderReadingTime(document.querySelector("main"));
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

## Lưu ý khác
- `insertAdjacentElement("afterend", badge)` chèn badge làm **anh em (sibling) ngay sau** phần tử neo, không phải lồng vào bên trong nó. 4 vị trí có thể dùng: `beforebegin` / `afterbegin` (đầu bên trong) / `beforeend` (cuối bên trong) / `afterend`.
- Selector heading/date (`.js-header-wrapper`, `<time>`) phải tìm **đúng trong phạm vi `article` được truyền vào hàm** — nếu gọi hàm với `document.querySelector("main")` thì bên trong không nên tìm lại `article.querySelector("main")` (tìm `<main>` lồng trong `<main>` sẽ luôn ra `null`).
- Style badge nên set trực tiếp qua `badge.style.*` thay vì dùng class CSS có sẵn của 1 site cụ thể (vd `color-secondary-text`, `type--caption` là class riêng của developer.chrome.com, chèn sang GitHub sẽ không có tác dụng và badge dễ bị kế thừa style lạ từ container cha).
