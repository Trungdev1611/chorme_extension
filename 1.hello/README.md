# 1. Hello Extensions

Extension cơ bản nhất: chỉ có popup, không tự chạy.

## Mục tiêu
Làm quen với thành phần đơn giản nhất của 1 Chrome extension: `action` + popup HTML. Hiểu được extension không phải lúc nào cũng "tự chạy" — có loại chỉ hoạt động khi user chủ động bấm icon, và học cách chẩn đoán các lỗi cơ bản khi load unpacked extension lần đầu (sai tên file manifest, sai tên file icon).

## Cách chạy
- Khai báo `"action": { "default_popup": "hello.html", "default_icon": "icon.png" }` trong `manifest.json`.
- **Phải bấm vào icon extension trên toolbar** thì `hello.html` (và `popup.js`) mới được mở/chạy.
- Không cần reload extension khi sửa `hello.html`/`popup.js`/`styles.css` — vì popup được load lại từ đĩa mỗi lần mở, đóng popup lại mở ra là thấy code mới ngay.

## Các lỗi từng gặp khi load
- **"Tệp kê khai bị thiếu hoặc không thể đọc được"**: do file bị đặt sai tên (`mainfest.json` thay vì `manifest.json`). Tên file `manifest.json` phải chính xác tuyệt đối.
- **"Could not load icon..."**: do `default_icon` trong manifest trỏ tới tên file không tồn tại trong thư mục (vd `hello_extensions.png` trong khi file thật là `icon.png`). Phải sửa cho khớp tên file thật.
