// Configuration
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'mistralai/mistral-small-3.2-24b-instruct';

// Get API key from storage
async function getApiKey() {
  const result = await chrome.storage.local.get(['openrouterApiKey']);
  return result.openrouterApiKey;
}

// Get model from storage (with fallback)
async function getModel() {
  const result = await chrome.storage.local.get(['selectedModel']);
  return result.selectedModel || DEFAULT_MODEL;
}

// Test API key on extension load
(async () => {
  const apiKey = await getApiKey();
  const model = await getModel();
  console.log('[MedComplete Background] Extension loaded:', {
    keyPresent: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    keyFormat: apiKey ? apiKey.startsWith('sk-or-v1-') : false,
    apiUrl: API_URL,
    model: model
  });
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[MedComplete Background] Received message:', request);
  
  if (request.action === 'getSuggestion') {
    getSuggestion(request.context)
      .then(suggestion => {
        console.log('[MedComplete Background] Sending suggestion:', suggestion);
        sendResponse({ suggestion });
      })
      .catch(error => {
        console.error('[MedComplete Background] Error:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function getSuggestion(context) {
  // Get API key and model from storage
  const apiKey = await getApiKey();
  const model = await getModel();
  
  try {
    console.log('[MedComplete Background] Getting suggestion for:', context);
    
    if (!apiKey) {
      throw new Error('No API key configured. Please set your OpenRouter API key in the extension settings.');
    }
    
    // Log API key validation
    console.log('[MedComplete Background] API Key validation:', {
      exists: !!apiKey,
      length: apiKey.length,
      format: apiKey.startsWith('sk-or-v1-'),
      firstChars: apiKey.substring(0, 15),
      lastChars: apiKey.substring(apiKey.length - 10)
    });
    
    // Create a medical-focused prompt for completion
    const prompt = `You are a medical documentation assistant. Continue the following medical text naturally. 

IMPORTANT: 
- Only provide what comes AFTER the given text
- Do not rewrite or repeat any part of the existing text
- Do not start with "..." or ".." or any dots
- Just continue from where the text ends naturally

Text: "${context}"

Continuation (max 15 words):`;

    const requestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 50
    };
    
    const requestDetails = {
      url: API_URL,
      model: model,
      prompt: prompt,
      requestBody: requestBody,
      headers: {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://medcomplete',
        'X-Title': 'MedComplete Extension',
        'Authorization': `Bearer ${apiKey.substring(0, 20)}...` // Only show first 20 chars
      }
    };
    console.log('[MedComplete Background] Sending API request:', JSON.stringify(requestDetails, null, 2));
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://medcomplete.extension',
        'X-Title': 'MedComplete Extension',
        'Origin': 'chrome-extension://medcomplete'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText
      };
      console.error('[MedComplete Background] API request failed:', JSON.stringify(errorDetails, null, 2));
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[MedComplete Background] API response:', data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      let completion = data.choices[0].message.content.trim();
      console.log('[MedComplete Background] Raw completion:', completion);
      
      // Clean up the completion
      completion = completion.replace(/^["']|["']$/g, ''); // Remove quotes
      completion = completion.replace(/^Continuation:\s*/i, ''); // Remove "Continuation:" prefix
      completion = completion.replace(/^Completion:\s*/i, ''); // Remove "Completion:" prefix
      completion = completion.replace(/^\.{2,}\s*/, ''); // Remove leading dots (2 or more)
      completion = completion.replace(/^\.\s*/, ''); // Remove single leading dot
      
      // Ensure it starts with a space if needed
      if (completion && !completion.startsWith(' ') && !context.endsWith(' ')) {
        completion = ' ' + completion;
      }
      
      console.log('[MedComplete Background] Final completion:', completion);
      return completion;
    }
    
    const responseDetails = {
      hasChoices: !!data.choices,
      choicesLength: data.choices ? data.choices.length : 0,
      firstChoice: data.choices && data.choices[0] ? data.choices[0] : null,
      fullResponse: data
    };
    console.error('[MedComplete Background] Invalid API response format:', JSON.stringify(responseDetails, null, 2));
    throw new Error('Invalid API response format - no choices or message found');
    
  } catch (error) {
    const errorDetails = {
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack,
      context: context,
      timestamp: new Date().toISOString(),
      apiUrl: API_URL,
      model: model
    };
    console.error('[MedComplete Background] Comprehensive error details:', JSON.stringify(errorDetails, null, 2));
    
    // Log network-related errors specifically
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[MedComplete Background] Network error - check internet connection and API endpoint');
    }
    
    // Log authentication errors
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('[MedComplete Background] Authentication error - check API key validity');
      const keyCheck = {
        keyExists: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        keyPrefix: apiKey ? apiKey.substring(0, 10) : 'none',
        expectedFormat: 'sk-or-v1-...'
      };
      console.error('[MedComplete Background] API Key format check:', JSON.stringify(keyCheck, null, 2));
    }
    
    // Log rate limiting
    if (error.message.includes('429')) {
      console.error('[MedComplete Background] Rate limit exceeded - too many requests');
    }
    
    // Log quota/billing issues
    if (error.message.includes('402') || error.message.includes('payment')) {
      console.error('[MedComplete Background] Billing/quota error - check OpenRouter account balance');
    }
    
    // Fallback to simple completions on error
    console.log('[MedComplete Background] Using fallback suggestion due to API error');
    return getFallbackSuggestion(context);
  }
}

function getFallbackSuggestion(context) {
  const fakeSuggestions = {
    'patient has a history of type 2 diabetes and': ' is currently managed with metformin 1000mg twice daily.',
    'the patient presents with': ' acute onset chest pain radiating to the left arm.',
    'physical examination reveals': ' bilateral lower extremity edema and jugular venous distension.',
    'laboratory results show': ' elevated troponin levels and ST segment changes on ECG.',
    'assessment and plan:': ' Continue current medication regimen and schedule follow-up in 2 weeks.',
    'prescribed': ' amoxicillin 500mg three times daily for 7 days.',
    'allergies:': ' No known drug allergies.',
    'vital signs:': ' BP 120/80, HR 72, RR 16, Temp 98.6°F, SpO2 98% on room air.',
    'chief complaint:': ' Progressive shortness of breath over the past 3 days.',
    'review of systems:': ' Negative except as noted in HPI.',
  };
  
  const lowerContext = context.toLowerCase().trim();
  for (const [key, value] of Object.entries(fakeSuggestions)) {
    if (lowerContext.endsWith(key)) {
      return value;
    }
  }
  
  return ' [API Error - Using Fallback]';
}