// Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'mistralai/mistral-small-3.2-24b-instruct';

// Default prompt template
const DEFAULT_PROMPT = `You are a medical documentation assistant. Continue the following medical text naturally.

IMPORTANT: 
- Only provide what comes AFTER the given text
- Do not rewrite or repeat any part of the existing text
- Do not start with "..." or ".." or any dots
- Just continue from where the text ends naturally`;

// Get API configuration from storage
async function getApiConfig() {
  const result = await chrome.storage.local.get([
    'apiProvider', 
    'openrouterApiKey', 
    'medgemmaApiUrl',
    'vertexEndpoint',
    'vertexToken',
    'selectedModel',
    'maxTokens',
    'temperature',
    'customPrompt',
    'userPrefix'
  ]);
  
  return {
    provider: result.apiProvider || 'openrouter',
    openrouterKey: result.openrouterApiKey,
    medgemmaUrl: result.medgemmaApiUrl,
    vertexEndpoint: result.vertexEndpoint,
    vertexToken: result.vertexToken,
    model: result.selectedModel || DEFAULT_MODEL,
    maxTokens: result.maxTokens || 25,
    temperature: result.temperature || 0.3,
    customPrompt: result.customPrompt || DEFAULT_PROMPT,
    userPrefix: result.userPrefix || ''
  };
}

// Get the user-defined prompt
function getPrompt(config) {
  return config.customPrompt;
}

