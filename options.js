// Default prompt template
const DEFAULT_PROMPT = `You are a medical documentation assistant. Continue the following medical text naturally.

IMPORTANT: 
- Only provide what comes AFTER the given text
- Do not rewrite or repeat any part of the existing text
- Do not start with "..." or ".." or any dots
- Just continue from where the text ends naturally`;

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'apiProvider', 
    'openrouterApiKey', 
    'medgemmaApiUrl',
    'vertexEndpoint',
    'vertexToken',
    'ollamaUrl',
    'ollamaModel',
    'selectedModel',
    'maxTokens',
    'temperature',
    'customPrompt',
    'userPrefix'
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
  
  if (result.vertexEndpoint) {
    document.getElementById('vertexEndpoint').value = result.vertexEndpoint;
  }
  
  if (result.vertexToken) {
    document.getElementById('vertexToken').value = result.vertexToken;
  }
  
  if (result.ollamaUrl) {
    document.getElementById('ollamaUrl').value = result.ollamaUrl;
  }
  
  if (result.ollamaModel) {
    document.getElementById('ollamaModel').value = result.ollamaModel;
  }
  
  if (result.selectedModel) {
    document.getElementById('model').value = result.selectedModel;
  }
  
  // Load AI behavior settings
  document.getElementById('maxTokens').value = result.maxTokens || 25;
  document.getElementById('temperature').value = result.temperature || 0.3;
  document.getElementById('temperatureValue').textContent = result.temperature || 0.3;
  
  // Load custom prompt or use default
  const customPrompt = result.customPrompt || DEFAULT_PROMPT;
  document.getElementById('customPrompt').value = customPrompt;
  
  // Load user prefix (optional)
  if (result.userPrefix) {
    document.getElementById('userPrefix').value = result.userPrefix;
  }
  
  // Update UI based on provider
  updateProviderUI(apiProvider);
}

// Update UI based on selected provider
function updateProviderUI(provider) {
  const openrouterSettings = document.getElementById('openrouter-settings');
  const medgemmaSettings = document.getElementById('medgemma-settings');
  const vertexSettings = document.getElementById('vertex-settings');
  const ollamaSettings = document.getElementById('ollama-settings');
  const modelSettings = document.getElementById('model-settings');
  
  // Hide all provider-specific settings first
  openrouterSettings.style.display = 'none';
  medgemmaSettings.style.display = 'none';
  vertexSettings.style.display = 'none';
  ollamaSettings.style.display = 'none';
  modelSettings.style.display = 'none';
  
  if (provider === 'medgemma') {
    medgemmaSettings.style.display = 'block';
  } else if (provider === 'medgemma-vertex') {
    vertexSettings.style.display = 'block';
  } else if (provider === 'ollama-local') {
    ollamaSettings.style.display = 'block';
  } else {
    openrouterSettings.style.display = 'block';
    modelSettings.style.display = 'block';
  }
}

