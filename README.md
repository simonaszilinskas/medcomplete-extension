# MedComplete Extension

AI-powered medical autocomplete Chrome extension for healthcare professionals.

## Features

- **Real-time AI suggestions** - Powered by Mistral via OpenRouter
- **Proactive suggestions** - Automatically appears when available
- **Simple acceptance** - Tab to accept suggestions immediately
- **Medical-focused** - Optimized prompts for medical documentation
- **Wide compatibility** - Works on most web forms and text fields

## How it Works

1. Start typing medical text in any text field
2. Extension automatically detects completion opportunities
3. Suggestion appears automatically when ready
4. Press Tab to accept and insert the text

## Triggers

- After **400ms pause** in typing (optimized for speed)
- When text ends with **punctuation** (. : , ;)
- After **3+ words** or **15+ characters** (more responsive)
- **§ key** for instant suggestions anytime

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
The extension uses OpenRouter's Mistral model with secure API key storage in user settings. Future versions will integrate MedGemma via Vertex AI.

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

### Debugging

Enable Chrome DevTools console to see detailed logs:
- `[MedComplete]` - Content script logs
- `[MedComplete Background]` - API and background logs

## Future Enhancements

- Checking for overrites by the models - if the model produces text that already exists, merge and complete it.
- Send more context to the model.
- Improve speed. 
- Use of MedGemma as the model.
- Memory that adds up in context that detects the specialty of the user and adapts. 
- Local LLM integration for privacy with WebGPU.
- Memore and learning fatures. 

## License

TBD

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly across different platforms
5. Submit a pull request

## Support

For issues or feature requests, please open an issue on GitHub.
