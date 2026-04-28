const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sert les fichiers statiques du dossier "public"
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Un utilisateur est connecté:', socket.id);

    // Un utilisateur rejoint en tant que Host ou Caméra
    socket.on('join-role', (role) => {
        socket.join(role);
        console.log(`Socket ${socket.id} a rejoint le rôle: ${role}`);
        if (role === 'camera') {
            // Notifie le host qu'une nouvelle caméra est là
            socket.to('host').emit('new-camera', socket.id);
        }
    });

    // Relais des signaux WebRTC (Offres, Réponses, ICE Candidates)
    socket.on('webrtc-signal', (data) => {
        io.to(data.target).emit('webrtc-signal', {
            sender: socket.id,
            signal: data.signal
        });
    });

    socket.on('disconnect', () => {
        console.log('Utilisateur déconnecté:', socket.id);
        socket.to('host').emit('camera-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur Coincoin lancé sur le port ${PORT}`);
});