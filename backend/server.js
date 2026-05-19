const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
require('dotenv').config();

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Mapeo de usuarios conectados: email -> socket.id
const connectedUsers = new Map();

// WebSocket: Usuario se conecta
io.on('connection', (socket) => {
    console.log(`✅ Cliente conectado: ${socket.id}`);
    
    socket.on('userConnect', (email) => {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (normalizedEmail) {
            connectedUsers.set(normalizedEmail, socket.id);
            console.log(`📍 Usuario autenticado: ${normalizedEmail} -> ${socket.id}`);
        }
    });
    
    socket.on('disconnect', () => {
        connectedUsers.forEach((id, email) => {
            if (id === socket.id) {
                connectedUsers.delete(email);
                console.log(`❌ Usuario desconectado: ${email}`);
            }
        });
    });
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Directorio para archivos temporales que se compartirán desde móviles
const TEMP_SHARES_DIR = path.join(__dirname, 'temp-shares');
if (!fs.existsSync(TEMP_SHARES_DIR)) {
    try {
        fs.mkdirSync(TEMP_SHARES_DIR, { recursive: true });
    } catch (e) {
        console.error('No se pudo crear temp-shares dir:', e.message);
    }
}
app.use('/temp-shares', express.static(TEMP_SHARES_DIR));

// Configurable TTL (segundos) para archivos en temp-shares
const TEMP_SHARES_TTL_SECONDS = Number(process.env.TEMP_SHARES_TTL_SECONDS || 3600); // 1 hora por defecto
const TEMP_SHARES_CLEANUP_INTERVAL_MS = Number(process.env.TEMP_SHARES_CLEANUP_INTERVAL_MS || 15 * 60 * 1000); // 15 min

function cleanupTempShares() {
    try {
        const files = fs.readdirSync(TEMP_SHARES_DIR);
        const now = Date.now();
        files.forEach((file) => {
            try {
                const full = path.join(TEMP_SHARES_DIR, file);
                const stat = fs.statSync(full);
                const mtime = stat.mtimeMs || stat.ctimeMs || 0;
                if ((now - mtime) > (TEMP_SHARES_TTL_SECONDS * 1000)) {
                    fs.unlinkSync(full);
                    console.log('🧹 Eliminado temp-share:', full);
                }
            } catch (e) {
                // no bloquear
            }
        });
    } catch (e) {
        console.error('Error cleanupTempShares:', e.message);
    }
}

// Ejecutar limpieza periódica
setInterval(() => {
    cleanupTempShares();
}, TEMP_SHARES_CLEANUP_INTERVAL_MS);
// Ejecutar al iniciar también
cleanupTempShares();

// --- Cloudinary Config ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });
const WATERMARK_PATH = path.join(__dirname, '..', 'sotanitapp', 'assets', 'watermark.png');

async function downloadRemoteFileToPath(url, destinationPath) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error('No se pudo descargar el archivo remoto');
    }

    const nodeStream = Readable.fromWeb ? Readable.fromWeb(response.body) : response.body;
    await pipeline(nodeStream, fs.createWriteStream(destinationPath));
    return response.headers.get('content-type') || null;
}

async function streamRemoteFileToResponse(url, res, fileNameHint) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        res.status(502).json({ message: 'No se pudo descargar el archivo original' });
        return false;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (fileNameHint) {
        res.setHeader('Content-Disposition', `attachment; filename="${fileNameHint}"`);
    }
    res.setHeader('Content-Type', contentType);

    const nodeStream = Readable.fromWeb ? Readable.fromWeb(response.body) : response.body;
    await pipeline(nodeStream, res);
    return true;
}

function isLikelyImageUrl(url) {
    const value = String(url || '').toLowerCase();
    return value.endsWith('.jpg') || value.endsWith('.jpeg') || value.endsWith('.png') || value.endsWith('.webp') || value.endsWith('.gif') || value.endsWith('.bmp') || value.endsWith('.tiff');
}

const CLOUDINARY_VIDEO_MARKER = '/video/upload/';
const STREAMING_TRANSFORM = 'f_mp4,vc_h264,ac_aac,fl_progressive,so_0,q_auto';

function getStreamingCloudinaryUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return raw;

    const markerIndex = raw.indexOf(CLOUDINARY_VIDEO_MARKER);
    if (markerIndex === -1) return raw;

    const afterMarker = raw.slice(markerIndex + CLOUDINARY_VIDEO_MARKER.length);
    if (afterMarker.includes('fl_progressive')) return raw;

    const prefix = raw.slice(0, markerIndex + CLOUDINARY_VIDEO_MARKER.length);
    const segments = afterMarker.split('/');
    const firstSegment = segments[0] || '';
    const hasVersionSegment = /^v\d+$/.test(firstSegment);

    if (hasVersionSegment) {
        return `${prefix}${STREAMING_TRANSFORM}/${afterMarker}`;
    }

    if (firstSegment.includes('f_')) {
        const merged = `${firstSegment},vc_h264,ac_aac,fl_progressive,so_0,q_auto`;
        return `${prefix}${merged}/${segments.slice(1).join('/')}`;
    }

    return `${prefix}${STREAMING_TRANSFORM}/${afterMarker}`;
}

async function proxyRemoteStream(url, req, res, { headOnly = false } = {}) {
    const rangeHeader = req.headers.range;
    const headers = rangeHeader ? { Range: rangeHeader } : undefined;
    const response = await fetch(url, {
        method: headOnly ? 'HEAD' : 'GET',
        headers,
    });

    if (!response.ok && response.status !== 206) {
        res.status(502).json({ message: 'No se pudo obtener el video remoto' });
        return;
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges') || 'bytes';

    res.status(response.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    if (contentLength) {
        res.setHeader('Content-Length', contentLength);
    }
    if (contentRange) {
        res.setHeader('Content-Range', contentRange);
    }

    if (headOnly) {
        res.end();
        return;
    }

    if (!response.body) {
        res.end();
        return;
    }

    const nodeStream = Readable.fromWeb ? Readable.fromWeb(response.body) : response.body;
    await pipeline(nodeStream, res);
}

function normalizeEvenDimension(value) {
    const safeValue = Math.max(2, Number(value) || 2);
    return safeValue % 2 === 0 ? safeValue : safeValue - 1;
}

const WEEKLY_RANK_AWARDS = {
    general: [10, 6, 2],
    category: [5, 3, 1],
};

const FRAME_TIERS = [
    { minPoints: 0, frameId: 'bronce' },
    { minPoints: 10, frameId: 'plata' },
    { minPoints: 50, frameId: 'oro' },
    { minPoints: 100, frameId: 'platino' },
    { minPoints: 250, frameId: 'amatista' },
];

const DEFINITE_FRAME_TIERS = FRAME_TIERS.filter((tier) => tier.frameId);

function startOfNaturalWeek(date = new Date()) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay();
    const offset = (day + 6) % 7;
    result.setDate(result.getDate() - offset);
    return result;
}

function endOfNaturalWeek(date = new Date()) {
    const result = startOfNaturalWeek(date);
    result.setDate(result.getDate() + 7);
    result.setMilliseconds(result.getMilliseconds() - 1);
    return result;
}

function getWeekKey(date = new Date()) {
    return startOfNaturalWeek(date).toISOString().slice(0, 10);
}

function getPreviousWeekWindow(date = new Date()) {
    const end = startOfNaturalWeek(date);
    end.setMilliseconds(end.getMilliseconds() - 1);
    const start = startOfNaturalWeek(end);
    return { start, end, key: getWeekKey(start) };
}

function normalizeUserId(value) {
    return String(value ?? '').trim().toLowerCase();
}

function getFrameTierForPoints(points = 0) {
    const totalPoints = Number(points) || 0;
    return [...DEFINITE_FRAME_TIERS].sort((left, right) => right.minPoints - left.minPoints)
        .find((tier) => totalPoints >= tier.minPoints) || DEFINITE_FRAME_TIERS[0];
}

function getNextFrameTier(points = 0) {
    const totalPoints = Number(points) || 0;
    return FRAME_TIERS.find((tier) => totalPoints < tier.minPoints) || FRAME_TIERS[FRAME_TIERS.length - 1];
}

function resolveFrameIdForPoints(points = 0) {
    return getFrameTierForPoints(points)?.frameId || 'bronce';
}

function roundRankingScore(score) {
    return Math.round((Number(score) || 0) * 10) / 10;
}

function pickTopRankedUsers(entries, awards) {
    const sorted = [...entries].sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        const leftComments = Number(left.commentsCount) || 0;
        const rightComments = Number(right.commentsCount) || 0;
        if (rightComments !== leftComments) return rightComments - leftComments;
        if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs; // newer wins
        return left.order - right.order;
    });

    const selected = new Map();

    sorted.slice(0, 3).forEach((entry, index) => {
        const award = awards[index] || 0;
        if (award <= 0) return;
        const current = selected.get(entry.userId);
        if (!current || award > current.awardedPoints) {
            selected.set(entry.userId, { ...entry, awardedPoints: award, rank: index + 1 });
        }
    });

    return Array.from(selected.values());
}

