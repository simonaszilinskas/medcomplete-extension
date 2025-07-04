let currentElement = null;
let suggestionElement = null;
let isShowingSuggestion = false;
let debounceTimer = null;
let lastProcessedText = '';
let pendingRequest = null;
let isGoogleDocs = false;
let docsObserver = null;

// Suggestion caching for performance
let suggestionCache = new Map();
const CACHE_MAX_SIZE = 20;
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Detect all editable elements
function findEditableElements() {
  const selectors = [
    'textarea',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input:not([type])',
    '[contenteditable="true"]',
    '[contenteditable=""]'
  ];
  
  // Add Gmail-specific selectors
  if (window.location.hostname.includes('mail.google.com')) {
    selectors.push(
      '[contenteditable="true"][aria-label*="Message Body"]',
      '[role="textbox"]',
      '.Am.Al.editable'
    );
  }
  
  // Check if we're on Google Docs
  if (window.location.hostname === 'docs.google.com') {
    console.log('[MedComplete] Detected Google Docs - adding special handling');
    // Google Docs uses a hidden iframe with contenteditable
    const docsCanvas = document.querySelector('.kix-appview-editor');
    if (docsCanvas) {
      console.log('[MedComplete] Found Google Docs editor canvas');
      selectors.push('.kix-page-content-wrapper');
    }
  }
  
  const elements = document.querySelectorAll(selectors.join(', '));
  console.log('[MedComplete] Found editable elements:', elements.length);
  return elements;
}

// Add event listeners to editable elements
function attachListeners() {
  const editables = findEditableElements();
  
  editables.forEach(element => {
    if (!element.hasAttribute('data-medcomplete-attached')) {
      element.setAttribute('data-medcomplete-attached', 'true');
      
      element.addEventListener('keydown', handleKeyDown, true); // Use capture mode
      element.addEventListener('focus', handleFocus);
      element.addEventListener('blur', handleBlur);
    }
  });
}

// Handle focus events
function handleFocus(e) {
  currentElement = e.target;
}

// Handle blur events
function handleBlur(e) {
  if (currentElement === e.target) {
    currentElement = null;
    hideSuggestion();
  }
}

// Handle keydown events
function handleKeyDown(e) {
  console.log('[MedComplete] Key pressed:', e.key, 'Ctrl:', e.ctrlKey, 'isShowingSuggestion:', isShowingSuggestion);
  
  // Ctrl+Space for instant proactive suggestion
  if (e.key === ' ' && e.ctrlKey && currentElement) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log('[MedComplete] Ctrl+Space pressed - requesting instant suggestion');
    requestInstantSuggestion();
    return;
  }
  
  // Tab for suggestions - but ONLY when suggestion is available
  if (e.key === 'Tab' && !e.shiftKey && currentElement && isShowingSuggestion && suggestionElement) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log('[MedComplete] Tab pressed with suggestion available - accepting immediately');
    acceptSuggestion();
  } else if (e.key === 'Escape' && isShowingSuggestion) {
    console.log('[MedComplete] Escape pressed - hiding suggestion');
    hideSuggestion();
  } else {
    // Handle proactive suggestions on typing
    // Note: Tab without suggestion will work normally for form navigation
    handleTyping();
  }
}

// Get text context from current element
function getContext() {
  if (isGoogleDocs) {
    return getGoogleDocsContext();
  }
  
  if (!currentElement) return '';
  
  let text = '';
  let cursorPosition = 0;
  
  if (currentElement.tagName === 'TEXTAREA' || currentElement.tagName === 'INPUT') {
    text = currentElement.value;
    cursorPosition = currentElement.selectionStart;
  } else if (currentElement.contentEditable === 'true') {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    if (textNode.nodeType === Node.TEXT_NODE) {
      text = textNode.textContent;
      cursorPosition = range.startOffset;
    }
  }
  
  // Get text before cursor (last 100 characters for context)
  const contextStart = Math.max(0, cursorPosition - 100);
  return text.substring(contextStart, cursorPosition);
}

