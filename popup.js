// Check if extension is active on current tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  const statusElement = document.getElementById('status');
  
  // Check if URL is supported (http/https)
  if (currentTab.url && (currentTab.url.startsWith('http://') || currentTab.url.startsWith('https://'))) {
    statusElement.classList.remove('inactive');
    statusElement.innerHTML = '<span class="status-dot"></span><span>Active on this page</span>';
  } else {
    statusElement.classList.add('inactive');
    statusElement.innerHTML = '<span class="status-dot"></span><span>Not available on this page</span>';
  }
});