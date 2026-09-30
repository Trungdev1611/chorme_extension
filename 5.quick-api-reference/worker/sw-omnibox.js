console.log("sw-omnibox.js");

// Save default API suggestions
browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    browser.storage.local.set({
      dataSaved: ["tabs", "storage", "scripting"],
    });
  }
});

const URL_CHROME_EXTENSIONS_DOC =
  "https://developer.chrome.com/docs/extensions/reference/";
const NUMBER_OF_PREVIOUS_SEARCHES = 4;

// Display the suggestions after user starts typing
browser.omnibox.onInputChanged.addListener(async (input, suggest) => {
  // `input` là đoạn chữ người dùng gõ SAU từ khóa "api"
  console.log("Dữ liệu gõ sau từ khóa 'api':", input);

  await browser.omnibox.setDefaultSuggestion({
    description: "Enter a Chrome API or choose from past searches",
  });
  const { dataSaved } = await browser.storage.local.get("dataSaved");
  const suggestions = dataSaved.map((api) => {
    return { content: api, description: `Open browser.${api} API` };
  });
  suggest(suggestions);
});

browser.omnibox.onInputEntered.addListener((input) => {
  browser.tabs.create({ url: URL_CHROME_EXTENSIONS_DOC + input });
  // Save the latest keyword
  updateHistory(input);
});


async function updateHistory(input) {
  const { dataSaved } = await browser.storage.local.get('dataSaved');
  dataSaved.unshift(input);
  dataSaved.splice(NUMBER_OF_PREVIOUS_SEARCHES);
  return browser.storage.local.set({ dataSaved });
}