// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['openrouterApiKey', 'selectedModel']);
  
  if (result.openrouterApiKey) {
    document.getElementById('apiKey').value = result.openrouterApiKey;
  }
  
  if (result.selectedModel) {
    document.getElementById('model').value = result.selectedModel;
  }
}

// Save settings
async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value;
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  
  // Validate API key format
  if (apiKey && !apiKey.startsWith('sk-or-v1-')) {
    showStatus('error', 'Invalid API key format. OpenRouter keys start with "sk-or-v1-"');
    return;
  }
  
  if (!apiKey) {
    showStatus('error', 'Please enter your OpenRouter API key');
    return;
  }
  
  // Disable button while saving
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    await chrome.storage.local.set({
      openrouterApiKey: apiKey,
      selectedModel: model
    });
    
    showStatus('success', 'Settings saved successfully!');
    
    // Test the API key
    testApiKey(apiKey, model);
    
  } catch (error) {
    showStatus('error', 'Failed to save settings: ' + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

// Test API key by making a simple request
async function testApiKey(apiKey, model) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://medcomplete.extension',
        'X-Title': 'MedComplete Extension'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
      })
    });
    
    if (response.ok) {
      showStatus('success', 'API key validated successfully! Extension is ready to use.');
    } else {
      const errorData = await response.text();
      showStatus('error', `API key test failed: ${response.status} - ${errorData}`);
    }
  } catch (error) {
    showStatus('error', `API key test failed: ${error.message}`);
  }
}

// Show status message
function showStatus(type, message) {
  const status = document.getElementById('status');
  status.className = `status ${type}`;
  status.textContent = message;
  status.style.display = 'block';
  
  // Hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('saveBtn').addEventListener('click', saveSettings);

// Save on Enter key
document.getElementById('apiKey').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

// Show/hide API key
document.getElementById('apiKey').addEventListener('focus', (e) => {
  e.target.type = 'text';
});

document.getElementById('apiKey').addEventListener('blur', (e) => {
  e.target.type = 'password';
});