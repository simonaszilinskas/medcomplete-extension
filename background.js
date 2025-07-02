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

    console.log('[MedComplete Background] Sending API request...');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'chrome-extension://medcomplete',
        'X-Title': 'MedComplete Extension'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
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
    
    throw new Error('Invalid API response format');
    
  } catch (error) {
    console.error('Error getting suggestion:', error);
    
    // Fallback to simple completions on error
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