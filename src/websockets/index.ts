/**
 * @fileoverview
 * Socket.io event configuration for handling chat meetings, participants,
 * message broadcasting, and disconnection logic. Integrates with Firestore
 * and a MessageDAO for persistent chat storage.
 */

const { Server, Socket } = require("socket.io");
const MessageDAO = require("../dao/MessageDAO");
const { db } = require("../firebase");

/**
 * Stores the active participants of each meeting.
 * 
 * Structure:
 * {
 *   [meetingId]: [{ userId: string, userName: string, photoURL: string|null }]
 * }
 *
 * @type {Object.<string, Array<{userId: string, userName: string, photoURL: string|null}>>}
 */
const participants = {};

/**
 * Configures all WebSocket events for the server.
 *
 * @param {Server} io - The Socket.io server instance.
 * @returns {void}
 */
function setupSockets(io) {
    io.on("connection", (socket) => {
        const uid = socket.handshake.query.uid;
        console.log("Connected", socket.id, "uid:", uid);

        /**
         * Retrieves the display name and photo URL of the currently connected user from Firestore.
         *
         * @async
         * @function getUserData
         * @returns {Promise<{userName: string, photoURL: string|null}>} User data.
         */
        const getUserData = async () => {
            let userName = "User";
            let photoURL = null;
            try {
                const userDoc = await db.collection("users").doc(uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    if (data?.displayName) userName = data.displayName;
                    if (data?.photoURL) photoURL = data.photoURL;
                }
            } catch (error) {
                console.error("Error while retrieving user data:", error);
            }
            return { userName, photoURL };
        };

        /**
         * Triggered when a user joins a meeting room.
         *
         * @event join-meeting
         * @param {string|{meetingId: string, photoURL: string|null}} data - Meeting ID or object with meetingId and photoURL.
         */
        socket.on("join-meeting", async (data) => {
            // Support both old format (string) and new format (object)
            const meetingId = typeof data === 'string' ? data : data.meetingId;
            const clientPhotoURL = typeof data === 'object' ? data.photoURL : null;

            socket.join(meetingId);

            // Send chat history
            const history = await MessageDAO.getMessages(meetingId);
            socket.emit("chat-history", history);

            const userData = await getUserData();
            const userName = userData.userName;
            // Prefer client-provided photoURL, fallback to Firestore
            const photoURL = clientPhotoURL || userData.photoURL;

            if (!participants[meetingId]) {
                participants[meetingId] = [];
            }

            // CRÍTICO: Eliminar TODAS las instancias previas del usuario antes de agregar
            // Esto previene duplicados cuando hay múltiples conexiones
            participants[meetingId] = participants[meetingId].filter(p => p.userId !== uid);
            
            // Ahora agregar el usuario una sola vez
            participants[meetingId].push({ userId: uid, userName, photoURL });
            
            console.log(`✅ User ${userName} (${uid}) joined meeting ${meetingId}`);
            console.log(`📋 Total participants in ${meetingId}: ${participants[meetingId].length}`);

            // Notify all users in the room
            io.to(meetingId).emit("user-joined", {
                userId: uid,
                userName,
                photoURL
            });

            io.to(meetingId).emit("participants", participants[meetingId]);
        });

        /**
         * Triggered when a user sends a chat message.
         *
         * @event send-message
         * @param {{ meetingId: string, message: string }} data - Message payload.
         */
        socket.on("send-message", async (data) => {
            const { meetingId, message } = data;

            const userDoc = await db.collection("users").doc(uid).get();
            const userData = userDoc.exists ? userDoc.data() : { displayName: "User" };

            /**
             * Message format sent to clients.
             *
             * @typedef {Object} ChatPayload
             * @property {string} meetingId
             * @property {string} senderId
             * @property {string} userName
             * @property {string} message
             * @property {string} time - ISO timestamp
             */
            const payload = {
                meetingId,
                senderId: uid,
                userName: userData.displayName,
                message,
                time: new Date().toISOString(),
            };

            io.to(meetingId).emit("new-message", payload);
            await MessageDAO.createMessage(meetingId, payload);
        });

        /**
         * Triggered when a user disconnects from the server.
         *
         * @event disconnect
         */
        socket.on("disconnect", async () => {
            console.log("Disconnected", socket.id, "uid:", uid);
            const userData = await getUserData();
            const userName = userData.userName;

            // Remove user from all meetings they were in
            for (const meetingId of Object.keys(participants)) {
                const beforeCount = participants[meetingId].length;

                // Eliminar todas las instancias del usuario
                participants[meetingId] = participants[meetingId].filter(p => p.userId !== uid);

                const afterCount = participants[meetingId].length;

                if (beforeCount !== afterCount) {
                    console.log(`❌ User ${userName} (${uid}) left meeting ${meetingId}`);
                    console.log(`📋 Remaining participants: ${afterCount}`);

                    io.to(meetingId).emit("user-left", {
                        userId: uid,
                        userName
                    });

                    io.to(meetingId).emit("participants", participants[meetingId]);
                }
            }
        });
    });
}

module.exports = { setupSockets };
