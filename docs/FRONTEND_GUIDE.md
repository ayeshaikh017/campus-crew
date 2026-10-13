# CampusCrew frontend integration guide

This file is the frontend team's contract. Backend APIs use JSON `{ "success": boolean, "message": string, "data": any }` and are prefixed with `/api/v1`. Health check is `/api/health`.

## Stack (no Flutter)
- React 18 + Vite
- Tailwind CSS 3
- React Router 6
- Axios
- `socket.io-client` for live events (REST remains authoritative)

## Local API setup
Set Vite environment variable `VITE_API_BASE_URL=http://localhost:5000/api/v1`. Create Axios with `baseURL: import.meta.env.VITE_API_BASE_URL`, `withCredentials: true`, and JSON content type. Because auth is an HttpOnly cookie, do not read or store JWT in localStorage. Frontend and backend origins must match `CLIENT_ORIGIN` in backend `.env`.

## Response/error contract
Success: `{ success: true, message: "...", data: {...} }`.
Error: `{ success: false, message: "...", data: null }`. Use HTTP status codes; handle 401 by clearing client auth state and redirecting to login, except while submitting login/register/verification.

## Authentication endpoints
All below are relative to `/api/v1`:
- `POST /auth/register` body `{name,collegeId,collegeEmail,password,department?,academicYear?}`. Account is pending until OTP verified.
- `POST /auth/verify-email` body `{email,otp}`. Sets HttpOnly cookie and returns `{user}`.
- `POST /auth/resend-verification` body `{email}`.
- `POST /auth/login` body `{email,password}`. Returns `{user}` and sets cookie.
- `POST /auth/logout`; `GET /auth/me`.
- `POST /auth/forgot-password` body `{email}`; response intentionally does not disclose whether the account exists.
- `POST /auth/verify-reset-otp` body `{email,otp}` returns `{resetGrant}`; then `POST /auth/reset-password` body `{email,resetGrant,newPassword}`.

OTP in local development: if `SMTP_HOST` is empty, inspect the backend terminal. OTP expires after 5 minutes, allows at most 5 attempts and has a 30-second resend cooldown.

## Profile and directory
- `PATCH /users/me`: allowed fields `name,department,academicYear,skills[],bio,avatarUrl`.
- `GET /users/directory?search=` returns safe public fields only. Never expect email, college ID, or password hash in directory results.
- `GET /users/events/:eventId/volunteers`: event volunteer list, including `user`, `workRole`, `responsibilities`, `status`.
- Admin only: `GET /users`, `PATCH /users/:id/status` body `{accountStatus}`, `PATCH /users/:id/role` body `{role}`.

## Events, applications, assignments
- `GET /events`: volunteers only receive published events; coordinator/admin can see all.
- `POST /events`: event fields `title,description?,category?,venue?,startDate,endDate,registrationDeadline?,coordinatorIds?`. A coordinator's event is created as `pending_approval`; admin-created events start as `draft`.
- `GET /events/:id`, `PATCH /events/:id`, `POST /events/:id/decision` body `{decision:"approve"|"reject"}`.
- `POST /events/:id/registrations` body `{type:"participant"|"volunteer_applicant",note?}`. Participant join is auto-approved; volunteer application is pending.
- `GET /events/:id/registrations` coordinator/admin; `PATCH /events/:id/registrations/:registrationId` body `{decision:"approve"|"reject",workRole?,responsibilities?}`. Approval creates/updates an assignment.
- `POST /events/:id/assignments` body `{volunteerId,workRole,responsibilities?}`; `GET /events/:id/assignments`.

## Tasks and notifications
- `GET /tasks/mine`; `POST /tasks` body `{eventId,assignmentId,title,description?,dueDate?}`; `PATCH /tasks/:id` body `{status?,title?,description?,dueDate?}`. Volunteers can update only status on their assigned tasks.
- `GET /notifications` returns `{notifications,unreadCount}`; `PATCH /notifications/:id/read`; `PATCH /notifications/read-all`.

## Chat and contact requests
- `GET /chat` conversations; `POST /chat` body `{recipientId,eventId?}`; `GET /chat/:id/messages`; `POST /chat/:id/messages` body `{text}`.
- `POST /chat/contact-requests` body `{recipientId,note?}`; `GET /chat/contact-requests/mine`; `PATCH /chat/contact-requests/:id` body `{decision:"accept"|"decline"}`.
- Conversation access by a non-participant returns 404. Always handle 403 contact-policy errors and 404 inaccessible conversations.

## Admin
- `GET /admin/stats`; `GET /admin/reports`; `PATCH /admin/reports/:id` body `{status:"reviewed"|"dismissed"}`.

## Socket.IO
Connect to the backend origin using `io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {withCredentials:true, transports:['websocket','polling']})`. Browser socket auth uses the same-origin/cross-origin cookie; configure Axios/socket CORS consistently. Listen for `notification:new`, `message:new`, `event:created`, `assignment:updated`, `registration:updated`, and `task:updated`. Before subscribing to conversation-specific rooms, emit `conversation:join` with `{conversationId}`; server verifies membership. REST is authoritative: refresh the relevant query after an event and poll about every 15 seconds while disconnected.

## Suggested React modules
- `src/lib/api.js`: Axios instance and response/error handling
- `src/context/AuthContext.jsx`: `me`, `login`, `logout`, `refreshMe`
- `src/components/ProtectedRoute.jsx`: auth-only and role-only routes
- `src/features/auth/`: Register, VerifyEmail, Login, ForgotPassword, ResetPassword
- `src/features/events/`: EventsList, EventDetail, EventForm, VolunteerDirectory, RegistrationActions
- `src/features/assignments/`: MyAssignments, TaskList, TaskStatusControl
- `src/features/chat/`: ConversationList, MessageThread, ContactRequests
- `src/features/notifications/`: NotificationList, unread badge, toast handling
- `src/features/admin/`: Stats, Users, EventApprovals, Reports

## Important UI rules
1. Keep general profile `skills` separate from event-specific assignment `workRole` and `responsibilities`.
2. Hiding a button is not authorization; backend permissions still apply and UI must handle 403/404.
3. Always use `withCredentials: true`; do not persist JWTs in localStorage.
4. Use a single API client, loading/error/empty states, and responsive layouts from 360px upward.
5. For production, use HTTPS and configure exact frontend origin in `CLIENT_ORIGIN`.

## Known backend scope/limitations to verify before production
This starter is a functional project baseline, not a security audit. The full master prompt's advanced requirements are not all implemented yet: formal college roster verification, CSRF/origin protection beyond CORS, block/report creation endpoints, complete notification coverage/reminders, all socket event types/room authorization for every action, rich 25+ assignment/20+ task seed coverage, and exhaustive Supertest/manual end-to-end tests. Test all flows locally and document any remaining gaps before demo/deployment.
