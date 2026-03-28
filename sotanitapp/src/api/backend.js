const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || `Error HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function getTeamNames() {
  const response = await fetch(`${API_BASE_URL}/api/nombresEquipos`);
  const data = await parseResponse(response);
  return data.nombresEquipos || [];
}

export async function getTeamIdByName(name) {
  const encodedName = encodeURIComponent(name);
  const response = await fetch(`${API_BASE_URL}/api/equipo/idPorNombre?name=${encodedName}`);
  const data = await parseResponse(response);
  return data.teamId;
}

export async function createUser(payload) {
  const response = await fetch(`${API_BASE_URL}/api/crearNuevoUsuario`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}
