# ToInfinity - Current Architecture Reference

**Last Updated:** 2025-12-21  
**Status:** Canonical Reference - Single Source of Truth

This document describes the current implementation of ToInfinity, a Node.js/Express web application with EJS templates, designed for managing organizational hierarchies, teams, brands, products, and credit policies with separate Admin and User flows.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Authentication & Authorization](#authentication--authorization)
5. [Admin Flow vs User Flow](#admin-flow-vs-user-flow)
6. [Definitions Module](#definitions-module)
7. [Route Map](#route-map)
8. [Views & Layout Architecture](#views--layout-architecture)
9. [CSS & Static Assets](#css--static-assets)
10. [Database Schema](#database-schema)
11. [Services Layer](#services-layer)
12. [Middleware Stack](#middleware-stack)
13. [Navigation Flow Diagrams](#navigation-flow-diagrams)
14. [Regression Prevention Checklist](#regression-prevention-checklist)

---

## Project Overview

ToInfinity is a mobile-first web application built for organizations that need to manage:
- **Organizational hierarchy** (org_nodes with parent-child relationships)
- **Teams** and team membership
- **Brands** and products with team assignments
- **Credit policies** per organizational node
- **User management** with role-based access control
- **Credit sales and settlements** (user flow)

The application uses **Persian (RTL)** UI with **Vazirmatn** font and follows a mobile-first design pattern.

---

## Technology Stack

### Backend
- **Node.js** (v18+)
- **Express** v5.2.1
- **PostgreSQL** (via `pg` driver v8.16.3)
- **EJS** v3.1.10 (template engine)
- **express-session** with `connect-pg-simple` (session storage)

### Frontend
- **Mobile-first CSS** (`app-mobile.css`)
- **Vazirmatn** font (self-hosted)
- **No frontend framework** (vanilla JavaScript where needed)

### Development
- **Node test runner** (`node --test`)
- **Supertest** for route testing
- **Multer** for file uploads (products Excel import)
- **XLSX** for Excel parsing

---

## Project Structure

```
/home/runner/work/Toinfinity/Toinfinity/
├── src/
│   ├── app.js                    # Main Express app configuration
│   ├── server.js                 # HTTP server entry point
│   ├── config/
│   │   └── db.js                 # PostgreSQL connection pool
│   ├── middlewares/
│   │   ├── auth.js               # requireLogin, getUser
│   │   ├── systemAdmin.js        # adminSession, requireSystemAdmin
│   │   ├── guards.js             # enforceRole, enforceStatus
│   │   └── flowGuards.js         # Flow-specific guards
│   ├── routes/
│   │   ├── admin.js              # Admin dashboard, hierarchy, baskets redirect
│   │   ├── auth.routes.js        # User login/logout
│   │   ├── register.routes.js    # User registration
│   │   ├── systemAdmin.routes.js # System admin login/setup
│   │   ├── telegramAuth.routes.js# Telegram OTP authentication
│   │   ├── orgNodes.routes.js    # Legacy org-nodes redirect (301 to hierarchy)
│   │   ├── teams.definitions.routes.js
│   │   ├── brands.definitions.routes.js
│   │   ├── products.definitions.routes.js
│   │   ├── creditPolicy.definitions.routes.js
│   │   ├── adminUsers.definitions.routes.js
│   │   ├── adminUsers.routes.js  # Admin user management
│   │   ├── creditSale.routes.js  # User flow: credit sales
│   │   ├── creditSettlement.routes.js
│   │   └── customers.routes.js
│   ├── services/
│   │   ├── teams.service.js
│   │   ├── brands.service.js
│   │   ├── products.service.js
│   │   ├── users.service.js
│   │   ├── auth.service.js
│   │   ├── systemAdmin.service.js
│   │   └── telegramAuth.service.js
│   ├── views/
│   │   ├── partials/
│   │   │   ├── layout_mobile.ejs    # Mobile-first layout wrapper
│   │   │   ├── admin_layout.ejs     # Admin-specific layout
│   │   │   ├── admin_menu_tree.ejs  # Admin navigation menu
│   │   │   └── pages/               # Content partials
│   │   ├── definitions/
│   │   │   ├── index.ejs            # Definitions home
│   │   │   ├── teams.ejs
│   │   │   ├── brands.ejs
│   │   │   └── products.ejs
│   │   ├── admin_*.ejs              # Admin views
│   │   ├── login.ejs                # User login
│   │   ├── register.ejs             # User registration
│   │   ├── telegram_auth.ejs        # Telegram OTP
│   │   ├── pending.ejs              # Pending approval
│   │   └── unauthorized.ejs
│   ├── public/
│   │   ├── css/
│   │   │   ├── app-mobile.css       # Base mobile-first styles
│   │   │   ├── admin-theme.css      # Admin color scheme
│   │   │   ├── admin-ui.css         # Admin UI components
│   │   │   ├── admin-definitions-system.css
│   │   │   ├── bria-theme.css       # Shared theme variables
│   │   │   └── pages/               # Page-specific CSS
│   │   │       ├── admin_dashboard.css
│   │   │       ├── admin_definitions.css
│   │   │       ├── admin_hierarchy.css
│   │   │       ├── admin_def_brands.css
│   │   │       ├── admin_def_products.css
│   │   │       └── [other page CSS]
│   │   ├── js/
│   │   │   └── admin-ui.js          # Admin UI interactions
│   │   ├── fonts/
│   │   │   └── vazir/               # Vazirmatn font files
│   │   └── icons/
│   │       ├── icon_1024.png        # App logo
│   │       └── logo.png
│   └── utils/                       # Utility functions
├── migrations/
│   ├── 000_fix_consistency.sql      # Teams/users tables
│   ├── 001_add_brand_manager.sql
│   ├── 002_add_user_search_indexes.sql
│   ├── 003_add_team_users_indexes.sql
│   └── 004_fix_team_users_fks.sql
├── docs/                            # Documentation
├── scripts/                         # Utility scripts
├── package.json
└── .gitignore
```

---

## Authentication & Authorization

### Two Separate Authentication Systems

#### 1. System Admin Authentication
- **Routes:** `/admin/*`
- **Session Cookie:** `toinf_admin_sid` (path: `/admin`, 2 hours TTL)
- **Session Storage:** `admin_sessions` table in PostgreSQL
- **Middleware:** `adminSession` → `requireSystemAdmin`
- **Login:** `/admin/login` (system admin username + Telegram OTP)
- **User Table:** `system_admins` (separate from regular users)
- **Features:**
  - Telegram bot integration for OTP
  - Account locking after failed attempts
  - Must-change-password flag support
  - First-time setup flow

#### 2. User Authentication
- **Routes:** All non-admin routes (/, /login, /credit-sale/*, etc.)
- **Session Cookie:** Default Express session (7 days TTL)
- **Session Storage:** `user_sessions` table in PostgreSQL
- **Middleware:** `requireLogin` → `enforceRole` → `enforceStatus`
- **Login:** `/login` (phone/username + Telegram OTP)
- **User Table:** `users` (with roles: USER, ADMIN, SUPER_ADMIN)
- **Features:**
  - Registration flow with approval workflow
  - Telegram OTP verification
  - Status-based access (pending, active, rejected)
  - Manager hierarchy validation

### User Roles & Status

**Roles in `users` table:**
- `USER`: Regular user (sales rep, employee)
- `ADMIN`: Legacy role (redirects to system admin login)
- `SUPER_ADMIN`: Legacy role (redirects to system admin login)
- `SYSTEM_ADMIN`: Compatibility role (set in session for system admins)

**User Status:**
- `pending_verification`: Registered, awaiting Telegram verification
- `NEEDS_EDIT`: Incomplete profile
- `active`: Verified and active
- `rejected`: Denied access
- `pending_*`: Other pending states

**Active Flag:**
- Boolean field `active` controls user access
- Inactive users are redirected to `/pending`

---

## Admin Flow vs User Flow

### Admin Flow (System Admin)

**Entry Points:**
- `/admin/login` → System admin login with OTP
- `/admin/first-setup` → Initial system setup (if no admins exist)

**Main Routes:**
```
/admin/dashboard          → Admin dashboard
/admin/definitions        → Definitions home page
/admin/definitions/teams  → Team management
/admin/definitions/brands → Brand management
/admin/definitions/products → Product management
/admin/definitions/hierarchy → Org hierarchy (org_nodes)
/admin/definitions/hierarchy/arrange → Parent-child relationships
/admin/definitions/credit-policy → Credit policies per node
/admin/definitions/users  → User management (definitions context)
/admin/users              → Full user management
/admin/approvals          → Pending approvals
/admin/reports            → Reports dashboard
```

**Layouts:**
- Uses `partials/admin_layout.ejs` OR `partials/layout_mobile.ejs` with `theme='admin'`
- Navigation via `admin_menu_tree.ejs`
- Page class: `admin-ui`, `page--definitions-*`
- Theme: `theme-admin`

### User Flow (Regular Users)

**Entry Points:**
- `/login` → User login
- `/register` → User registration
- `/auth/telegram` → Telegram OTP verification

**Main Routes:**
```
/                         → User dashboard (pending implementation)
/credit-sale/list         → List credit sales
/credit-sale/new          → Create credit sale
/credit-sale/:id          → View credit sale detail
/credit-settlement/inbox  → Settlement inbox
/credit-settlement/new    → Create settlement
/customers                → Customer management
/pending                  → Pending approval page
/unauthorized             → Access denied page
```

**Layouts:**
- Uses `partials/layout_mobile.ejs` with `theme='user'`
- Mobile-first design with app bar and drawer
- Page class varies by page
- Theme: `theme-user`

---

## Definitions Module

The **Definitions** module is the core administrative area for configuring organizational structure, teams, brands, products, and policies.

### Module Structure

```
/admin/definitions/
├── (index)               → Definitions home (menu of all sub-modules)
├── teams/
│   ├── (list)            → List all teams
│   ├── new               → Create team form
│   ├── :id/edit          → Edit team form
│   ├── :id/toggle        → Toggle active status
│   ├── :id/delete        → Delete team (FK-safe)
│   ├── :id/members       → Team members management
│   ├── :id/members/add   → Add member to team
│   ├── :id/members/remove → Remove member from team
│   ├── :id/brands        → Team brands assignment
│   ├── :id/brands/add    → Assign brand to team
│   └── :id/brands/remove → Remove brand from team
├── brands/
│   ├── (list)            → List all brands
│   ├── new               → Create brand form
│   ├── :id/edit          → Edit brand form
│   ├── (create)          → POST create brand
│   ├── :id (update)      → POST update brand
│   └── :id/toggle        → Toggle active status
├── products/
│   ├── (list)            → List/filter products (paginated)
│   ├── new               → Create product form
│   ├── :id/edit          → Edit product form
│   ├── (create)          → POST create product
│   ├── :id (update)      → POST update product
│   ├── :id/toggle        → Toggle active status
│   ├── template.xlsx     → Download Excel import template
│   └── import            → POST Excel/CSV import (with auto brand creation)
├── hierarchy/
│   ├── (list)            → List/create/edit org_nodes
│   ├── update            → POST update org_node title
│   ├── delete            → POST delete org_node (with guards)
│   ├── arrange           → Parent-child edge arrangement UI
│   └── link              → POST update parent_id (with cycle detection)
├── credit-policy/
│   ├── (list)            → List all node policies
│   └── :nodeId (edit/save) → Edit/save policy for org_node
└── users/
    ├── (list)            → List users with org title
    ├── :id/edit          → Edit user form
    └── :id (update)      → POST update user (role/status/org_node)
```

### Legacy Redirects

**`/admin/definitions/org-nodes*`** (ANY path starting with this)
- **Handled by:** `src/routes/orgNodes.routes.js`
- **Action:** `301 Permanent Redirect` to `/admin/definitions/hierarchy`
- **Reason:** Legacy UI removed; hierarchy page is canonical

**`/admin/definitions/baskets`**
- **Handled by:** `src/routes/admin.js`
- **Action:** Redirect with warning message "removed"
- **Reason:** Baskets feature deprecated

---

## Route Map

### Admin Routes (Require System Admin)

| Route | Method | Handler | Middleware | Description |
|-------|--------|---------|------------|-------------|
| `/admin/login` | GET/POST | `systemAdmin.routes.js` | adminSession | System admin login |
| `/admin/verify` | GET/POST | `systemAdmin.routes.js` | adminSession | Telegram OTP verify |
| `/admin/first-setup` | GET/POST | `systemAdmin.routes.js` | adminSession | First-time setup |
| `/admin/logout` | GET | `systemAdmin.routes.js` | requireSystemAdmin | Logout |
| `/admin/dashboard` | GET | `admin.js` | requireSystemAdmin, requireLogin, enforceRole, enforceStatus | Dashboard |
| `/admin/definitions` | GET | `admin.js` | requireSystemAdmin, requireLogin, enforceRole, enforceStatus | Definitions home |
| `/admin/definitions/hierarchy` | GET/POST | `admin.js` | requireSystemAdmin | Manage org_nodes |
| `/admin/definitions/hierarchy/update` | POST | `admin.js` | requireSystemAdmin | Update node title |
| `/admin/definitions/hierarchy/delete` | POST | `admin.js` | requireSystemAdmin | Delete node |
| `/admin/definitions/hierarchy/arrange` | GET | `admin.js` | requireSystemAdmin | Arrange hierarchy |
| `/admin/definitions/hierarchy/link` | POST | `admin.js` | requireSystemAdmin | Update parent_id |
| `/admin/definitions/org-nodes*` | ALL | `orgNodes.routes.js` | requireSystemAdmin | 301 → `/admin/definitions/hierarchy` |
| `/admin/definitions/baskets` | GET | `admin.js` | requireSystemAdmin | Redirect with warning |
| `/admin/definitions/teams` | GET | `teams.definitions.routes.js` | requireSystemAdmin | List teams |
| `/admin/definitions/teams/new` | GET | `teams.definitions.routes.js` | requireSystemAdmin | Create team form |
| `/admin/definitions/teams/:id/edit` | GET | `teams.definitions.routes.js` | requireSystemAdmin | Edit team form |
| `/admin/definitions/teams` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Create team |
| `/admin/definitions/teams/:id` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Update team |
| `/admin/definitions/teams/:id/toggle` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Toggle active |
| `/admin/definitions/teams/:id/delete` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Delete team |
| `/admin/definitions/teams/:id/members` | GET | `teams.definitions.routes.js` | requireSystemAdmin | Team members page |
| `/admin/definitions/teams/:id/members/candidates` | GET | `teams.definitions.routes.js` | requireSystemAdmin | Search users (JSON) |
| `/admin/definitions/teams/:id/members/add` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Add member |
| `/admin/definitions/teams/:id/members/remove` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Remove member |
| `/admin/definitions/teams/:id/brands` | GET | `teams.definitions.routes.js` | requireSystemAdmin | Team brands page |
| `/admin/definitions/teams/:id/brands/add` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Assign brand |
| `/admin/definitions/teams/:id/brands/remove` | POST | `teams.definitions.routes.js` | requireSystemAdmin | Remove brand |
| `/admin/definitions/brands` | GET | `brands.definitions.routes.js` | requireSystemAdmin | List brands |
| `/admin/definitions/brands/new` | GET | `brands.definitions.routes.js` | requireSystemAdmin | Create form |
| `/admin/definitions/brands/:id/edit` | GET | `brands.definitions.routes.js` | requireSystemAdmin | Edit form |
| `/admin/definitions/brands` | POST | `brands.definitions.routes.js` | requireSystemAdmin | Create brand |
| `/admin/definitions/brands/:id` | POST | `brands.definitions.routes.js` | requireSystemAdmin | Update brand |
| `/admin/definitions/brands/:id/toggle` | POST | `brands.definitions.routes.js` | requireSystemAdmin | Toggle active |
| `/admin/definitions/products` | GET | `products.definitions.routes.js` | requireSystemAdmin | List/filter products |
| `/admin/definitions/products/template.xlsx` | GET | `products.definitions.routes.js` | requireSystemAdmin | Download template |
| `/admin/definitions/products/template` | GET | `products.definitions.routes.js` | requireSystemAdmin | Redirect to .xlsx |
| `/admin/definitions/products/import` | POST | `products.definitions.routes.js` | requireSystemAdmin, multer | Import Excel/CSV |
| `/admin/definitions/products/new` | GET | `products.definitions.routes.js` | requireSystemAdmin | Create form |
| `/admin/definitions/products/:id/edit` | GET | `products.definitions.routes.js` | requireSystemAdmin | Edit form |
| `/admin/definitions/products` | POST | `products.definitions.routes.js` | requireSystemAdmin | Create product |
| `/admin/definitions/products/:id` | POST | `products.definitions.routes.js` | requireSystemAdmin | Update product |
| `/admin/definitions/products/:id/toggle` | POST | `products.definitions.routes.js` | requireSystemAdmin | Toggle active |
| `/admin/definitions/credit-policy` | GET | `creditPolicy.definitions.routes.js` | requireSystemAdmin | List policies |
| `/admin/definitions/credit-policy/:nodeId` | GET | `creditPolicy.definitions.routes.js` | requireSystemAdmin | Edit policy form |
| `/admin/definitions/credit-policy/:nodeId` | POST | `creditPolicy.definitions.routes.js` | requireSystemAdmin | Save policy |
| `/admin/definitions/users` | GET | `adminUsers.definitions.routes.js` | requireSystemAdmin | List users |
| `/admin/definitions/users/:id/edit` | GET | `adminUsers.definitions.routes.js` | requireSystemAdmin | Edit user form |
| `/admin/definitions/users/:id` | POST | `adminUsers.definitions.routes.js` | requireSystemAdmin | Update user |
| `/admin/users` | GET | `adminUsers.routes.js` | requireSystemAdmin | Full user management |
| `/admin/approvals` | GET | `admin.js` | requireSystemAdmin | Approvals page |
| `/admin/inbox` | GET | `inbox.routes.js` | requireLogin | Unified Inbox (replaces legacy approvals placeholders) |
| `/admin/inbox?category=automation` | GET | `inbox.routes.js` | requireLogin | Automation approvals |
| `/admin/inbox?category=credit` | GET | `inbox.routes.js` | requireLogin | Credit/settlement approvals |
| `/admin/inbox?category=users` | GET | `inbox.routes.js` | requireLogin | User approvals |
| `/admin/reports` | GET | `admin.js` | requireSystemAdmin | Reports page |

### User Routes

| Route | Method | Handler | Middleware | Description |
|-------|--------|---------|------------|-------------|
| `/login` | GET/POST | `auth.routes.js` | - | User login |
| `/logout` | GET | `auth.routes.js` | - | User logout |
| `/register` | GET/POST | `register.routes.js` | - | User registration |
| `/pre-register-info` | GET | `register.routes.js` | - | Registration info page |
| `/auth/telegram` | GET/POST | `telegramAuth.routes.js` | - | Telegram OTP flow |
| `/pending` | GET | Various | requireLogin | Pending approval page |
| `/unauthorized` | GET | Various | requireLogin | Access denied page |
| `/customers` | GET | `customers.routes.js` | requireLogin, enforceRole, enforceStatus | Customer list |
| `/credit-sale/list` | GET | `creditSale.routes.js` | requireLogin, enforceRole, enforceStatus | List credit sales |
| `/credit-sale/new` | GET/POST | `creditSale.routes.js` | requireLogin, enforceRole, enforceStatus | Create sale |
| `/credit-sale/:id` | GET | `creditSale.routes.js` | requireLogin, enforceRole, enforceStatus | Sale detail |
| `/credit-settlement/inbox` | GET | `creditSettlement.routes.js` | requireLogin, enforceRole, enforceStatus | Settlement inbox |
| `/credit-settlement/new` | GET/POST | `creditSettlement.routes.js` | requireLogin, enforceRole, enforceStatus | Create settlement |

---

## Views & Layout Architecture

### Layout System

**Two Main Layouts:**

#### 1. Mobile-First Layout (`partials/layout_mobile.ejs`)
- **Used by:** Most pages (both admin and user)
- **Features:**
  - Responsive app bar with hamburger menu
  - Side drawer navigation
  - Theme switching (`theme-admin` or `theme-user`)
  - Page-specific classes via `pageClass` variable
  - Content partials via `contentPartial` variable
  - Error/warning/info message display
  - Extra CSS loading via `extraCss` array
- **Theme Detection:**
  - `theme='admin'` → Admin color scheme, admin menu
  - `theme='user'` → User color scheme, user menu
- **Variables:**
  - `pageTitle`: Page title
  - `theme`: 'admin' or 'user'
  - `user`: Current user object
  - `menuItems`: Navigation menu structure
  - `pageClass`: CSS class for body
  - `contentPartial`: Path to content partial
  - `extraCss`: Array of additional CSS files
  - `error`, `warn`, `info`: Alert messages

#### 2. Admin Layout (`partials/admin_layout.ejs`)
- **Used by:** Some admin pages (alternative to mobile layout)
- **Features:**
  - Fixed top bar with branding
  - Admin navigation menu
  - User badge with logout button
  - "ADMIN MODE" badge indicator
  - Direct content inclusion (no partial system)
- **Variables:**
  - `pageTitle`: Main title
  - `pageSubtitle`: Subtitle
  - `activeNav`: Active menu item key
  - `hideNav`: Hide navigation flag
  - `content`: Path to content file
  - `user`: Current user object

### View Organization

```
src/views/
├── partials/
│   ├── layout_mobile.ejs        # Mobile-first wrapper
│   ├── admin_layout.ejs         # Admin wrapper (alternative)
│   ├── admin_menu_tree.ejs      # Admin menu component
│   └── pages/                   # Content partials for layout_mobile
│       ├── admin_definitions.ejs
│       ├── admin_def_teams.ejs
│       ├── admin_def_brands.ejs
│       └── [other content partials]
├── definitions/                 # Definitions views
│   ├── index.ejs                # Definitions home (full page)
│   ├── teams.ejs                # Teams list (full page)
│   ├── brands.ejs               # Brands list (full page)
│   └── products.ejs             # Products list (full page)
├── admin_*.ejs                  # Admin full-page views
├── login.ejs                    # User login
├── register.ejs                 # User registration
├── telegram_auth.ejs            # Telegram OTP
├── pending.ejs                  # Pending status
└── unauthorized.ejs             # Access denied
```

### View Naming Conventions

- **Full pages:** Direct EJS files in `views/` (e.g., `admin_dashboard.ejs`)
- **Content partials:** In `views/partials/pages/` (e.g., `admin_def_teams.ejs`)
- **Definitions views:** In `views/definitions/` (e.g., `teams.ejs`)
- **Forms:** Typically `admin_def_*_form.ejs` for create/edit forms

### Rendering Patterns

**Pattern 1: Direct render (full page)**
```javascript
res.render('admin_dashboard', { user, pageTitle: 'Dashboard' });
```

**Pattern 2: Mobile layout with content partial**
```javascript
res.render('partials/layout_mobile', {
  theme: 'admin',
  pageTitle: 'Teams',
  pageClass: 'page--definitions-teams',
  contentPartial: 'partials/pages/admin_def_teams',
  user,
  teams,
  error,
  menuItems: [...],
  extraCss: ['/css/pages/admin_definitions.css']
});
```

**Pattern 3: Definitions views (use mobile layout internally)**
```javascript
res.render('definitions/teams', { user, teams, error });
// definitions/teams.ejs includes layout_mobile internally
```

---

## CSS & Static Assets

### CSS Architecture

**Load Order (from `layout_mobile.ejs`):**
1. `/css/app-mobile.css` (base mobile-first styles)
2. **Admin theme (if `theme='admin'`):**
   - `/css/bria-theme.css` (shared theme variables)
   - `/css/admin-theme.css` (admin color scheme)
   - `/css/admin-ui.css` (admin UI components)
   - `/css/admin-definitions-system.css` (definitions-specific)
3. **Page-specific CSS** (via `extraCss` array):
   - `/css/pages/admin_dashboard.css`
   - `/css/pages/admin_definitions.css`
   - `/css/pages/admin_hierarchy.css`
   - `/css/pages/admin_def_brands.css`
   - `/css/pages/admin_def_products.css`
   - etc.

### CSS Files Structure

```
src/public/css/
├── app-mobile.css               # Base mobile-first (ALL pages)
├── bria-theme.css               # Shared theme variables
├── admin-theme.css              # Admin color scheme
├── admin-ui.css                 # Admin UI components (.card, .btn, etc.)
├── admin-definitions-system.css # Definitions-specific styles
└── pages/                       # Page-specific overrides
    ├── admin_dashboard.css
    ├── admin_definitions.css
    ├── admin_hierarchy.css
    ├── admin_approvals.css
    ├── admin_reports.css
    ├── admin_user_edit.css
    ├── admin_users.css
    ├── admin_def_brands.css     # Brands page
    ├── admin_def_products.css   # Products page
    ├── admin_def_baskets.css    # Legacy (may be unused)
    ├── login.css
    ├── pending.css
    ├── pre_register_info.css
    └── telegram_auth.css
```

### CSS Patterns

**Mobile-First Approach:**
- Base styles in `app-mobile.css` for all devices
- Responsive via media queries (min-width breakpoints)
- RTL-aware (Persian text direction)

**Component Classes:**
- `.card`, `.card-header`, `.card-body`: Card containers
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`: Buttons
- `.table`, `.table-hover`: Tables
- `.form-group`, `.form-label`, `.form-control`: Forms
- `.badge`, `.badge-success`, `.badge-warning`: Badges
- `.app-bar`, `.drawer`, `.drawer-overlay`: Mobile navigation

**Page Classes:**
- `.page--definitions-teams`
- `.page--definitions-brands`
- `.page--definitions-products`
- `.page--definitions-hierarchy`
- `.page--login`
- `.page--register`

### Static Assets

```
src/public/
├── css/                         # Stylesheets
├── js/
│   └── admin-ui.js              # Admin UI interactions (drawer, menu)
├── fonts/
│   └── vazir/                   # Vazirmatn font (WOFF2, WOFF)
│       ├── Vazirmatn-Regular.woff2
│       ├── Vazirmatn-Medium.woff2
│       └── Vazirmatn-Bold.woff2
├── icons/
│   ├── icon_1024.png            # Main app logo
│   ├── logo.png                 # Logo variant
│   ├── favicon.png
│   └── favicon.ico
├── manifest.json                # PWA manifest
└── apple-touch-icon.png         # iOS icon
```

### Font Loading

- **Vazirmatn** font is preloaded in admin theme for performance
- Font files hosted locally (no external CDN)
- Supports RTL (Persian/Arabic) text rendering

---

## Database Schema

### Core Tables

#### `users`
Main user accounts table.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  telegram_id TEXT,
  password_hash TEXT,
  verification_code TEXT,
  status TEXT DEFAULT 'pending_verification',
  role TEXT DEFAULT 'USER',
  active BOOLEAN DEFAULT FALSE,
  org_node_id INTEGER REFERENCES org_nodes(id),
  manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Roles:** `USER`, `ADMIN` (legacy), `SUPER_ADMIN` (legacy), `SYSTEM_ADMIN` (compat)  
**Status:** `pending_verification`, `active`, `NEEDS_EDIT`, `rejected`, `pending_*`

#### `system_admins`
Separate table for system administrators (not regular users).

```sql
CREATE TABLE system_admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  telegram_id TEXT,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `org_nodes`
Organizational hierarchy nodes (positions, roles, departments).

```sql
CREATE TABLE org_nodes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id INTEGER REFERENCES org_nodes(id),
  level INTEGER DEFAULT 1,
  branch TEXT DEFAULT 'ORG',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Branch Values:** `'ORG'` (normal), `'SYSTEM'` (system-level nodes)

#### `org_node_edges`
Parent-child relationships for hierarchy (derived/computed table, may be managed by triggers).

```sql
CREATE TABLE org_node_edges (
  child_id INTEGER REFERENCES org_nodes(id),
  parent_id INTEGER REFERENCES org_nodes(id),
  PRIMARY KEY (child_id, parent_id)
);
```

#### `teams`
Team definitions.

```sql
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  org_node_id INTEGER REFERENCES org_nodes(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (LOWER(name))
);
```

#### `user_team_assignment`
One-to-one mapping: user → team (canonical table for team membership).

```sql
CREATE TABLE user_team_assignment (
  user_id TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
```

**Constraint:** Each user can only be in ONE team.

#### `team_users`
Derived table (managed by trigger from `user_team_assignment`), role fixed to `'MEMBER'`.

```sql
CREATE TABLE team_users (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id),
  CHECK (UPPER(role) = 'MEMBER')
);
```

#### `brands`
Brand definitions.

```sql
CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (LOWER(name)),
  UNIQUE (code) WHERE code IS NOT NULL
);
```

#### `team_brands`
Many-to-many: teams ↔ brands.

```sql
CREATE TABLE team_brands (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  priority INTEGER,
  PRIMARY KEY (team_id, brand_id)
);
```

#### `products`
Product definitions.

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  sku_code TEXT,
  name TEXT NOT NULL,
  aliases TEXT[],
  is_key BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sku_code) WHERE sku_code IS NOT NULL,
  UNIQUE (brand_id, LOWER(name))
);
```

#### `org_credit_policy`
Credit policy configuration per org_node.

```sql
CREATE TABLE org_credit_policy (
  org_node_id INTEGER PRIMARY KEY REFERENCES org_nodes(id) ON DELETE CASCADE,
  approver1_node_id INTEGER REFERENCES org_nodes(id),
  approver2_node_id INTEGER REFERENCES org_nodes(id),
  finance_required BOOLEAN DEFAULT FALSE,
  finance_user_id UUID REFERENCES users(id),
  max_open_invoices_per_user INTEGER,
  max_open_amount_per_user NUMERIC,
  max_open_invoices_per_customer INTEGER,
  max_open_amount_per_customer NUMERIC,
  max_invoice_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Session Tables

```sql
CREATE TABLE user_sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE TABLE admin_sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
```

#### `system_settings`
Key-value configuration store.

```sql
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Example keys:** `telegram_bot_token`, `TELEGRAM_BOT_TOKEN`

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ users : "manager_id"
    users }o--|| org_nodes : "org_node_id"
    users ||--o| user_team_assignment : "user_id"
    users ||--o{ brands : "manager_user_id"
    users ||--o{ org_credit_policy : "finance_user_id"
    
    org_nodes ||--o{ org_nodes : "parent_id"
    org_nodes ||--o{ org_node_edges : "child/parent"
    org_nodes ||--|| org_credit_policy : "org_node_id"
    org_nodes ||--o{ teams : "org_node_id"
    org_nodes ||--o{ users : "org_node_id"
    
    teams ||--o{ user_team_assignment : "team_id"
    teams ||--o{ team_users : "team_id"
    teams ||--o{ team_brands : "team_id"
    
    brands ||--o{ team_brands : "brand_id"
    brands ||--o{ products : "brand_id"
    
    user_team_assignment ||--|| team_users : "propagated via trigger"
```

### Constraints & Indexes

**Unique Constraints:**
- `users.username` (unique)
- `system_admins.username` (unique)
- `teams.name` (unique case-insensitive via `LOWER(name)`)
- `brands.name` (unique case-insensitive)
- `brands.code` (unique, nullable)
- `products.sku_code` (unique, nullable)
- `products(brand_id, name)` (unique case-insensitive)
- `user_team_assignment.user_id` (unique - one team per user)
- `team_users(team_id, user_id)` (composite PK)
- `team_brands(team_id, brand_id)` (composite PK)

**Foreign Key Cascades:**
- `teams.org_node_id` → `SET NULL` on delete
- `user_team_assignment.team_id` → `CASCADE` on delete
- `team_users.team_id` → `CASCADE` on delete
- `team_brands` → `CASCADE` on delete
- `products.brand_id` → `CASCADE` on delete
- `org_credit_policy.org_node_id` → `CASCADE` on delete

**Indexes:**
- `teams(org_node_id)`, `teams(LOWER(name))`
- `team_users(user_id)`, `team_users(team_id)`
- `user_team_assignment(team_id)`
- `brands(manager_user_id)`
- `products(brand_id)`
- `users(org_node_id)`, `users(manager_id)`, `users(status)`, `users(active)`

---

## Services Layer

Services encapsulate business logic and database access.

### Service Files

**`src/services/teams.service.js`**
- `listTeamsWithCounts()`: List teams with member/brand counts
- `getTeamById(id)`: Get single team
- `isNameTaken(name, excludeId)`: Check duplicate team name
- `createTeam({ name, orgNodeId })`: Create team
- `updateTeam(id, { name, orgNodeId })`: Update team
- `toggleTeamActive(id)`: Toggle active flag
- `deleteTeam(id)`: Delete team (FK-safe)
- `listTeamMembers(teamId)`: Get team members with user details
- `addMember(teamId, userId)`: Add user to team
- `removeMember(teamId, userId)`: Remove user from team
- `listCandidateUsers(teamId, search)`: Search users for team assignment
- `normalizeUserId(userId)`: Normalize UUID format
- `listTeamBrands(teamId)`: Get brands assigned to team
- `addTeamBrand(teamId, brandId)`: Assign brand to team
- `removeTeamBrand(teamId, brandId)`: Remove brand from team
- `listActiveBrandsSimple()`: Get all active brands
- `listOrgNodes()`: Get org hierarchy nodes
- `queryWithTimeout(query, params, timeout)`: Execute query with timeout

**`src/services/brands.service.js`**
- `listBrandsWithCounts()`: List brands with product counts
- `getBrandById(id)`: Get single brand
- `isNameTaken(name, excludeId)`: Check duplicate brand name
- `isCodeTaken(code, excludeId)`: Check duplicate brand code
- `createBrand({ name, code, isActive, managerUserId })`: Create brand
- `updateBrand(id, { name, code, isActive, managerUserId })`: Update brand
- `toggleBrandActive(id)`: Toggle active flag (warns if products exist)
- `countProducts(brandId)`: Count products for brand
- `listActiveUsersForManagerSelect()`: Get users for manager dropdown
- `listAllBrandsSimple()`: Get all brands (id, name)
- `listActiveBrands()`: Get active brands

**`src/services/products.service.js`**
- `listProducts({ brandId, search, page, pageSize })`: List/filter/paginate products
- `getProductById(id)`: Get single product
- `isSkuTaken(sku, excludeId)`: Check duplicate SKU
- `isNameTaken(brandId, name, excludeId)`: Check duplicate product name per brand
- `createProduct({ brandId, skuCode, name, aliases, isKey, isActive })`: Create product
- `updateProduct(id, { brandId, skuCode, name, aliases, isKey, isActive })`: Update product
- `toggleProductActive(id)`: Toggle active flag
- `getProductsBySkuCodes(skus)`: Bulk lookup by SKU
- `upsertProducts(rows)`: Bulk upsert for Excel import

**`src/services/users.service.js`**
- `listUsersWithOrgTitle()`: List users with org_node title
- `getUserById(id)`: Get single user
- `listOrgNodes()`: Get org hierarchy
- `listDistinctRoles()`: Get all user roles
- `listDistinctStatuses()`: Get all user statuses
- `updateUserDefinitions(id, updates)`: Update user (role/status/org_node)

**`src/services/systemAdmin.service.js`**
- Admin authentication and management

**`src/services/auth.service.js`**
- User authentication helpers

**`src/services/telegramAuth.service.js`**
- Telegram OTP integration

**`src/services/register.service.js`**
- User registration flow

### Service Patterns

**Query Timeout:**
```javascript
// teams.service.js
async function queryWithTimeout(query, params, timeout = 5000) {
  const timeoutMs = parseInt(timeout, 10) || 5000;
  await pool.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
  return await pool.query(query, params);
}
```

**UUID Normalization:**
```javascript
// teams.service.js
function normalizeUserId(userId) {
  // Ensures UUID format consistency
}
```

**Case-Insensitive Checks:**
```javascript
// brands.service.js
async function isNameTaken(name, excludeId = null) {
  let sql = 'SELECT id FROM public.brands WHERE LOWER(name) = LOWER($1)';
  // ...
}
```

---

## Middleware Stack

### Middleware Files

**`src/middlewares/auth.js`**
- `getUser(req)`: Extract user from session
- `isApiRequest(req)`: Detect API/AJAX requests
- `requireLogin(req, res, next)`: Require authenticated user
- `requireAuth`: Alias for `requireLogin`
- `isSuperAdminUser(user)`: Check if user is super admin
- `isAdminUser`: Alias for `isSuperAdminUser`
- `requireAdmin(req, res, next)`: Legacy - redirects to `/admin/login`

**`src/middlewares/systemAdmin.js`**
- `adminSession`: Express session middleware for admin routes
  - Cookie name: `toinf_admin_sid`
  - Path: `/admin`
  - TTL: 2 hours
  - Storage: `admin_sessions` table
- `requireSystemAdmin(req, res, next)`: Verify system admin session
  - Loads admin from `system_admins` table
  - Checks `is_active` flag
  - Checks `locked_until` timestamp
  - Sets `req.systemAdmin` and `req.session.user` (compat)

**`src/middlewares/guards.js`**
- `enforceRole(allowedRoles)`: Check user role
  - Accepts array of roles: `['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN']`
  - Returns 403 if role not allowed
- `enforceStatus(req, res, next)`: Check user status and active flag
  - Loads fresh user data from DB
  - Checks status (`pending_*`, `rejected`)
  - Checks `active` flag
  - Redirects inactive/pending users to `/pending`
  - Normalizes user session data

**`src/middlewares/flowGuards.js`**
- Flow-specific guards (not heavily used currently)

### Middleware Chain Examples

**Admin Route:**
```javascript
router.get(
  '/admin/definitions/teams',
  adminSession,               // 1. Admin session
  requireSystemAdmin,         // 2. Verify system admin
  requireLogin,               // 3. Ensure login (compat)
  enforceRole(['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN']), // 4. Check role
  enforceStatus,              // 5. Check user status
  handler                     // 6. Route handler
);
```

**User Route:**
```javascript
router.get(
  '/credit-sale/list',
  requireLogin,               // 1. Require login
  enforceRole(['USER']),      // 2. Check role
  enforceStatus,              // 3. Check status/active
  handler                     // 4. Route handler
);
```

---

## Navigation Flow Diagrams

### Admin Navigation Flow

```mermaid
flowchart TD
    A[/admin/login] -->|System Admin Login| B{Authenticated?}
    B -->|No| A
    B -->|Yes| C[/admin/definitions]
    
    C --> D[/admin/definitions/teams]
    C --> E[/admin/definitions/brands]
    C --> F[/admin/definitions/products]
    C --> G[/admin/definitions/hierarchy]
    C --> H[/admin/definitions/credit-policy]
    C --> I[/admin/definitions/users]
    
    D --> D1[/teams/new]
    D --> D2[/teams/:id/edit]
    D --> D3[/teams/:id/members]
    D --> D4[/teams/:id/brands]
    
    E --> E1[/brands/new]
    E --> E2[/brands/:id/edit]
    
    F --> F1[/products/new]
    F --> F2[/products/:id/edit]
    F --> F3[/products/import]
    
    G --> G1[/hierarchy/arrange]
    
    H --> H1[/credit-policy/:nodeId]
    
    I --> I1[/users/:id/edit]
    
    C --> J[/admin/dashboard]
    C --> K[/admin/users]
    C --> L[/admin/approvals]
    C --> M[/admin/reports]
```

### User Registration Flow

```mermaid
flowchart TD
    A[/pre-register-info] -->|Read Info| B[/register]
    B -->|Submit Form| C{Validation OK?}
    C -->|No| B
    C -->|Yes| D[Save to DB]
    D --> E[/auth/telegram]
    E -->|Send OTP| F{Telegram ID Valid?}
    F -->|No| G[Error]
    F -->|Yes| H[Send Code]
    H --> I[User Enters Code]
    I --> J{Code Correct?}
    J -->|No| I
    J -->|Yes| K[/pending]
    K -->|Admin Approves| L[Status: active]
    L --> M[/credit-sale/list or /]
```

### Definitions Hierarchy Flow

```mermaid
flowchart TD
    A[/admin/definitions/hierarchy] -->|List Nodes| B{Action?}
    B -->|Create| C[POST /hierarchy]
    B -->|Edit| D[POST /hierarchy/update]
    B -->|Delete| E[POST /hierarchy/delete]
    E --> E1{Has Children/Users?}
    E1 -->|Yes| E2[Error: Cannot Delete]
    E1 -->|No| E3[Delete OK]
    B -->|Arrange| F[/hierarchy/arrange]
    F --> G[Show Nodes + Edges]
    G --> H[POST /hierarchy/link]
    H --> H1{Cycle Detected?}
    H1 -->|Yes| H2[Error: Loop]
    H1 -->|No| H3[Update parent_id]
```

---

## Regression Prevention Checklist

Use this checklist before deploying changes to avoid known issues:

### Routes
- [ ] **No bare wildcard routes** (e.g., `/path*`) - use explicit params or regex
  - Check: `rg "\.get\(.*\*['\"]" src/routes/`
  - Exception: `orgNodes.routes.js` uses `.all()` with wildcard (safe pattern)
- [ ] **Legacy org-nodes redirect** active: `/admin/definitions/org-nodes*` → 301 to `/hierarchy`
  - Check: `curl -I http://localhost:3000/admin/definitions/org-nodes`
- [ ] **Baskets redirect** present: `/admin/definitions/baskets` → redirect with warning
- [ ] **All definition routes** require `requireSystemAdmin` middleware

### SQL
- [ ] **All queries use parameterized placeholders** (`$1`, `$2`, etc.)
- [ ] **No string concatenation** of user input in SQL
- [ ] **Case-insensitive checks** use `LOWER()` function
- [ ] **Unique constraints** respected in services (pre-check before insert)

### Hierarchy
- [ ] **Cycle detection** active in `/hierarchy/link` handler
- [ ] **Delete guards** prevent removing nodes with children/users
- [ ] **org_node_edges table** tolerates missing table gracefully

### Teams
- [ ] **UUID validation** in `addMember` (normalizeUserId)
- [ ] **One team per user** enforced (user_team_assignment unique constraint)
- [ ] **Conflict codes** handled: `23505` (duplicate), `23503` (FK violation)

### Brands & Products
- [ ] **Active flag toggle** warns when products/teams exist
- [ ] **Duplicate checks** enforce unique names/codes/SKUs
- [ ] **Import limits** enforced: max 5000 rows, 10MB file size
- [ ] **Import header validation** checks required columns

### Credit Policy
- [ ] **Approver1 required** (cannot save without)
- [ ] **Finance user required** if `finance_required=true`
- [ ] **Org node existence** validated before save

### Views
- [ ] **RTL classes** preserved in mobile layout
- [ ] **User display** uses `first_name` + `last_name` (not `full_name`)
- [ ] **Theme switching** works: `theme='admin'` vs `theme='user'`
- [ ] **Menu filtering** removes baskets href from menu

### CSS
- [ ] **Load order** correct: base → theme → page-specific
- [ ] **Mobile-first** approach maintained
- [ ] **Page classes** used for scoping styles

### Testing
- [ ] **All route tests** pass: `npm test`
- [ ] **No DB mocking errors** (check mock setup in tests)
- [ ] **Smoke test** passes: `bash QA_SMOKE_AFTER_FIX.sh` (if present)

### Smoke Test Commands
```bash
# Restart app
npm start &
sleep 5

# Check admin login
curl -I http://localhost:3000/admin/login

# Check definitions
curl -I http://localhost:3000/admin/definitions

# Check teams
curl -I http://localhost:3000/admin/definitions/teams

# Check hierarchy
curl -I http://localhost:3000/admin/definitions/hierarchy

# Check legacy redirect
curl -I http://localhost:3000/admin/definitions/org-nodes

# Grep for wildcard routes
rg "org-nodes\\*" src/routes

# Stop server
pkill -f "node.*server.js"
```

---

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Telegram bot token (for OTP)

### Installation
```bash
# Install dependencies
npm ci

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
export SESSION_SECRET="your-secret"
export ADMIN_SESSION_SECRET="your-admin-secret"
export TELEGRAM_BOT_TOKEN="your-telegram-bot-token" # Optional for development

# Run migrations
npm run db:patch

# Start server
npm start

# Server runs on http://localhost:3000 (or PORT env var)
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
node --test src/routes/teams.definitions.routes.test.js
```

### Database Migrations
```bash
# Apply migrations
npm run db:patch

# Manual migration
psql "$DATABASE_URL" -f migrations/000_fix_consistency.sql
```

---

## Known Issues & Workarounds

### Issue: Wildcard Route Crash
**Problem:** Express 5.x with path-to-regexp crashes on `/path*` syntax.  
**Solution:** Use `.all('/definitions/org-nodes*', ...)` in separate middleware file (`orgNodes.routes.js`) mounted with `app.use('/admin', ...)`. This isolates the wildcard pattern.  
**Prevention:** Never use bare `*` in route paths; use `:param(*)` or regex instead.

### Issue: SQL Placeholder Syntax Error
**Problem:** Mixing parameterized queries with string concatenation causes "syntax error near $1".  
**Solution:** Always use array-based params: `query(sql, [val1, val2])`.  
**Prevention:** Code review for SQL concatenation patterns.

### Issue: Hierarchy Cycle
**Problem:** Setting `parent_id` can create loops in org_nodes tree.  
**Solution:** `/hierarchy/link` includes cycle detection via recursive query.  
**Prevention:** Always validate parent-child relationships before update.

### Issue: Team Member Duplicates
**Problem:** Multiple assignments to same team if UUID format varies.  
**Solution:** `normalizeUserId()` standardizes UUID format before insert.  
**Prevention:** Use `normalizeUserId()` in all user-related services.

---

## Future Enhancements

Planned features not yet implemented:

1. **User Dashboard** - Home page for authenticated users
2. **Voice Recording** - Capture and analyze sales calls
3. **AI Analysis** - Score voice recordings (0-100)
4. **Advanced Reports** - KPI dashboard with charts
5. **Notification System** - Real-time alerts for approvals
6. **Mobile App** - Native iOS/Android apps
7. **API Layer** - REST API for mobile apps
8. **Multi-language** - Support for English UI
9. **Role Permissions** - Fine-grained permissions per role
10. **Audit Log** - Track all changes for compliance

---

## Appendix: File Reference

### Key Configuration Files
- `package.json`: Dependencies and scripts
- `src/app.js`: Express app setup
- `src/server.js`: HTTP server
- `src/config/db.js`: Database pool
- `.gitignore`: Ignored files
- `migrations/*.sql`: Database migrations

### Key Route Files
- `src/routes/admin.js`: Admin core routes
- `src/routes/systemAdmin.routes.js`: System admin auth
- `src/routes/teams.definitions.routes.js`: Teams CRUD
- `src/routes/brands.definitions.routes.js`: Brands CRUD
- `src/routes/products.definitions.routes.js`: Products CRUD + import
- `src/routes/creditPolicy.definitions.routes.js`: Credit policies
- `src/routes/adminUsers.definitions.routes.js`: User management (definitions)
- `src/routes/orgNodes.routes.js`: Legacy redirect

### Key View Files
- `src/views/partials/layout_mobile.ejs`: Main layout
- `src/views/partials/admin_layout.ejs`: Admin layout
- `src/views/definitions/index.ejs`: Definitions home
- `src/views/definitions/teams.ejs`: Teams page
- `src/views/definitions/brands.ejs`: Brands page
- `src/views/definitions/products.ejs`: Products page
- `src/views/admin_hierarchy.ejs`: Hierarchy page
- `src/views/admin_hierarchy_arrange.ejs`: Hierarchy arrange

### Key CSS Files
- `src/public/css/app-mobile.css`: Base styles
- `src/public/css/admin-theme.css`: Admin colors
- `src/public/css/admin-ui.css`: Admin components
- `src/public/css/pages/admin_definitions.css`: Definitions styles
- `src/public/css/pages/admin_hierarchy.css`: Hierarchy styles

### Key Service Files
- `src/services/teams.service.js`: Teams business logic
- `src/services/brands.service.js`: Brands business logic
- `src/services/products.service.js`: Products business logic + import
- `src/services/users.service.js`: Users business logic

---

## Documentation Maintenance

This document should be updated when:
- New routes are added or removed
- Database schema changes (new tables, columns, constraints)
- Authentication/authorization logic changes
- View structure changes (new layouts, partials)
- CSS architecture changes
- New services or middleware are added
- Known issues are discovered or resolved

**Document Owner:** Development Team  
**Review Frequency:** After each major feature release  
**Last Reviewed:** 2025-12-21

---

## Related Documentation

- [DEFINITIONS_README.md](./DEFINITIONS_README.md) - Detailed Definitions module guide
- [DB_MAP.md](./DB_MAP.md) - Database schema overview
- [QA_SMOKE_AFTER_FIX.md](./QA_SMOKE_AFTER_FIX.md) - QA smoke test procedures
- [docs/spec/](./spec/) - Original specification documents
- [GUIDE_Definitions_Teams_Brands_Products.md](../GUIDE_Definitions_Teams_Brands_Products.md) - Implementation guide

---

**End of Architecture Document**
