# ToInfinity Project - Final Folder Structure

## Backend Routes Structure

```
src/routes/
├── admin/
│   ├── index.js                          # Main admin router (mounts definitions, tools, pages)
│   ├── pages.routes.js                   # Admin pages (dashboard, reports, approvals, hierarchy)
│   ├── definitions/
│   │   ├── index.js                      # Definitions router (mounts all definition routes)
│   │   ├── brands.routes.js              # Brand definitions CRUD
│   │   ├── brands.routes.test.js         # Brand routes tests
│   │   ├── products.routes.js            # Product definitions CRUD
│   │   ├── products.routes.test.js       # Product routes tests
│   │   ├── teams.routes.js               # Team definitions CRUD
│   │   ├── teams.routes.test.js          # Team routes tests
│   │   ├── creditPolicy.routes.js        # Credit policy definitions
│   │   ├── creditPolicy.routes.test.js   # Credit policy tests
│   │   ├── users.routes.js               # Admin user definitions
│   │   └── users.routes.test.js          # User definitions tests
│   └── tools/
│       └── index.js                      # Admin tools placeholder
├── auth/
│   └── index.js                          # Authentication routes (login, logout)
├── register/
│   └── index.js                          # Registration routes
├── telegram/
│   ├── index.js                          # Telegram auth routes
│   └── index.test.js                     # Telegram auth tests
├── user/
│   ├── index.js                          # User routes placeholder
│   ├── definitions/
│   │   └── index.js                      # User definitions placeholder
│   └── tools/
│       └── index.js                      # User tools placeholder
├── customers.routes.js                   # Customer management (user-facing)
├── creditSale.routes.js                  # Credit sale operations (user-facing)
├── creditSettlement.routes.js            # Credit settlement operations (user-facing)
├── adminUsers.routes.js                  # Admin user management operations
├── systemAdmin.routes.js                 # System admin operations
└── (legacy inline routes removed)

## Views Structure

```
src/views/
├── admin/
│   ├── definitions/
│   │   ├── index.ejs                     # Definitions center page
│   │   ├── brands.ejs                    # Brands list view
│   │   ├── brand_form.ejs                # Brand create/edit form
│   │   ├── products.ejs                  # Products list view
│   │   ├── product_form.ejs              # Product create/edit form
│   │   ├── teams.ejs                     # Teams list view (from definitions/teams.ejs)
│   │   ├── team_form.ejs                 # Team create/edit form
│   │   ├── team_members.ejs              # Team members management
│   │   ├── team_brands.ejs               # Team brands assignment
│   │   ├── credit_policy.ejs             # Credit policy list
│   │   ├── credit_policy_form.ejs        # Credit policy form
│   │   ├── users.ejs                     # Admin users list
│   │   └── user_edit.ejs                 # Admin user edit form
│   ├── tools/
│   │   └── index.ejs                     # Admin tools placeholder page
│   ├── dashboard.ejs                     # Admin dashboard
│   ├── reports.ejs                       # Admin reports
│   ├── approvals.ejs                     # User approvals page
│   ├── hierarchy.ejs                     # Organization hierarchy
│   ├── hierarchy_arrange.ejs             # Hierarchy arrangement
│   ├── users.ejs                         # Admin users management
│   └── user_edit.ejs                     # Admin user edit
├── auth/
│   ├── login.ejs                         # User login page
│   ├── register.ejs                      # User registration page
│   ├── pending.ejs                       # Pending approval page
│   ├── pre_register_info.ejs             # Pre-registration info
│   ├── telegram_auth.ejs                 # Telegram authentication
│   ├── system_admin_login.ejs            # System admin login
│   ├── system_admin_verify.ejs           # System admin verification
│   └── system_admin_first_setup.ejs      # System admin first setup
├── shared/
│   ├── partials/                         # Shared EJS partials (for future use)
│   └── layouts/                          # Shared EJS layouts (for future use)
├── user/
│   ├── definitions/                      # User definitions views (placeholder)
│   └── tools/                            # User tools views (placeholder)
├── customers.ejs                         # Customer management page
├── credit_sale_list.ejs                  # Credit sale list
├── credit_sale_new.ejs                   # New credit sale form
├── credit_sale_detail.ejs                # Credit sale detail
├── credit_settlement_inbox.ejs           # Credit settlement inbox
├── credit_settlement_new.ejs             # New credit settlement
├── unauthorized.ejs                      # Unauthorized access page
├── admin_section_disabled.ejs            # Section disabled message
├── admin_definitions_org_nodes.ejs       # Org nodes (legacy)
└── admin_definitions_org_nodes_form.ejs  # Org nodes form (legacy)

## CSS Structure