// Save settings
async function saveSettings() {
  const apiProvider = document.getElementById('apiProvider').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const medgemmaUrl = document.getElementById('medgemmaUrl').value.trim();
  const vertexEndpoint = document.getElementById('vertexEndpoint').value.trim();
  const vertexToken = document.getElementById('vertexToken').value.trim();
  const ollamaUrl = document.getElementById('ollamaUrl').value.trim();
  const ollamaModel = document.getElementById('ollamaModel').value.trim();
  const model = document.getElementById('model').value;
  const maxTokens = parseInt(document.getElementById('maxTokens').value);
  const temperature = parseFloat(document.getElementById('temperature').value);
  const customPrompt = document.getElementById('customPrompt').value.trim();
  const userPrefix = document.getElementById('userPrefix').value.trim();
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
  } else if (apiProvider === 'medgemma-vertex') {
    if (!vertexEndpoint) {
      showStatus('error', 'Please enter your Vertex AI endpoint URL');
      return;
    }
    
    if (!vertexEndpoint.includes('vertexai.goog')) {
      showStatus('error', 'URL should be a Vertex AI endpoint (e.g., https://...vertexai.goog/v1/projects/.../endpoints/...:predict)');
      return;
    }
    
    if (!vertexToken) {
      showStatus('error', 'Please enter your Vertex AI access token');
      return;
    }
    
    if (!vertexToken.startsWith('ya29.')) {
      showStatus('error', 'Access token should start with "ya29." (Google Cloud access token format)');
      return;
    }
  } else if (apiProvider === 'ollama-local') {
    if (!ollamaUrl) {
      showStatus('error', 'Please enter your Ollama API URL');
      return;
    }
    
    if (!ollamaUrl.startsWith('http://') && !ollamaUrl.startsWith('https://')) {
      showStatus('error', 'Ollama URL must start with http:// or https://');
      return;
    }
    
    if (!ollamaModel) {
      showStatus('error', 'Please enter the Ollama model name');
      return;
    }
  }
  
  // Validate AI behavior settings
  if (maxTokens < 5 || maxTokens > 100) {
    showStatus('error', 'Max tokens must be between 5 and 100');
    return;
  }
  
  if (!customPrompt) {
    showStatus('error', 'Please enter a system prompt');
    return;
  }
  
  // Disable button while saving
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    const settingsToSave = {
      apiProvider: apiProvider,
      selectedModel: model,
      maxTokens: maxTokens,
      temperature: temperature,
      customPrompt: customPrompt,
      userPrefix: userPrefix
    };
    
    if (apiProvider === 'openrouter') {
      settingsToSave.openrouterApiKey = apiKey;
    } else if (apiProvider === 'medgemma') {
      settingsToSave.medgemmaApiUrl = medgemmaUrl;
    } else if (apiProvider === 'medgemma-vertex') {
      settingsToSave.vertexEndpoint = vertexEndpoint;
      settingsToSave.vertexToken = vertexToken;
    } else if (apiProvider === 'ollama-local') {
      settingsToSave.ollamaUrl = ollamaUrl;
      settingsToSave.ollamaModel = ollamaModel;
    }
    
    await chrome.storage.local.set(settingsToSave);
    
    showStatus('success', 'Settings saved successfully!');
    
    // Test the API configuration
    if (apiProvider === 'openrouter') {
      testOpenRouterApi(apiKey, model);
    } else if (apiProvider === 'medgemma') {
      testMedGemmaApi(medgemmaUrl);
    } else if (apiProvider === 'medgemma-vertex') {
      testVertexApi(vertexEndpoint, vertexToken);
    } else if (apiProvider === 'ollama-local') {
      testOllamaApi(ollamaUrl, ollamaModel);
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

// Test Ollama API
async function testOllamaApi(ollamaUrl, model) {
  try {
    showStatus('info', 'Testing Ollama connection...');
    
    // First, test if Ollama is running by checking the API endpoint
    const healthResponse = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!healthResponse.ok) {
      if (healthResponse.status === 403) {
        showStatus('error', `CORS error (403). Enable CORS by setting OLLAMA_ORIGINS=chrome-extension://* and restart Ollama. See setup instructions above.`);
      } else {
        showStatus('error', `Ollama server not responding: ${healthResponse.status}. Make sure Ollama is running.`);
      }
      return;
    }
    
    const tagsData = await healthResponse.json();
    console.log('Ollama available models:', tagsData);
    
    // Check if the specified model is available
    const modelExists = tagsData.models && tagsData.models.some(m => m.name.includes(model));
    
    if (!modelExists) {
      showStatus('error', `Model "${model}" not found. Available models: ${tagsData.models?.map(m => m.name).join(', ') || 'none'}. Run: ollama run hf.co/unsloth/medgemma-4b-it-GGUF`);
      return;
    }
    
    // Test generation with the model
    const testResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        prompt: 'Test',
        stream: false,
        options: {
          num_predict: 5
        }
      })
    });
    
    if (testResponse.ok) {
      const result = await testResponse.json();
      showStatus('success', `Ollama API validated successfully! Model "${model}" is ready. Generated: "${result.response?.trim()?.substring(0, 50) || 'response received'}"`);
    } else {
      const errorText = await testResponse.text();
      if (testResponse.status === 403) {
        showStatus('error', `CORS error (403) during generation. Make sure OLLAMA_ORIGINS=chrome-extension://* is set and Ollama is restarted.`);
      } else {
        showStatus('error', `Ollama generation test failed: ${testResponse.status} - ${errorText}`);
      }
    }
    
  } catch (error) {
    showStatus('error', `Ollama API test failed: ${error.message}. Make sure Ollama is running on ${ollamaUrl}`);
  }
}

