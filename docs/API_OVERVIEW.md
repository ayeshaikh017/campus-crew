# API overview

Base prefix `/api/v1`; health endpoint `/api/health`. Every API response uses `{success,message,data}`. Authenticated routes use the HttpOnly session cookie.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/verify-reset-otp`, `POST /auth/reset-password` |
| Users | `PATCH /users/me`, `GET /users/directory`, `GET /users/events/:eventId/volunteers`; admin `GET /users`, `PATCH /users/:id/status`, `PATCH /users/:id/role` |
| Events | `GET/POST /events`, `GET/PATCH /events/:id`, `POST /events/:id/decision`, assignments and registrations under `/events/:id/...` |
| Tasks | `GET /tasks/mine`, `POST /tasks`, `PATCH /tasks/:id` |
| Chat | `GET/POST /chat`, `GET/POST /chat/:id/messages`, contact request endpoints under `/chat/contact-requests` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Admin | `GET /admin/stats`, `GET /admin/reports`, `PATCH /admin/reports/:id` |
