const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

        const existing = await db.collection('perfiles').findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
        }

        let teamId = inputTeamId;
        let resolvedTeamName = teamName;

        if (teamId) {
            const teamById = await db.collection('fondo').findOne({ _id: teamId });
            if (!teamById) {
                return res.status(404).json({ message: 'teamId no existe en fondo' });
            }
            resolvedTeamName = teamById.name;
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

        const frameDoc = await db.collection('marco').findOne({ _id: frameId });
        if (!frameDoc) {
            return res.status(404).json({ message: 'frameId no existe en marco' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userDoc = {
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            position: position.trim(),
            teamId,
            frameId,
            createdAt: new Date(),
        };

        const result = await db.collection('perfiles').insertOne(userDoc);

        return res.status(201).json({
            id: result.insertedId.toString(),
            username: userDoc.username,
            email: userDoc.email,
            position: userDoc.position,
            teamId: userDoc.teamId,
            teamName: resolvedTeamName,
            frameId: userDoc.frameId,
        });
    } catch (err) {
        console.error('❌ Error en POST /api/usuarios', err.message);
        return res.status(500).json({ message: 'Error creando usuario' });
    }
}

app.post('/api/usuarios', handleCreateUser);
app.post('/api/crearNuevoUsuario', handleCreateUser);

async function startServer() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        db = client.db(DB_NAME);
        console.log("🔥 Conectado a MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
    } catch (err) {
        console.error("❌ Error de conexión a MongoDB", err.message);
        process.exit(1);
    }
}

startServer();