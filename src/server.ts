/**
 * Initializes and configures the HTTP server, Express app, and Socket.io server
 * for a real-time chat backend. Applies authentication middleware for sockets
 * and sets up event listeners for WebSocket communication.
 * 
 * @module ChatServer
 */

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { setupSockets } = require("./websockets/index");
const socketAuth = require("./middleware/socketAuth");

const app = express();
const server = http.createServer(app);

/**
 * Root route for basic server status check.
 *
 * @name GET/
 * @function
 * @param {express.Request} req - Client request object.
 * @param {express.Response} res - Server response object.
 * @returns {void}
 */
app.get("/", (req, res) => {
  res.send("Chat backend running");
});

/**
 * Socket.io server instance for handling real-time WebSocket connections.
 * Configured with CORS to allow any origin.
 *
 * @type {Server}
 */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/**
 * Applies the socket authentication middleware to all incoming WebSocket connections.
 *
 * @see socketAuth.socketAutenticate
 */
io.use(socketAuth.socketAutenticate);

/**
 * Registers all socket event listeners defined in the websockets setup module.
 *
 * @function setupSockets
 * @param {Server} io - The Socket.io server instance.
 */
setupSockets(io);

/**
 * Starts the HTTP server and listens on the port specified in environment variables.
 *
 * @function
 * @returns {void}
 */
server.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
