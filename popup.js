// Check extension status
async function checkStatus() {
  const statusElement = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  
  // Check API key
  const result = await chrome.storage.local.get(['openrouterApiKey']);
  const hasApiKey = !!result.openrouterApiKey;
  
  // Check current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const isValidUrl = currentTab.url && (currentTab.url.startsWith('http://') || currentTab.url.startsWith('https://'));
  
  if (!hasApiKey) {
    statusElement.classList.add('inactive');
    statusText.textContent = 'API key required - click Settings';
  } else if (!isValidUrl) {
    statusElement.classList.add('inactive');
    statusText.textContent = 'Not available on this page';
  } else {
    statusElement.classList.remove('inactive');
    statusText.textContent = 'Ready to assist';
  }
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
});