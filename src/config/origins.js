// One place for allowed browser origins (used by Express CORS and Socket.IO).
// Accepts CLIENT_ORIGIN or CLIENT_URL, comma-separated. Trailing slashes are
// stripped because browsers never send them in the Origin header.
export const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  process.env.CLIENT_URL ||
  'http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