// Test Vertex AI API
async function testVertexApi(vertexEndpoint, vertexToken) {
  try {
    const response = await fetch(vertexEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vertexToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [
          {
            "@requestFormat": "chatCompletions",
            messages: [
              {
                role: "system",
                content: "You are a medical assistant. Respond briefly."
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Test"
                  }
                ]
              }
            ],
            max_tokens: 5,
            temperature: 0.3,
            top_p: 1.0,
            top_k: -1
          }
        ]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Vertex AI test response:', result);
      
      if (result.predictions) {
        // Check for the actual response format where predictions is an object with choices
        if (result.predictions.choices && result.predictions.choices.length > 0) {
          showStatus('success', 'Vertex AI API validated successfully! Extension is ready to use.');
        } 
        // Fallback for array format
        else if (Array.isArray(result.predictions) && result.predictions.length > 0) {
          showStatus('success', 'Vertex AI API validated successfully! Extension is ready to use.');
        } 
        else {
          showStatus('error', 'Vertex AI API test failed: No predictions received');
        }
      } else {
        showStatus('error', 'Vertex AI API test failed: No predictions received');
      }
    } else {
      const errorText = await response.text();
      showStatus('error', `Vertex AI API test failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    showStatus('error', `Vertex AI API test failed: ${error.message}. Check if the endpoint URL and token are correct.`);
  }
}

// Save AI Behavior settings only
async function saveBehaviorSettings() {
  const maxTokens = parseInt(document.getElementById('maxTokens').value);
  const temperature = parseFloat(document.getElementById('temperature').value);
  const customPrompt = document.getElementById('customPrompt').value.trim();
  const userPrefix = document.getElementById('userPrefix').value.trim();
  const saveBtn = document.getElementById('saveBehaviorBtn');
  const status = document.getElementById('behaviorStatus');
  
  // Validate AI behavior settings
  if (maxTokens < 5 || maxTokens > 100) {
    showBehaviorStatus('error', 'Max tokens must be between 5 and 100');
    return;
  }
  
  if (!customPrompt) {
    showBehaviorStatus('error', 'Please enter a system prompt');
    return;
  }
  
  // Disable button while saving
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    const settingsToSave = {
      maxTokens: maxTokens,
      temperature: temperature,
      customPrompt: customPrompt,
      userPrefix: userPrefix
    };
    
    await chrome.storage.local.set(settingsToSave);
    
    showBehaviorStatus('success', 'AI Behavior settings saved successfully!');
    
  } catch (error) {
    showBehaviorStatus('error', 'Failed to save AI behavior settings: ' + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save AI Behavior';
  }
}

// Show behavior status message
function showBehaviorStatus(type, message) {
  const status = document.getElementById('behaviorStatus');
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
document.getElementById('saveBehaviorBtn').addEventListener('click', saveBehaviorSettings);

// API provider change
document.getElementById('apiProvider').addEventListener('change', (e) => {
  updateProviderUI(e.target.value);
});

// Temperature slider update
document.getElementById('temperature').addEventListener('input', (e) => {
  document.getElementById('temperatureValue').textContent = e.target.value;
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

document.getElementById('vertexEndpoint').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

document.getElementById('vertexToken').addEventListener('keypress', (e) => {
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

// Show/hide Vertex token
document.getElementById('vertexToken').addEventListener('focus', (e) => {
  e.target.type = 'text';
});

document.getElementById('vertexToken').addEventListener('blur', (e) => {
  e.target.type = 'password';
});

// Ollama URL enter key
document.getElementById('ollamaUrl').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

document.getElementById('ollamaModel').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

// Ollama test button
document.getElementById('testOllama').addEventListener('click', () => {
  const url = document.getElementById('ollamaUrl').value.trim();
  const model = document.getElementById('ollamaModel').value.trim();
  if (url && model) {
    testOllamaApi(url, model);
  } else {
    showStatus('error', 'Please enter both Ollama URL and model name');
  }
});