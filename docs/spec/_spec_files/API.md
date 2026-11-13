# ToInfinity API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Endpoints

### Health Check

#### GET /health
Check if the API is running.

**Response:**
```json
{
  "success": true,
  "message": "ToInfinity API is running",
  "timestamp": "2024-12-12T08:50:20.214Z"
}
```

---

## Authentication Endpoints

### GET /api/auth/status
Get authentication configuration status.

**Response:**
```json
{
  "success": true,
  "data": {
    "botConfigured": true,
    "botUsername": "ToInfinityBot",
    "botLink": "https://t.me/ToInfinityBot"
  }
}
```

### POST /api/auth/check-telegram
Check if a Telegram user exists in the system.

**Request:**
```json
{
  "telegramId": "123456789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "exists": true,
    "status": "active",
    "username": "john_doe",
    "role": "USER"
  }
}
```

### POST /api/auth/telegram-login
Login with Telegram ID (after /start command).

**Request:**
```json
{
  "telegramId": "123456789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "john_doe",
      "fullName": "John Doe",
      "role": "USER",
      "language": "fa",
      "orgNodeId": 5,
      "isFirstAdmin": false
    }
  }
}
```

### POST /api/auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### GET /api/auth/me
Get current user profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "telegram_id": "123456789",
    "username": "john_doe",
    "full_name": "John Doe",
    "role": "USER",
    "active": true,
    "status": "active",
    "org_node_id": 5,
    "phone": "+989123456789",
    "level": "senior",
    "language": "fa",
    "is_first_admin": false,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### PUT /api/auth/language
Update user language preference.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "language": "en",
    "message": "Language updated successfully"
  }
}
```

---

## Users Management Endpoints

### GET /api/users
Get all users (Admin only).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 100)
- `status` (string: 'pending_manager' | 'active' | 'inactive')
- `role` (string: 'USER' | 'ADMIN')
- `orgNodeId` (number)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "username": "john_doe",
        "full_name": "John Doe",
        "role": "USER",
        "status": "active",
        "active": true,
        "org_node_id": 5,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100,
      "pages": 2
    }
  }
}
```

### GET /api/users/:id
Get user by ID.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "full_name": "John Doe",
    "role": "USER",
    "org_node_title": "Sales Team A",
    "manager_username": "jane_manager"
  }
}
```

### POST /api/users/:id/approve
Approve a pending user (Admin only).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "orgNodeId": 5,
  "managerId": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "User approved successfully"
}
```

### PUT /api/users/:id/role
Update user role (First Admin only).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "role": "ADMIN"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User role updated successfully"
}
```

### PUT /api/users/:id/deactivate
Deactivate a user (Admin only).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid input",
  "message": "Detailed error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "No token provided"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "This action requires admin privileges"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Not found",
  "message": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Rate limit exceeded",
  "retryAfter": 900
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

The API implements 4 tiers of rate limiting:

| Tier | Endpoints | Limit | Window |
|------|-----------|-------|--------|
| Auth | `/api/auth/telegram-login`, `/api/auth/refresh` | 5 requests | 15 minutes |
| Modify | POST, PUT, DELETE operations | 30 requests | 15 minutes |
| Read | GET operations | 200 requests | 15 minutes |
| General | Mixed endpoints | 100 requests | 15 minutes |

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640000000
```

---

## WebSocket Events (Future Implementation)

The API will support WebSocket connections for real-time updates:

### Events:
- `dashboard:update` - Dashboard data updated
- `notification:new` - New notification received
- `debt:alert` - Debt alert triggered
- `gps:alert` - GPS-based product alert

---

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. All endpoints support multi-language responses based on user's language preference
3. File uploads are limited to 10MB
4. Voice files are NEVER stored on the server - only metadata is saved
5. GPS coordinates are stored as JSONB with encryption for sensitive data

---

**Last Updated**: 2024-12-12
**API Version**: 1.0.0
