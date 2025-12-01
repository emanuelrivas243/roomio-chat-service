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
 *   [meetingId]: [{ userId: string, userName: string }]
 * }
 *
 * @type {Object.<string, Array<{userId: string, userName: string}>>}
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
         * Retrieves the display name of the currently connected user from Firestore.
         *
         * @async
         * @function getUserName
         * @returns {Promise<string>} Display name of the user.
         */
        const getUserName = async () => {
            let userName = "User";
            try {
                const userDoc = await db.collection("users").doc(uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    if (data?.displayName) userName = data.displayName;
                }
            } catch (error) {
                console.error("Error while retrieving user name:", error);
            }
            return userName;
        };

        /**
         * Triggered when a user joins a meeting room.
         *
         * @event join-meeting
         * @param {string} meetingId - ID of the meeting room the user joins.
         */
        socket.on("join-meeting", async (meetingId) => {
            socket.join(meetingId);

            // Send chat history
            const history = await MessageDAO.getMessages(meetingId);
            socket.emit("chat-history", history);

            const userName = await getUserName();

            if (!participants[meetingId]) {
                participants[meetingId] = [];
            }

            // Add participant if not already inside
            if (!participants[meetingId].some(u => u.userId === uid)) {
                participants[meetingId].push({ userId: uid, userName });
            }

            // Notify all users in the room
            io.to(meetingId).emit("user-joined", {
                userId: uid,
                userName
            });

            io.to(meetingId).emit("participants", participants[meetingId]);

            console.log(`User ${uid} joined meeting ${meetingId}`);
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
            console.log("Disconnected", socket.id);
            const userName = await getUserName();

            // Remove user from all meetings they were in
            for (const meetingId of Object.keys(participants)) {
                const beforeList = participants[meetingId];
                const beforeCount = beforeList.length;

                participants[meetingId] = beforeList.filter(p => p.userId !== uid);

                const afterCount = participants[meetingId].length;

                if (beforeCount !== afterCount) {
                    io.to(meetingId).emit("user-left", {
                        userId: uid,
                        userName
                    });

                    io.to(meetingId).emit("participants", participants[meetingId]);

                    console.log(`User ${userName} (${uid}) left meeting ${meetingId}`);
                }
            }
        });
    });
}

module.exports = { setupSockets };