// Handle typing for proactive suggestions
function handleTyping() {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  // Cancel any pending request
  if (pendingRequest) {
    pendingRequest = null;
  }
  
  // Hide current suggestion since user is typing
  hideSuggestion();
  
  // Set new debounce timer - reduced for faster response
  debounceTimer = setTimeout(() => {
    checkForSuggestion();
  }, 400); // 400ms delay (reduced from 750ms)
}

// Request instant suggestion (triggered by Ctrl+Space)
function requestInstantSuggestion() {
  const context = getContext();
  console.log('[MedComplete] Instant suggestion requested, context:', context);
  
  if (!context.trim()) {
    console.log('[MedComplete] No context for instant suggestion');
    return;
  }
  
  // Cancel any pending automatic request
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  if (pendingRequest) {
    pendingRequest = null;
  }
  
  hideSuggestion();
  lastProcessedText = context;
  requestSuggestion();
}

// Check if we should request a suggestion
function checkForSuggestion() {
  const context = getContext();
  console.log('[MedComplete] Checking for suggestion, context:', context);
  
  if (!context.trim()) return;
  
  // Don't request if text hasn't changed
  if (context === lastProcessedText) {
    console.log('[MedComplete] Context unchanged, skipping');
    return;
  }
  
  // Check triggers
  const words = context.trim().split(/\s+/);
  const lastChar = context.slice(-1);
  const endsWithPunctuation = ['.', ':', ',', ';'].includes(lastChar);
  
  // Check for medical keywords to be more proactive
  const medicalKeywords = ['patient', 'diagnosis', 'treatment', 'symptom', 'medication', 'history', 'exam', 'assessment', 'plan', 'follow'];
  const containsMedicalKeyword = medicalKeywords.some(keyword => 
    context.toLowerCase().includes(keyword)
  );
  
  console.log('[MedComplete] Trigger check - punctuation:', endsWithPunctuation, 'words:', words.length, 'chars:', context.length, 'medical:', containsMedicalKeyword);
  
  // More aggressive triggers for faster suggestions:
  // 1. Ends with punctuation, OR
  // 2. Has at least 3 words (reduced from 5), OR  
  // 3. Has at least 15 characters (reduced from 20), OR
  // 4. Contains medical keywords and has at least 2 words
  if (endsWithPunctuation || 
      words.length >= 3 || 
      context.length >= 15 || 
      (containsMedicalKeyword && words.length >= 2)) {
    console.log('[MedComplete] Triggering suggestion request');
    lastProcessedText = context;
    requestSuggestion();
  }
}

// Helper function to manage suggestion cache
function getCachedSuggestion(context) {
  // Create cache key from last 50 characters for better matching
  const cacheKey = context.slice(-50).toLowerCase().trim();
  const cached = suggestionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    console.log('[MedComplete] Using cached suggestion for:', cacheKey);
    return cached.suggestion;
  }
  
  return null;
}

function cacheSuggestion(context, suggestion) {
  const cacheKey = context.slice(-50).toLowerCase().trim();
  
  // Clean up old entries if cache is full
  if (suggestionCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = suggestionCache.keys().next().value;
    suggestionCache.delete(oldestKey);
  }
  
  suggestionCache.set(cacheKey, {
    suggestion: suggestion,
    timestamp: Date.now()
  });
  
  console.log('[MedComplete] Cached suggestion for:', cacheKey);
}

// Request suggestion from background script
async function requestSuggestion() {
  const context = getContext();
  if (!context.trim()) return;
  
  console.log('[MedComplete] Requesting suggestion for context:', context);
  
  // Check cache first
  const cachedSuggestion = getCachedSuggestion(context);
  if (cachedSuggestion) {
    showSuggestion(cachedSuggestion);
    showProactiveIndicator();
    return;
  }
  
  try {
    // Store this as pending request
    pendingRequest = chrome.runtime.sendMessage({
      action: 'getSuggestion',
      context: context
    });
    
    const response = await pendingRequest;
    console.log('[MedComplete] Received response:', response);
    
    // Only show if this is still the pending request (not cancelled)
    if (pendingRequest && response.suggestion) {
      console.log('[MedComplete] Showing suggestion:', response.suggestion);
      
      // Cache the suggestion
      cacheSuggestion(context, response.suggestion);
      
      showSuggestion(response.suggestion);
      showProactiveIndicator();
    } else if (response.error) {
      console.error('[MedComplete] Error from background:', response.error);
    }
  } catch (error) {
    console.error('[MedComplete] Error getting suggestion:', error);
  } finally {
    pendingRequest = null;
  }
}

