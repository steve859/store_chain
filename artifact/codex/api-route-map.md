# API Route Map — Target REST Routes

Base path: `/api/v1`

| Route group | Module | Use cases |
|---|---|---|
| `/auth` | `auth` | UC01 |
| `/users` | `users` | UC02 |
| `/roles`, `/permissions` | `roles` | UC03 |
| `/stores` | `stores` | UC04, UC05 |
| `/dashboard` | `dashboard` | UC05 |
| `/pos` | `pos` | UC06, UC07, UC09 |
| `/transactions` | `transactions` | UC16, UC17 |
| `/loyalty` | `loyalty` | UC08, UC09, UC10 |
| `/promotions` | `promotions` | UC11, UC12 |
| `/pricing` | `pricing` | UC13, UC14, UC15, UC29, UC30 |
| `/products`, `/categories` | `products` | UC18 |
| `/inventory` | `inventory` | UC19, UC25, UC26 |
| `/transfers` | `transfers` | UC20, UC21 |
| `/reports` | `reports` | UC22, UC23, UC28 |
| `/analytics` | `analytics` | UC24 |
| `/complaints` | `complaints` | UC27 |
| `/audit-logs` | `audit_logs` | Cross-cutting |
| `/settings` | `settings` | Cross-cutting |

## API design rules

- All protected routes must pass JWT middleware.
- Role-sensitive routes must pass RBAC middleware.
- Store-sensitive routes must apply store-scope checks.
- Use pagination for list/history/search routes.
- Use consistent error format.
- Do not expose internal database errors directly to users.
- Do not return sensitive fields such as password hashes.

## Suggested response shape

Use existing repo conventions first. If no convention exists, prefer:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data validation failed. Please check your input."
  }
}
```

## Important SRS messages

| Code | Meaning |
|---|---|
| MSG01 | Operation completed successfully. |
| MSG02 | Required fields are missing. |
| MSG03 | Permission denied. |
| MSG04 | Invalid username or password. |
| MSG05 | Validation failed. |
| MSG06 | System service unavailable. |
| MSG08 | Report exported successfully. |
| MSG09 | Inventory stock is below threshold. |
| MSG10 | Payment failed. |