function buildRankingPayload(entries) {
    return entries.map((entry) => ({
        rank: entry.rank,
        videoId: entry.videoId,
        videoTitle: entry.title,
        category: entry.category,
        score: roundRankingScore(entry.score),
        likes: Number(entry.likes) || 0,
        commentsCount: Number(entry.commentsCount) || 0,
        username: entry.username,
        userId: entry.userId,
        team: entry.team || 'Sin equipo',
        teamName: entry.teamName || 'Sin equipo',
        position: entry.position || '---',
        rating: entry.rating ?? 88,
        profileImageUrl: entry.profileImageUrl ?? null,
        teamImageUrl: entry.teamImageUrl ?? null,
        frameImageId: entry.frameImageId ?? null,
        frameId: entry.frameId ?? null,
        mediaUrls: entry.mediaUrls || [],
        mediaType: entry.mediaType || 'video',
        url: entry.url,
        awardedPoints: entry.awardedPoints || 0,
    }));
}

async function getRankedVideosForWindow({ start, end, category }) {
    const match = {
        createdAt: { $gte: start, $lte: end },
    };

    if (category) {
        match.category = buildNameRegex(category);
    }

    const pipeline = [
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $addFields: { videoIdStr: { $toString: '$_id' } } },
        {
            $lookup: {
                from: 'comentarios',
                localField: 'videoIdStr',
                foreignField: 'videoId',
                as: 'comments',
            },
        },
        { $addFields: { commentsCount: { $size: '$comments' } } },
        { $addFields: { uploaderKey: { $toLower: { $ifNull: ['$id_usuario', ''] } } } },
        {
            $lookup: {
                from: 'perfiles',
                let: { uploaderKey: '$uploaderKey' },
                pipeline: [
                    { $addFields: { emailKey: { $toLower: '$email' } } },
                    { $match: { $expr: { $eq: ['$emailKey', '$$uploaderKey'] } } },
                    { $project: { password: 0, emailKey: 0 } },
                ],
                as: 'uploader',
            },
        },
        { $addFields: { uploader: { $first: '$uploader' } } },
        { $project: { comments: 0, videoIdStr: 0, uploaderKey: 0 } },
    ];

    const videos = await db.collection('videos').aggregate(pipeline).toArray();

    return Promise.all(videos.map(async (video, index) => {
        const uploader = video.uploader || {};
        const userId = normalizeUserId(uploader.email || video.id_usuario);
        const likes = Number(video.likes) || 0;
        const commentsCount = Number(video.commentsCount) || 0;
        const cardData = uploader.teamId || uploader.frameId
            ? await resolveCardData(uploader.teamId, uploader.frameId)
            : { teamName: null, teamImageUrl: null, frameImageId: null, resolvedFrameId: null };

        return {
            order: index,
            videoId: video._id.toString(),
            title: video.title,
            category: video.category,
            likes,
            commentsCount,
            score: likes + (commentsCount * 1.5),
            createdAtMs: new Date(video.createdAt || 0).getTime(),
            url: video.url,
            mediaUrls: video.mediaUrls || [],
            mediaType: video.mediaType || 'video',
            username: uploader.username || String(video.id_usuario || '').split('@')[0] || 'usuario',
            userId,
            team: cardData.teamName || 'Sin equipo',
            teamName: cardData.teamName || 'Sin equipo',
            position: uploader.position || '---',
            rating: uploader.rating ?? 88,
            profileImageUrl: uploader.profileImageUrl ?? null,
            teamImageUrl: cardData.teamImageUrl ?? null,
            frameImageId: cardData.frameImageId ?? null,
            frameId: cardData.resolvedFrameId ?? uploader.frameId ?? null,
        };
    }));
}

async function buildWeeklyRankingsForWindow({ start, end }) {
    const [generalVideos, rawCategoryDocs] = await Promise.all([
        getRankedVideosForWindow({ start, end }),
        db.collection('videos').aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: '$category' } },
            { $project: { _id: 0, category: '$_id' } },
        ]).toArray(),
    ]);

    const categoryValues = rawCategoryDocs.map((r) => r.category);

    const categories = [...new Set(
        categoryValues
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));

    const general = buildRankingPayload(pickTopRankedUsers(generalVideos, WEEKLY_RANK_AWARDS.general));
    const byCategory = {};

    for (const category of categories) {
        const categoryVideos = await getRankedVideosForWindow({ start, end, category });
        byCategory[category] = buildRankingPayload(pickTopRankedUsers(categoryVideos, WEEKLY_RANK_AWARDS.category));
    }

    return { categories, general, byCategory };
}

async function applyWeeklyAwards(rankings, weekKey, window) {
    const rankingRuns = db.collection('weekly_ranking_runs');
    const existing = await rankingRuns.findOne({ weekKey });

    if (existing?.processedAt) {
        return existing;
    }

    const seenVideos = new Map();

    const registerEntries = (items, scope) => {
        items.forEach((item) => {
            const current = seenVideos.get(item.videoId);
            const candidate = {
                scope,
                weekKey,
                videoId: item.videoId,
                userId: normalizeUserId(item.userId),
                username: item.username,
                award: Number(item.awardedPoints) || 0,
                rank: item.rank,
                category: item.category || null,
                score: item.score,
            };

            if (!current || candidate.award > current.award) {
                seenVideos.set(item.videoId, candidate);
            }
        });
    };

    registerEntries(rankings.general || [], 'general');
    Object.entries(rankings.byCategory || {}).forEach(([category, items]) => {
        registerEntries(items.map((item) => ({ ...item, category })), `category:${category}`);
    });

    const awardedByUser = new Map();
    for (const entry of seenVideos.values()) {
        if (!entry.userId || entry.award <= 0) continue;
        awardedByUser.set(entry.userId, (awardedByUser.get(entry.userId) || 0) + entry.award);
    }

    for (const [userId, points] of awardedByUser.entries()) {
        const user = await db.collection('perfiles').findOne({
            $or: [
                { email: userId },
                { username: userId },
            ],
        });

        if (!user) continue;

        const currentPoints = Number(user.points) || 0;
        const nextPoints = currentPoints + points;
        const nextFrameId = resolveFrameIdForPoints(nextPoints);

        await db.collection('perfiles').updateOne(
            { _id: user._id },
            { $set: { points: nextPoints, frameId: nextFrameId } }
        );

        // Emitir evento WebSocket cuando se actualizan los puntos
        io.emit('userPointsUpdated', {
            email: user.email,
            username: user.username,
            points: nextPoints,
            frameId: nextFrameId,
            pointsGained: points,
        });
    }

    const runDoc = {
        weekKey,
        window: {
            start: window.start,
            end: window.end,
        },
        awards: Array.from(seenVideos.values()),
        processedAt: new Date(),
    };

    if (existing?._id) {
        await rankingRuns.updateOne({ _id: existing._id }, { $set: runDoc });
        return { ...existing, ...runDoc };
    }

    const insertResult = await rankingRuns.insertOne(runDoc);
    return { _id: insertResult.insertedId, ...runDoc };
}

async function processPendingWeeklyRankings() {
    if (!db) return;

    try {
        const window = getPreviousWeekWindow(new Date());
        const rankings = await buildWeeklyRankingsForWindow(window);
        await applyWeeklyAwards(rankings, window.key, window);
    } catch (error) {
        console.error('Error procesando rankings semanales:', error.message);
    }
}

function cleanupUploadedFiles(files = []) {
    files.forEach((file) => {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    });
}