// Show suggestion overlay
function showSuggestion(suggestion) {
  if (!currentElement) return;
  
  // Create suggestion element if it doesn't exist
  if (!suggestionElement) {
    suggestionElement = document.createElement('div');
    suggestionElement.className = 'medcomplete-suggestion';
    document.body.appendChild(suggestionElement);
  }
  
  // Store suggestion in data attribute
  suggestionElement.dataset.suggestion = suggestion;
  
  // Don't display full suggestion yet in proactive mode
  isShowingSuggestion = true;
}

// Show proactive indicator
function showProactiveIndicator() {
  if (!suggestionElement) return;
  if (!isGoogleDocs && !currentElement) return;
  
  console.log('[MedComplete] Showing proactive indicator');
  
  let x, y;
  
  if (isGoogleDocs) {
    // For Google Docs, position near the document
    const docsContainer = document.querySelector('.kix-appview-editor');
    if (docsContainer) {
      const rect = docsContainer.getBoundingClientRect();
      x = rect.right - 200;
      y = rect.top + 100;
    } else {
      x = window.innerWidth - 200;
      y = 100;
    }
  } else {
    // Position indicator near cursor for regular elements
    const rect = currentElement.getBoundingClientRect();
    const selection = window.getSelection();
    x = rect.left;
    y = rect.top;
    
    if (currentElement.tagName === 'TEXTAREA' || currentElement.tagName === 'INPUT') {
      // For input/textarea, position at the end of current text
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const style = window.getComputedStyle(currentElement);
      context.font = style.font;
      
      const textWidth = context.measureText(currentElement.value).width;
      x += Math.min(textWidth + 5, rect.width - 200);
      y += rect.height / 2;
    } else if (selection.rangeCount > 0) {
      // For contenteditable, use selection position
      const range = selection.getRangeAt(0);
      const rangeRect = range.getBoundingClientRect();
      x = rangeRect.right;
      y = rangeRect.bottom;
    }
  }
  
  // Show full suggestion by default
  suggestionElement.className = 'medcomplete-suggestion';
  suggestionElement.textContent = suggestionElement.dataset.suggestion || 'Suggestion available';
  suggestionElement.style.left = x + 'px';
  suggestionElement.style.top = y + 'px';
  suggestionElement.style.display = 'block';
}


// Hide suggestion
function hideSuggestion() {
  if (suggestionElement) {
    suggestionElement.style.display = 'none';
  }
  isShowingSuggestion = false;
  lastProcessedText = ''; // Reset so we can suggest again
}

