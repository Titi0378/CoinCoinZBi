const socket = io();

const landing = document.getElementById('landing');
const hostView = document.getElementById('host-view');
const cameraView = document.getElementById('camera-view');
const btnHost = document.getElementById('btn-host');
const btnCamera = document.getElementById('btn-camera');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');

let localStream;
const peerConnections = {}; // Map pour stocker les RTCPeerConnection (côté Host) ou la connexion unique (côté Caméra)

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// --- LOGIQUE CHOIX DU RÔLE ---

btnHost.addEventListener('click', () => {
    landing.classList.add('hidden');
    hostView.classList.remove('hidden');
    socket.emit('join', 'host');
    setupHost();
});

btnCamera.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        landing.classList.add('hidden');
        cameraView.classList.remove('hidden');
        socket.emit('join', 'camera');
    } catch (err) {
        alert('Erreur accès caméra: ' + err.message);
    }
});

// --- LOGIQUE HOST ---

function setupHost() {
    socket.on('camera_joined', async (cameraId) => {
        console.log('Nouvelle caméra connectée:', cameraId);
        createVideoContainer(cameraId);
        await initiateCall(cameraId);
    });

    socket.on('camera_left', (cameraId) => {
        console.log('Caméra déconnectée:', cameraId);
        if (peerConnections[cameraId]) {
            peerConnections[cameraId].close();
            delete peerConnections[cameraId];
        }
        const videoElement = document.getElementById(`container-${cameraId}`);
        if (videoElement) {
            videoElement.remove();
        }
        updateGridLayout();
    });

    // Le host reçoit une réponse (answer) d'une caméra
    socket.on('answer', async (data) => {
        const pc = peerConnections[data.answerer];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
    });

    socket.on('ice-candidate', async (data) => {
        const pc = peerConnections[data.sender];
        if (pc && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
}

function createVideoContainer(id) {
    if (document.getElementById(`container-${id}`)) return;

    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `container-${id}`;

    const video = document.createElement('video');
    video.id = `video-${id}`;
    video.autoplay = true;
    video.playsInline = true;

    // Toggle fullscreen local lors du clic
    container.addEventListener('click', () => {
        const isFullscreen = container.classList.contains('fullscreen');
        // Retirer fullscreen de tous
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('fullscreen'));
        if (!isFullscreen) {
            container.classList.add('fullscreen');
        }
    });

    container.appendChild(video);
    videoGrid.appendChild(container);
    updateGridLayout();
}

function updateGridLayout() {
    const containers = document.querySelectorAll('.video-container');
    const count = containers.length;
    // Ajustement très basique, le CSS grid (auto-fit) s'occupe de la base, on peut affiner ici si besoin.
}

async function initiateCall(cameraId) {
    const pc = new RTCPeerConnection(configuration);
    peerConnections[cameraId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: cameraId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        const videoElement = document.getElementById(`video-${cameraId}`);
        if (videoElement && !videoElement.srcObject) {
            videoElement.srcObject = event.streams[0];
        }
    };

    const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    socket.emit('offer', {
        target: cameraId,
        sdp: pc.localDescription
    });
}

// --- LOGIQUE CAMÉRA ---

let cameraPc = null;

socket.on('offer', async (data) => {
    // Si la caméra reçoit une offre du Host
    cameraPc = new RTCPeerConnection(configuration);
    
    // Ajouter les flux locaux
    localStream.getTracks().forEach(track => cameraPc.addTrack(track, localStream));

    cameraPc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: data.caller,
                candidate: event.candidate
            });
        }
    };

    await cameraPc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await cameraPc.createAnswer();
    await cameraPc.setLocalDescription(answer);

    socket.emit('answer', {
        target: data.caller,
        sdp: cameraPc.localDescription
    });
});

socket.on('ice-candidate', async (data) => {
    if (cameraPc && data.candidate) {
        await cameraPc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});