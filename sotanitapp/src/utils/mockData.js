export const teams = [
  'Real Madrid',
  'Barcelona',
  'Manchester United',
  'Manchester City',
  'Liverpool',
  'Bayern Munich',
  'PSG',
  'Juventus',
  'AC Milan',
  'Inter Milan',
  'Chelsea',
  'Arsenal',
  'Atletico Madrid',
  'Borussia Dortmund',
  'Ajax',
];

export const positions = ['Portero', 'Defensa', 'Mediocampista', 'Delantero'];

export const categories = ['Todos', 'Goles', 'Regates', 'Asistencias', 'Paradas', 'Faltas'];

export const rankingByCategory = {
  Goles: [
    { username: 'CR7', team: 'Al-Nassr', position: 'DEL', likes: 25000, rank: 1, rating: 99 },
    { username: 'Messi10', team: 'Inter Miami', position: 'DEL', likes: 23500, rank: 2, rating: 95 },
    { username: 'Mbappe', team: 'Real Madrid', position: 'DEL', likes: 21000, rank: 3, rating: 92 },
  ],
  Regates: [
    { username: 'Neymar Jr', team: 'Al-Hilal', position: 'EXT', likes: 20000, rank: 1, rating: 98 },
    { username: 'Vinicius', team: 'Real Madrid', position: 'EXT', likes: 18500, rank: 2, rating: 94 },
    { username: 'Messi10', team: 'Inter Miami', position: 'DEL', likes: 17000, rank: 3, rating: 91 },
  ],
  Asistencias: [
    { username: 'KDB', team: 'Man City', position: 'MC', likes: 19000, rank: 1, rating: 97 },
    { username: 'Messi10', team: 'Inter Miami', position: 'DEL', likes: 18000, rank: 2, rating: 94 },
    { username: 'Modric', team: 'Real Madrid', position: 'MC', likes: 16500, rank: 3, rating: 90 },
  ],
  Paradas: [
    { username: 'Courtois', team: 'Real Madrid', position: 'POR', likes: 22000, rank: 1, rating: 98 },
    { username: 'Oblak', team: 'Atletico', position: 'POR', likes: 20500, rank: 2, rating: 95 },
    { username: 'Ter Stegen', team: 'Barcelona', position: 'POR', likes: 19000, rank: 3, rating: 91 },
  ],
  Faltas: [
    { username: 'Messi10', team: 'Inter Miami', position: 'DEL', likes: 24000, rank: 1, rating: 98 },
    { username: 'CR7', team: 'Al-Nassr', position: 'DEL', likes: 22000, rank: 2, rating: 95 },
    { username: 'Dybala', team: 'Roma', position: 'DEL', likes: 18000, rank: 3, rating: 90 },
  ],
};

export const feedVideos = [
  { id: 1, user: 'Messi10', team: 'Inter Miami', position: 'DEL', likes: 12500, category: 'Goles', owner: false },
  { id: 2, user: 'CR7', team: 'Al-Nassr', position: 'DEL', likes: 15000, category: 'Regates', owner: true },
  { id: 3, user: 'Neymar Jr', team: 'Al-Hilal', position: 'EXT', likes: 10200, category: 'Asistencias', owner: false },
  { id: 4, user: 'Mbappe', team: 'Real Madrid', position: 'DEL', likes: 18000, category: 'Goles', owner: false },
];

export const userVideos = [
  { id: 1, likes: 1250, views: 5400 },
  { id: 2, likes: 2100, views: 8900 },
  { id: 3, likes: 890, views: 3200 },
  { id: 4, likes: 3400, views: 12000 },
];

export const likedVideos = [
  { id: 5, likes: 15000, views: 45000, user: 'CR7' },
  { id: 6, likes: 12000, views: 38000, user: 'Messi10' },
  { id: 7, likes: 9500, views: 28000, user: 'Neymar' },
];

export const notifications = [
  { id: 1, user: 'Messi10', action: 'le ha gustado tu video', time: '2h' },
  { id: 2, user: 'CR7', action: 'comento tu video', time: '5h' },
  { id: 3, user: 'Neymar', action: 'comenzo a seguirte', time: '1d' },
  { id: 4, user: 'Mbappe', action: 'compartio tu video', time: '2d' },
  { id: 5, user: 'Haaland', action: 'le ha gustado tu video', time: '3d' },
];
