const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

function buildApiUrl(path) {
  const normalizedBase = API_BASE_URL.replace(/\/+$/, '');

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

export async function getTeamIdByName(name) {
  const encodedName = encodeURIComponent(name);
  const response = await fetch(buildApiUrl(`/api/equipo/idPorNombre?name=${encodedName}`));
  const data = await parseResponse(response);
  return data.teamId;
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

export async function getVideos(limit = 10, offset = 0) {
  const response = await fetch(buildApiUrl(`/api/videos?limit=${limit}&offset=${offset}`));
  return parseResponse(response);
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
