// socketAuth.ts
const { auth } = require("../firebase");

/**
 * Middleware para autenticar sockets usando Firebase Auth
 * @param {import("socket.io").Socket} socket
 * @param {(err?: any) => void} next
 */
async function socketAutenticate(socket, next) {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("No token provided"));

        const decoded = await auth.verifyIdToken(token);
        socket.uid = decoded.uid;
        next();
    } catch (e) {
        next(new Error("Unauthorized"));
    }
}

module.exports = { socketAutenticate };