// Helper function to get cursor position in contenteditable elements
function getContentEditableCursorPosition(element, range) {
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

// Smart suggestion processing - handles spacing, periods, and text overlap
function processSuggestion(rawSuggestion, currentText, cursorPosition) {
  console.log('[MedComplete] Processing suggestion:', rawSuggestion);
  console.log('[MedComplete] Current text context:', currentText.substring(Math.max(0, cursorPosition - 50), cursorPosition + 50));
  
  let suggestion = rawSuggestion;
  
  // Get text before and after cursor
  const beforeCursor = currentText.substring(0, cursorPosition);
  const afterCursor = currentText.substring(cursorPosition);
  
  // Remove leading space if previous character is already a space or punctuation
  if (suggestion.startsWith(' ')) {
    const lastChar = beforeCursor.slice(-1);
    if (lastChar === ' ' || lastChar === '' || /[.,:;!?]/.test(lastChar)) {
      suggestion = suggestion.substring(1);
      console.log('[MedComplete] Removed unnecessary leading space');
    }
  }
  
  // Remove leading "..." if not needed
  if (suggestion.startsWith('...')) {
    const lastChars = beforeCursor.slice(-3);
    if (lastChars === '...' || beforeCursor.trim() === '') {
      suggestion = suggestion.substring(3);
      console.log('[MedComplete] Removed unnecessary leading ellipsis');
    }
  }
  
  // Handle text overlap - find the longest overlap between end of current text and start of suggestion
  const wordsBeforeCursor = beforeCursor.trim().split(/\s+/).filter(word => word.length > 0).slice(-10); // Last 10 words
  let maxOverlap = 0;
  let overlapIndex = 0;
  
  // Try to find overlap starting from suggestion beginning
  for (let i = 1; i <= Math.min(wordsBeforeCursor.length, 8); i++) {
    const endWords = wordsBeforeCursor.slice(-i).join(' ').toLowerCase().trim();
    const suggestionStart = suggestion.toLowerCase().trim();
    
    if (endWords.length > 2 && suggestionStart.startsWith(endWords)) {
      if (endWords.length > maxOverlap) {
        maxOverlap = endWords.length;
        overlapIndex = i;
      }
    }
  }
  
  // Also check for partial word overlap (common with medical terms)
  if (maxOverlap === 0 && wordsBeforeCursor.length > 0) {
    const lastWord = wordsBeforeCursor[wordsBeforeCursor.length - 1].toLowerCase();
    const suggestionLower = suggestion.toLowerCase().trim();
    
    // Check if suggestion starts with a word that partially matches the last word
    const suggestionWords = suggestionLower.split(/\s+/);
    if (suggestionWords.length > 0) {
      const firstSuggestionWord = suggestionWords[0];
      
      // If last word is a prefix of first suggestion word, remove the overlap
      if (firstSuggestionWord.length > lastWord.length && 
          firstSuggestionWord.startsWith(lastWord) && 
          lastWord.length > 2) {
        const remainingPart = firstSuggestionWord.substring(lastWord.length);
        suggestion = remainingPart + suggestion.substring(firstSuggestionWord.length);
        console.log('[MedComplete] Merged partial word overlap:', lastWord, '->', firstSuggestionWord);
      }
    }
  }
  
  // If we found complete word overlap, remove the duplicated part from suggestion
  if (maxOverlap > 0) {
    const overlapWords = wordsBeforeCursor.slice(-overlapIndex);
    const overlapText = overlapWords.join(' ');
    
    // Find the exact overlap and remove it from suggestion
    const suggestionLower = suggestion.toLowerCase();
    const overlapLower = overlapText.toLowerCase();
    
    if (suggestionLower.startsWith(overlapLower)) {
      suggestion = suggestion.substring(overlapText.length);
      // Remove leading space if any
      if (suggestion.startsWith(' ')) {
        suggestion = suggestion.substring(1);
      }
      console.log('[MedComplete] Removed overlapping text:', overlapText);
    }
  }
  
  // Ensure proper spacing if suggestion doesn't start with punctuation
  if (suggestion && !suggestion.startsWith(' ') && !/^[.,:;!?]/.test(suggestion)) {
    const lastChar = beforeCursor.slice(-1);
    if (lastChar && lastChar !== ' ' && !/[.,:;!?]/.test(lastChar)) {
      suggestion = ' ' + suggestion;
      console.log('[MedComplete] Added necessary space before suggestion');
    }
  }
  
  // Clean up multiple spaces
  suggestion = suggestion.replace(/\s{2,}/g, ' ');
  
  // Handle case where suggestion might be empty after processing
  if (!suggestion.trim()) {
    console.log('[MedComplete] Suggestion became empty after processing, using original');
    return rawSuggestion;
  }
  
  console.log('[MedComplete] Processed suggestion:', suggestion);
  return suggestion;
}

// Accept and insert suggestion
function acceptSuggestion() {
  if (!suggestionElement || !currentElement) {
    console.log('[MedComplete] Cannot accept suggestion - missing element');
    return;
  }
  
  const rawSuggestion = suggestionElement.dataset.suggestion || suggestionElement.textContent;
  console.log('[MedComplete] Raw suggestion:', rawSuggestion, 'into element:', currentElement.tagName, currentElement.className);
  
  // Ensure the element is still focused
  if (document.activeElement !== currentElement) {
    console.log('[MedComplete] Refocusing element before insertion');
    currentElement.focus();
  }
  
  let processedSuggestion;
  let cursorPosition;
  let fullText;
  
  if (currentElement.tagName === 'TEXTAREA' || currentElement.tagName === 'INPUT') {
    cursorPosition = currentElement.selectionStart;
    fullText = currentElement.value;
    processedSuggestion = processSuggestion(rawSuggestion, fullText, cursorPosition);
    
    const start = currentElement.selectionStart;
    const end = currentElement.selectionEnd;
    
    currentElement.value = fullText.substring(0, start) + processedSuggestion + fullText.substring(end);
    currentElement.selectionStart = currentElement.selectionEnd = start + processedSuggestion.length;
    
    // Trigger input event for frameworks
    currentElement.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (currentElement.contentEditable === 'true') {
    // For contenteditable elements (like Gmail), get text and cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Get full text and cursor position for processing
      fullText = currentElement.textContent || '';
      cursorPosition = getContentEditableCursorPosition(currentElement, range);
      processedSuggestion = processSuggestion(rawSuggestion, fullText, cursorPosition);
      
      range.deleteContents();
      range.insertNode(document.createTextNode(processedSuggestion));
      range.collapse(false);
    } else {
      // Fallback - just use raw suggestion with execCommand
      processedSuggestion = rawSuggestion;
      document.execCommand('insertText', false, processedSuggestion);
    }
    
    // Trigger input event for Gmail
    currentElement.dispatchEvent(new Event('input', { bubbles: true }));
    currentElement.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  hideSuggestion();
  console.log('[MedComplete] Suggestion accepted successfully');
}

// Monitor DOM changes for dynamic content
const observer = new MutationObserver(() => {
  attachListeners();
});

// Initialize
function init() {
  console.log('[MedComplete] Initializing extension...');
  
  // Skip Google Docs for now
  if (window.location.hostname === 'docs.google.com') {
    console.log('[MedComplete] Google Docs detected - not supported yet');
    return;
  }
  
  attachListeners();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable']
  });
  console.log('[MedComplete] Extension initialized');
}

