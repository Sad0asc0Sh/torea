# Changelog

All notable changes to the Catalog Manager will be documented here.

## [2.0.0] - 2025-01-01

### 🎉 Major Release: New Catalog Manager

Complete rewrite of catalog management system with modern features.

### ✨ Added

- **Auto-discovery**: Automatic detection of pages from routes and views
- **Multi-view**: Tree, List, and Kanban views
- **Advanced filters**: Search, status, source, and type filters
- **Properties panel**: Edit all item details in sidebar
- **Dark mode**: Full dark theme support
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Performance**: Caching, debouncing, lazy loading
- **Polish**: Animations, loading states, toast notifications
- **Migration guide**: Step-by-step guide from old system (`docs/migration/CATALOG_MIGRATION.md`)
- **User guide**: Complete documentation (`docs/CATALOG_MANAGER_USER_GUIDE.md`)
- **Cleanup script**: Data cleanup utility (`scripts/cleanup-catalog.js`)
- **NPM scripts**: Added `catalog:cleanup` (cross-platform), `catalog:health`, `catalog:cache:clear` (Unix/Linux/Mac only, requires curl)

### 🔄 Changed

- Old catalog system marked as deprecated
- URL changed from `/admin/settings/catalog` to `/admin/settings/catalog-manager`
- UI completely redesigned
- Database schema enhanced (icon, metadata columns)

### 🐛 Fixed

- Fixed orphaned items issue
- Fixed duplicate entries
- Fixed performance issues with large datasets
- Fixed RTL layout issues

### 🗑️ Deprecated

- Old catalog routes in `src/routes/admin/settings/catalog.routes.js`
- Old catalog view in `src/views/admin/settings/catalog.ejs`
- Will be removed in version 3.0.0 (2026)

### 📚 Documentation

- Complete user guide with all features
- Migration guide step-by-step
- Troubleshooting and FAQ sections
- Keyboard shortcuts reference

### 🔐 Security

- Input validation and sanitization
- SQL injection prevention
- XSS protection in inline editing

---

## [1.x.x] - Previous versions

Legacy catalog system (deprecated).

---

## Future Roadmap

### [3.0.0] - 2026 (Planned)

- **Breaking**: Remove old catalog system completely
- Drag & drop reordering
- Manual item creation
- Batch operations
- Advanced permissions
- Audit log

### [2.1.0] - Q2 2025 (Planned)

- Real-time collaboration
- Undo/redo functionality
- Export/import catalog data
- API documentation
- Performance optimizations

---

[2.0.0]: https://github.com/smkhadivpoor/Toinfinity/releases/tag/v2.0.0
