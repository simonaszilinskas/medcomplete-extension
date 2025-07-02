// Configuration
const OPENROUTER_API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemma-3n-e4b-it';

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
  try {
    console.log('[MedComplete Background] Getting suggestion for:', context);
    
    // Create a medical-focused prompt for completion
    const prompt = `You are a medical documentation assistant. Continue the following medical text naturally. 

IMPORTANT: Only provide what comes AFTER the given text. Do not rewrite or repeat any part of the existing text. Just continue from where it ends.

Text: "${context}"

Continuation (max 15 words):`;

    const requestBody = {
      model: MODEL,
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
      model: MODEL,
      prompt: prompt,
      requestBody: requestBody,
      headers: {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://medcomplete',
        'X-Title': 'MedComplete Extension',
        'Authorization': `Bearer ${OPENROUTER_API_KEY.substring(0, 20)}...` // Only show first 20 chars
      }
    };
    console.log('[MedComplete Background] Sending API request:', JSON.stringify(requestDetails, null, 2));
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'chrome-extension://medcomplete',
        'X-Title': 'MedComplete Extension'
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
      model: MODEL
    };
    console.error('[MedComplete Background] Comprehensive error details:', JSON.stringify(errorDetails, null, 2));
    
    // Log network-related errors specifically
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[MedComplete Background] Network error - check internet connection and API endpoint');
    }
    
    // Log authentication errors
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('[MedComplete Background] Authentication error - check API key validity');
      console.error('[MedComplete Background] API Key format check:', {
        keyExists: !!OPENROUTER_API_KEY,
        keyLength: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.length : 0,
        keyPrefix: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.substring(0, 10) : 'none',
        expectedFormat: 'sk-or-v1-...'
      });
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