console.log("sw-tips.js");

// Fetch tip & save in storage
const updateTip = async () => {
  const response = await fetch('https://chrome.dev/f/extension_tips/');
  const tips = await response.json();
  const randomIndex = Math.floor(Math.random() * tips.length);
  return browser.storage.local.set({ tip: tips[randomIndex] });
};

const ALARM_NAME = 'tip';

// Check if alarm exists to avoid resetting the timer.
// The alarm might be removed when the browser session restarts.
async function createAlarm() {
  const alarm = await browser.alarms.get(ALARM_NAME);
  if (typeof alarm === 'undefined') {
    browser.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 24*60
    });
    updateTip();
  }
}

createAlarm();

// Update tip once a day
browser.alarms.onAlarm.addListener(updateTip);

// Send tip to content script via messaging
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.greeting === 'tip') {
    browser.storage.local.get('tip').then(sendResponse);
    return true;
  }
});