// --- Upload Route ---
app.post('/api/videos', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 12 },
]), async (req, res) => {
    let files = [];
    try {
        const { title, category, description, id_usuario } = req.body;
        files = [
            ...(req.files?.file || []),
            ...(req.files?.files || []),
        ];

        if (!files.length || !title || !category || !id_usuario) {
            cleanupUploadedFiles(files);
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        const uploadedUrls = [];
        for (const file of files) {
            const result = await cloudinary.uploader.upload(file.path, {
                resource_type: 'auto',
                folder: 'videos_app',
            });
            uploadedUrls.push(result.secure_url);
        }

        cleanupUploadedFiles(files);

        const primaryUrl = uploadedUrls[0];
        const mediaType = files.length > 1
            ? 'carousel'
            : (files[0]?.mimetype || '').startsWith('image/')
                ? 'image'
                : 'video';

        // Guardar en MongoDB
        const videoDoc = {
            url: primaryUrl,
            mediaUrls: uploadedUrls,
            mediaType,
            title,
            category,
            description,
            id_usuario,
            likes: 0,
            likedBy: [],
            createdAt: new Date()
        };

        const insertResult = await db.collection('videos').insertOne(videoDoc);

        res.status(201).json({
            id: insertResult.insertedId.toString(),
            url: primaryUrl,
            mediaUrls: uploadedUrls,
            mediaType,
            title,
            category,
            description,
            id_usuario,
            likes: 0,
            likedBy: [],
            createdAt: videoDoc.createdAt.toISOString()
        });

    } catch (error) {
        cleanupUploadedFiles(files);
        console.error('Error al subir video:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

// --- Get Videos Route ---
app.get('/api/videos', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        const categoryRaw = String(req.query.category || '').trim();

        const pipeline = [];

        if (categoryRaw) {
            pipeline.push({ $match: { category: buildNameRegex(categoryRaw) } });
        }

        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: offset },
            { $limit: limit },
            { $addFields: { videoIdStr: { $toString: '$_id' } } },
            {
                $lookup: {
                    from: 'comentarios',
                    localField: 'videoIdStr',
                    foreignField: 'videoId',
                    as: 'comments',
                },
            },
            { $addFields: { commentsCount: { $size: '$comments' } } },
            { $addFields: { uploaderKey: { $toLower: { $ifNull: ['$id_usuario', ''] } } } },
            {
                $lookup: {
                    from: 'perfiles',
                    let: { uploaderKey: '$uploaderKey' },
                    pipeline: [
                        { $addFields: { emailKey: { $toLower: '$email' } } },
                        { $match: { $expr: { $eq: ['$emailKey', '$$uploaderKey'] } } },
                        { $project: { password: 0, emailKey: 0 } },
                    ],
                    as: 'uploader',
                },
            },
            { $addFields: { uploader: { $first: '$uploader' } } },
            { $project: { comments: 0, videoIdStr: 0, uploaderKey: 0 } },
        );

        const videos = await db.collection('videos').aggregate(pipeline).toArray();

        const enriched = await Promise.all(videos.map(async (video) => {
            let uploaderCard = null;

            if (video?.uploader) {
                const cardData = await resolveCardData(video.uploader.teamId, video.uploader.frameId);
                uploaderCard = {
                    username: video.uploader.username,
                    position: video.uploader.position,
                    teamName: cardData.teamName,
                    teamImageUrl: cardData.teamImageUrl,
                    frameImageId: cardData.frameImageId,
                    frameId: cardData.resolvedFrameId,
                    profileImageUrl: video.uploader.profileImageUrl ?? null,
                };
            }

            const sanitized = { ...video };
            delete sanitized.uploader;

            return {
                ...sanitized,
                uploaderCard,
                id: video._id.toString(),
                _id: undefined,
            };
        }));

        res.json(enriched);
    } catch (error) {
        console.error('Error al obtener videos:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/videos/categories', async (req, res) => {
    try {
        const rawCategoryDocs = await db.collection('videos').aggregate([
            { $group: { _id: '$category' } },
            { $project: { _id: 0, category: '$_id' } },
        ]).toArray();

        const categoriesMap = new Map();
        rawCategoryDocs.forEach((row) => {
            const value = row?.category ?? row ?? '';
            const trimmed = String(value ?? '').trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (!categoriesMap.has(key)) {
                categoriesMap.set(key, trimmed);
            }
        });

        const categories = Array.from(categoriesMap.values()).sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' })
        );

        return res.json({ categories });
    } catch (error) {
        console.error('Error al obtener categorias de videos:', error);
        return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/categorias', async (req, res) => {
    try {
        const rows = await db.collection('categorias').find({}, { projection: { _id: 0 } }).toArray();
        const categoriesMap = new Map();

        rows.forEach((row) => {
            const candidate = typeof row === 'string'
                ? row
                : row?.name ?? row?.nombre ?? row?.title ?? row?.titulo ?? row?.category ?? row?.categoria ?? row?.label;

            const trimmed = String(candidate ?? '').trim();
            if (!trimmed) return;

            const key = trimmed.toLowerCase();
            if (!categoriesMap.has(key)) {
                categoriesMap.set(key, trimmed);
            }
        });

        const categories = Array.from(categoriesMap.values()).sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' })
        );

        return res.json({ categories });
    } catch (error) {
        console.error('Error al obtener categorias:', error);
        return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/rankings/weekly', async (req, res) => {
    try {
        const categoryRaw = String(req.query.category || '').trim();
        const wantCurrent = String(req.query.current || '').toLowerCase() === 'true' || String(req.query.current || '') === '1';

        const window = wantCurrent ?
            { start: startOfNaturalWeek(new Date()), end: endOfNaturalWeek(new Date()), key: getWeekKey(new Date()) }
            : getPreviousWeekWindow(new Date());

        const rankings = await buildWeeklyRankingsForWindow(window);

        if (categoryRaw && categoryRaw.toLowerCase() !== 'todos') {
            const selectedCategory = Object.keys(rankings.byCategory).find(
                (item) => item.localeCompare(categoryRaw, 'es', { sensitivity: 'base' }) === 0
            ) || null;

            return res.json({
                week: window,
                categories: rankings.categories,
                general: rankings.general,
                selectedCategory: selectedCategory || categoryRaw,
                selectedRanking: selectedCategory ? rankings.byCategory[selectedCategory] : [],
                byCategory: rankings.byCategory,
            });
        }

        return res.json({
            week: window,
            categories: rankings.categories,
            general: rankings.general,
            selectedCategory: 'Todos',
            selectedRanking: rankings.general,
            byCategory: rankings.byCategory,
        });
    } catch (error) {
        console.error('Error GET /api/rankings/weekly', error.message);
        return res.status(500).json({ message: 'Error obteniendo ranking semanal' });
    }
});

// --- Username availability check (DEBE estar ANTES de /api/usuarios/:id) ---
app.get('/api/usuarios/usernameDisponible', async (req, res) => {
    try {
        const username = String(req.query.username || '').trim();
        if (!username) return res.status(400).json({ message: 'username es obligatorio' });

        if (username.length < 3 || username.length > 10) {
            return res.json({ available: false, reason: 'length' });
        }

        if (!/^[a-zA-Z0-9.\-]+$/.test(username)) {
            return res.json({ available: false, reason: 'invalid_chars' });
        }

        if (!/[a-zA-Z]/.test(username)) {
            return res.json({ available: false, reason: 'needs_letter' });
        }

        const existing = await db.collection('perfiles').findOne({ username }, { collation: { locale: 'es', strength: 2 } });
        return res.json({ available: !Boolean(existing) });
    } catch (err) {
        console.error('Error checking username availability', err.message);
        return res.status(500).json({ message: 'Error interno' });
    }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await db.collection('perfiles').findOne(buildIdFilter(id));

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const cardData = await resolveCardData(user.teamId, user.frameId);
        const points = Number(user.points) || 0;

        return res.json({
            id: extractDocId(user),
            username: user.username,
            email: user.email,
            position: user.position,
            profileImageUrl: user.profileImageUrl ?? null,
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName ?? 'Sin equipo',
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
            points,
            currentFrame: getFrameTierForPoints(points)?.frameId || 'bronce',
            nextFrame: getNextFrameTier(points)?.frameId || null,
        });
    } catch (error) {
        console.error('Error GET /api/usuarios/:id', error.message);
        return res.status(500).json({ message: 'Error obteniendo usuario' });
    }
});

app.get('/api/posiciones', async (req, res) => {
    try {
        const rows = await db.collection('posiciones').find({}, { projection: { _id: 0 } }).toArray();
        const positionsMap = new Map();

        rows.forEach((row) => {
            const candidate = typeof row === 'string'
                ? row
                : row?.name ?? row?.nombre ?? row?.title ?? row?.titulo ?? row?.position ?? row?.posicion ?? row?.label;

            const trimmed = String(candidate ?? '').trim();
            if (!trimmed) return;

            const key = trimmed.toLowerCase();
            if (!positionsMap.has(key)) {
                positionsMap.set(key, trimmed);
            }
        });

        const posiciones = Array.from(positionsMap.values()).sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' })
        );

        return res.json({ posiciones });
    } catch (error) {
        console.error('Error al obtener posiciones:', error);
        return res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/videos/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de video invalido' });
        }

        const comments = await db.collection('comentarios')
            .find({ videoId: id })
            .sort({ createdAt: -1 })
            .toArray();

        const enrichedComments = await Promise.all(comments.map(async (comment) => {
            const authorEmail = String(comment.userId || '').trim().toLowerCase();
            let authorProfile = null;

            if (authorEmail) {
                authorProfile = await db.collection('perfiles').findOne({ email: authorEmail });
            }

            const cardData = authorProfile
                ? await resolveCardData(authorProfile.teamId, authorProfile.frameId)
                : { teamName: null, teamImageUrl: null, frameImageId: null, resolvedFrameId: null };

            return {
                ...comment,
                authorUsername: authorProfile?.username || comment.username || authorEmail.split('@')[0] || 'usuario',
                authorProfileImageUrl: authorProfile?.profileImageUrl || null,
                authorTeamName: cardData.teamName,
                authorTeamImageUrl: cardData.teamImageUrl,
                authorFrameImageId: cardData.frameImageId,
                authorFrameId: cardData.resolvedFrameId,
                id: comment._id.toString(),
                _id: undefined,
            };
        }));

        return res.json(enrichedComments);
    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.post('/api/videos/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de video invalido' });
        }

        const { id_usuario, type, text, audioUrl } = req.body || {};
        const normalizedUser = String(id_usuario || '').trim().toLowerCase();
        const normalizedType = String(type || '').trim().toLowerCase();

        if (!normalizedUser) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        if (normalizedType !== 'text' && normalizedType !== 'audio') {
            return res.status(400).json({ message: 'type invalido' });
        }

        if (normalizedType === 'text' && !String(text || '').trim()) {
            return res.status(400).json({ message: 'text es obligatorio' });
        }

        if (normalizedType === 'audio' && !String(audioUrl || '').trim()) {
            return res.status(400).json({ message: 'audioUrl es obligatorio' });
        }

        const commentDoc = {
            videoId: id,
            userId: normalizedUser,
            type: normalizedType,
            text: normalizedType === 'text' ? String(text).trim() : null,
            audioUrl: normalizedType === 'audio' ? String(audioUrl).trim() : null,
            createdAt: new Date(),
        };

        const insertResult = await db.collection('comentarios').insertOne(commentDoc);

        return res.status(201).json({
            id: insertResult.insertedId.toString(),
            ...commentDoc,
            createdAt: commentDoc.createdAt.toISOString(),
        });
    } catch (error) {
        console.error('Error al crear comentario:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

// --- Foros (team forums) ---
app.get('/api/foros/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) return res.status(400).json({ message: 'teamId es obligatorio' });

        // Return messages sorted ascending (oldest first) so newest appear at the bottom in the chat
        const msgs = await db.collection('foros')
            .find({ team: teamId })
            .sort({ date: 1 })
            .toArray();

        // Enrich each message: resolve current username from perfiles using stored user (email)
        const enriched = await Promise.all(msgs.map(async (m) => {
            const storedUser = String(m.user || '').trim();
            const maybeEmail = storedUser.includes('@') ? storedUser.toLowerCase() : null;

            let resolvedUsername = storedUser;
            let profileImageUrl = null;

            if (maybeEmail) {
                const profile = await db.collection('perfiles').findOne({ email: maybeEmail });
                if (profile) {
                    resolvedUsername = profile.username || (maybeEmail.split('@')[0]);
                    profileImageUrl = profile.profileImageUrl || null;
                } else {
                    resolvedUsername = maybeEmail.split('@')[0];
                }
            } else {
                // stored value is not an email (legacy) - try to resolve by username
                const profile = await db.collection('perfiles').findOne({ username: storedUser }, { collation: { locale: 'es', strength: 2 } });
                if (profile) {
                    resolvedUsername = profile.username;
                    profileImageUrl = profile.profileImageUrl || null;
                }
            }

            return {
                ...m,
                id: m._id.toString(),
                _id: undefined,
                user: resolvedUsername,
                userEmail: maybeEmail,
                profileImageUrl,
            };
        }));

        return res.json(enriched);
    } catch (err) {
        console.error('Error GET /api/foros/:teamId', err.message);
        return res.status(500).json({ message: 'Error obteniendo foro' });
    }
});

