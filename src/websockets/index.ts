const { Server, Socket } = require("socket.io");
const MessageDAO = require("../dao/MessageDAO");
const { db } = require("../firebase");

// Mapa con los participantes por reunión
// meetingId -> [{ userId, userName }]
const participants = {};

function setupSockets(io) {
    io.on("connection", (socket) => {
        const uid = socket.uid;
        console.log("Connected", socket.id, "uid:", uid);

        // Obtener nombre del usuario 
        const getUserName = async () => {
            let userName = "Usuario";
            try {
                const userDoc = await db.collection("users").doc(uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    if (data?.displayName) userName = data.displayName;
                }
            } catch (error) {
                console.error("Error al obtener nombre del usuario:", error);
            }
            return userName;
        };

        socket.on("join-meeting", async (meetingId) => {
            socket.join(meetingId);

            // Enviar historial al que entra
            const history = await MessageDAO.getMessages(meetingId);
            socket.emit("chat-history", history);

            const userName = await getUserName();

            // inicializar lista
            if (!participants[meetingId]) {
                participants[meetingId] = [];
            }

            // agregar si no está
            if (!participants[meetingId].some(u => u.userId === uid)) {
                participants[meetingId].push({ userId: uid, userName });
            }

            // Notificar a todos (incluye al que entra)
            io.to(meetingId).emit("user-joined", {
                userId: uid,
                userName
            });

            // Enviar lista actualizada de participantes
            io.to(meetingId).emit("participants", participants[meetingId]);

            console.log(`User ${uid} joined meeting ${meetingId}`);
        });

        socket.on("send-message", async (data) => {
            const { meetingId, message } = data;

            const userDoc = await db.collection("users").doc(socket.uid).get();
            const userData = userDoc.exists ? userDoc.data() : { displayName: "Usuario" };

            const payload = {
                meetingId,
                senderId: socket.uid,
                userName: userData.displayName,
                message,
                time: new Date().toISOString(),
            };

            io.to(meetingId).emit("new-message", payload);
            await MessageDAO.createMessage(meetingId, payload);
        });

        // CUANDO UN USUARIO SE DESCONECTA
        socket.on("disconnect", () => {
            console.log("Disconnected", socket.id);

            // Buscar en qué reunión estaba
            for (const meetingId of Object.keys(participants)) {
                const before = participants[meetingId].length;

                // filtrar usuario fuera
                participants[meetingId] = participants[meetingId].filter(
                    p => p.userId !== uid
                );

                const after = participants[meetingId].length;

                // Si lo eliminamos, emitimos user-left y actualizamos la lista
                if (before !== after) {
                    io.to(meetingId).emit("user-left", { userId: uid });
                    io.to(meetingId).emit("participants", participants[meetingId]);
                    console.log(`User ${uid} left meeting ${meetingId}`);
                }
            }
        });
    });
}

module.exports = { setupSockets };
