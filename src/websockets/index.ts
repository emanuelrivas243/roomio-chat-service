const { Server, Socket } = require("socket.io");
const MessageDAO = require("../dao/MessageDAO");

/**
 * Configura los sockets para chat y reuniones.
 * @param {import("socket.io").Server} io
 */
function setupSockets(io) {
    /**
     * @param {import("socket.io").Socket & { uid?: string }} socket
     */
    io.on("connection", (socket) => {
        const uid = socket.uid;
        console.log("Connected", socket.id, "uid:", uid);

        /**
         * Evento para unirse a una reunión
         * @param {string} meetingId
         */
        socket.on("join-meeting", async (meetingId) => {
            socket.join(meetingId);
            const history = await MessageDAO.getMessages(meetingId);
            socket.emit("chat-history", history);
            socket.to(meetingId).emit("user-joined", { userId: uid });
        });

        /**
         * Evento para enviar un mensaje
         * @param {{ meetingId: string, message: string }} data
         */
        socket.on("send-message", async (data) => {
            const { meetingId, message } = data;
            const payload = {
                meetingId,
                senderId: uid,
                message,
                time: new Date().toISOString(),
            };
            io.to(meetingId).emit("new-message", payload);
            await MessageDAO.createMessage(meetingId, payload);
        });

        socket.on("disconnect", () => {
            console.log("Disconnected", socket.id);
        });
    });
}

module.exports = { setupSockets };