// Test API configuration on extension load
(async () => {
  const config = await getApiConfig();
  console.log('[MedComplete Background] Extension loaded:', {
    provider: config.provider,
    openrouterKeyPresent: !!config.openrouterKey,
    medgemmaUrlPresent: !!config.medgemmaUrl,
    vertexEndpointPresent: !!config.vertexEndpoint,
    vertexTokenPresent: !!config.vertexToken,
    model: config.model
  });
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[MedComplete Background] Received message:', request);
  
  if (request.action === 'getSuggestion') {
    getSuggestion(request.context)
      .then(suggestion => {
        console.log('[MedComplete Background] Got suggestion from API:', suggestion);
        const response = { suggestion };
        console.log('[MedComplete Background] Sending response back:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('[MedComplete Background] Error in getSuggestion:', error);
        const errorResponse = { error: error.message };
        console.log('[MedComplete Background] Sending error response:', errorResponse);
        sendResponse(errorResponse);
      });
    return true; // Keep the message channel open for async response
  }
});

async function getSuggestion(context) {
  // Get API configuration from storage
  const config = await getApiConfig();
  
  try {
    console.log('[MedComplete Background] Getting suggestion for:', context);
    console.log('[MedComplete Background] Using provider:', config.provider);
    
    // Route to appropriate API
    if (config.provider === 'medgemma') {
      return await getMedGemmaSuggestion(context, config);
    } else if (config.provider === 'medgemma-vertex') {
      return await getVertexSuggestion(context, config);
    } else {
      return await getOpenRouterSuggestion(context, config);
    }
  } catch (error) {
    console.error('[MedComplete Background] Error getting suggestion:', error);
    return getFallbackSuggestion(context);
  }
}

// MedGemma Gradio API implementation
async function getMedGemmaSuggestion(context, config) {
  if (!config.medgemmaUrl) {
    throw new Error('No MedGemma API URL configured. Please set your Gradio URL in the extension settings.');
  }
  
  const baseUrl = config.medgemmaUrl.replace(/\/$/, ''); // Remove trailing slash
  const maxTokens = config.maxTokens;
  const prefixedContext = config.userPrefix ? `${config.userPrefix} ${context}` : context;
  
  try {
    console.log('[MedComplete Background] Calling MedGemma API:', baseUrl);
    
    // Step 1: Initiate prediction
    const predictionResponse = await fetch(`${baseUrl}/gradio_api/call/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: [prefixedContext, maxTokens]
      })
    });
    
    if (!predictionResponse.ok) {
      throw new Error(`MedGemma prediction failed: ${predictionResponse.status} ${predictionResponse.statusText}`);
    }
    
    const predictionResult = await predictionResponse.json();
    const eventId = predictionResult.event_id;
    
    if (!eventId) {
      throw new Error('No event_id received from MedGemma API');
    }
    
    console.log('[MedComplete Background] MedGemma event ID:', eventId);
    
    // Step 2: Get result with timeout
    const resultUrl = `${baseUrl}/gradio_api/call/predict/${eventId}`;
    const maxAttempts = 15; // 15 seconds timeout
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        console.log(`[MedComplete Background] MedGemma attempt ${attempt + 1} - fetching: ${resultUrl}`);
        const resultResponse = await fetch(resultUrl);
        
        console.log('[MedComplete Background] MedGemma result response status:', resultResponse.status);
        
        if (resultResponse.ok) {
          const text = await resultResponse.text();
          console.log('[MedComplete Background] MedGemma raw response:', text);
          
          // Try to parse the entire response first
          try {
            const jsonData = JSON.parse(text);
            console.log('[MedComplete Background] MedGemma parsed JSON:', jsonData);
            
            if (jsonData.data && jsonData.data.length > 0) {
              let completion = jsonData.data[0];
              
              // Clean up MedGemma response
              completion = completion.replace(/^Completion:\s*/i, '');
              completion = completion.replace(/\nGeneration time:.*$/i, '');
              completion = completion.trim();
              
              console.log('[MedComplete Background] MedGemma final completion:', completion);
              return completion;
            }
          } catch (parseError) {
            console.log('[MedComplete Background] Failed to parse as JSON, trying line by line');
          }
          
          // If not JSON, try SSE (Server-Sent Events) parsing
          const lines = text.split('\n');
          console.log('[MedComplete Background] MedGemma lines count:', lines.length);
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            console.log('[MedComplete Background] Processing line:', trimmedLine);
            
            if (trimmedLine.startsWith('data:')) {
              const dataLine = trimmedLine.substring(5).trim(); // Remove 'data:' prefix
              console.log('[MedComplete Background] MedGemma data line:', dataLine);
              
              try {
                // Parse the JSON array directly
                const dataArray = JSON.parse(dataLine);
                console.log('[MedComplete Background] MedGemma parsed array:', dataArray);
                
                if (Array.isArray(dataArray) && dataArray.length > 0) {
                  let completion = dataArray[0];
                  
                  // Clean up MedGemma response
                  completion = completion.replace(/^Completion:\s*/i, '');
                  completion = completion.replace(/\nGeneration time:.*$/i, '');
                  completion = completion.trim();
                  
                  console.log('[MedComplete Background] MedGemma completion found:', completion);
                  console.log('[MedComplete Background] Returning from getMedGemmaSuggestion');
                  return completion;
                }
              } catch (e) {
                console.log('[MedComplete Background] Failed to parse data line:', e.message);
              }
            }
          }
        } else {
          const errorText = await resultResponse.text();
          console.log('[MedComplete Background] MedGemma error response:', errorText);
        }
      } catch (e) {
        console.log('[MedComplete Background] MedGemma attempt', attempt + 1, 'failed:', e.message);
      }
      
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('[MedComplete Background] MedGemma - All attempts exhausted, throwing timeout error');
    throw new Error('MedGemma API timeout - no result received');
    
  } catch (error) {
    console.error('[MedComplete Background] MedGemma API error:', error);
    throw error;
  }
}

// Vertex AI API implementation
async function getVertexSuggestion(context, config) {
  if (!config.vertexEndpoint) {
    throw new Error('No Vertex AI endpoint configured. Please set your endpoint URL in the extension settings.');
  }
  
  if (!config.vertexToken) {
    throw new Error('No Vertex AI access token configured. Please set your access token in the extension settings.');
  }
  
  const prefixedContext = config.userPrefix ? `${config.userPrefix} ${context}` : context;
  const systemPrompt = getPrompt(config);
  
  try {
    console.log('[MedComplete Background] Calling Vertex AI API:', config.vertexEndpoint);
    
    const response = await fetch(config.vertexEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.vertexToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [
          {
            "@requestFormat": "chatCompletions",
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Text: "${prefixedContext}"\n\nContinuation (max ${config.maxTokens} words):`
                  }
                ]
              }
            ],
            max_tokens: Math.min(config.maxTokens * 2, 100),
            temperature: config.temperature,
            top_p: 1.0,
            top_k: -1
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Vertex AI request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[MedComplete Background] Vertex AI response:', data);
    
    if (data.predictions) {
      let completion = '';
      
      // Handle the actual Vertex AI response format where predictions is an object with choices
      if (data.predictions.choices && data.predictions.choices.length > 0) {
        const choice = data.predictions.choices[0];
        if (choice.message && choice.message.content) {
          completion = choice.message.content;
        }
      } 
      // Fallback: Handle array format if it exists
      else if (Array.isArray(data.predictions) && data.predictions.length > 0) {
        const prediction = data.predictions[0];
        
        if (prediction.candidates && prediction.candidates.length > 0) {
          const candidate = prediction.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            completion = candidate.content.parts[0].text;
          }
        } else if (prediction.choices && prediction.choices.length > 0) {
          const choice = prediction.choices[0];
          if (choice.message && choice.message.content) {
            completion = choice.message.content;
          }
        } else if (typeof prediction === 'string') {
          completion = prediction;
        }
      }
      
      console.log('[MedComplete Background] Raw Vertex completion:', completion);
      
      // Clean up the completion
      completion = completion.trim();
      completion = completion.replace(/^[\"']|[\"']$/g, ''); // Remove quotes
      completion = completion.replace(/^Continuation:\\s*/i, ''); // Remove "Continuation:" prefix
      completion = completion.replace(/^Completion:\\s*/i, ''); // Remove "Completion:" prefix
      completion = completion.replace(/^\\.{2,}\\s*/, ''); // Remove leading dots (2 or more)
      completion = completion.replace(/^\\.\\s*/, ''); // Remove single leading dot
      
      // Ensure it starts with a space if needed
      if (completion && !completion.startsWith(' ') && !context.endsWith(' ')) {
        completion = ' ' + completion;
      }
      
      console.log('[MedComplete Background] Final Vertex completion:', completion);
      return completion;
    }
    
    throw new Error('Invalid Vertex AI response format - no predictions found');
    
  } catch (error) {
    console.error('[MedComplete Background] Vertex AI error:', error);
    throw error;
  }
}

