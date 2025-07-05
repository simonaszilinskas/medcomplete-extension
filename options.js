// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'apiProvider', 
    'openrouterApiKey', 
    'medgemmaApiUrl', 
    'selectedModel'
  ]);
  
  // Set API provider
  const apiProvider = result.apiProvider || 'openrouter';
  document.getElementById('apiProvider').value = apiProvider;
  
  // Load API-specific settings
  if (result.openrouterApiKey) {
    document.getElementById('apiKey').value = result.openrouterApiKey;
  }
  
  if (result.medgemmaApiUrl) {
    document.getElementById('medgemmaUrl').value = result.medgemmaApiUrl;
  }
  
  if (result.selectedModel) {
    document.getElementById('model').value = result.selectedModel;
  }
  
  // Update UI based on provider
  updateProviderUI(apiProvider);
}

// Update UI based on selected provider
function updateProviderUI(provider) {
  const openrouterSettings = document.getElementById('openrouter-settings');
  const medgemmaSettings = document.getElementById('medgemma-settings');
  const modelSettings = document.getElementById('model-settings');
  
  if (provider === 'medgemma') {
    openrouterSettings.style.display = 'none';
    medgemmaSettings.style.display = 'block';
    modelSettings.style.display = 'none';
  } else {
    openrouterSettings.style.display = 'block';
    medgemmaSettings.style.display = 'none';
    modelSettings.style.display = 'block';
  }
}

// Save settings
async function saveSettings() {
  const apiProvider = document.getElementById('apiProvider').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const medgemmaUrl = document.getElementById('medgemmaUrl').value.trim();
  const model = document.getElementById('model').value;
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  
  // Validate based on provider
  if (apiProvider === 'openrouter') {
    if (apiKey && !apiKey.startsWith('sk-or-v1-')) {
      showStatus('error', 'Invalid API key format. OpenRouter keys start with "sk-or-v1-"');
      return;
    }
    
    if (!apiKey) {
      showStatus('error', 'Please enter your OpenRouter API key');
      return;
    }
  } else if (apiProvider === 'medgemma') {
    if (!medgemmaUrl) {
      showStatus('error', 'Please enter your MedGemma Gradio URL');
      return;
    }
    
    if (!medgemmaUrl.includes('gradio')) {
      showStatus('error', 'URL should be a Gradio URL (e.g., https://abc123.gradio.live)');
      return;
    }
  }
  
  // Disable button while saving
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    const settingsToSave = {
      apiProvider: apiProvider,
      selectedModel: model
    };
    
    if (apiProvider === 'openrouter') {
      settingsToSave.openrouterApiKey = apiKey;
    } else if (apiProvider === 'medgemma') {
      settingsToSave.medgemmaApiUrl = medgemmaUrl;
    }
    
    await chrome.storage.local.set(settingsToSave);
    
    showStatus('success', 'Settings saved successfully!');
    
    // Test the API configuration
    if (apiProvider === 'openrouter') {
      testOpenRouterApi(apiKey, model);
    } else if (apiProvider === 'medgemma') {
      testMedGemmaApi(medgemmaUrl);
    }
    
  } catch (error) {
    showStatus('error', 'Failed to save settings: ' + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

// Test OpenRouter API
async function testOpenRouterApi(apiKey, model) {
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
      showStatus('success', 'OpenRouter API validated successfully! Extension is ready to use.');
    } else {
      const errorData = await response.text();
      showStatus('error', `OpenRouter API test failed: ${response.status} - ${errorData}`);
    }
  } catch (error) {
    showStatus('error', `OpenRouter API test failed: ${error.message}`);
  }
}

// Test MedGemma API
async function testMedGemmaApi(medgemmaUrl) {
  try {
    const baseUrl = medgemmaUrl.replace(/\/$/, '');
    
    // Test Step 1: Initiate prediction
    const response = await fetch(`${baseUrl}/gradio_api/call/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: ["Test medical text", 5]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.event_id) {
        showStatus('success', 'MedGemma API validated successfully! Extension is ready to use.');
      } else {
        showStatus('error', 'MedGemma API test failed: No event_id received');
      }
    } else {
      showStatus('error', `MedGemma API test failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    showStatus('error', `MedGemma API test failed: ${error.message}. Check if the URL is correct and accessible.`);
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

// API provider change
document.getElementById('apiProvider').addEventListener('change', (e) => {
  updateProviderUI(e.target.value);
});

// Save on Enter key for both API inputs
document.getElementById('apiKey').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

document.getElementById('medgemmaUrl').addEventListener('keypress', (e) => {
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