// Initialize Google Docs specific handling
function initGoogleDocs() {
  console.log('[MedComplete] Initializing Google Docs support...');
  
  // Wait for the editor to load
  const waitForEditor = () => {
    const editor = document.querySelector('.kix-appview-editor');
    if (editor) {
      console.log('[MedComplete] Google Docs editor found');
      setupGoogleDocsListeners();
    } else {
      console.log('[MedComplete] Waiting for Google Docs editor...');
      setTimeout(waitForEditor, 1000);
    }
  };
  
  waitForEditor();
}

// Set up Google Docs event listeners
function setupGoogleDocsListeners() {
  // Listen for keyboard events on the document
  document.addEventListener('keydown', handleGoogleDocsKeyDown, true);
  
  // Monitor document changes
  docsObserver = new MutationObserver((mutations) => {
    handleGoogleDocsTextChange();
  });
  
  const appView = document.querySelector('.kix-appview-editor');
  if (appView) {
    docsObserver.observe(appView, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  console.log('[MedComplete] Google Docs listeners set up');
}

// Handle Google Docs keyboard events
function handleGoogleDocsKeyDown(e) {
  console.log('[MedComplete] Google Docs key:', e.key, 'isShowingSuggestion:', isShowingSuggestion);
  
  // Tab for suggestions in Google Docs - only when suggestion is available
  if (e.key === 'Tab' && !e.shiftKey && isShowingSuggestion) {
    e.preventDefault();
    e.stopPropagation();
    console.log('[MedComplete] Google Docs - accepting suggestion immediately');
    acceptGoogleDocsSuggestion();
  } else if (e.key === 'Escape' && isShowingSuggestion) {
    hideSuggestion();
  } else {
    // Handle typing for proactive suggestions
    handleTyping();
  }
}

// Handle text changes in Google Docs
function handleGoogleDocsTextChange() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  hideSuggestion();
  
  debounceTimer = setTimeout(() => {
    checkGoogleDocsForSuggestion();
  }, 750);
}

// Check Google Docs for suggestion triggers
function checkGoogleDocsForSuggestion() {
  const context = getGoogleDocsContext();
  console.log('[MedComplete] Google Docs context:', context);
  
  if (!context.trim() || context === lastProcessedText) return;
  
  const words = context.trim().split(/\s+/);
  const lastChar = context.slice(-1);
  const endsWithPunctuation = ['.', ':', ',', ';'].includes(lastChar);
  
  if (endsWithPunctuation || words.length >= 5 || context.length >= 20) {
    console.log('[MedComplete] Google Docs - triggering suggestion');
    lastProcessedText = context;
    requestSuggestion();
  }
}

// Get text context from Google Docs
function getGoogleDocsContext() {
  // Try multiple approaches to get text content
  let context = '';
  
  // Method 1: Get text from current lines
  const lines = document.querySelectorAll('.kix-lineview');
  if (lines.length > 0) {
    // Get text from the last few lines (up to 100 characters)
    for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
      const lineText = lines[i].textContent || '';
      context += lineText + ' ';
    }
  }
  
  // Method 2: Try getting text from cursor position if available
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (range.startContainer && range.startContainer.textContent) {
      const fullText = range.startContainer.textContent;
      const cursorPos = range.startOffset;
      const beforeCursor = fullText.substring(Math.max(0, cursorPos - 100), cursorPos);
      if (beforeCursor.length > context.length) {
        context = beforeCursor;
      }
    }
  }
  
  // Method 3: Fallback to document body text (last resort)
  if (!context.trim()) {
    const docsContent = document.querySelector('.kix-page-content-wrapper');
    if (docsContent) {
      const text = docsContent.textContent || '';
      context = text.slice(-100);
    }
  }
  
  // Return last 100 characters, trimmed
  return context.slice(-100).trim();
}