// OpenRouter API implementation (existing logic)
async function getOpenRouterSuggestion(context, config) {
  if (!config.openrouterKey) {
    throw new Error('No OpenRouter API key configured. Please set your API key in the extension settings.');
  }
  
  // Log API key validation
  console.log('[MedComplete Background] API Key validation:', {
    exists: !!config.openrouterKey,
    length: config.openrouterKey.length,
    format: config.openrouterKey.startsWith('sk-or-v1-'),
    firstChars: config.openrouterKey.substring(0, 15),
    lastChars: config.openrouterKey.substring(config.openrouterKey.length - 10)
  });
  
  // Get the appropriate prompt and create completion request
  const systemPrompt = getPrompt(config);
  const prefixedContext = config.userPrefix ? `${config.userPrefix} ${context}` : context;
  const userPrompt = `${systemPrompt}

Text: "${prefixedContext}"

Continuation (max ${config.maxTokens} words):`;

  const requestBody = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: config.temperature,
    max_tokens: Math.min(config.maxTokens * 2, 100) // Estimate tokens as ~2x words
  };
  
  const requestDetails = {
    url: OPENROUTER_API_URL,
    model: config.model,
    prompt: prompt,
    requestBody: requestBody,
    headers: {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://medcomplete',
      'X-Title': 'MedComplete Extension',
      'Authorization': `Bearer ${config.openrouterKey.substring(0, 20)}...` // Only show first 20 chars
    }
  };
  console.log('[MedComplete Background] Sending OpenRouter API request:', JSON.stringify(requestDetails, null, 2));
  
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openrouterKey}`,
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
      apiUrl: OPENROUTER_API_URL,
      model: config.model
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
        keyExists: !!config.openrouterKey,
        keyLength: config.openrouterKey ? config.openrouterKey.length : 0,
        keyPrefix: config.openrouterKey ? config.openrouterKey.substring(0, 10) : 'none',
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
    
    // Re-throw error to be caught by main getSuggestion function
    throw error;
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