# ToInfinity CSS Architecture - Refactored

## 🎯 Overview

This is the NEW refactored CSS structure from PR #179, designed to replace the fragmented CSS system with a clean, organized, and maintainable architecture.

## 📁 Structure

```
src/public/css/
├── 1-foundation/           # Base layer (CREATED ✅)
│   ├── variables.css       # All CSS variables (CREATED ✅)
│   ├── reset.css          # Modern CSS reset (CREATED ✅)
│   └── typography.css     # Font and text styles (CREATED ✅)
│
├── 2-components/          # Reusable components (IN PROGRESS ⏳)
│   ├── buttons.css        # All button variants
│   ├── forms.css          # Form elements with RTL
│   ├── cards.css          # Card components
│   ├── tables.css         # Responsive tables
│   ├── badges.css         # Badges and pills
│   └── navigation.css     # App bar, drawer, menu
│
├── 3-layouts/             # Layout utilities (TODO 📋)
│   ├── shell.css          # Main page structure
│   ├── grid.css           # Grid and flexbox utilities
│   └── spacing.css        # Margin and padding utilities
│
├── 4-views/               # View-specific styles (TODO 📋)
│   ├── admin.css          # Admin panel specific
│   └── user.css           # User panel specific
│
└── app.css                # Main entry point (CREATED ✅)
```

## 🔄 Merge Conflict Resolution

### The Problem
- **Main branch** (from PR #180): Has an `app.css` file with inline styles
- **PR #179 branch**: Introduces a completely NEW `app.css` as part of refactored architecture
- **Result**: Git merge conflict on `app.css`

### The Solution
1. ✅ Backed up old `app.css` → `app-old-backup.css` (removed from public assets during cleanup; available in git history)
2. ✅ Created new directory structure (1-foundation, 2-components, 3-layouts, 4-views)
3. ✅ Created foundation layer files (variables, reset, typography)
4. ✅ Created new `app.css` that imports the refactored modules
5. ⏳ Remaining: Create component, layout, and view files

## 🎨 Theme System

Two themes supported via `data-theme` attribute:

### Admin Theme (Dark)
```html
<html data-theme="admin">
```
- Background: `#020617` (Dark slate)
- Primary: `#6366f1` (Indigo)
- Text: `#e5e7eb` (Light gray)

### User Theme (Light) - Default
```html
<html data-theme="user">
```
- Background: `#f7f7f7` (Light gray)
- Primary: `#0d6efd` (Blue)
- Text: `#111111` (Almost black)

## 📦 Current Status

### Completed ✅
- CSS Variables system (all design tokens in one place)
- Modern CSS reset
- Typography system with Vazirmatn font
- Main app.css entry point
- Old app.css backup available in git history (removed from public assets)

### In Progress ⏳
- Component CSS files (buttons, forms, cards, tables, badges, navigation)
- Layout utility files (shell, grid, spacing)
- View-specific files (admin, user)
- Documentation files
- Demo HTML pages

## 🚀 Usage

Import the main CSS file:
```html
<link rel="stylesheet" href="/css/app.css">
```

Set the theme:
```html
<html lang="fa" dir="rtl" data-theme="admin">
<!-- or -->
<html lang="fa" dir="rtl" data-theme="user">
```

## 📝 Next Steps

To complete the refactoring from PR #179:

1. Create all 2-components/*.css files
2. Create all 3-layouts/*.css files  
3. Create all 4-views/*.css files
4. Uncomment the @import statements in app.css
5. Create documentation (README.md, راهنمای_سریع_CSS.md)
6. Create demo HTML files (demo-test.html, demo-admin.html, demo-user.html)
7. Test theme switching
8. Verify RTL support
9. Test responsive behavior

## 🔗 References

- Original PR: #179 - Refactor CSS architecture
- Conflict PR: #180 - Prepare project CSS refactoring
- All file contents available in PR #179 diff

## ✅ Verification

To verify the CSS works:

1. Check that variables.css loads correctly
2. Verify theme switching with `data-theme` attribute
3. Test RTL layout
4. Ensure fonts load from `/fonts/vazir/`
5. Check that all imports in app.css resolve correctly

---

**Status**: Foundation complete, components and layouts pending
**Branch**: copilot/fix-app-css-conflicts
**Purpose**: Resolve merge conflict between PR #179 and main branch
