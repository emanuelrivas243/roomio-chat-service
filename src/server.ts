const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { setupSockets } = require("./websockets/index");
const socketAuth = require("./middleware/socketAuth");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


// Middleware de autenticación de sockets
io.use(socketAuth.socketAutenticate);

// Configurar eventos de sockets
setupSockets(io);

server.listen(process.env.PORT, () => console.log(`Servidor corriendo en puerto ${process.env.PORT}`));
