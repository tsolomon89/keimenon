# API Documentation

**Last Updated**: October 21, 2025
**Base URL**: `http://localhost:4001` (development) | `https://api.yourdomain.com` (production)
**API Version**: v1

---

## Table of Contents

1. [Authentication](#authentication)
2. [Core Endpoints](#core-endpoints)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [Pagination](#pagination)
6. [Webhooks & SSE](#webhooks--sse)

---

## Authentication

All API requests (except `/auth/login` and `/auth/register`) require a valid JWT token.

### Get Token

**POST** `/api/v1/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

Response (Single Account):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "usr_123",
    "email": "user@example.com",
    "accountId": "acc_456",
    "permissionLevel": "admin",
    "accountType": "admin",
    "accountClass": "professional"
  }
}
```

Response (Multiple Accounts):

```json
{
  "requiresAccountSelection": true,
  "availableAccounts": [
    {
      "accountId": "acc_123",
      "accountName": "My Personal Account",
      "accountType": "client",
      "accountClass": "free",
      "permission_level": "admin",
      "status": "active"
    },
    {
      "accountId": "acc_456",
      "accountName": "Company Account",
      "accountType": "admin",
      "accountClass": "business",
      "permission_level": "leader",
      "status": "active"
    }
  ],
  "tempToken": "temp_token_for_selection"
}
```

### Use Token

Include in `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Core Endpoints

### Authentication

#### Register New User

**POST** `/api/v1/auth/register`

Request:

```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "accountClass": "free"
}
```

Response:

```json
{
  "success": true,
  "message": "User registered successfully",
  "userId": "usr_789"
}
```

#### Select Account (Multi-Account Users)

**POST** `/api/v1/auth/select-account`

Headers:

```
Authorization: Bearer {tempToken}
```

Request:

```json
{
  "accountId": "acc_123"
}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "usr_123",
    "accountId": "acc_123",
    "email": "user@example.com",
    "permissionLevel": "admin"
  }
}
```

#### Switch Account

**POST** `/api/v1/auth/switch-account`

Request:

```json
{
  "accountId": "acc_456"
}
```

Response:

```json
{
  "token": "new_jwt_token...",
  "user": {
    "userId": "usr_123",
    "accountId": "acc_456",
    "email": "user@example.com"
  }
}
```

---

### Accounts

#### Get Current Account

**GET** `/api/v1/accounts/current`

Response:

```json
{
  "accountId": "acc_123",
  "accountName": "My Account",
  "accountType": "client",
  "accountClass": "professional",
  "created_at": 1697654400000,
  "stats": {
    "totalUsers": 5,
    "totalSources": 150,
    "totalNodes": 5000,
    "storageUsed": 1024000000
  }
}
```

#### Get All User Accounts

**GET** `/api/v1/accounts`

Response:

```json
{
  "accounts": [
    {
      "accountId": "acc_123",
      "accountName": "Personal",
      "role": "admin",
      "status": "active",
      "last_accessed": 1697654400000
    },
    {
      "accountId": "acc_456",
      "accountName": "Work",
      "role": "leader",
      "status": "active",
      "last_accessed": 1697640000000
    }
  ]
}
```

---

### Users

#### Get Users in Account

**GET** `/api/v1/users?accountId=acc_123`

Query Parameters:

- `accountId` (optional): Filter by account
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

Response:

```json
{
  "users": [
    {
      "userId": "usr_123",
      "email": "john@example.com",
      "name": "John Doe",
      "permissionLevel": "admin",
      "status": "active",
      "created_at": 1697654400000
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

#### Create User in Account

**POST** `/api/v1/users`

Request:

```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "name": "Jane Doe",
  "accountId": "acc_123",
  "permissionLevel": "senior"
}
```

Response:

```json
{
  "success": true,
  "userId": "usr_456",
  "message": "User created successfully"
}
```

---

### Import

#### Upload File for Import

**POST** `/api/v1/import/upload`

Headers:

```
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

Form Data:

- `file`: The file to upload (JSON, CSV, etc.)
- `accountId`: Target account ID
- `options`: JSON string with import options

Response:

```json
{
  "jobId": "job_123",
  "uploadId": "upload_456",
  "message": "Upload started",
  "estimatedTime": 30000
}
```

#### Get Import Job Status

**GET** `/api/v1/import/jobs/{jobId}`

Response:

```json
{
  "jobId": "job_123",
  "status": "processing",
  "progress": 75,
  "stage": "deduplication",
  "message": "Deduplicating nodes...",
  "stats": {
    "totalMessages": 1000,
    "processed": 750,
    "duplicates": 50,
    "errors": 0
  },
  "created_at": 1697654400000,
  "updated_at": 1697654430000
}
```

Job Statuses:

- `pending`: Queued, not started
- `processing`: Currently running
- `complete`: Finished successfully
- `failed`: Encountered error
- `cancelled`: User cancelled

#### Get Import Jobs (List)

**GET** `/api/v1/import/jobs?accountId=acc_123`

Query Parameters:

- `accountId`: Account ID (required)
- `status`: Filter by status (optional)
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset (default: 0)

Response:

```json
{
  "jobs": [
    {
      "jobId": "job_123",
      "type": "import",
      "status": "complete",
      "progress": 100,
      "created_at": 1697654400000
    },
    {
      "jobId": "job_124",
      "type": "import",
      "status": "processing",
      "progress": 45,
      "created_at": 1697654500000
    }
  ],
  "total": 15,
  "limit": 20,
  "offset": 0
}
```

---

### Analytics

#### Get Analytics Overview

**GET** `/api/v1/analytics/overview?accountId=acc_123`

Response:

```json
{
  "totalSources": 100,
  "totalNodes": 5000,
  "totalGroups": 25,
  "storageUsed": 1024000000,
  "trends": {
    "sources": "+15%",
    "nodes": "+230",
    "groups": "+3"
  }
}
```

---

### Settings

#### Get Settings

**GET** `/api/v1/settings?accountId=acc_123`

Response:

```json
{
  "settings": [
    {
      "key": "duplicate_threshold",
      "value": "0.85",
      "category": "import"
    },
    {
      "key": "auto_group",
      "value": "true",
      "category": "grouping"
    }
  ]
}
```

#### Update Setting

**PUT** `/api/v1/settings/{key}`

Request:

```json
{
  "value": "0.9",
  "accountId": "acc_123"
}
```

Response:

```json
{
  "success": true,
  "setting": {
    "key": "duplicate_threshold",
    "value": "0.9",
    "updated_at": 1697654400000
  }
}
```

---

### Data Management

#### Clear All Data

**DELETE** `/api/v1/data-management/clear-all`

Request:

```json
{
  "accountId": "acc_123",
  "confirmation": "DELETE_ALL_DATA"
}
```

Response:

```json
{
  "jobId": "job_789",
  "message": "Data deletion started",
  "estimatedTime": 60000
}
```

⚠️ **Warning**: This permanently deletes all data. Cannot be undone.

---

## Server-Sent Events (SSE)

### Real-Time Job Progress

**GET** `/api/v1/stream/jobs?token={jwt_token}`

Stream Events:

```
event: jobs.update
data: {"jobs":[{"jobId":"job_123","status":"processing","progress":75}]}

event: jobs.update
data: {"jobs":[{"jobId":"job_123","status":"complete","progress":100}]}
```

Event Types:

- `jobs.update`: Job status changed
- `jobs.complete`: Job finished
- `jobs.error`: Job encountered error

---

## Error Handling

### Error Response Format

```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND",
  "statusCode": 404,
  "details": {
    "resource": "user",
    "id": "usr_999"
  }
}
```

### Common Error Codes

| Status | Code                  | Description              |
| ------ | --------------------- | ------------------------ |
| 400    | `VALIDATION_ERROR`    | Invalid request data     |
| 401    | `UNAUTHORIZED`        | Missing or invalid token |
| 403    | `FORBIDDEN`           | Insufficient permissions |
| 404    | `NOT_FOUND`           | Resource doesn't exist   |
| 409    | `CONFLICT`            | Resource already exists  |
| 429    | `RATE_LIMIT_EXCEEDED` | Too many requests        |
| 500    | `INTERNAL_ERROR`      | Server error             |
| 503    | `SERVICE_UNAVAILABLE` | Service temporarily down |

---

## Rate Limiting

### Limits by Endpoint

| Endpoint                | Rate Limit   | Window |
| ----------------------- | ------------ | ------ |
| `/auth/login`           | 5 requests   | 15 min |
| `/auth/register`        | 5 requests   | 1 hour |
| `/api/v1/*`             | 100 requests | 1 min  |
| `/api/v1/import/upload` | 10 requests  | 1 hour |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697654500
```

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "statusCode": 429,
  "retryAfter": 60
}
```

---

## Pagination

### Query Parameters

- `limit`: Results per page (default: 50, max: 100)
- `offset`: Number of results to skip (default: 0)

### Example

```
GET /api/v1/users?limit=20&offset=40
```

### Response Format

```json
{
  "users": [...],
  "total": 150,
  "limit": 20,
  "offset": 40,
  "hasMore": true
}
```

---

## Permission Levels

| Level    | Rank | Capabilities           |
| -------- | ---- | ---------------------- |
| `junior` | 10   | View only              |
| `senior` | 20   | View + Create          |
| `leader` | 30   | View + Create + Update |
| `admin`  | 100  | Full access            |

---

## Account Types

| Type     | Description                                  |
| -------- | -------------------------------------------- |
| `admin`  | Internal admin accounts (Canvas Memory team) |
| `client` | Customer accounts                            |

## Account Classes

| Class          | Limits                               |
| -------------- | ------------------------------------ |
| `free`         | 500 sources, 20K nodes, 5GB storage  |
| `professional` | 5K sources, 200K nodes, 50GB storage |
| `business`     | Unlimited                            |

---

## Security

### HTTPS Only (Production)

All production API calls must use HTTPS.

### CORS

CORS is enabled for configured origins only (see `ALLOWED_ORIGINS` in deployment).

### Content Security Policy

The API sets strict CSP headers to prevent XSS attacks.

### Request Validation

All inputs are validated and sanitized to prevent SQL injection and other attacks.

---

## Testing

### Example: Test Authentication

```bash
# Login
curl -X POST http://localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}'

# Use token
curl -X GET http://localhost:4001/api/v1/accounts/current \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example: Upload File

```bash
curl -X POST http://localhost:4001/api/v1/import/upload \
  -H "Authorization: Bearer {token}" \
  -F "file=@./chat-export.json" \
  -F "accountId=acc_123" \
  -F "options={\"detectDuplicates\":true}"
```

---

## Changelog

### v1 (2025-10-21)

- Initial API release
- Authentication endpoints
- Account management
- Import system with SSE progress
- Analytics endpoints
- Settings management
- Data management

---

## Support

For API issues or questions:

- GitHub Issues: https://github.com/your-repo/canvas-memory-os/issues
- Email: support@yourdomain.com
- Docs: https://docs.yourdomain.com

---

**Status**: ✅ **Production Ready**

---

## TODO: OpenAPI Spec Generation

To generate a full OpenAPI (Swagger) specification:

1. Install `swagger-jsdoc` and `swagger-ui-express`:

   ```bash
   npm install --save swagger-jsdoc swagger-ui-express @types/swagger-jsdoc @types/swagger-ui-express
   ```

2. Create `apps/api/src/swagger.ts`:

   ```typescript
   import swaggerJsdoc from 'swagger-jsdoc';

   const options = {
     definition: {
       openapi: '3.0.0',
       info: {
         title: 'Canvas Memory OS API',
         version: '1.0.0',
         description: 'API documentation for Canvas Memory OS',
       },
       servers: [
         {
           url: 'http://localhost:4001',
           description: 'Development server',
         },
       ],
     },
     apis: ['./src/routes/*.ts'],
   };

   export const swaggerSpec = swaggerJsdoc(options);
   ```

3. Add JSDoc comments to routes:

   ```typescript
   /**
    * @openapi
    * /api/v1/auth/login:
    *   post:
    *     summary: Login user
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             properties:
    *               email:
    *                 type: string
    *               password:
    *                 type: string
    *     responses:
    *       200:
    *         description: Login successful
    */
   router.post('/auth/login', ...)
   ```

4. Serve Swagger UI:

   ```typescript
   import swaggerUi from 'swagger-ui-express';
   import { swaggerSpec } from './swagger';

   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
   ```

5. Access at: `http://localhost:4001/api-docs`
