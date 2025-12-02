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
 *   [meetingId]: [{ userId: string, userName: string, photoURL: string|null, isMuted: boolean, isVideoOff: boolean }]
 * }
 *
 * @type {Object.<string, Array<{userId: string, userName: string, photoURL: string|null, isMuted: boolean, isVideoOff: boolean}>>}
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
        
        // ✅ CRITICAL VALIDATION: Reject connections without a valid uid
        if (!uid || uid === 'undefined' || uid === 'null') {
            console.error("❌ Connection rejected: invalid uid", socket.id);
            socket.disconnect(true);
            return;
        }
        
        console.log("✅ Connected", socket.id, "uid:", uid);

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
                } else {
                    console.warn(`⚠️ User ${uid} doesn't exist in Firestore`);
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
         * @param {string|{meetingId: string, photoURL: string|null, isMuted: boolean, isVideoOff: boolean}} data - Meeting ID or object with meetingId, photoURL, and media states.
         */
        socket.on("join-meeting", async (data) => {
            // Support both old format (string) and new format (object)
            const meetingId = typeof data === 'string' ? data : data.meetingId;
            const clientPhotoURL = typeof data === 'object' ? data.photoURL : null;
            const isMuted = typeof data === 'object' && data.isMuted !== undefined ? data.isMuted : true;
            const isVideoOff = typeof data === 'object' && data.isVideoOff !== undefined ? data.isVideoOff : true;

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

            participants[meetingId] = participants[meetingId].filter(p => p.userId !== uid);
            
            if (uid) {
                participants[meetingId].push({ 
                    userId: uid, 
                    userName, 
                    photoURL,
                    isMuted,
                    isVideoOff
                });
                console.log(`✅ User ${userName} (${uid}) joined meeting ${meetingId} [Muted: ${isMuted}, VideoOff: ${isVideoOff}]`);
                console.log(`📋 Total participants in ${meetingId}: ${participants[meetingId].length}`);
            } else {
                console.error("❌ Attempt to add participant without uid");
            }

            // Notify only OTHER users in the room (not the user who just joined)
            socket.broadcast.to(meetingId).emit("user-joined", {
                userId: uid,
                userName,
                photoURL
            });

            // Send participants list to ALL users
            io.to(meetingId).emit("participants", participants[meetingId]);
        });

        /**
         * Triggered when a user updates their media state (microphone/camera).
         *
         * @event update-media-state
         * @param {{ meetingId: string, isMuted: boolean, isVideoOff: boolean }} data - Media state payload.
         */
        socket.on("update-media-state", ({ meetingId, isMuted, isVideoOff }) => {
            if (!participants[meetingId]) return;
            
            const participant = participants[meetingId].find(p => p.userId === uid);
            if (participant) {
                participant.isMuted = isMuted;
                participant.isVideoOff = isVideoOff;
                
                console.log(`🎤 ${participant.userName} (${uid}) updated media: muted=${isMuted}, videoOff=${isVideoOff}`);
                
                // Notify all users in the room about the media state change
                io.to(meetingId).emit("media-state-updated", {
                    userId: uid,
                    isMuted,
                    isVideoOff
                });
                
                // ⚠️ REMOVED: Don't send participants list here to avoid race conditions
                // The media-state-updated event is sufficient and more specific
                // io.to(meetingId).emit("participants", participants[meetingId]);
            }
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
            console.log("🔌 Disconnected", socket.id, "uid:", uid);
            const userData = await getUserData();
            const userName = userData.userName;

            // Remove user from all meetings they were in
            for (const meetingId of Object.keys(participants)) {
                const beforeCount = participants[meetingId].length;

                // Delete all instances of the user
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
