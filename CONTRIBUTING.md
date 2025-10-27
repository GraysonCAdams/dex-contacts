# Contributing to Dex Contacts Plugin

Thank you for your interest in contributing to the Dex Contacts plugin! We welcome contributions from the community.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Architecture Overview](#architecture-overview)

## 🤝 Code of Conduct

Be respectful, constructive, and professional. We're all here to make great software together.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Obsidian (for testing)
- A Dex account with API access
- Git

### Setting Up Your Development Environment

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/dex-contacts.git
   cd dex-contacts
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Link to Obsidian Vault** (for testing)

   ```bash
   # Option 1: Symlink to your vault's plugins folder
   ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/dex-contacts

   # Option 2: Copy files after each build
   npm run build
   cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/dex-contacts/
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

This will watch for changes and rebuild automatically.

## 🔧 Development Workflow

### Project Structure

```
dex-contacts/
├── src/
│   ├── api/
│   │   └── client.ts          # Dex API client
│   ├── core/
│   │   ├── contact-manager.ts # Contact loading and caching
│   │   ├── memo-manager.ts    # Memo sync logic
│   │   ├── settings.ts        # Plugin settings
│   │   └── types.ts           # Core type definitions
│   ├── ui/
│   │   ├── contact-creation-modal.ts
│   │   ├── contact-hover-card.ts
│   │   ├── contact-suggest.ts # @ mention autocomplete
│   │   ├── notifications.ts    # Toast notifications
│   │   ├── settings-tab.ts     # Settings UI
│   │   └── sync-buttons/
│   │       └── codemirror-extension.ts  # Inline sync buttons
│   └── utils/
│       ├── contact-link-updater.ts  # Update links with Dex comments
│       ├── contact-selection-manager.ts
│       ├── content-hash.ts          # Change detection
│       ├── content-processor.ts
│       ├── debug-logger.ts
│       └── markdown-converter.ts    # Markdown → Dex HTML
├── main.ts                     # Plugin entry point
├── manifest.json               # Plugin metadata
├── styles.css                  # Plugin styles
├── esbuild.config.mjs          # Build configuration
├── package.json
└── tsconfig.json
```

### Key Components

#### 1. Contact Suggestions (`contact-suggest.ts`)

- Implements Obsidian's `EditorSuggest` interface
- Fuzzy search using fuse.js
- Triggered by `@` character

#### 2. Sync Buttons (`codemirror-extension.ts`)

- CodeMirror 6 extension for inline widgets
- State management: not-synced, synced, needs-sync
- Clickable when synced (opens Dex profile)

#### 3. Contact Hover Cards (`contact-hover-card.ts`)

- Shows contact preview on link hover
- Extracts contact info from Dex comments

#### 4. Memo Manager (`memo-manager.ts`)

- Hash-based change detection
- Template variable substitution
- Batch and individual sync operations

#### 5. Content Hash (`content-hash.ts`)

- MD5 hashing for change detection
- Embedded in Dex comments: `%%dex:contact-id=X,memo-id=Y,hash=Z%%`

### Making Changes

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**

   - Follow the existing code style (TypeScript, 2-space indentation)
   - Add comments for complex logic
   - Update types as needed

3. **Test Your Changes**

   - Build the plugin: `npm run build`
   - Test in Obsidian manually
   - Verify no TypeScript errors: `npx tsc --noEmit`

4. **Commit Your Changes**

   ```bash
   git add .
   git commit -m "feat: add awesome feature"
   ```

   Use [Conventional Commits](https://www.conventionalcommits.org/):

   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Adding tests
   - `chore:` - Maintenance tasks

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test these scenarios:

#### Contact Suggestions

- [ ] Type `@` triggers suggestion dropdown
- [ ] Fuzzy search works (name and company)
- [ ] Selecting contact inserts correct link
- [ ] Works with both Dex URL and vault page modes

#### Sync Buttons

- [ ] Buttons appear after contact mentions
- [ ] First sync shows gray button
- [ ] After sync shows green checkmark
- [ ] Content changes show orange "needs sync"
- [ ] Clicking synced button opens Dex profile

#### Hover Cards

- [ ] Hover over contact link shows card
- [ ] Card displays correct contact info
- [ ] "View in Dex" button works
- [ ] Card positioning is correct

#### Memo Sync

- [ ] Individual memo sync works
- [ ] Batch sync command works
- [ ] Auto-sync on save works (when enabled)
- [ ] Hash detection prevents duplicate syncs
- [ ] Template variables are substituted correctly
- [ ] Line breaks converted to `<br />` tags

#### Settings

- [ ] API key test connection works
- [ ] Settings persist after restart
- [ ] Template preview shows correctly

## 📤 Submitting Changes

### Pull Request Process

1. **Update Documentation**

   - Update README.md if you add features
   - Add comments to complex code
   - Update types if interfaces change

2. **Ensure Build Succeeds**

   ```bash
   npm run build
   npx tsc --noEmit
   ```

3. **Push Your Branch**

   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request**

   - Go to GitHub and create a PR from your branch
   - Fill out the PR template
   - Link any related issues
   - Request review from maintainers

5. **Code Review**

   - Address any feedback from reviewers
   - Make requested changes
   - Push updates to your branch (PR auto-updates)

6. **Merge**
   - Once approved, maintainers will merge your PR
   - Your changes will be included in the next release

## 📝 Coding Standards

### TypeScript

- Use TypeScript's strict mode
- Define interfaces for all data structures
- Avoid `any` types where possible
- Use meaningful variable names

### Code Style

- 2-space indentation (tabs converted to spaces)
- Use semicolons
- Use single quotes for strings
- Trailing commas in multi-line objects/arrays
- Max line length: 120 characters

### Comments

- Add comments for complex logic
- Document all public methods with JSDoc
- Explain "why" not "what" when code isn't obvious

### Example

```typescript
/**
 * Calculates content hash for change detection
 * @param content - The memo content to hash
 * @returns MD5 hash as hex string
 */
export function calculateContentHash(content: string): string {
  return CryptoJS.MD5(content).toString();
}
```

## 🏗️ Architecture Overview

### Data Flow

```
User types @ → ContactSuggest → Contact Selected
                                      ↓
                               Link Inserted
                                      ↓
                          CodeMirror Extension
                                      ↓
                            Sync Button Rendered
                                      ↓
User clicks sync → MemoManager → DexApiClient
                                      ↓
                                 Dex Server
                                      ↓
                            Success/Error Response
                                      ↓
                     Update Dex Comment with IDs
                                      ↓
                          Update Button State
```

### Key Patterns

1. **Dependency Injection**: Pass plugin instance to managers
2. **Observer Pattern**: Use Obsidian events for file changes
3. **State Management**: Buttons manage their own state
4. **Caching**: Contacts cached in memory, refreshed on command
5. **Hash-Based Sync**: Content hash in Dex comments prevents duplicates

### Dex Comments

Links are annotated with hidden comments:

```markdown
[John Doe](https://getdex.com/contacts/123)%%dex:contact-id=123,memo-id=456,hash=abc123%%
```

- `contact-id`: Dex contact ID
- `memo-id`: Dex memo ID (after first sync)
- `hash`: Content hash for change detection

## 🐛 Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/GraysonCAdams/dex-contacts/issues)
2. If not, create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Obsidian version and OS
   - Plugin version
   - Console errors (if any)

## 💡 Feature Requests

We love feature ideas! Please:

1. Check existing [Issues](https://github.com/GraysonCAdams/dex-contacts/issues) first
2. Create a new issue describing:
   - The feature you'd like
   - Why it's useful
   - How it might work
   - Any examples from other tools

## 📚 Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Dex API Documentation](https://docs.getdex.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [CodeMirror 6 Documentation](https://codemirror.net/docs/)

## ❓ Questions?

- Open a [Discussion](https://github.com/GraysonCAdams/dex-contacts/discussions)
- Join the [Dex Community Slack](https://join.slack.com/t/dex-community/shared_invite/zt-2ipft5dp3-c4Uh_I3r6MMSzynp1KlnrA)

---

Thank you for contributing! 🎉
