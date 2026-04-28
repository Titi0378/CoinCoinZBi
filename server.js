const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Stocker les caméras connectées
const cameras = new Set();
let hostId = null;

io.on('connection', (socket) => {
    console.log(`Nouvelle connexion: ${socket.id}`);

    // Gestion des rôles
    socket.on('join', (role) => {
        if (role === 'host') {
            hostId = socket.id;
            socket.join('host');
            console.log(`Host connecté: ${socket.id}`);
            // Informer le host des caméras déjà présentes
            cameras.forEach(camId => {
                socket.emit('camera_joined', camId);
            });
        } else if (role === 'camera') {
            cameras.add(socket.id);
            socket.join('cameras');
            console.log(`Caméra connectée: ${socket.id}`);
            if (hostId) {
                io.to(hostId).emit('camera_joined', socket.id);
            }
        }
    });

    // Signalisation WebRTC
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            sdp: data.sdp,
            caller: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            sdp: data.sdp,
            answerer: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('disconnect', () => {
        console.log(`Déconnexion: ${socket.id}`);
        if (socket.id === hostId) {
            hostId = null;
        } else if (cameras.has(socket.id)) {
            cameras.delete(socket.id);
            if (hostId) {
                io.to(hostId).emit('camera_left', socket.id);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});