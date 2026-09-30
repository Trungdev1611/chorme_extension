// Chạy ở document_start nên document.body chưa chắc đã tồn tại,
// phải đợi DOM sẵn sàng trước khi quét và xoá phần tử quảng cáo.
const AD_SELECTORS = [
  '[class*="ads"]',
  '[id*="google_ads"]',
  '[class*="advertisement"]',
  'iframe[src*="doubleclick.net"]',
];

function removeAds(root = document) {
  for (const selector of AD_SELECTORS) {
    root.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

function start() {
  removeAds();

  // Trang có thể chèn thêm quảng cáo sau khi load (lazy load, SPA...),
  // nên tiếp tục theo dõi DOM để xoá quảng cáo xuất hiện muộn.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          removeAds(node.parentNode ?? document);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  // document_start chạy trước khi DOM parse xong -> chờ DOMContentLoaded
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
