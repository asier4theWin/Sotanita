const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Cloudinary Config ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// --- Upload Route ---
app.post('/api/videos', upload.single('file'), async (req, res) => {
    try {
        const { title, category, description, id_usuario } = req.body;
        const file = req.file;

        if (!file || !title || !category || !id_usuario) {
            if (file) fs.unlinkSync(file.path);
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        // Subir a Cloudinary
        const result = await cloudinary.uploader.upload(file.path, {
            resource_type: 'auto',
            folder: 'videos_app'
        });

        // Eliminar archivo temporal
        fs.unlinkSync(file.path);

        const secure_url = result.secure_url;

        // Guardar en MongoDB
        const videoDoc = {
            url: secure_url,
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
            url: secure_url,
            title,
            category,
            description,
            id_usuario,
            likes: 0,
            likedBy: [],
            createdAt: videoDoc.createdAt.toISOString()
        });

    } catch (error) {
        console.error('Error al subir video:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

// --- Get Videos Route ---
app.get('/api/videos', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const videos = await db.collection('videos')
            .find({})
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        res.json(videos.map(v => ({
            ...v,
            id: v._id.toString(),
            _id: undefined
        })));
    } catch (error) {
        console.error('Error al obtener videos:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
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
            const actorProfile = await db.collection('perfiles').findOne({ email: userIdRaw });
            const actorUsername = String(actorProfile?.username || userIdRaw.split('@')[0] || 'Usuario').trim();
            const videoTitle = String(video.title || 'video').trim();

            await db.collection('notificaciones').insertOne({
                videoId: video._id.toString(),
                videoTitle,
                actorUserId: userIdRaw,
                actorUsername,
                recipientUserId,
                message: `${actorUsername} le ha dado me gusta a tu video: ${videoTitle}`,
                type: 'like',
                read: false,
                createdAt: new Date(),
            });
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

        return res.json(
            notifications.map((n) => ({
                ...n,
                id: n._id.toString(),
                _id: undefined,
            }))
        );
    } catch (error) {
        console.error('Error al obtener notificaciones:', error);
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
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
    position: z.string().min(1),
    teamId: z.string().min(1).optional(),
    teamName: z.string().min(1).optional(),
    frameId: z.string().min(1).default('bronce'),
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

async function resolveCardData(teamId, frameId) {
    const [teamDoc, frameDoc] = await Promise.all([
        teamId ? db.collection('fondo').findOne(buildIdFilter(teamId)) : Promise.resolve(null),
        frameId ? db.collection('marco').findOne(buildIdFilter(frameId)) : Promise.resolve(null),
    ]);

    return {
        teamDoc,
        frameDoc,
        teamName: teamDoc ? (teamDoc.name ?? teamDoc.Name ?? null) : null,
        teamImageUrl: teamDoc ? normalizeImageUrl(teamDoc.imageUrl) : null,
        frameImageId: frameDoc ? normalizeImageUrl(frameDoc.imageId) : null,
        resolvedTeamId: teamDoc ? extractDocId(teamDoc) : teamId,
        resolvedFrameId: frameDoc ? extractDocId(frameDoc) : frameId,
    };
}

async function handleGetNombresEquipos(req, res) {
    try {
        const rows = await db
            .collection('fondo')
            .find({}, { projection: { _id: 0, name: 1, Name: 1 } })
            .toArray();

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

async function handleGetTeamIdByName(req, res) {
    const name = String(req.query.name || '').trim();

    if (!name) {
        return res.status(400).json({ message: 'El query param name es obligatorio' });
    }

    try {
        const teamDoc = await db.collection('fondo').findOne({
            $or: [{ name: buildNameRegex(name) }, { Name: buildNameRegex(name) }],
        });

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

app.get('/api/equipos/id', handleGetTeamIdByName);
app.get('/api/equipo/idPorNombre', handleGetTeamIdByName);

async function handleCreateUser(req, res) {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Datos de registro invalidos', issues: parsed.error.issues });
    }

    try {
        const { username, email, password, position, frameId, teamId: inputTeamId, teamName } = parsed.data;
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
            const teamById = await db.collection('fondo').findOne(buildIdFilter(teamId));
            if (!teamById) {
                return res.status(404).json({ message: 'teamId no existe en fondo' });
            }
            teamId = extractDocId(teamById);
            resolvedTeamName = teamById.name ?? teamById.Name;
        }

        if (!teamId && teamName) {
            const teamDoc = await db.collection('fondo').findOne({
                $or: [{ name: buildNameRegex(teamName) }, { Name: buildNameRegex(teamName) }],
            });
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

        const userDoc = {
            username: normalizedUsername,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            position: position.trim(),
            teamId,
            frameId: resolvedFrameId,
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
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName ?? resolvedTeamName,
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
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
    const { username, teamId, teamName, position } = req.body;

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
            const teamDoc = await db.collection('fondo').findOne({
                $or: [{ name: buildNameRegex(teamName) }, { Name: buildNameRegex(teamName) }],
            });

            if (!teamDoc) {
                return res.status(404).json({ message: 'Equipo no encontrado' });
            }

            updateData.teamId = extractDocId(teamDoc);
        } else if (teamId) {
            const teamDoc = await db.collection('fondo').findOne(buildIdFilter(teamId));
            if (!teamDoc) {
                return res.status(404).json({ message: 'Equipo no encontrado' });
            }
            updateData.teamId = extractDocId(teamDoc);
        }

        if (position) {
            updateData.position = position.trim();
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
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName,
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
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
        return res.status(400).json({ message: 'Email y contraseña son obligatorios' });
    }

    try {
        const user = await db.collection('perfiles').findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        const cardData = await resolveCardData(user.teamId, user.frameId);

        return res.json({
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            position: user.position,
            teamId: cardData.resolvedTeamId,
            teamName: cardData.teamName ?? 'Sin equipo',
            teamImageUrl: cardData.teamImageUrl,
            frameId: cardData.resolvedFrameId,
            frameImageId: cardData.frameImageId,
            frameImageUrl: cardData.frameImageId,
        });
    } catch (err) {
        console.error('❌ Error en POST /api/login', err.message);
        return res.status(500).json({ message: 'Error en el servidor' });
    }
}

app.post('/api/login', handleLogin);

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

        console.log("🔥 Conectado a MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
    } catch (err) {
        console.error("❌ Error de conexión a MongoDB", err.message);
        process.exit(1);
    }
}

startServer();