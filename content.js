let currentElement = null;
let suggestionElement = null;
let isShowingSuggestion = false;
let debounceTimer = null;
let lastProcessedText = '';
let pendingRequest = null;
let isGoogleDocs = false;
let docsObserver = null;

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
  console.log('[MedComplete] Key pressed:', e.key, 'isShowingSuggestion:', isShowingSuggestion);
  
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
  
  // Set new debounce timer
  debounceTimer = setTimeout(() => {
    checkForSuggestion();
  }, 750); // 750ms delay
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
  
  console.log('[MedComplete] Trigger check - punctuation:', endsWithPunctuation, 'words:', words.length, 'chars:', context.length);
  
  // Trigger if:
  // 1. Ends with punctuation, OR
  // 2. Has at least 5 words, OR  
  // 3. Has at least 20 characters (for shorter medical terms)
  if (endsWithPunctuation || words.length >= 5 || context.length >= 20) {
    console.log('[MedComplete] Triggering suggestion request');
    lastProcessedText = context;
    requestSuggestion();
  }
}

// Request suggestion from background script
async function requestSuggestion() {
  const context = getContext();
  if (!context.trim()) return;
  
  console.log('[MedComplete] Requesting suggestion for context:', context);
  
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

// Accept and insert suggestion
function acceptSuggestion() {
  if (!suggestionElement || !currentElement) {
    console.log('[MedComplete] Cannot accept suggestion - missing element');
    return;
  }
  
  const suggestion = suggestionElement.dataset.suggestion || suggestionElement.textContent;
  console.log('[MedComplete] Accepting suggestion:', suggestion, 'into element:', currentElement.tagName, currentElement.className);
  
  // Ensure the element is still focused
  if (document.activeElement !== currentElement) {
    console.log('[MedComplete] Refocusing element before insertion');
    currentElement.focus();
  }
  
  if (currentElement.tagName === 'TEXTAREA' || currentElement.tagName === 'INPUT') {
    const start = currentElement.selectionStart;
    const end = currentElement.selectionEnd;
    const text = currentElement.value;
    
    currentElement.value = text.substring(0, start) + suggestion + text.substring(end);
    currentElement.selectionStart = currentElement.selectionEnd = start + suggestion.length;
    
    // Trigger input event for frameworks
    currentElement.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (currentElement.contentEditable === 'true') {
    // For contenteditable elements (like Gmail), try multiple approaches
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(suggestion));
      range.collapse(false);
    } else {
      // Fallback to execCommand
      document.execCommand('insertText', false, suggestion);
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