app.post('/api/foros/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { user, type, text, audioUrl, share } = req.body || {};

        if (!teamId) return res.status(400).json({ message: 'teamId es obligatorio' });
        if (!user) return res.status(400).json({ message: 'user es obligatorio' });

        const allowedTypes = ['text', 'audio', 'share'];
        if (!type || !allowedTypes.includes(type)) return res.status(400).json({ message: 'type invalido' });

        if (type === 'text' && (!text || String(text).trim().length === 0)) return res.status(400).json({ message: 'text es obligatorio para type=text' });
        if (type === 'text' && String(text).length > 500) return res.status(400).json({ message: 'text supera 500 caracteres' });
        if (type === 'audio' && (!audioUrl || String(audioUrl).trim().length === 0)) return res.status(400).json({ message: 'audioUrl es obligatorio para type=audio' });

        // For share type, accept a 'share' object with videoId and optional thumbnailUrl/title/mediaType
        let shareObj = null;
        if (type === 'share') {
            if (!share || (!share.videoId && !share.video_id)) {
                return res.status(400).json({ message: 'share.videoId es obligatorio para type=share' });
            }

            shareObj = {
                videoId: String(share.videoId || share.video_id),
                thumbnailUrl: share.thumbnailUrl || share.thumbnail_url || null,
                title: String(share.title || share.titulo || share.name || '').trim() || null,
                mediaType: String(share.mediaType || share.media_type || '').trim().toLowerCase() || null,
                carouselIndex: (() => {
                    const parsedIndex = Number.parseInt(String(share.carouselIndex ?? share.carousel_index ?? share.mediaIndex ?? share.media_index ?? ''), 10);
                    return Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null;
                })(),
            };
        }

        // Normalize user identifier: prefer email (lowercased) when present
        const rawUser = String(user || '').trim();
        const normalizedUser = rawUser.includes('@') ? rawUser.toLowerCase() : rawUser;

        const doc = {
            user: normalizedUser,
            team: teamId,
            type,
            audioUrl: type === 'audio' ? (audioUrl || null) : null,
            text: type === 'text' ? String(text).trim() : null,
            share: shareObj,
            date: new Date(),
        };

        const result = await db.collection('foros').insertOne(doc);
        const created = await db.collection('foros').findOne({ _id: result.insertedId });
        
        // Emitir evento WebSocket a todos los usuarios conectados en este foro
        io.emit('forumMessage', {
            teamId,
            message: {
                ...created,
                id: created._id.toString(),
                _id: undefined,
            }
        });

        return res.status(201).json({ ...created, id: created._id.toString(), _id: undefined });
    } catch (err) {
        console.error('Error POST /api/foros/:teamId', err.message);
        return res.status(500).json({ message: 'Error creando mensaje de foro' });
    }
});

app.delete('/api/foros/:teamId/:messageId', async (req, res) => {
    try {
        const { teamId, messageId } = req.params;
        const userIdentifier = String(req.body?.user || req.query?.user || '').trim();

        if (!teamId) return res.status(400).json({ message: 'teamId es obligatorio' });
        if (!messageId) return res.status(400).json({ message: 'messageId es obligatorio' });
        if (!userIdentifier) return res.status(400).json({ message: 'user es obligatorio' });

        if (!ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: 'messageId invalido' });
        }

        const message = await db.collection('foros').findOne({ _id: new ObjectId(messageId), team: teamId });
        
        if (!message) {
            return res.status(404).json({ message: 'Mensaje no encontrado' });
        }

        // Validate ownership: compare stored user (normalized) with identifier (normalized)
        const storedUser = String(message.user || '').trim().toLowerCase();
        const normalizedIdentifier = String(userIdentifier).trim().toLowerCase();
        
        if (storedUser !== normalizedIdentifier) {
            return res.status(403).json({ message: 'No autorizado para eliminar este mensaje' });
        }

        await db.collection('foros').deleteOne({ _id: new ObjectId(messageId) });
        
        // Emitir evento WebSocket de eliminación
        io.emit('forumMessageDeleted', {
            teamId,
            messageId: messageId.toString(),
        });

        return res.json({ message: 'Mensaje eliminado' });
    } catch (err) {
        console.error('Error DELETE /api/foros/:teamId/:messageId', err.message);
        return res.status(500).json({ message: 'Error eliminando mensaje' });
    }
});

