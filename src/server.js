import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import Conversation from './models/Conversation.js';
import { allowedOrigins } from './config/origins.js';
import { resolveSession, COOKIE_NAME } from './utils/session.js';

const port = Number(process.env.PORT || 5000);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  maxHttpBufferSize: 1e6,
});
globalThis.campusCrewIo = io;

function tokenFromCookie(header = '') {
  const match = header.split(';').map((v) => v.trim()).find((v) => v.startsWith(COOKIE_NAME + '='));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || tokenFromCookie(socket.handshake.headers.cookie);
    if (!token) return next(new Error('Authentication required'));
    const { user, roleSelected } = await resolveSession(token);
    if (!roleSelected) return next(new Error('Choose a role first'));
    socket.user = { id: String(user._id), role: user.role };
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
  if (['coordinator', 'admin'].includes(socket.user.role)) socket.join('teachers');
  socket.on('conversation:join', async ({ conversationId } = {}) => {
    if (!conversationId) return;
    const c = await Conversation.findOne({ _id: conversationId, participantIds: socket.user.id }).select('_id');
    if (c) socket.join(`conversation:${c.id}`);
  });
});

try {
  await connectDB();
  server.listen(port, () => console.log(`CampusCrew API listening on http://localhost:${port}`));
} catch (err) {
  console.error('Startup failed:', err.message);
  process.exit(1);
}
