import { getJsonApi, postJsonApi } from './api';
import { getStoredToken } from './attendanceApi';

async function authHeaders() {
  const token = await getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getChatRooms() {
  const h = await authHeaders();
  return getJsonApi('/api/v1/chat/rooms', h);
}

export async function getChatMessages(roomId, afterId = null) {
  const query = afterId ? `?after_id=${afterId}` : '';
  const h = await authHeaders();
  return getJsonApi(`/api/v1/chat/rooms/${roomId}/messages${query}`, h);
}

export async function sendChatMessage(roomId, content) {
  const h = await authHeaders();
  return postJsonApi(`/api/v1/chat/rooms/${roomId}/send`, { content }, h);
}

export async function markChatRead(roomId) {
  const h = await authHeaders();
  return postJsonApi(`/api/v1/chat/rooms/${roomId}/read`, {}, h);
}

export async function startPrivateChat(targetUserId) {
  const h = await authHeaders();
  return postJsonApi('/api/v1/chat/start', { target_user_id: targetUserId }, h);
}

export async function getChatUsers(query = '') {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  const h = await authHeaders();
  return getJsonApi(`/api/v1/chat/users${q}`, h);
}

export async function getNotificationsSummary() {
  const h = await authHeaders();
  return getJsonApi('/api/v1/notifications/summary', h);
}
