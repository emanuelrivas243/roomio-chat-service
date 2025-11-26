// socketAuth.js
const { auth } = require("../firebase");

/**
 * Firebase Auth–based middleware for authenticating incoming Socket.io connections.
 * Validates the ID token sent during the WebSocket handshake and attaches the user's UID
 * to the socket instance.
 *
 * @async
 * @function socketAutenticate
 * @param {import("socket.io").Socket} socket - The socket instance for the incoming connection.
 * @param {(err?: Error) => void} next - Callback to proceed to the next middleware or throw an authentication error.
 * @returns {Promise<void>}
 *
 * @throws {Error} If no token is provided or verification fails.
 */
async function socketAutenticate(socket, next) {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("No token provided"));
        }

        const decoded = await auth.verifyIdToken(token);
        socket.uid = decoded.uid; // Attach UID for later access in socket events

        next();
    } catch (e) {
        next(new Error("Unauthorized"));
    }
}

module.exports = { socketAutenticate };
