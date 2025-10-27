# Changelog

All notable changes to the Dex Contacts plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI/CD workflows for automated releases
- Comprehensive CONTRIBUTING.md with development guidelines
- Issue and PR templates for better collaboration
- Build status badges in README

### Changed

- Improved README with better organization and feature documentation

## [1.0.14] - 2024-01-XX

### Added

- Clickable synced sync buttons that open Dex profile in browser
- Contact hover cards with detailed contact preview
- Simplified notification styling with colored border stripes

### Changed

- Synced sync buttons now link to Dex profiles instead of being disabled
- Notification UI simplified (removed SVG icons, using border stripes)
- Contact name extraction improved to use hovered element first

### Fixed

- Fixed Dex comment updates when creating new contacts from external links
- Fixed contact name extraction from hovered elements
- Line breaks now properly converted to `<br />` tags in memo content

### Removed

- Removed "Show Unlinked @Mentions" feature (question mark indicators)
- Removed SVG icons from toast notifications

## [1.0.0] - Initial Release

### Added

- Smart contact suggestions with fuzzy search
- Inline sync buttons using CodeMirror extensions
- Hash-based change detection for intelligent memo sync
- Customizable memo templates with variables
- Flexible linking options (Dex URLs or vault pages)
- Batch sync operations
- Auto-sync on save option
- Status bar indicators for sync progress
- Contact creation modal
- Settings tab with API key test connection
- Debug logging utilities
- Markdown to HTML converter for memo content

### Features

- **Contact Management**
  - Load and cache contacts from Dex API
  - Fuzzy search by name or company
  - Contact suggestions with @ trigger
- **Memo Synchronization**
  - Individual and batch memo sync
  - Content hash tracking for change detection
  - Template variable substitution
  - Dex comment annotations for tracking
- **User Interface**
  - CodeMirror sync buttons with state management
  - Toast notifications for user feedback
  - Comprehensive settings panel
  - Status bar counters

### Security

- Secure local API key storage
- No data collection or third-party transmission
- Opt-in sync model

---

## Release Types

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security-related changes

[Unreleased]: https://github.com/GraysonCAdams/dex-contacts/compare/v1.0.14...HEAD
[1.0.14]: https://github.com/GraysonCAdams/dex-contacts/releases/tag/v1.0.14
[1.0.0]: https://github.com/GraysonCAdams/dex-contacts/releases/tag/v1.0.0
