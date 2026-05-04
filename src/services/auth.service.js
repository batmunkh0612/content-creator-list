'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const sign = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

async function register({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'Email already registered');

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  return { user, token: sign(user) };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new ApiError(401, 'Invalid credentials');

  const safeUser = { id: user.id, email: user.email, name: user.name };
  return { user: safeUser, token: sign(safeUser) };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }
}

/**
 * Change the password for the currently-authenticated user.
 *
 * Returns a fresh JWT so the caller can swap tokens client-side without
 * forcing a re-login. Old JWTs that were issued before this call remain
 * valid until their natural expiry — JWTs are stateless, and there's no
 * server-side denylist. To force-logout other devices we'd need a
 * `tokenVersion` column on User and a check in the auth middleware (out
 * of scope for this feature; flagged in the docs).
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) throw new ApiError(401, 'Current password is incorrect');

  // Defence in depth — Joi already rejects this, but guard the service too
  // in case a future caller skips validation.
  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    throw new ApiError(400, 'New password must differ from current password');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hash },
  });

  const safeUser = { id: user.id, email: user.email, name: user.name };
  return { user: safeUser, token: sign(safeUser) };
}

module.exports = { register, login, verifyToken, changePassword };
