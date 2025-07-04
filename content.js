let currentElement = null;
let suggestionElement = null;
let isShowingSuggestion = false;
let isShowingPreview = false;
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
      
      element.addEventListener('keydown', handleKeyDown);
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
  console.log('[MedComplete] Key pressed:', e.key, 'ctrl:', e.ctrlKey, 'isShowingSuggestion:', isShowingSuggestion, 'isShowingPreview:', isShowingPreview);
  
  // Ctrl+Space for suggestions
  if (e.key === ' ' && e.ctrlKey && currentElement) {
    if (isShowingSuggestion && suggestionElement) {
      e.preventDefault();
      console.log('[MedComplete] Ctrl+Space pressed with suggestion available');
      
      if (isShowingPreview) {
        // Second Ctrl+Space press - accept suggestion
        console.log('[MedComplete] Second Ctrl+Space - accepting suggestion');
        acceptSuggestion();
      } else {
        // First Ctrl+Space press - show preview
        console.log('[MedComplete] First Ctrl+Space - showing preview');
        showFullSuggestion();
        isShowingPreview = true;
      }
    } else {
      console.log('[MedComplete] Ctrl+Space pressed but no suggestion available');
    }
  } else if (e.key === 'Escape' && isShowingSuggestion) {
    console.log('[MedComplete] Escape pressed - hiding suggestion');
    hideSuggestion();
  } else {
    // Handle proactive suggestions on typing
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
      x = rect.right - 100;
      y = rect.top + 100;
    } else {
      x = window.innerWidth - 100;
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
      x += Math.min(textWidth + 5, rect.width - 100);
      y += rect.height / 2;
    } else if (selection.rangeCount > 0) {
      // For contenteditable, use selection position
      const range = selection.getRangeAt(0);
      const rangeRect = range.getBoundingClientRect();
      x = rangeRect.right;
      y = rangeRect.bottom;
    }
  }
  
  // Show minimal indicator
  suggestionElement.className = 'medcomplete-suggestion medcomplete-indicator';
  suggestionElement.textContent = 'Ctrl+Space';
  suggestionElement.style.left = x + 'px';
  suggestionElement.style.top = y + 'px';
  suggestionElement.style.display = 'block';
  
  // Add event listener to show full suggestion on hover
  suggestionElement.addEventListener('mouseenter', showFullSuggestion);
  suggestionElement.addEventListener('mouseleave', hideFullSuggestion);
}

// Show full suggestion on hover
function showFullSuggestion() {
  if (suggestionElement && suggestionElement.dataset.suggestion) {
    suggestionElement.className = 'medcomplete-suggestion medcomplete-preview';
    suggestionElement.textContent = suggestionElement.dataset.suggestion;
    isShowingPreview = true;
  }
}

// Hide full suggestion
function hideFullSuggestion() {
  if (suggestionElement && !isShowingPreview) {
    suggestionElement.className = 'medcomplete-suggestion medcomplete-indicator';
    suggestionElement.textContent = 'Ctrl+Space';
  }
}

// Hide suggestion
function hideSuggestion() {
  if (suggestionElement) {
    suggestionElement.style.display = 'none';
    suggestionElement.removeEventListener('mouseenter', showFullSuggestion);
    suggestionElement.removeEventListener('mouseleave', hideFullSuggestion);
  }
  isShowingSuggestion = false;
  isShowingPreview = false;
  lastProcessedText = ''; // Reset so we can suggest again
}

// Accept and insert suggestion
function acceptSuggestion() {
  if (!suggestionElement || !currentElement) return;
  
  const suggestion = suggestionElement.dataset.suggestion || suggestionElement.textContent;
  console.log('[MedComplete] Accepting suggestion:', suggestion);
  
  if (currentElement.tagName === 'TEXTAREA' || currentElement.tagName === 'INPUT') {
    const start = currentElement.selectionStart;
    const end = currentElement.selectionEnd;
    const text = currentElement.value;
    
    currentElement.value = text.substring(0, start) + suggestion + text.substring(end);
    currentElement.selectionStart = currentElement.selectionEnd = start + suggestion.length;
    
    // Trigger input event for frameworks
    currentElement.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (currentElement.contentEditable === 'true') {
    document.execCommand('insertText', false, suggestion);
  }
  
  hideSuggestion();
}

// Monitor DOM changes for dynamic content
const observer = new MutationObserver(() => {
  attachListeners();
});

// Initialize
function init() {
  console.log('[MedComplete] Initializing extension...');
  
  // Check for Google Docs
  if (window.location.hostname === 'docs.google.com') {
    console.log('[MedComplete] Detected Google Docs - using specialized handling');
    isGoogleDocs = true;
    initGoogleDocs();
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
  console.log('[MedComplete] Google Docs key:', e.key, 'ctrl:', e.ctrlKey, 'isShowingSuggestion:', isShowingSuggestion);
  
  // Ctrl+Space for suggestions in Google Docs
  if (e.key === ' ' && e.ctrlKey && isShowingSuggestion) {
    e.preventDefault();
    e.stopPropagation();
    
    if (isShowingPreview) {
      console.log('[MedComplete] Google Docs - accepting suggestion');
      acceptGoogleDocsSuggestion();
    } else {
      console.log('[MedComplete] Google Docs - showing preview');
      showFullSuggestion();
      isShowingPreview = true;
    }
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
  // Try to get text from the current line and previous lines
  const lines = document.querySelectorAll('.kix-lineview');
  let context = '';
  
  // Get text from the last few lines (up to 100 characters)
  for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
    const lineText = lines[i].textContent || '';
    context += lineText + ' ';
  }
  
  // Return last 100 characters
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
    
    // Simulate Ctrl+V to paste
    document.execCommand('paste');
    
    hideSuggestion();
  } catch (error) {
    console.error('[MedComplete] Failed to insert text in Google Docs:', error);
    // Fallback: show instruction to user
    showGoogleDocsInstructions(suggestion);
  }
}

// Show notification for unsupported sites
function showUnsupportedSiteNotification() {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = 'MedComplete: Google Docs is not supported. Try in standard text fields or other medical platforms.';
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}