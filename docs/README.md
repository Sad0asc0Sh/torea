# ToInfinity Documentation Index

Welcome to the ToInfinity project documentation. This index provides quick access to all documentation resources.

---

## 📚 Core Documentation

### **[ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md)** ⭐
**The canonical reference for the current implementation.**  
Start here for understanding the complete architecture, including:
- Project structure and technology stack
- Admin vs User authentication flows
- Definitions module (teams, brands, products, hierarchy, credit policy)
- Database schema with ERD diagrams
- Route map and middleware stack
- Views, layouts, and CSS organization
- Regression prevention checklist

### **[DEFINITIONS_README.md](./DEFINITIONS_README.md)**
**Comprehensive guide to the Definitions module.**  
Detailed documentation covering:
- Route inventory (all definitions endpoints)
- Service layer (teams, brands, products)
- Views and partials structure
- Static assets and CSS
- Database tables and relationships
- Where to change safely
- Smoke tests and regression checks

---

## 🗂️ Database Documentation

### **[DB_MAP.md](./DB_MAP.md)**
High-level database schema overview. Lists key tables and fields observed from code queries.

**Note:** For complete database schema with ERD, see [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#database-schema).

---

## 🏗️ Implementation Guides

### **[../GUIDE_Definitions_Teams_Brands_Products.md](../GUIDE_Definitions_Teams_Brands_Products.md)**
Implementation plan and discovery notes for the Definitions module (Teams, Brands, Products). Includes:
- Discovery phase findings
- Implementation plan (routes, views, DB, validation)
- Manual QA checklist
- Test strategy

---

## Frontend

## 🎨 CSS Architecture

این پروژه از یک سیستم CSS مدرن و modular استفاده میکند که در 3 PR بزرگ refactor شده. 

ساختار:
- `src/public/css/1-foundation/` (متغیرها، reset، typography)
- `src/public/css/2-components/` (6 component)
- `src/public/css/3-layouts/` (grid، spacing، shell)
- `src/public/css/4-views/` (admin و user themes)
- `src/public/css/app.css` (entry point)

استفاده:
```html
<html lang="fa" dir="rtl" data-theme="admin">
  <link rel="stylesheet" href="/css/app.css">
</html>
```

---

## 🧪 Testing & QA

### **[QA_SMOKE_AFTER_FIX.md](./QA_SMOKE_AFTER_FIX.md)**
Smoke test procedures for verifying fixes and deployments.

### **Running Tests**
```bash
# Run all tests
npm test

# Run specific test file
node --test src/routes/teams.definitions.routes.test.js

# Smoke test (manual)
bash QA_SMOKE_AFTER_FIX.sh
```

---

## 🛠️ Setup & Operations

### **Quick Start**
```bash
# Install dependencies
npm ci

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost/dbname"
export SESSION_SECRET="your-secret"
export ADMIN_SESSION_SECRET="your-admin-secret"

# Run migrations
npm run db:patch

# Start server
npm start
```

For detailed setup instructions, see [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#development-setup).

### **Database Migrations**
```bash
# Apply all migrations
npm run db:patch

# Apply single migration
psql "$DATABASE_URL" -f migrations/000_fix_consistency.sql
```

Migration files:
- `migrations/000_fix_consistency.sql` - Teams and users tables
- `migrations/001_add_brand_manager.sql` - Brand manager field
- `migrations/002_add_user_search_indexes.sql` - User search indexes
- `migrations/003_add_team_users_indexes.sql` - Team users indexes
- `migrations/004_fix_team_users_fks.sql` - Team users foreign keys

---

## 📋 Original Specifications

### **[spec/_spec_files/](./spec/_spec_files/)**
Original project specification documents:

- **[01-Vision-and-Scope.md](./spec/_spec_files/01-Vision-and-Scope.md)** - Project vision and scope
- **[02-SRS-Requirements.md](./spec/_spec_files/02-SRS-Requirements.md)** - Software requirements specification
- **[03-WBS.md](./spec/_spec_files/03-WBS.md)** - Work breakdown structure
- **[04-Flowcharts.md](./spec/_spec_files/04-Flowcharts.md)** - Process flowcharts
- **[05-ERD.md](./spec/_spec_files/05-ERD.md)** - Entity relationship diagrams (original spec)
- **[06-Architecture.md](./spec/_spec_files/06-Architecture.md)** - Architecture specification (original plan)
- **[07-Roadmap.md](./spec/_spec_files/07-Roadmap.md)** - Development roadmap
- **[08-UI-UX-Wireframes.md](./spec/_spec_files/08-UI-UX-Wireframes.md)** - UI/UX wireframes
- **[09-Test-Plan.md](./spec/_spec_files/09-Test-Plan.md)** - Test plan
- **[API.md](./spec/_spec_files/API.md)** - API specification (planned)
- **[IMPLEMENTATION_STATUS.md](./spec/_spec_files/IMPLEMENTATION_STATUS.md)** - Implementation status
- **[SETUP.md](./spec/_spec_files/SETUP.md)** - Setup instructions (spec phase)

⚠️ **Note:** Spec files represent the original plan. For current implementation, always refer to [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md).

### **[spec/_spec_text/](./spec/_spec_text/)**
Full text specification documents (Persian + English):
- `ToInfinity.txt` - Brief specification
- `ToInfinity_FULL.txt` - Complete specification

---

## 🗺️ Auxiliary Documentation

### **[DOMAIN_MAP.md](./DOMAIN_MAP.md)**
Domain-level overview of the project structure, modules, and flows. Covers:
- User roles and status
- Auth flow
- Modules (hierarchy, voice capture, AI analysis, credit, reports, settings)
- Backend/frontend boundaries

### **[_map.txt](./_map.txt)**
Quick reference text file mapping project structure.

### **[_map_routes.txt](./_map_routes.txt)**
Route mapping reference.

---

## 🔄 Migrations & Changelogs

### **[migrations/2025-12-19_runbook.md](./migrations/2025-12-19_runbook.md)**
Runbook for specific migration on 2025-12-19.

### **[../CLEANUP_REPORT.md](../CLEANUP_REPORT.md)**
Report of cleanup operations (removed backup files, etc.).

### **[../CLEANUP_DELETED_FILES.txt](../CLEANUP_DELETED_FILES.txt)**
List of files deleted during cleanup.

---

## 🔍 Finding Information

### By Topic

| Topic | Primary Document | Additional Resources |
|-------|------------------|----------------------|
| **Architecture Overview** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) | [DOMAIN_MAP.md](./DOMAIN_MAP.md) |
| **Definitions Module** | [DEFINITIONS_README.md](./DEFINITIONS_README.md) | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#definitions-module) |
| **Database Schema** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#database-schema) | [DB_MAP.md](./DB_MAP.md) |
| **Authentication** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#authentication--authorization) | [DOMAIN_MAP.md](./DOMAIN_MAP.md) |
| **Routes** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#route-map) | [DEFINITIONS_README.md](./DEFINITIONS_README.md#route-inventory) |
| **Views & CSS** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#views--layout-architecture) | [DEFINITIONS_README.md](./DEFINITIONS_README.md#static-assets-css--ui-structure) |
| **Testing** | [QA_SMOKE_AFTER_FIX.md](./QA_SMOKE_AFTER_FIX.md) | [DEFINITIONS_README.md](./DEFINITIONS_README.md#smoke-tests) |
| **Setup** | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md#development-setup) | [spec/_spec_files/SETUP.md](./spec/_spec_files/SETUP.md) |
| **Original Specs** | [spec/_spec_files/README.md](./spec/_spec_files/README.md) | [spec/_spec_text/](./spec/_spec_text/) |

### By File Type

- **Markdown Guides:** `ARCHITECTURE_CURRENT.md`, `DEFINITIONS_README.md`, `GUIDE_*.md`
- **Database Docs:** `DB_MAP.md`, `ARCHITECTURE_CURRENT.md` (Database Schema section)
- **Specs:** `docs/spec/_spec_files/*.md`
- **Migration Docs:** `docs/migrations/*.md`
- **Quick References:** `_map*.txt`

---

## 📝 Documentation Standards

### When to Update Documentation

Update documentation when:
- ✅ New routes are added or removed
- ✅ Database schema changes (tables, columns, constraints)
- ✅ Authentication/authorization logic changes
- ✅ View structure changes (layouts, partials)
- ✅ CSS architecture changes
- ✅ New services or middleware added
- ✅ Known issues discovered or resolved
- ✅ Deprecations or redirects added

### Documentation Hierarchy

1. **ARCHITECTURE_CURRENT.md** - Single source of truth for current implementation
2. **Module-specific docs** - Detailed guides (e.g., DEFINITIONS_README.md)
3. **Spec files** - Original specifications (reference only)

**Rule:** If there's a conflict between docs, ARCHITECTURE_CURRENT.md is authoritative.

### Deprecation Process

When marking docs as deprecated:
1. Add header: `**⚠️ DEPRECATED** - See [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) for current information.`
2. Add reason for deprecation
3. Link to replacement documentation
4. Keep file for historical reference (do not delete)

---

## 🆘 Need Help?

### Common Questions

**Q: Where do I start if I'm new to the project?**  
A: Read [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) from top to bottom. It's the complete guide.

**Q: How do I understand the Definitions module?**  
A: See [DEFINITIONS_README.md](./DEFINITIONS_README.md) for comprehensive coverage.

**Q: What database tables exist?**  
A: Check [ARCHITECTURE_CURRENT.md - Database Schema](./ARCHITECTURE_CURRENT.md#database-schema) for ERD and table definitions.

**Q: How do I add a new route?**  
A: Follow patterns in existing route files (`src/routes/`). Ensure proper middleware chain (see [ARCHITECTURE_CURRENT.md - Route Map](./ARCHITECTURE_CURRENT.md#route-map)).

**Q: The spec says X, but the code does Y. Which is right?**  
A: The code is right. Specs are original plans. Always refer to [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) for actual implementation.

**Q: How do I run tests?**  
A: `npm test` for all tests. See [Testing & QA](#-testing--qa) section.

**Q: What's the difference between `users` and `system_admins` tables?**  
A: `system_admins` are system administrators who access `/admin/*` routes. `users` are regular application users (sales reps, etc.). See [Authentication](./ARCHITECTURE_CURRENT.md#authentication--authorization).

---

## 🔗 External Resources

- **Node.js Docs:** https://nodejs.org/docs/
- **Express.js Docs:** https://expressjs.com/
- **EJS Docs:** https://ejs.co/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

---

## 📄 License & Contributing

(Add license and contributing guidelines here if applicable)

---

**Document Maintained By:** Development Team  
**Last Updated:** 2025-12-21  
**Version:** 1.0
