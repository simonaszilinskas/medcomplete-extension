# MedComplete Extension

AI-powered medical autocomplete Chrome extension for healthcare professionals.

## Features

- **Real-time AI suggestions** - Powered by Gemma AI via OpenRouter
- **Proactive indicators** - Shows "Tab" button when suggestions are available  
- **Two-step acceptance** - Tab to preview, Tab again to accept
- **Cross-platform support** - Works on standard web forms AND Google Docs
- **Medical-focused** - Trained prompts for medical documentation
- **Privacy-first** - Processes text locally, only sends context to AI

## How it Works

1. Start typing medical text in any text field
2. Extension automatically detects completion opportunities
3. Blue "Tab" indicator appears when suggestion is ready
4. Press Tab once to preview the suggestion
5. Press Tab again to accept and insert the text

## Triggers

- After **750ms pause** in typing
- When text ends with **punctuation** (. : , ;)
- After **5+ words** or **20+ characters**

## Supported Platforms

✅ **Standard web forms** (EMR systems, email, etc.)  
✅ **Google Docs** (via clipboard insertion)  
✅ **Medical platforms** (Epic MyChart, Cerner, etc.)  
✅ **Email clients** (Gmail, Outlook web)  

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" 
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your toolbar

## Files Structure

```
medcomplete/
├── manifest.json          # Extension configuration
├── background.js          # API integration & suggestion logic
├── content.js             # DOM interaction & UI handling  
├── styles.css             # Styling for suggestion overlay
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── icon16.png             # Extension icons
├── icon48.png
├── icon128.png
└── spec.md                # Project specification
```

## Development

### API Configuration
The extension uses OpenRouter's free Gemma model. The API key is currently hardcoded in `background.js` but should be moved to user settings in production.

### Key Components

**Content Script (`content.js`)**
- Detects editable elements across all websites
- Handles keyboard events (Tab, Escape)
- Shows/hides suggestion indicators
- Special handling for Google Docs

**Background Script (`background.js`)**  
- Makes API calls to OpenRouter
- Processes AI responses
- Handles fallback suggestions on errors

**Styling (`styles.css`)**
- Non-intrusive suggestion overlays
- Animated indicators and previews
- Dark mode support

### Testing

Test the extension on various platforms:
- Gmail compose window
- Medical EMR systems  
- Google Docs
- Standard web forms
- Reddit/forum comments

### Debugging

Enable Chrome DevTools console to see detailed logs:
- `[MedComplete]` - Content script logs
- `[MedComplete Background]` - API and background logs

## Future Enhancements

- User-configurable API keys
- Customizable trigger settings
- Medical specialty-specific suggestions
- Local LLM integration for privacy
- Integration with popular EMR systems
- Usage analytics and learning

## Privacy & Security

- Only sends text context (last 100 characters) to AI
- No personal data stored
- API calls are logged for debugging only
- Clipboard access only used for Google Docs insertion

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly across different platforms
5. Submit a pull request

## Support

For issues or feature requests, please open an issue on GitHub.