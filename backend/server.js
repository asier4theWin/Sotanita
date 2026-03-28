const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
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

async function startServer() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("🔥 Conectado a MongoDB Atlas");
        app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
    } catch (err) {
        console.error("❌ Error de conexión a MongoDB", err.message);
        process.exit(1);
    }
}

startServer();