app.delete('/api/comments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userIdRaw = String(req.body?.id_usuario || req.query?.id_usuario || '').trim().toLowerCase();

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de comentario invalido' });
        }

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const commentObjectId = new ObjectId(id);
        const comment = await db.collection('comentarios').findOne({ _id: commentObjectId });

        if (!comment) {
            return res.status(404).json({ message: 'Comentario no encontrado' });
        }

        if (String(comment.userId || '').trim().toLowerCase() !== userIdRaw) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar este comentario' });
        }

        await db.collection('comentarios').deleteOne({ _id: commentObjectId });

        return res.json({ success: true, id });
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.post('/api/uploads/audio', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ message: 'file es obligatorio' });
        }

        const result = await cloudinary.uploader.upload(file.path, {
            resource_type: 'video',
            folder: 'audio_comments',
        });

        fs.unlinkSync(file.path);

        return res.status(201).json({ url: result.secure_url });
    } catch (error) {
        console.error('Error al subir audio:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.post('/api/videos/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const userIdRaw = String(req.body?.id_usuario || '').trim().toLowerCase();

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de video invalido' });
        }

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const videoObjectId = new ObjectId(id);

        const result = await db.collection('videos').updateOne(
            { _id: videoObjectId, likedBy: { $ne: userIdRaw } },
            {
                $inc: { likes: 1 },
                $addToSet: { likedBy: userIdRaw },
            }
        );

        const video = await db.collection('videos').findOne({ _id: videoObjectId });
        if (!video) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const alreadyLiked = result.modifiedCount === 0;

        // Crear notificacion en cada like nuevo.
        const ownerUserId = String(video.id_usuario || '').trim().toLowerCase();
        if (!alreadyLiked) {
            const recipientUserId = ownerUserId || userIdRaw;
            const videoTitle = String(video.title || 'video').trim();

            await db.collection('notificaciones').insertOne({
                videoId: video._id.toString(),
                videoTitle,
                actorUserId: userIdRaw,
                recipientUserId,
                type: 'like',
                read: false,
                createdAt: new Date(),
            });

            // Emitir evento WebSocket al propietario del video
            const recipientSocketId = connectedUsers.get(recipientUserId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('newNotification', {
                    type: 'like',
                    videoId: video._id.toString(),
                    videoTitle,
                    actorUserId: userIdRaw,
                    createdAt: new Date(),
                    message: `Alguien te dio like a tu video`
                });
            }
        }

        return res.json({
            id: video._id.toString(),
            likes: Number(video.likes || 0),
            liked: true,
            alreadyLiked,
        });
    } catch (error) {
        console.error('Error al dar like:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/notificaciones', async (req, res) => {
    try {
        const userIdRaw = String(req.query?.id_usuario || '').trim().toLowerCase();
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = parseInt(req.query.offset, 10) || 0;

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const notifications = await db.collection('notificaciones')
            .find({ recipientUserId: userIdRaw })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        const enrichedNotifications = await Promise.all(notifications.map(async (n) => {
            const actorEmail = String(n.actorUserId || '').trim().toLowerCase();
            let actorProfile = null;

            if (actorEmail) {
                actorProfile = await db.collection('perfiles').findOne({ email: actorEmail });
            }

            const actorUsername = actorProfile?.username || actorEmail.split('@')[0] || 'usuario';
            const cardData = actorProfile
                ? await resolveCardData(actorProfile.teamId, actorProfile.frameId)
                : { teamName: null, teamImageUrl: null, frameImageId: null, actorFrameId: null };

            const videoTitle = String(n.videoTitle || 'video').trim();
            const dynamicMessage = `${actorUsername} le ha dado me gusta a tu video: ${videoTitle}`;

            return {
                ...n,
                actorUsername,
                message: dynamicMessage,
                actorProfileImageUrl: actorProfile?.profileImageUrl || null,
                actorTeamName: cardData.teamName,
                actorTeamImageUrl: cardData.teamImageUrl,
                actorFrameImageId: cardData.frameImageId,
                actorFrameId: cardData.resolvedFrameId,
                id: n._id.toString(),
                _id: undefined,
            };
        }));

        return res.json(enrichedNotifications);
    } catch (error) {
        console.error('Error al obtener notificaciones:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.get('/api/notificaciones/unread-count', async (req, res) => {
    try {
        const userIdRaw = String(req.query?.id_usuario || '').trim().toLowerCase();

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const count = await db.collection('notificaciones').countDocuments({
            recipientUserId: userIdRaw,
            read: { $ne: true },
        });

        return res.json({ unreadCount: count });
    } catch (error) {
        console.error('Error al contar notificaciones:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.post('/api/notificaciones/mark-read', async (req, res) => {
    try {
        const userIdRaw = String(req.body?.id_usuario || '').trim().toLowerCase();

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const result = await db.collection('notificaciones').updateMany(
            { recipientUserId: userIdRaw, read: { $ne: true } },
            { $set: { read: true } }
        );

        return res.json({ updated: result.modifiedCount || 0 });
    } catch (error) {
        console.error('Error al marcar notificaciones como leidas:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.delete('/api/notificaciones', async (req, res) => {
    try {
        const userIdRaw = String(req.body?.id_usuario || '').trim().toLowerCase();

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const result = await db.collection('notificaciones').deleteMany({
            recipientUserId: userIdRaw,
        });

        return res.json({ deleted: result.deletedCount || 0 });
    } catch (error) {
        console.error('Error al eliminar notificaciones:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.post('/api/videos/:id/unlike', async (req, res) => {
    try {
        const { id } = req.params;
        const userIdRaw = String(req.body?.id_usuario || '').trim().toLowerCase();

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de video invalido' });
        }

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const videoObjectId = new ObjectId(id);

        const result = await db.collection('videos').updateOne(
            { _id: videoObjectId, likedBy: userIdRaw },
            {
                $inc: { likes: -1 },
                $pull: { likedBy: userIdRaw },
            }
        );

        // Protección adicional ante datos legacy inconsistentes.
        await db.collection('videos').updateOne(
            { _id: videoObjectId, likes: { $lt: 0 } },
            { $set: { likes: 0 } }
        );

        const video = await db.collection('videos').findOne({ _id: videoObjectId });
        if (!video) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const alreadyUnliked = result.modifiedCount === 0;

        return res.json({
            id: video._id.toString(),
            likes: Number(video.likes || 0),
            liked: false,
            alreadyUnliked,
        });
    } catch (error) {
        console.error('Error al quitar like:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

app.delete('/api/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userIdRaw = String(req.body?.id_usuario || req.query?.id_usuario || '').trim().toLowerCase();

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id de video invalido' });
        }

        if (!userIdRaw) {
            return res.status(400).json({ message: 'id_usuario es obligatorio' });
        }

        const videoObjectId = new ObjectId(id);
        const video = await db.collection('videos').findOne({ _id: videoObjectId });

        if (!video) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const ownerId = String(video.id_usuario || '').trim().toLowerCase();
        if (ownerId !== userIdRaw) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar este video' });
        }

        await db.collection('videos').deleteOne({ _id: videoObjectId });

        return res.json({
            success: true,
            id: id,
            message: 'Video eliminado correctamente',
        });
    } catch (error) {
        console.error('Error al eliminar video:', error);
        return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
    }
});

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    console.error("❌ Falta la variable MONGO_URI en backend/.env");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const PORT = process.env.PORT || 5000;
const DB_NAME = process.env.MONGO_DB_NAME || 'sotanitapp';

let db;

const createUserSchema = z.object({
    username: z.string()
        .min(3, 'Username debe tener al menos 3 caracteres')
        .max(10, 'Username no puede superar 10 caracteres')
        .regex(/^[a-zA-Z0-9.\-]+$/, 'Username solo puede contener letras, numeros, "." y "-"')
        .refine(
            (username) => /[a-zA-Z]/.test(username),
            'Username debe contener al menos una letra'
        ),
    email: z.string()
        .email('Email invalido')
        .refine(
            (email) => {
                // Basic real email validation - must have common TLD
                const parts = email.split('@');
                if (parts.length !== 2) return false;
                const domain = parts[1];
                return /\.[a-z]{2,}$/i.test(domain);
            },
            'Email debe ser un email valido y real'
        ),
    password: z.string()
        .min(8, 'Contrasena debe tener minimo 8 caracteres')
        .regex(/[a-zA-Z]/, 'Contrasena debe contener al menos una letra')
        .regex(/\d/, 'Contrasena debe contener al menos un numero')
        .regex(/[$&%_#]/, 'Contrasena debe contener al menos un caracter especial ($, &, %, _, #)')
        .refine(
            (password) => {
                // Verify it only contains allowed characters
                return /^[a-zA-Z0-9$&%_#]+$/.test(password);
            },
            'Contrasena solo puede contener letras, numeros y caracteres especiales ($, &, %, _, #)'
        ),
    position: z.string().min(1),
    teamId: z.string().min(1).optional(),
    teamName: z.string().min(1).optional(),
    frameId: z.string().min(1).default('bronce'),
    profileImageUrl: z.string().min(1).optional(),
});

function buildNameRegex(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
}

function extractDocId(doc) {
    if (!doc) return null;
    if (typeof doc._id === 'string' && doc._id) return doc._id;
    if (doc._id && typeof doc._id.toString === 'function') return doc._id.toString();
    return null;
}

function buildIdCandidates(id) {
    const normalized = String(id || '').trim();
    if (!normalized) return [];

    const candidates = [normalized];
    if (ObjectId.isValid(normalized)) {
        candidates.push(new ObjectId(normalized));
    }

    return candidates;
}

function buildIdFilter(id) {
    const normalized = String(id || '').trim();
    if (!normalized) return { _id: null };

    const candidates = [normalized];
    if (ObjectId.isValid(normalized)) {
        candidates.push(new ObjectId(normalized));
    }

    return candidates.length === 1 ? { _id: candidates[0] } : { _id: { $in: candidates } };
}

function normalizeImageUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('//')) return `https:${raw}`;
    return raw;
}

// Helpers: fondo contains background images, equipos contains escudos.
async function findFondoById(teamId) {
    return db.collection('fondo').findOne(buildIdFilter(teamId));
}

async function findEquiposById(teamId) {
    return db.collection('equipos').findOne(buildIdFilter(teamId));
}

async function findFondoByName(name) {
    return db.collection('fondo').findOne({ $or: [{ name: buildNameRegex(name) }, { Name: buildNameRegex(name) }] });
}

async function findEquiposByName(name) {
    return db.collection('equipos').findOne({ $or: [{ name: buildNameRegex(name) }, { Name: buildNameRegex(name) }] });
}

async function uploadProfileImageUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;

    const result = await cloudinary.uploader.upload(raw, {
        resource_type: 'image',
        folder: 'sotanitapp_profiles',
    });

    return result.secure_url || null;
}

async function resolveCardData(teamId, frameId) {
    // Prefer 'fondo' for background and 'equipos' for escudo
    const [fondoDoc, equiposDoc, frameDoc] = await Promise.all([
        teamId ? findFondoById(teamId) : Promise.resolve(null),
        teamId ? findEquiposById(teamId) : Promise.resolve(null),
        frameId ? db.collection('marco').findOne(buildIdFilter(frameId)) : Promise.resolve(null),
    ]);

    const teamDoc = fondoDoc || equiposDoc || null;
    const teamImageUrl = fondoDoc ? normalizeImageUrl(fondoDoc.imageUrl ?? fondoDoc.escudoUrl) : (equiposDoc ? normalizeImageUrl(equiposDoc.imageUrl ?? equiposDoc.escudoUrl) : null);
    const teamEscudoUrl = equiposDoc ? normalizeImageUrl(equiposDoc.escudoUrl ?? equiposDoc.imageUrl) : (fondoDoc ? normalizeImageUrl(fondoDoc.escudoUrl ?? fondoDoc.imageUrl) : null);

    return {
        teamDoc,
        frameDoc,
        teamName: teamDoc ? (teamDoc.name ?? teamDoc.Name ?? null) : null,
        teamImageUrl,
        teamEscudoUrl,
        frameImageId: frameDoc ? normalizeImageUrl(frameDoc.imageId) : null,
        resolvedTeamId: teamDoc ? extractDocId(teamDoc) : teamId,
        resolvedFrameId: frameDoc ? extractDocId(frameDoc) : frameId,
    };
}

async function handleGetNombresEquipos(req, res) {
    try {
        const rows = [];

        const fondoDocs = await db.collection('fondo').find({}, { projection: { _id: 0, name: 1, Name: 1 } }).toArray();
        const equiposDocs = await db.collection('equipos').find({}, { projection: { _id: 0, name: 1, Name: 1 } }).toArray();

        rows.push(...fondoDocs, ...equiposDocs);

        const nombres = [...new Set(
            rows
                .map((row) => String(row.name ?? row.Name ?? '').trim())
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

        return res.json({ nombresEquipos: nombres });
    } catch (err) {
        console.error('❌ Error en GET /api/equipos/nombres', err.message);
        return res.status(500).json({ message: 'Error obteniendo nombres de equipos' });
    }
}

app.get('/api/equipos/nombres', handleGetNombresEquipos);
app.get('/api/nombresEquipos', handleGetNombresEquipos);

app.get('/api/equipos/lista/todos', async (req, res) => {
    try {
        // Fetch from equipos collection first (should have shields)
        const equiposDocs = await db.collection('equipos').find({}, { projection: { _id: 1, name: 1, Name: 1, escudoUrl: 1 } }).toArray();
        
        // Map and normalize
        const allTeams = equiposDocs.map((doc) => {
            const escudoUrl = normalizeImageUrl(doc.escudoUrl);
            const teamName = (doc.name ?? doc.Name ?? 'Equipo sin nombre').trim();
            return {
                id: doc._id.toString(),
                name: teamName,
                escudoUrl,
                normalizedName: teamName.toLowerCase().trim(),
            };
        });

        // Remove duplicates by normalized name (case-insensitive, trimmed)
        const uniqueTeams = [];
        const seenNames = new Set();
        
        allTeams.forEach((team) => {
            if (!seenNames.has(team.normalizedName)) {
                seenNames.add(team.normalizedName);
                uniqueTeams.push({
                    id: team.id,
                    name: team.name,
                    escudoUrl: team.escudoUrl,
                });
            }
        });

        // Sort alphabetically in Spanish
        uniqueTeams.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        return res.json({ equipos: uniqueTeams });
    } catch (err) {
        console.error('❌ Error en GET /api/equipos/lista/todos', err.message);
        return res.status(500).json({ message: 'Error obteniendo lista de equipos' });
    }
});

async function handleGetTeamIdByName(req, res) {
    const name = String(req.query.name || '').trim();

    if (!name) {
        return res.status(400).json({ message: 'El query param name es obligatorio' });
    }

    try {
        let teamDoc = await findFondoByName(name);
        if (!teamDoc) {
            teamDoc = await findEquiposByName(name);
        }

        if (!teamDoc) {
            return res.status(404).json({ message: 'Equipo no encontrado' });
        }

        const teamId = extractDocId(teamDoc);
        if (!teamId) {
            return res.status(500).json({ message: 'El equipo no tiene id valido' });
        }

        return res.json({ name: teamDoc.name ?? teamDoc.Name, teamId });
    } catch (err) {
        console.error('❌ Error en GET /api/equipos/id', err.message);
        return res.status(500).json({ message: 'Error obteniendo teamId' });
    }
}

// --- Get Team Routes (DEBEN estar ANTES de /api/equipos/:id) ---
app.get('/api/equipos/id', handleGetTeamIdByName);
app.get('/api/equipo/idPorNombre', handleGetTeamIdByName);

app.get('/api/equipos/:id', async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ message: 'El id del equipo es obligatorio' });
    }

    try {
        const equiposDoc = await findEquiposById(id);
        const fondoDoc = await findFondoById(id);

        const teamDoc = {
            ...(equiposDoc || {}),
            ...(fondoDoc || {}),
        };

        if (!equiposDoc && !fondoDoc) {
            return res.status(404).json({ message: 'Equipo no encontrado' });
        }

        const escudoUrl = normalizeImageUrl(
            equiposDoc?.escudoUrl ?? equiposDoc?.imageUrl ?? fondoDoc?.escudoUrl ?? fondoDoc?.imageUrl
        );
        const imageUrl = normalizeImageUrl(
            fondoDoc?.imageUrl ?? fondoDoc?.escudoUrl ?? equiposDoc?.imageUrl ?? equiposDoc?.escudoUrl
        );
        const name = teamDoc.name ?? teamDoc.Name ?? teamDoc.teamName ?? teamDoc.title ?? teamDoc.nombre ?? equiposDoc?.name ?? equiposDoc?.Name ?? fondoDoc?.name ?? fondoDoc?.Name ?? null;
        const year = teamDoc.year ?? teamDoc.founded ?? teamDoc.lastYear ?? teamDoc.foundationYear ?? teamDoc.anio ?? teamDoc.ano ?? equiposDoc?.year ?? equiposDoc?.founded ?? fondoDoc?.year ?? fondoDoc?.founded ?? null;
        const stadium = teamDoc.stadium ?? teamDoc.stadio ?? teamDoc.stadiumName ?? teamDoc.estadio ?? equiposDoc?.stadium ?? equiposDoc?.stadiumName ?? fondoDoc?.stadium ?? fondoDoc?.stadiumName ?? null;
        const lastTitle = teamDoc.lastTitle ?? teamDoc.last_title ?? teamDoc.lastTitleWon ?? teamDoc.ultimoTitulo ?? teamDoc.tituloUltimo ?? equiposDoc?.lastTitle ?? equiposDoc?.last_title ?? fondoDoc?.lastTitle ?? fondoDoc?.last_title ?? null;

        return res.json({
            ...equiposDoc,
            ...fondoDoc,
            id: extractDocId(teamDoc) || extractDocId(equiposDoc) || extractDocId(fondoDoc),
            name,
            escudoUrl,
            imageUrl,
            year,
            stadium,
            lastTitle,
        });
    } catch (err) {
        console.error('❌ Error en GET /api/equipos/:id', err.message);
        return res.status(500).json({ message: 'Error obteniendo equipo' });
    }
});

async function handleCreateUser(req, res) {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Datos de registro invalidos', issues: parsed.error.issues });
    }

    try {
        const { username, email, password, position, frameId, teamId: inputTeamId, teamName, profileImageUrl } = parsed.data;
        const normalizedUsername = username.trim();

        const existing = await db.collection('perfiles').findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
        }

        const existingUsername = await db.collection('perfiles').findOne(
            { username: normalizedUsername },
            { collation: { locale: 'es', strength: 2 } }
        );
        if (existingUsername) {
            return res.status(409).json({ message: 'Ese nombre de usuario no esta disponible' });
        }

        let teamId = inputTeamId;
        let resolvedTeamName = teamName;

        if (teamId) {
            let teamById = await findFondoById(teamId);
            if (!teamById) {
                teamById = await findEquiposById(teamId);
            }
            if (!teamById) {
                return res.status(404).json({ message: 'teamId no existe' });
            }
            teamId = extractDocId(teamById);
            resolvedTeamName = teamById.name ?? teamById.Name;
        }

        if (!teamId && teamName) {
            let teamDoc = await findFondoByName(teamName);
            if (!teamDoc) {
                teamDoc = await findEquiposByName(teamName);
            }
            if (!teamDoc) {
                return res.status(404).json({ message: 'Equipo no encontrado para el registro' });
            }
            teamId = extractDocId(teamDoc);
            resolvedTeamName = teamDoc.name ?? teamDoc.Name;
        }

        if (!teamId) {
            return res.status(400).json({ message: 'Debe enviarse teamId o teamName valido' });
        }

        const frameDoc = await db.collection('marco').findOne(buildIdFilter(frameId));
        if (!frameDoc) {
            return res.status(404).json({ message: 'frameId no existe en marco' });
        }

        const resolvedFrameId = extractDocId(frameDoc);

        const hashedPassword = await bcrypt.hash(password, 10);
        const resolvedProfileImageUrl = profileImageUrl
            ? await uploadProfileImageUrl(profileImageUrl)
            : null;

        const userDoc = {
            username: normalizedUsername,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            position: position.trim(),
            teamId,
            frameId: resolvedFrameId,
            profileImageUrl: resolvedProfileImageUrl,
            points: 0,
            createdAt: new Date(),
        };

        const result = await db.collection('perfiles').insertOne(userDoc);
        const persistedUser = await db.collection('perfiles').findOne({ _id: result.insertedId });

        if (!persistedUser) {
            return res.status(500).json({ message: 'No se pudo confirmar la creacion del usuario en base de datos' });
        }

        const cardData = await resolveCardData(persistedUser.teamId, persistedUser.frameId);

        return res.status(201).json({
            id: persistedUser._id.toString(),
            username: persistedUser.username,
            email: persistedUser.email,
            position: persistedUser.position,
            profileImageUrl: persistedUser.profileImageUrl ?? null,
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName ?? resolvedTeamName,
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
            points: Number(persistedUser.points) || 0,
        });
    } catch (err) {
        if (err?.code === 11000 && (String(err?.message || '').includes('username') || err?.keyPattern?.username)) {
            return res.status(409).json({ message: 'Ese nombre de usuario no esta disponible' });
        }
        console.error('❌ Error en POST /api/usuarios', err.message);
        return res.status(500).json({ message: 'Error creando usuario' });
    }
}

app.post('/api/usuarios', handleCreateUser);
app.post('/api/crearNuevoUsuario', handleCreateUser);

async function handleUpdateUser(req, res) {
    const { id } = req.params;
    const { username, teamId, teamName, position, profileImageUrl } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'El id del usuario es obligatorio' });
    }

    try {
        const updateData = {};

        if (username) {
            const normalizedUsername = String(username).trim();

            if (normalizedUsername.length < 3) {
                return res.status(400).json({ message: 'El nombre de usuario debe tener al menos 3 caracteres' });
            }

            if (normalizedUsername.length > 10) {
                return res.status(400).json({ message: 'El nombre de usuario no puede superar 10 caracteres' });
            }

            if (!/^[a-zA-Z0-9.\-]+$/.test(normalizedUsername)) {
                return res.status(400).json({ message: 'Username solo puede contener letras, numeros, "." y "-"' });
            }

            if (!/[a-zA-Z]/.test(normalizedUsername)) {
                return res.status(400).json({ message: 'El username debe contener al menos una letra' });
            }

            const idCandidates = buildIdCandidates(id);
            const existingUsername = await db.collection('perfiles').findOne(
                {
                    username: normalizedUsername,
                    _id: { $nin: idCandidates },
                },
                { collation: { locale: 'es', strength: 2 } }
            );

            if (existingUsername) {
                return res.status(409).json({ message: 'Ese nombre de usuario no esta disponible' });
            }

            updateData.username = normalizedUsername;
        }

        if (teamName) {
            let teamDoc = await findFondoByName(teamName);
            if (!teamDoc) {
                teamDoc = await findEquiposByName(teamName);
            }

            if (!teamDoc) {
                return res.status(404).json({ message: 'Equipo no encontrado' });
            }

            updateData.teamId = extractDocId(teamDoc);
        } else if (teamId) {
            let teamDoc = await findFondoById(teamId);
            if (!teamDoc) {
                teamDoc = await findEquiposById(teamId);
            }
            if (!teamDoc) {
                return res.status(404).json({ message: 'Equipo no encontrado' });
            }
            updateData.teamId = extractDocId(teamDoc);
        }

        if (position) {
            updateData.position = position.trim();
        }

        if (profileImageUrl) {
            updateData.profileImageUrl = await uploadProfileImageUrl(profileImageUrl);
        }

        if (!Object.keys(updateData).length) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }

        const result = await db.collection('perfiles').findOneAndUpdate(
            buildIdFilter(id),
            { $set: updateData },
            { returnDocument: 'after' }
        );

        const updatedUser = result?.value ?? result;

        if (!updatedUser) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const cardData = await resolveCardData(updatedUser.teamId, updatedUser.frameId);

        return res.json({
            id: extractDocId(updatedUser),
            username: updatedUser.username,
            email: updatedUser.email,
            position: updatedUser.position,
            profileImageUrl: updatedUser.profileImageUrl ?? null,
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName,
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
            points: Number(updatedUser.points) || 0,
        });
    } catch (err) {
        if (err?.code === 11000 && (String(err?.message || '').includes('username') || err?.keyPattern?.username)) {
            return res.status(409).json({ message: 'Ese nombre de usuario no esta disponible' });
        }
        console.error('❌ Error en PUT /api/usuarios/:id', err.message);
        return res.status(500).json({ message: 'Error actualizando usuario' });
    }
}