```
src/public/css/
├── admin/
│   ├── definitions/
│   │   ├── brands.css                    # Brands page styles
│   │   ├── products.css                  # Products page styles
│   │   ├── baskets.css                   # Baskets page styles
│   │   └── index.css                     # Definitions center styles
│   ├── dashboard.css                     # Dashboard styles
│   ├── reports.css                       # Reports styles
│   ├── approvals.css                     # Approvals styles
│   ├── hierarchy.css                     # Hierarchy styles
│   ├── users.css                         # Admin users styles
│   └── user_edit.css                     # User edit styles
├── user/
│   ├── definitions/                      # User definitions CSS (placeholder)
│   └── tools/                            # User tools CSS (placeholder)
├── shared/
│   ├── base.css                          # Base styles
│   ├── admin-theme.css                   # Admin theme
│   ├── admin-ui.css                      # Admin UI components
│   ├── bria-theme.css                    # Bria theme
│   ├── app-mobile.css                    # Mobile app styles
│   ├── admin-definitions-system.css      # Admin definitions system styles
│   ├── login.css                         # Login page styles
│   ├── pending.css                       # Pending page styles
│   ├── pre_register_info.css             # Pre-register info styles
│   └── telegram_auth.css                 # Telegram auth styles
└── pages/                                # Legacy page CSS (to be deprecated)
    ├── admin_def_brands.css
    ├── admin_def_products.css
    ├── admin_def_baskets.css
    ├── admin_definitions.css
    ├── admin_dashboard.css
    ├── admin_reports.css
    ├── admin_approvals.css
    ├── inbox.css                         # Unified Inbox styles
    ├── admin_hierarchy.css
    ├── admin_users.css
    ├── admin_user_edit.css
    ├── login.css
    ├── pending.css
    ├── pre_register_info.css
    └── telegram_auth.css

## Key Features of New Structure

### 1. Clear Separation
- **Admin**: All admin-related routes, views, and CSS under `admin/`
- **Auth**: Authentication routes and views under `auth/`, `register/`, `telegram/`
- **User**: Placeholder structure for future user-specific features
- **Shared**: Common resources accessible by all sections

### 2. Definitions vs Tools
- **Definitions**: CRUD operations for managing system entities (brands, products, teams, etc.)
- **Tools**: Operational tools for admins (placeholder for future features)

### 3. Modular Organization
- Each major section has its own router that mounts sub-routers
- Views organized to match route structure
- CSS follows the same organizational pattern

### 4. Scalability
- Easy to add new definitions or tools
- Clear structure for adding user-facing features
- Placeholder structures ready for expansion

### 5. Backward Compatibility
- Old files remain in place during transition
- New structure mirrors and improves on old structure
- URL paths preserved for external compatibility

## URL Structure (Unchanged)

All URLs remain the same:
- `/admin/dashboard` - Admin dashboard
- `/admin/definitions` - Definitions center
- `/admin/definitions/brands` - Brands management
- `/admin/definitions/products` - Products management
- `/admin/definitions/teams` - Teams management
- `/admin/definitions/hierarchy` - Organization hierarchy
- `/admin/reports` - Admin reports
- `/admin/approvals` - User approvals
- `/login` - User login
- `/register` - User registration
- `/telegram/auth` - Telegram authentication

## Import Patterns

### Route Imports (from routes/)
```javascript
// Services
require('../../services/...')      // From auth/, register/, telegram/
require('../../../services/...')   // From admin/definitions/

// Middlewares
require('../../middlewares/...')   // From auth/, register/, telegram/
require('../../../middlewares/...') // From admin/definitions/

// Config
require('../../config/...')        // From auth/, register/, telegram/
require('../../../config/...')     // From admin/definitions/
```

### View Paths (in res.render())
```javascript
// Admin
res.render('admin/definitions/brands')
res.render('admin/dashboard')
res.render('admin/tools/index')

// Auth
res.render('auth/login')
res.render('auth/register')

// User (future)
res.render('user/dashboard')
```

### CSS Paths (in views)
```html
<!-- Shared CSS -->
<link rel="stylesheet" href="/css/shared/base.css">
<link rel="stylesheet" href="/css/shared/admin-theme.css">

<!-- Admin CSS -->
<link rel="stylesheet" href="/css/admin/dashboard.css">
<link rel="stylesheet" href="/css/admin/definitions/brands.css">
```

## Testing

All test files moved alongside their route files:
- `src/routes/admin/definitions/brands.routes.test.js`
- `src/routes/admin/definitions/products.routes.test.js`
- `src/routes/admin/definitions/teams.routes.test.js`
- `src/routes/admin/definitions/creditPolicy.routes.test.js`
- `src/routes/admin/definitions/users.routes.test.js`
- `src/routes/telegram/index.test.js`

## Next Steps

1. **Remove Old Files**: After thorough testing, remove original files from old locations
2. **Update Documentation**: Update any documentation referencing old paths
3. **Implement Tools**: Add actual admin tools functionality
4. **User Section**: Implement user-specific features in user/ directories
5. **Shared Partials**: Move common EJS partials to shared/partials/
