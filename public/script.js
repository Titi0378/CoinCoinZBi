const socket = io();
let myRole = '';
const peers = {}; // Stocke les connexions WebRTC

// Configuration STUN (gratuit via Google) pour aider à passer les pare-feux
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function joinAs(role) {
    myRole = role;
    document.getElementById('landing-screen').classList.add('hidden');
    
    if (role === 'host') {
        document.getElementById('host-screen').classList.remove('hidden');
        socket.emit('join-role', 'host');
    } else if (role === 'camera') {
        document.getElementById('camera-screen').classList.remove('hidden');
        socket.emit('join-role', 'camera');
        startCamera();
    }
}

// ================= LOGIQUE CAMERA =================
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
        document.getElementById('local-video').srcObject = stream;

        // Quand le host demande une connexion
        socket.on('webrtc-signal', async (data) => {
            if (!peers[data.sender]) {
                const pc = new RTCPeerConnection(rtcConfig);
                peers[data.sender] = pc;
                
                stream.getTracks().forEach(track => pc.addTrack(track, stream));

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('webrtc-signal', { target: data.sender, signal: { type: 'candidate', candidate: event.candidate } });
                    }
                };
            }

            const pc = peers[data.sender];
            if (data.signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc-signal', { target: data.sender, signal: pc.localDescription });
            } else if (data.signal.type === 'candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
            }
        });

    } catch (err) {
        alert("Erreur d'accès à la caméra. Vérifiez que vous êtes en HTTPS !");
        console.error(err);
    }
}

// ================= LOGIQUE HOST =================
socket.on('new-camera', async (cameraId) => {
    if (myRole !== 'host') return;

    const pc = new RTCPeerConnection(rtcConfig);
    peers[cameraId] = pc;

    // Quand on reçoit le flux vidéo de la caméra
    pc.ontrack = (event) => {
        let video = document.getElementById(`vid-${cameraId}`);
        if (!video) {
            video = document.createElement('video');
            video.id = `vid-${cameraId}`;
            video.autoplay = true;
            video.playsInline = true;
            video.className = "w-full h-full object-cover rounded-xl border-2 border-gray-800 shadow-lg cursor-pointer transition-all hover:border-orange-500";
            
            // Logique d'agrandissement au clic
            video.onclick = () => {
                video.classList.toggle('video-fullscreen');
            };

            document.getElementById('video-grid').appendChild(video);
            updateGrid();
        }
        video.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-signal', { target: cameraId, signal: { type: 'candidate', candidate: event.candidate } });
        }
    };

    // Le host initie l'offre
    const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    socket.emit('webrtc-signal', { target: cameraId, signal: pc.localDescription });
});

// Réception des réponses de la caméra
socket.on('webrtc-signal', async (data) => {
    if (myRole !== 'host' || !peers[data.sender]) return;
    const pc = peers[data.sender];

    if (data.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    }
});

// Nettoyage quand une caméra se déconnecte
socket.on('camera-disconnected', (cameraId) => {
    const video = document.getElementById(`vid-${cameraId}`);
    if (video) {
        video.remove();
        updateGrid();
    }
    if (peers[cameraId]) {
        peers[cameraId].close();
        delete peers[cameraId];
    }
});

// Ajuste la grille en fonction du nombre de vidéos
function updateGrid() {
    const grid = document.getElementById('video-grid');
    const count = grid.children.length;
    grid.className = "w-full h-full grid gap-4 auto-rows-fr place-items-center";
    if (count === 1) grid.classList.add("grid-cols-1");
    else if (count <= 4) grid.classList.add("grid-cols-2");
    else grid.classList.add("grid-cols-3");
}