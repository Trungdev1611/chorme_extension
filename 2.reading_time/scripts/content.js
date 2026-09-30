console.log("[reading-time] content.js LOADED on", location.href);

function renderReadingTime(article) {
    console.log("aaaaaaaaaaaaaaaaaaaaaaaa")
  // If we weren't provided an article, we don't need to render anything.
  if (!article) {
    console.log("not found article")
    return;
  }

  const text = article.textContent;
  const wordMatchRegExp = /[^\s]+/g; // Regular expression
  const words = text.matchAll(wordMatchRegExp);
  // matchAll returns an iterator, convert to array to get word count
  const wordCount = [...words].length;
  const readingTime = Math.round(wordCount / 200);
  const badge = document.createElement("p");
  badge.textContent = `⏱️ ${readingTime} min read aaaaaa`;
  badge.style.color = "red";
  badge.style.textAlign = "right";
  badge.style.margin = "8px 0";


  // Support for API reference docs
  const heading = article.querySelector(".js-header-wrapper");
  // Support for article docs with date
  const date = article.querySelector("time")?.parentNode;

  const anchor = date ?? heading;
  if (anchor) {
    anchor.insertAdjacentElement("afterend", badge);
    return;
  }

  // Không tìm thấy heading/date cụ thể -> chèn luôn vào đầu article/main
  console.log("not found heading/date, fallback: prepend into article");
  article.insertAdjacentElement("afterbegin", badge);
}

renderReadingTime(document.querySelector("main"));

// SPA (GitHub, Chrome Docs...) đổi nội dung mà không reload trang, nhưng
// luôn đổi location.href khi "chuyển trang" -> theo dõi URL thay vì đoán
// thẻ nào sẽ được thêm vào DOM.
let lastUrl = location.href;

const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    renderReadingTime(document.querySelector("main"));
  }
});

const targetNode = document.body;

if (targetNode) {
  observer.observe(targetNode, {
    childList: true,
    subtree: true // Theo dõi cả các phần tử con thay đổi bên trong
  });
} else {
  console.log("Không tìm thấy body để gán observer!");
}