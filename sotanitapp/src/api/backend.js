const DEFAULT_API_BASE_URL = 'https://sotanita-backend.onrender.com';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function resolveApiBaseUrl() {
  const envBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_BACKEND_URL);
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (typeof window !== 'undefined' && window?.location?.hostname) {
    const hostname = String(window.location.hostname).toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }

  return DEFAULT_API_BASE_URL;
}

function buildApiUrl(path) {
  const normalizedBase = resolveApiBaseUrl();

  // Soporta EXPO_PUBLIC_API_URL con o sin "/api" al final.
  if (normalizedBase.endsWith('/api') && path.startsWith('/api/')) {
    return `${normalizedBase}${path.slice(4)}`;
  }

  return `${normalizedBase}${path}`;
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || data?.error || `Error HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function getTeamNames() {
  const response = await fetch(buildApiUrl('/api/nombresEquipos'));
  const data = await parseResponse(response);
  return data.nombresEquipos || [];
}

export async function getTeamsListWithEscudo() {
  const response = await fetch(buildApiUrl('/api/equipos/lista/todos'));
  const data = await parseResponse(response);
  return data.equipos || [];
}

export async function getTeamIdByName(name) {
  const encodedName = encodeURIComponent(name);
  const response = await fetch(buildApiUrl(`/api/equipo/idPorNombre?name=${encodedName}`));
  const data = await parseResponse(response);
  return data.teamId;
}

export async function getTeamById(teamId) {
  const encodedId = encodeURIComponent(teamId);
  const response = await fetch(buildApiUrl(`/api/equipos/${encodedId}`));
  return parseResponse(response);
}

export async function createUser(payload) {
  const response = await fetch(buildApiUrl('/api/usuarios'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function updateUser(userId, payload) {
  const response = await fetch(buildApiUrl(`/api/usuarios/${userId}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function loginUser(email, password) {
  const response = await fetch(buildApiUrl('/api/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return parseResponse(response);
}

export async function uploadVideo(formData) {
  const response = await fetch(buildApiUrl('/api/videos'), {
    method: 'POST',
    body: formData,
    // Note: Do NOT set 'Content-Type': 'multipart/form-data'.
    // Fetch automatically sets it with the correct boundary when body is FormData.
  });

  return parseResponse(response);
}

export async function getVideos(limit = 10, offset = 0, category) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const normalizedCategory = String(category ?? '').trim();
  if (normalizedCategory) {
    params.set('category', normalizedCategory);
  }

  const response = await fetch(buildApiUrl(`/api/videos?${params.toString()}`));
  return parseResponse(response);
}

export async function getCategories() {
  const response = await fetch(buildApiUrl('/api/categorias'));
  const data = await parseResponse(response);
  return data.categories || [];
}

export async function getWeeklyRankings(category, current = false) {
  const params = new URLSearchParams();
  const normalizedCategory = String(category ?? '').trim();

  if (normalizedCategory && normalizedCategory.toLowerCase() !== 'todos') {
    params.set('category', normalizedCategory);
  }

  if (current) params.set('current', 'true');

  const query = params.toString();
  const response = await fetch(buildApiUrl(`/api/rankings/weekly${query ? `?${query}` : ''}`));
  return parseResponse(response);
}

export async function getUserProfile(userId) {
  const encoded = encodeURIComponent(userId || '');
  const response = await fetch(buildApiUrl(`/api/usuarios/${encoded}`));
  return parseResponse(response);
}

export async function getVideoCategories() {
  return getCategories();
}

export async function getPositions() {
  const response = await fetch(buildApiUrl('/api/posiciones'));
  const data = await parseResponse(response);
  return data.posiciones || data.positions || [];
}

export async function getAllVideos(limit = 20, maxPages = 50) {
  const all = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await getVideos(limit, offset);
    all.push(...batch);

    if (batch.length < limit) break;
    offset += batch.length;
  }

  return all;
}

export async function likeVideo(videoId, idUsuario) {
  const response = await fetch(buildApiUrl(`/api/videos/${videoId}/like`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}

export async function unlikeVideo(videoId, idUsuario) {
  const response = await fetch(buildApiUrl(`/api/videos/${videoId}/unlike`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}

export async function deleteVideo(videoId, idUsuario) {
  const response = await fetch(buildApiUrl(`/api/videos/${videoId}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}

export async function getVideoComments(videoId) {
  const response = await fetch(buildApiUrl(`/api/videos/${videoId}/comments`));
  return parseResponse(response);
}

export async function postVideoComment(videoId, payload) {
  const response = await fetch(buildApiUrl(`/api/videos/${videoId}/comments`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function uploadCommentAudio(formData) {
  const response = await fetch(buildApiUrl('/api/uploads/audio'), {
    method: 'POST',
    body: formData,
  });

  return parseResponse(response);
}

export async function getForumMessages(teamId) {
  const encoded = encodeURIComponent(teamId);
  const response = await fetch(buildApiUrl(`/api/foros/${encoded}`));
  return parseResponse(response);
}

export async function postForumMessage(teamId, payload) {
  const encoded = encodeURIComponent(teamId);
  const response = await fetch(buildApiUrl(`/api/foros/${encoded}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function isUsernameAvailable(username) {
  const encoded = encodeURIComponent(String(username || ''));
  const response = await fetch(buildApiUrl(`/api/usuarios/usernameDisponible?username=${encoded}`));
  return parseResponse(response);
}

export async function deleteVideoComment(commentId, idUsuario) {
  const encodedUser = encodeURIComponent(idUsuario || '');
  const response = await fetch(buildApiUrl(`/api/comments/${commentId}?id_usuario=${encodedUser}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}

export async function deleteForumMessage(teamId, messageId, user) {
  const encoded = encodeURIComponent(teamId);
  const response = await fetch(buildApiUrl(`/api/foros/${encoded}/${messageId}?user=${encodeURIComponent(user || '')}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user }),
  });

  return parseResponse(response);
}

export async function getNotifications(idUsuario, limit = 20, offset = 0) {
  const encodedUser = encodeURIComponent(idUsuario);
  const response = await fetch(
    buildApiUrl(`/api/notificaciones?id_usuario=${encodedUser}&limit=${limit}&offset=${offset}`)
  );

  return parseResponse(response);
}

export async function getAllNotifications(idUsuario, pageSize = 50, maxPages = 50) {
  const all = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await getNotifications(idUsuario, pageSize, offset);
    all.push(...batch);

    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return all;
}

export async function getUnreadNotificationsCount(idUsuario) {
  const encodedUser = encodeURIComponent(idUsuario);
  const response = await fetch(buildApiUrl(`/api/notificaciones/unread-count?id_usuario=${encodedUser}`));
  const data = await parseResponse(response);
  return Number(data.unreadCount || 0);
}

export async function markNotificationsRead(idUsuario) {
  const response = await fetch(buildApiUrl('/api/notificaciones/mark-read'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}

export async function deleteAllNotifications(idUsuario) {
  const response = await fetch(buildApiUrl('/api/notificaciones'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_usuario: idUsuario }),
  });

  return parseResponse(response);
}
