# Catalog Manager API Reference

## Endpoints

### GET /admin/settings/catalog-manager
Display catalog manager UI page

**Authentication**: Required  
**Response**: HTML page

**Query Parameters**:
- `view` (optional): View type ('tree', 'list', 'kanban')
- `ok` (optional): Success message
- `err` (optional): Error message

**Example**: 
```bash
GET /admin/settings/catalog-manager?view=tree&ok=Success
```

---

### POST /admin/settings/catalog-manager/apply
Apply bulk changes

**Authentication**: Required  
**Content-Type**: application/x-www-form-urlencoded

**Request Body**:
- `selected_keys[]`: Array of keys to activate
- `edits`: JSON string of edits
- `items_data`: JSON string of all items

**Response**: Redirect to catalog-manager with message

**Example**:
```bash
POST /admin/settings/catalog-manager/apply
selected_keys[]=admin.dashboard&selected_keys[]=admin.settings
edits={"admin.dashboard": {"title":"داشبورد جدید"}}
items_data=[{...}]
```

---

### POST /admin/settings/catalog-manager/quick-edit
Quick edit single field (AJAX)

**Authentication**: Required  
**Content-Type**: application/json

**Request Body**:
```json
{
  "key": "admin.dashboard",
  "field": "title",
  "value": "داشبورد"
}
```

**Response**:
```json
{
  "ok": true
}
```

**Error Response**:
```json
{
  "ok": false,
  "error": "error message"
}
```

**Allowed Fields**:
- `title`
- `description`
- `icon`
- `order_index`
- `type`
- `parent_key`

---

### GET /admin/settings/catalog-manager/api/discover
Force re-discovery

**Authentication**: Required  
**Content-Type**: application/json

**Response**:
```json
{
  "ok": true,
  "stats": {
    "total": 45,
    "new": 8,
    "active": 32,
    "sources": {...}
  },
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

---

### GET /admin/settings/catalog-manager/api/stats
Get current stats

**Authentication**: Required  
**Content-Type**: application/json

**Response**:
```json
{
  "ok": true,
  "stats": {
    "total": 45,
    "new": 8,
    "active": 32
  }
}
```

---

## Error Codes
- `400`: Bad Request (missing/invalid parameters)
- `401`: Unauthorized (if not authenticated)
- `500`: Internal Server Error

## Authentication
All endpoints require an active session. If not authenticated, user will be redirected to login page.

## Transaction Safety
The `/apply` endpoint uses database transactions to ensure data consistency:
- `BEGIN` transaction before any updates
- `COMMIT` on success
- `ROLLBACK` on any error

## Performance Considerations
- The discovery service uses caching (5-minute TTL by default)
- Use `/api/stats` for cached stats
- Use `/api/discover` only when you need to force a fresh discovery
- Bulk updates in `/apply` are optimized with a single transaction

## Security
- All endpoints use parameterized queries to prevent SQL injection
- Input validation on field names in quick-edit
- Session-based authentication required
- Error messages do not expose sensitive information
