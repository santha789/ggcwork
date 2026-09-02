import { getJsonApi, postJsonApi } from './api';

export async function getChatRooms() {
  return getJsonApi('/api/v1/chat/rooms');
}

export async function getChatMessages(roomId, afterId = null) {
  const query = afterId ? `?after_id=${afterId}` : '';
  return getJsonApi(`/api/v1/chat/rooms/${roomId}/messages${query}`);
}

export async function sendChatMessage(roomId, content) {
  return postJsonApi(`/api/v1/chat/rooms/${roomId}/send`, { content });
}

export async function markChatRead(roomId) {
  return postJsonApi(`/api/v1/chat/rooms/${roomId}/read`, {});
}

export async function startPrivateChat(targetUserId) {
  return postJsonApi('/api/v1/chat/start', { target_user_id: targetUserId });
}

export async function getChatUsers(query = '') {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return getJsonApi(`/api/v1/chat/users${q}`);
}

export async function getNotificationsSummary() {
  return getJsonApi('/api/v1/notifications/summary');
}