// Accept suggestion in Google Docs using clipboard
async function acceptGoogleDocsSuggestion() {
  if (!suggestionElement) return;
  
  const suggestion = suggestionElement.dataset.suggestion || suggestionElement.textContent;
  console.log('[MedComplete] Google Docs - inserting via clipboard:', suggestion);
  
  try {
    // Copy suggestion to clipboard
    await navigator.clipboard.writeText(suggestion);
    
    // Try direct paste command first
    const pasteSuccess = document.execCommand('paste');
    console.log('[MedComplete] execCommand paste result:', pasteSuccess);
    
    if (!pasteSuccess) {
      // Try creating a proper ClipboardEvent with data
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', suggestion);
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true
      });
      
      // Dispatch to focused element and document
      const activeElement = document.activeElement;
      if (activeElement) {
        activeElement.dispatchEvent(pasteEvent);
      }
      document.dispatchEvent(pasteEvent);
      
      // Also try simulating Ctrl+V
      const keyDownEvent = new KeyboardEvent('keydown', {
        key: 'v',
        code: 'KeyV',
        ctrlKey: true,
        bubbles: true
      });
      
      const keyUpEvent = new KeyboardEvent('keyup', {
        key: 'v',
        code: 'KeyV',
        ctrlKey: true,
        bubbles: true
      });
      
      document.dispatchEvent(keyDownEvent);
      document.dispatchEvent(keyUpEvent);
    }
    
    hideSuggestion();
    
    // Show success message with fallback instruction
    showGoogleDocsMessage(
      'Suggestion ready! If text didn\'t appear automatically, press Ctrl+V to paste.',
      'success'
    );
    
  } catch (error) {
    console.error('[MedComplete] Failed to insert text in Google Docs:', error);
    
    // Fallback: show instruction to user
    showGoogleDocsMessage(
      `Text copied to clipboard: "${suggestion}". Press Ctrl+V to paste.`, 
      'info'
    );
  }
}

// Show message to user in Google Docs
function showGoogleDocsMessage(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `medcomplete-google-docs-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}


// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}