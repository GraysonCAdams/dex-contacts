# GitHub Actions Release Setup - Complete! 🎉

This document summarizes the automated release workflow setup for the Dex Contacts Obsidian plugin, based on the Excalidraw plugin's approach.

## ✅ What Was Created

### 1. GitHub Actions Workflows

#### `.github/workflows/release.yml`

Automated release workflow that:

- Triggers on git tags (e.g., `git tag 1.0.15 && git push --tags`)
- Builds the plugin with `npm ci && npm run build`
- Verifies version consistency between tag, manifest.json, and package.json
- Creates a GitHub release automatically
- Uploads build artifacts: `main.js`, `manifest.json`, `styles.css`

**Key Features:**

- Version validation (ensures tag matches manifest.json)
- Automatic asset uploads for Obsidian plugin installation
- Clean release notes generation

#### `.github/workflows/build.yml`

Continuous Integration workflow that:

- Runs on pushes to main/master and pull requests
- Tests build on multiple Node versions (18.x, 20.x)
- Runs TypeScript type checking (`tsc --noEmit`)
- Verifies build artifacts are generated
- Includes placeholder for linting (can add ESLint/Prettier)

**Key Features:**

- Matrix builds for multiple Node versions
- Build verification
- TypeScript error checking
- Fail-fast validation

### 2. Documentation

#### Updated `README.md`

Enhanced with:

- **Build status badges** (Build CI, Release, License)
- **Comprehensive feature list** with emojis for easy scanning
- **Updated installation instructions** for manual and community plugins
- **Development setup** section for contributors
- **Detailed usage guide** with examples
- **Troubleshooting section** expanded
- **Resources and roadmap** sections
- Better organization with clear sections

#### New `CONTRIBUTING.md`

Complete developer guide including:

- **Getting started** instructions for contributors
- **Project structure** overview with file descriptions
- **Development workflow** best practices
- **Architecture overview** with data flow diagrams
- **Key patterns** used in the codebase (DI, Observer, State Management)
- **Coding standards** and examples
- **Manual testing checklist** for QA
- **Dex Comments** format documentation
- Resources and helpful links

### 3. Issue/PR Templates

#### `.github/ISSUE_TEMPLATE/bug_report.md`

Structured bug report template with:

- Bug description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Obsidian version, OS, plugin version)
- Console logs section
- Checklist for reporters

#### `.github/ISSUE_TEMPLATE/feature_request.md`

Feature request template with:

- Feature description
- Problem/use case
- Proposed solution
- Alternative solutions
- Priority indicators
- Examples section

#### `.github/PULL_REQUEST_TEMPLATE.md`

PR template with:

- Change description
- Type of change checkboxes
- Manual testing checklist
- Screenshots section
- Related issues linking
- Reviewer checklist

### 4. Changelog

#### `CHANGELOG.md`

Version history following [Keep a Changelog](https://keepachangelog.com/) format:

- **Unreleased** section for upcoming changes
- Proper semantic versioning links
- Categories: Added, Changed, Fixed, Removed, Security

## 🚀 How to Use the Release Workflow

### Making a Release

1. **Update Version Numbers**

   ```bash
   # This script updates manifest.json and versions.json from package.json
   npm version patch  # or minor, or major
   ```

2. **Verify Changes**

   - Check that `manifest.json` version matches `package.json`
   - Update `CHANGELOG.md` with new version details
   - Ensure all changes are committed

3. **Create and Push Tag**

   ```bash
   git tag 1.0.15
   git push origin main
   git push --tags
   ```

4. **Automated Process**

   - GitHub Actions detects the tag
   - Runs build workflow
   - Creates release on GitHub
   - Uploads `main.js`, `manifest.json`, `styles.css`

5. **Verify Release**
   - Check [Releases page](https://github.com/GraysonCAdams/dex-contacts/releases)
   - Verify all three files are attached
   - Test installation from the release

### Version Management

The repo uses `version-bump.mjs` to sync versions:

```javascript
// When you run: npm version patch
// It automatically:
// 1. Increments package.json version
// 2. Runs version-bump.mjs
// 3. Updates manifest.json version
// 4. Updates versions.json with minAppVersion
// 5. Stages changes for commit
```

**Current State:**

- `manifest.json`: v1.0.14
- `package.json`: v1.0.0 (intentionally different - see note below)
- `versions.json`: Contains version history

> **Note:** The package.json version (1.0.0) is kept separate as it represents the npm package version, while manifest.json represents the Obsidian plugin version. The release workflow validates that tags match manifest.json.

## 📋 Pre-Release Checklist

Before creating a new release:

- [ ] All tests pass locally (`npm run build`)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Update `CHANGELOG.md` with new version
- [ ] Commit all changes
- [ ] Bump version with `npm version [patch|minor|major]`
- [ ] Push commits and tags
- [ ] Monitor GitHub Actions for build success
- [ ] Verify release assets are correct
- [ ] Test installation from release in Obsidian

## 🔄 CI/CD Flow

```
Developer
    ↓
Commit & Push to main
    ↓
Build CI Workflow
    ├── Install dependencies
    ├── Run build
    ├── Check TypeScript
    └── Verify artifacts
    ↓
All checks pass ✅
    ↓
Create version tag
    ↓
Push tag to GitHub
    ↓
Release Workflow
    ├── Build plugin
    ├── Verify versions
    ├── Create GitHub release
    └── Upload assets
    ↓
Release Published! 🎉
    ↓
Users download from Releases
```

## 🎯 Next Steps

### Optional Enhancements

1. **Add Tests**

   - Unit tests for core functionality
   - Integration tests for API client
   - Test coverage reporting

2. **Add Linting**

   ```bash
   npm install --save-dev eslint @typescript-eslint/eslint-plugin
   # Create .eslintrc.json
   # Update build.yml to run linting
   ```

3. **Automated Changelog**

   - Use conventional commits
   - Generate changelog automatically from commits
   - Tools: `conventional-changelog`, `semantic-release`

4. **Beta Releases**

   - Create `beta` branch for testing
   - Release beta versions (e.g., `1.0.15-beta.1`)
   - Test with BRAT plugin

5. **Release Notes Automation**
   - Generate release notes from CHANGELOG.md
   - Include breaking changes prominently
   - Add upgrade instructions if needed

### Community Growth

1. **Submit to Obsidian Community Plugins**

   - Once stable, submit PR to obsidian-releases repo
   - Follow Obsidian plugin guidelines
   - Provide screenshots and demo

2. **Documentation Site**

   - Consider GitHub Pages for docs
   - Add video tutorials
   - Create usage examples

3. **Engage Community**
   - Respond to issues promptly
   - Welcome first-time contributors
   - Create "good first issue" labels

## 📚 Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 🎉 Summary

Your Dex Contacts plugin now has:

✅ **Automated releases** with GitHub Actions  
✅ **Build verification** on every PR and push  
✅ **Comprehensive documentation** for users and contributors  
✅ **Issue/PR templates** for better collaboration  
✅ **Version management** system  
✅ **Professional README** with badges and clear structure  
✅ **Changelog** tracking all changes

The plugin is ready for professional development and community contributions!

---

**To create your first automated release:**

```bash
# Make sure you're on main branch
git checkout main

# Bump version (updates manifest.json and versions.json)
npm version patch

# Push everything including the new tag
git push origin main --follow-tags
```

Then watch GitHub Actions create your release automatically! 🚀
