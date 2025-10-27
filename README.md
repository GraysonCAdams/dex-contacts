# Dex Contacts Plugin for Obsidian

[![Build Status](https://github.com/GraysonCAdams/dex-contacts/workflows/Build%20CI/badge.svg)](https://github.com/GraysonCAdams/dex-contacts/actions)
[![Release](https://img.shields.io/github/v/release/GraysonCAdams/dex-contacts)](https://github.com/GraysonCAdams/dex-contacts/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Seamlessly integrate your [GetDex](https://getdex.com) contacts with Obsidian. This plugin enables smart contact suggestions and intelligent memo synchronization with hash-based change detection.

## ✨ Features

### 🚀 Smart Contact Suggestions

- Type `@` followed by 2+ characters to see contact suggestions
- Fuzzy search through your Dex contacts by name or company
- Beautiful dropdown with contact photos and company information
- Auto-complete contact names when selected

### 🔗 Flexible Linking Options

- **Dex URL**: Link directly to contact pages on GetDex.com
- **Vault Pages**: Create internal Obsidian pages for contacts
- **Contact Hover Cards**: Preview contact details on hover
- Customizable vault paths and optional `@` symbol inclusion

### 📝 Intelligent Memo Syncing

- **Hash-Based Change Detection**: Only syncs when content changes
- **Inline Sync Buttons**: Context-aware buttons appear after contact mentions (with CodeMirror extensions)
- **Clickable Synced Buttons**: Open Dex profile in browser when already synced
- Sync entire paragraphs or header sections to Dex as memos
- Customizable memo templates with rich variables

### ⚡ Batch Operations & Automation

- Command to sync all memos in the current document
- Optional auto-sync on document save
- Status bar counters show sync progress
- Visual feedback with success/error notifications

### 🎨 User Experience

- **Contact Hover Cards**: Detailed contact information on link hover
- **Visual Status Indicators**: Color-coded buttons (✅ synced, 🔄 needs sync, ➕ not synced)
- **Toast Notifications**: Clean border-stripe notifications for actions
- **Link Extraction**: Smart extraction of contact names from context

## 🚀 Installation

### From Community Plugins (Coming Soon)

1. Open Obsidian Settings
2. Go to Community Plugins and browse
3. Search for "Dex Contacts"
4. Install and enable

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/GraysonCAdams/dex-contacts/releases/latest)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/dex-contacts/` folder
3. Enable the plugin in Obsidian's Community Plugins settings

## 🛠️ Development Setup

#### For Development

```bash
# Clone this repository to your vault's plugins folder
cd /path/to/your/vault/.obsidian/plugins/
git clone https://github.com/GraysonCAdams/dex-contacts.git
cd dex-contacts

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with auto-rebuild
npm run dev
```

## ⚙️ Configuration

### 1. Get Your Dex API Key

1. Log in to your [Dex account](https://getdex.com)
2. Navigate to **Settings** → **API**
3. Copy your personal API key

⚠️ **Keep your API key secure!** Don't share it with others.

### 2. Configure the Plugin

1. Open Obsidian Settings
2. Go to **Community Plugins** → **Dex Contacts**
3. Enter your Dex API key
4. Click **Test Connection** to verify it works
5. Configure your preferences:
   - **Link Mode**: Choose between Dex URLs or vault pages
   - **Vault Path**: Set where contact pages should be created
   - **Memo Template**: Customize how memos are formatted
   - **Sync Options**: Enable auto-sync and sync buttons

## 📖 Usage

### Adding Contact Mentions

1. In any note, type `@` followed by part of a contact's name (2+ characters)
2. A dropdown will appear with matching contacts (name, company, photo)
3. Select a contact to insert their name as a link
4. The link format depends on your settings (Dex URL or vault page)

### Syncing Memos

#### Individual Sync

- After mentioning a contact, an inline sync button will appear
- Click the button to sync that paragraph/section to Dex as a memo
- The button shows different states:
  - ➕ **Not synced**: Gray button, ready to sync
  - 🔄 **Needs sync**: Orange button, content changed since last sync
  - ✅ **Synced**: Green button, click to open Dex profile

#### Batch Sync

- Use the command palette (`Cmd/Ctrl + P`)
- Run **"Sync All Memos in Document"**
- All unsynced memos in the current note will be sent to Dex

#### Auto-Sync

- Enable "Auto-sync on Save" in settings
- Unsynced memos will automatically sync when you save the document

### Contact Hover Cards

- Hover over any contact link to see a preview card
- View contact photo, name, company, and recent memos
- Click "View in Dex" to open their profile
- Click "Edit" to modify contact details

### Commands

- **Refresh Dex Contacts**: Manually reload your contact list from Dex
- **Sync All Memos in Document**: Sync all unsynced memos in the current note
- **Test Dex Connection**: Verify your API key and connection

## 🎨 Memo Templates

Customize how your memos appear in Dex using template variables:

### Default Template

```
{{content}}
```

### Advanced Template Example

```
📝 Note from {{title}}

{{content}}

---
📅 {{date}}
🔗 [View in Obsidian]({{obsidian_uri}})
```

### Available Variables

- `{{date}}` - Current date (format configurable in settings)
- `{{title}}` - The title of your Obsidian note
- `{{content}}` - The paragraph content containing the contact mention
- `{{header}}` - The header text if the mention is under a heading
- `{{obsidian_uri}}` - A clickable link back to this note in Obsidian

## 📋 Settings Reference

### API Configuration

- **Dex API Key**: Your personal API key from GetDex.com
- **Test Connection**: Button to verify your API key works

### Link Behavior

- **Link Mode**:
  - _Dex URL_: Creates links to getdex.com contact pages
  - _Vault Page_: Creates internal Obsidian page links
- **Vault Path**: Where to create contact pages (root or custom folder)
- **Include @ Symbol**: Whether contact page names include "@"

### Memo Sync

- **Memo Template**: Template for syncing content to Dex (supports variables)
- **Date Format**: How dates appear in memos (e.g., YYYY-MM-DD)
- **Show Sync Buttons**: Whether to display inline sync buttons
- **Auto-sync on Save**: Automatically sync when saving documents

## 🔧 Troubleshooting

### Connection Issues

1. Verify your API key is correct
2. Check your internet connection
3. Use the "Test Connection" button to diagnose issues
4. Check the console (`Cmd/Ctrl + Shift + I`) for error messages

### Contacts Not Loading

1. Make sure you have contacts in your Dex account
2. Try the "Refresh Dex Contacts" command
3. Wait a few seconds - large contact lists may take time to load
4. Check network connectivity to getdex.com

### Sync Problems

1. Verify your API key has write permissions
2. Check that the contact still exists in Dex
3. Try syncing individual memos first, then batch operations
4. Check if content contains special characters that need encoding

### Performance

- The plugin loads contacts on startup and caches them locally
- Use "Refresh Dex Contacts" if you add new contacts in Dex
- Large contact lists (1000+) may take a few seconds to load initially
- Hash-based change detection means only modified content syncs

## 🔒 Privacy & Security

- **API Key Storage**: Securely stored locally in Obsidian's data directory
- **Local Processing**: Contact matching and change detection happen locally
- **No Data Collection**: Plugin doesn't collect or transmit usage data
- **Opt-in Sync**: Content is only sent to Dex when you explicitly sync
- **Direct Communication**: All API calls go directly to Dex servers (no third parties)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Ensure the build succeeds (`npm run build`)
5. Test your changes thoroughly
6. Submit a pull request

## 📚 Resources

- 📖 [Dex API Documentation](https://docs.getdex.com)
- 🐛 [Report Issues](https://github.com/GraysonCAdams/dex-contacts/issues)
- 🚀 [Feature Requests](https://github.com/GraysonCAdams/dex-contacts/issues/new)
- 📦 [Releases](https://github.com/GraysonCAdams/dex-contacts/releases)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🎯 Roadmap

- [ ] Bi-directional sync (Dex → Obsidian)

## 📈 Changelog

See [Releases](https://github.com/GraysonCAdams/dex-contacts/releases) for version history and detailed changes.

---

Made with ❤️ for the Dex and Obsidian communities.