app.put('/api/usuarios/:id', handleUpdateUser);

async function handleLogin(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email/username y contraseña son obligatorios' });
    }

    try {
        // Buscar por email o username.
        // If input looks like an email, search by email (case-insensitive on local part via lowercasing input).
        // Otherwise treat the input as a username and perform an exact, case-sensitive match.
        const identifier = email.trim();
        const looksLikeEmail = (str) => /\S+@\S+\.\S+/.test(str);
        let user = null;
        if (looksLikeEmail(identifier)) {
            const normalizedEmail = identifier.toLowerCase();
            user = await db.collection('perfiles').findOne({ email: normalizedEmail });
        } else {
            // Exact match for username (case-sensitive)
            user = await db.collection('perfiles').findOne({ username: identifier });
        }

        if (!user) {
            return res.status(401).json({ message: 'Usuario no encontrado' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }

        const cardData = await resolveCardData(user.teamId, user.frameId);

        return res.json({
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            position: user.position,
            profileImageUrl: user.profileImageUrl ?? null,
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName ?? 'Sin equipo',
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
            points: Number(user.points) || 0,
        });
    } catch (err) {
        console.error('❌ Error en POST /api/login', err.message);
        return res.status(500).json({ message: 'Error en el servidor' });
    }
}

app.post('/api/login', handleLogin);

async function handleVideoStream(req, res, headOnly = false) {
    try {
        const { videoId } = req.params;
        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        const requestedIndex = Number.parseInt(String(req.query.mediaIndex ?? req.query.carouselIndex ?? ''), 10);
        const mediaUrls = Array.isArray(video?.mediaUrls) && video.mediaUrls.length
            ? video.mediaUrls
            : video?.url
                ? [video.url]
                : [];
        const safeIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0
            ? Math.min(requestedIndex, Math.max(mediaUrls.length - 1, 0))
            : 0;
        const primaryMediaUrl = mediaUrls[safeIndex] || video?.url;

        if (!video || !primaryMediaUrl) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const normalizedMediaType = String(video?.mediaType || '').toLowerCase();
        const isImageMedia = normalizedMediaType === 'image'
            || (normalizedMediaType === 'carousel' && !String(primaryMediaUrl || '').toLowerCase().match(/\.(mp4|mov|m4v|webm)(\?|$)/))
            || isLikelyImageUrl(primaryMediaUrl);

        if (isImageMedia) {
            if (headOnly) {
                return res.status(200).end();
            }
            return res.redirect(primaryMediaUrl);
        }

        const streamUrl = getStreamingCloudinaryUrl(primaryMediaUrl);
        await proxyRemoteStream(streamUrl, req, res, { headOnly });
    } catch (err) {
        console.error('❌ Error en streaming:', err.message);
        return res.status(500).json({ message: 'Error obteniendo streaming' });
    }
}

app.get('/api/videos/:videoId/stream', (req, res) => handleVideoStream(req, res, false));
app.head('/api/videos/:videoId/stream', (req, res) => handleVideoStream(req, res, true));

app.get('/api/videos/:videoId/download', async (req, res) => {
    try {
        const { videoId } = req.params;
        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        const mediaUrls = Array.isArray(video?.mediaUrls) && video.mediaUrls.length
            ? video.mediaUrls
            : video?.url
                ? [video.url]
                : [];
        const requestedIndex = Number.parseInt(req.query.mediaIndex, 10);
        const selectedIndex = Number.isFinite(requestedIndex)
            ? Math.max(0, Math.min(requestedIndex, Math.max(mediaUrls.length - 1, 0)))
            : 0;
        const primaryMediaUrl = mediaUrls[selectedIndex] || video?.url;
        const normalizedMediaType = String(video?.mediaType || '').toLowerCase();
        const isImageMedia = normalizedMediaType === 'image'
            || (normalizedMediaType === 'carousel' && !String(primaryMediaUrl || '').toLowerCase().match(/\.(mp4|mov|m4v)(\?|$)/))
            || isLikelyImageUrl(primaryMediaUrl);

        if (!video || !primaryMediaUrl) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        let extension = isImageMedia ? 'jpg' : 'mp4';
        try {
            const urlPath = new URL(primaryMediaUrl).pathname;
            const ext = path.extname(urlPath || '').toLowerCase();
            if (ext) {
                extension = ext.replace('.', '') || extension;
            }
        } catch (e) {
            // ignore invalid URLs
        }

        const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `media_${safeVideoId}.${extension}`;
        await streamRemoteFileToResponse(primaryMediaUrl, res, fileName);
    } catch (err) {
        console.error('❌ Error en descarga directa:', err.message);
        return res.status(500).json({ message: 'Error descargando el archivo' });
    }
});

app.get('/api/videos/:videoId/download-watermarked', async (req, res) => {
    try {
        const { videoId } = req.params;
        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        const requestedMediaIndex = Number.parseInt(String(req.query.mediaIndex ?? req.query.carouselIndex ?? ''), 10);
        const mediaUrls = Array.isArray(video?.mediaUrls) && video.mediaUrls.length
            ? video.mediaUrls
            : video?.url
                ? [video.url]
                : [];
        const safeMediaIndex = Number.isFinite(requestedMediaIndex) && requestedMediaIndex >= 0
            ? Math.min(requestedMediaIndex, Math.max(mediaUrls.length - 1, 0))
            : 0;
        const primaryMediaUrl = mediaUrls[safeMediaIndex] || video?.url;
        const normalizedMediaType = String(video?.mediaType || '').toLowerCase();
        const targetWidth = normalizeEvenDimension(Number.parseInt(req.query.targetWidth, 10) || 1080);
        const targetHeight = normalizeEvenDimension(Number.parseInt(req.query.targetHeight, 10) || 1920);
        const isImageMedia = normalizedMediaType === 'image'
            || (normalizedMediaType === 'carousel' && !String(primaryMediaUrl || '').toLowerCase().match(/\.(mp4|mov|m4v)(\?|$)/))
            || isLikelyImageUrl(primaryMediaUrl);

        if (!video || !primaryMediaUrl) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const sourceExtension = isImageMedia ? 'jpg' : 'mp4';
        const outputExtension = isImageMedia ? 'jpg' : 'mp4';
        const sourcePath = path.join(os.tmpdir(), `sotanita-source-${safeVideoId}-${Date.now()}.${sourceExtension}`);
        const outputPath = path.join(os.tmpdir(), `sotanita-watermarked-${safeVideoId}-${Date.now()}.${outputExtension}`);
        const dispositionName = `video_${safeVideoId}_watermarked.${outputExtension}`;

        if (!fs.existsSync(WATERMARK_PATH)) {
            const directName = `video_${safeVideoId}.${outputExtension}`;
            await streamRemoteFileToResponse(primaryMediaUrl, res, directName);
            return;
        }

        await downloadRemoteFileToPath(primaryMediaUrl, sourcePath);

        ffmpeg(sourcePath)
            .input(WATERMARK_PATH)
            .complexFilter([
                `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}[base]`,
                `[1:v][base]scale2ref=w=main_w*0.28:h=ih/6[wm][base2]`,
                `[base2][wm]overlay=(main_w-overlay_w)/2:main_h-overlay_h-55[outv]`,
            ])
            .outputOptions([
                '-map', '[outv]',
                ...(isImageMedia
                    ? ['-frames:v', '1', '-q:v', '2']
                    : ['-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.0', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']),
            ])
            .on('error', (error) => {
                console.error('❌ Error generando video con marca de agua:', error.message);
                if (fs.existsSync(outputPath)) {
                    fs.unlink(outputPath, () => {});
                }
                if (fs.existsSync(sourcePath)) {
                    fs.unlink(sourcePath, () => {});
                }
                if (!res.headersSent) {
                    return res.status(500).json({ message: isImageMedia ? 'No se pudo generar la imagen con marca de agua' : 'No se pudo generar el video con marca de agua' });
                }
            })
            .on('end', () => {
                res.setHeader('Content-Disposition', `attachment; filename="${dispositionName}"`);
                res.setHeader('Content-Type', isImageMedia ? 'image/jpeg' : 'video/mp4');
                res.sendFile(outputPath, (sendErr) => {
                    if (sendErr) {
                        console.error('❌ Error enviando video con marca de agua:', sendErr.message);
                    }
                    fs.unlink(outputPath, () => {});
                    fs.unlink(sourcePath, () => {});
                });
            })
            .save(outputPath);
    } catch (err) {
        console.error('❌ Error en descarga con marca de agua:', err.message);
        return res.status(500).json({ message: 'Error descargando el archivo con marca de agua' });
    }
});

// --- Preparar archivo en temp-shares para compartir desde móvil ---
app.post('/api/temp-shares/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const requestedMediaIndex = Number.parseInt(String(req.query.mediaIndex ?? req.query.carouselIndex ?? ''), 10);
        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        const mediaUrls = Array.isArray(video?.mediaUrls) && video.mediaUrls.length
            ? video.mediaUrls
            : video?.url
                ? [video.url]
                : [];
        const safeMediaIndex = Number.isFinite(requestedMediaIndex) && requestedMediaIndex >= 0
            ? Math.min(requestedMediaIndex, Math.max(mediaUrls.length - 1, 0))
            : 0;
        const primaryMediaUrl = mediaUrls[safeMediaIndex] || video?.url;

        if (!video || !primaryMediaUrl) {
            return res.status(404).json({ message: 'Video no encontrado' });
        }

        const normalizedMediaType = String(video?.mediaType || '').toLowerCase();
        const isImageMedia = normalizedMediaType === 'image'
            || (normalizedMediaType === 'carousel' && !String(primaryMediaUrl || '').toLowerCase().match(/\.(mp4|mov|m4v)(\?|$)/))
            || isLikelyImageUrl(primaryMediaUrl);
        const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const outputExtension = isImageMedia ? 'jpg' : 'mp4';
        const fileName = `share_${safeVideoId}.${outputExtension}`;
        const destPath = path.join(TEMP_SHARES_DIR, fileName);

        // Si ya existe, devolver la URL directamente
        if (fs.existsSync(destPath)) {
            const host = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
            const frontendUrl = process.env.FRONTEND_URL || 'https://sotanita.vercel.app';
            const shareUrl = Number.isFinite(requestedMediaIndex) && requestedMediaIndex >= 0
                ? `${frontendUrl}/share/${encodeURIComponent(videoId)}?carouselIndex=${safeMediaIndex}`
                : `${frontendUrl}/share/${encodeURIComponent(videoId)}`;
            return res.json({ fileUrl: `${host}/temp-shares/${encodeURIComponent(fileName)}`, shareUrl });
        }

        // Crear archivos temporales y generar marca de agua (reutiliza pipeline existente)
        const sourceExtension = isImageMedia ? 'jpg' : 'mp4';
        const sourcePath = path.join(os.tmpdir(), `sotanita-source-${safeVideoId}-${Date.now()}.${sourceExtension}`);
        const outputPath = path.join(os.tmpdir(), `sotanita-watermarked-${safeVideoId}-${Date.now()}.${outputExtension}`);

        const response = await fetch(primaryMediaUrl);
        if (!response.ok || !response.body) {
            return res.status(502).json({ message: 'No se pudo descargar el video original' });
        }

        const sourceBuffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(sourcePath, sourceBuffer);

        const targetWidth = Math.max(1, Number.parseInt(req.query.targetWidth, 10) || 1080);
        const targetHeight = Math.max(1, Number.parseInt(req.query.targetHeight, 10) || 1920);

        await new Promise((resolve, reject) => {
            ffmpeg(sourcePath)
                .input(WATERMARK_PATH)
                .complexFilter([
                    `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}[base]`,
                    `[1:v][base]scale2ref=w=main_w*0.28:h=ih/6[wm][base2]`,
                    `[base2][wm]overlay=(main_w-overlay_w)/2:main_h-overlay_h-55[outv]`,
                ])
                .outputOptions([
                    '-map', '[outv]',
                    ...(isImageMedia
                        ? ['-frames:v', '1', '-q:v', '2']
                        : ['-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.0', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']),
                ])
                .on('error', (error) => {
                    console.error('❌ Error generando archivo para temp-shares:', error.message);
                    if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
                    if (fs.existsSync(sourcePath)) fs.unlink(sourcePath, () => {});
                    reject(error);
                })
                .on('end', () => resolve())
                .save(outputPath);
        });

        // Mover a carpeta temp-shares
        try {
            fs.renameSync(outputPath, destPath);
        } catch (e) {
            // fallback copy
            fs.copyFileSync(outputPath, destPath);
            fs.unlinkSync(outputPath);
        }

        if (fs.existsSync(sourcePath)) fs.unlink(sourcePath, () => {});

        const host = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
                const frontendUrl = process.env.FRONTEND_URL || 'https://sotanita.vercel.app';
                const shareUrl = Number.isFinite(requestedMediaIndex) && requestedMediaIndex >= 0
                    ? `${frontendUrl}/share/${encodeURIComponent(videoId)}?carouselIndex=${safeMediaIndex}`
                    : `${frontendUrl}/share/${encodeURIComponent(videoId)}`;
                return res.json({ fileUrl: `${host}/temp-shares/${encodeURIComponent(fileName)}`, shareUrl });
    } catch (err) {
        console.error('❌ Error en POST /api/temp-shares/:videoId', err.message);
        return res.status(500).json({ message: 'Error preparando archivo para compartir' });
    }
});

// --- Share Link (Intermediario inteligente) ---
app.get('/share', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        const rawCarouselIndex = req.query.carouselIndex ?? req.query.mediaIndex;
        const parsedCarouselIndex = Number.parseInt(String(rawCarouselIndex ?? ''), 10);
        const hasCarouselIndex = Number.isFinite(parsedCarouselIndex) && parsedCarouselIndex >= 0;
        if (!videoId) {
            return res.status(400).json({ message: 'videoId es obligatorio' });
        }

        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        if (!video) {
            return res.status(404).send('Video no encontrado');
        }
                const frontendUrl = process.env.FRONTEND_URL || 'https://sotanita.vercel.app';
                const redirectUrl = hasCarouselIndex
                    ? `${frontendUrl}/share/${encodeURIComponent(videoId)}?carouselIndex=${parsedCarouselIndex}`
                    : `${frontendUrl}/share/${encodeURIComponent(videoId)}`;
                return res.redirect(302, redirectUrl);
    } catch (err) {
        console.error('❌ Error en GET /share', err.message);
        return res.status(500).send('Error compartiendo video');
    }
});

// --- Video Preview (Open Graph) ---
app.get('/video-preview', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        if (!videoId) {
            return res.status(400).json({ message: 'videoId es obligatorio' });
        }

        const video = await db.collection('videos').findOne(buildIdFilter(videoId));
        if (!video) {
            return res.status(404).send('Video no encontrado');
        }

        // Construir URL base del frontend (desde origin, referer o env var)
        let originUrl = process.env.FRONTEND_URL || 'https://sotanita.vercel.app';
        
        const origin = req.get('origin');
        const referer = req.get('referer');
        
        if (origin) {
            originUrl = origin;
        } else if (referer) {
            try {
                const refererUrl = new URL(referer);
                originUrl = `${refererUrl.protocol}//${refererUrl.host}`;
            } catch (e) {
                // Si hay error parsing, usa el default
            }
        }

        const imageUrl = `${originUrl}/assets/links.png`;
        const frontendUrl = process.env.FRONTEND_URL || 'https://sotanita.vercel.app';
        const videoUrl = `${frontendUrl}/feed?videoId=${encodeURIComponent(videoId)}`;
        const videoTitle = (video.title || 'Video en Sotanitapp').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta property="og:title" content="${videoTitle}">
  <meta property="og:description" content="Mira este video en la Sotanitapp">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="${videoUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${videoTitle}">
  <meta name="twitter:description" content="Mira este video en la Sotanitapp">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0;url=${videoUrl}">
  <title>${videoTitle}</title>
</head>
<body>
  <p>Redirigiendo a video...</p>
  <script>
    window.location.href = "${videoUrl}";
  </script>
</body>
</html>`;

        return res.set('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (err) {
        console.error('❌ Error en GET /video-preview', err.message);
        return res.status(500).send('Error obteniendo preview del video');
    }
});

async function startServer() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        db = client.db(DB_NAME);

        try {
            await db.collection('perfiles').createIndex(
                { username: 1 },
                {
                    unique: true,
                    collation: { locale: 'es', strength: 2 },
                    partialFilterExpression: { username: { $type: 'string' } },
                }
            );
        } catch (indexErr) {
            console.error('⚠️ No se pudo crear indice unico para username:', indexErr.message);
        }

        await processPendingWeeklyRankings();
        setInterval(() => {
            processPendingWeeklyRankings().catch((error) => {
                console.error('Error en el procesador de rankings semanales:', error.message);
            });
        }, 60 * 60 * 1000);

        console.log("🔥 Conectado a MongoDB Atlas");
        server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
    } catch (err) {
        console.error("❌ Error de conexión a MongoDB", err.message);
        process.exit(1);
    }
}

startServer();