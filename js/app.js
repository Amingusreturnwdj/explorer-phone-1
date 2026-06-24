import { loadGoogleMaps, toggleTrackingLocation, renderCustomPlaces } from './map.js';
import { initAuth, login, logout, listenToPlaces, addPlace, updatePlace, deletePlace, currentUser } from './firebase.js';
import { askAI, updateAIContextCustomPlaces } from './ai.js';

// DOM Elements
const btnLogin = document.getElementById('btn-login');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const btnLogout = document.getElementById('btn-logout');
const btnLocation = document.getElementById('btn-location');
const btnAddPlace = document.getElementById('btn-add-place');

// Sidebar Elements
const aiSidebar = document.getElementById('ai-sidebar');
const btnToggleAi = document.getElementById('btn-toggle-ai');
const btnCloseAi = document.getElementById('btn-close-ai');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const btnSendMsg = document.getElementById('btn-send-msg');

// Modal Elements
const modalPlace = document.getElementById('modal-place');
const btnCloseModal = document.getElementById('btn-close-modal');
const formPlace = document.getElementById('form-place');
const modalPlaceTitle = document.getElementById('modal-place-title');
const btnDeletePlace = document.getElementById('btn-delete-place');

// State
let customPlacesData = [];

// Initialize Application
function init() {
    loadGoogleMaps();

    // Setup Auth Listener
    initAuth((user) => {
        if (user) {
            btnLogin.classList.add('hidden');
            userProfile.classList.remove('hidden');
            userAvatar.src = user.photoURL || 'https://via.placeholder.com/32';
            btnAddPlace.classList.remove('hidden');
        } else {
            btnLogin.classList.remove('hidden');
            userProfile.classList.add('hidden');
            btnAddPlace.classList.add('hidden');
        }
        
        // Re-render markers to update permissions
        if (customPlacesData.length > 0) {
            renderCustomPlaces(customPlacesData, user ? user.uid : null);
        }
    });

    // Listen to Firebase Places
    listenToPlaces((places) => {
        customPlacesData = places;
        const uid = currentUser ? currentUser.uid : null;
        renderCustomPlaces(places, uid);
        updateAIContextCustomPlaces(places);
    });

    setupEventListeners();
}

function setupEventListeners() {
    // Auth
    btnLogin.addEventListener('click', async () => {
        try {
            await login();
        } catch (e) {}
    });

    btnLogout.addEventListener('click', async () => {
        await logout();
    });

    // Location Tracking
    btnLocation.addEventListener('click', () => {
        const isTracking = btnLocation.classList.contains('tracking');
        
        if (!isTracking) {
            btnLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            toggleTrackingLocation(
                (trackingStatus) => { 
                    if (trackingStatus) {
                        btnLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs fa-beat"></i>';
                        btnLocation.classList.add('tracking');
                        btnLocation.style.color = 'var(--primary)';
                    } else {
                        btnLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
                        btnLocation.classList.remove('tracking');
                        btnLocation.style.color = '';
                    }
                },
                (err) => { 
                    btnLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
                    btnLocation.classList.remove('tracking');
                    btnLocation.style.color = '';
                    alert("ข้อผิดพลาด GPS: " + err);
                }
            );
        } else {
            // Stop tracking
            toggleTrackingLocation();
            btnLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
            btnLocation.classList.remove('tracking');
            btnLocation.style.color = '';
        }
    });

    // Add Place (Manual click, usually we want click on map instead)
    btnAddPlace.addEventListener('click', () => {
        alert("กรุณาคลิกบนแผนที่ในตำแหน่งที่ต้องการเพิ่มสถานที่");
    });

    // Map Click Event
    window.addEventListener('mapClick', (e) => {
        if (!currentUser) return; // Only logged in users can add
        
        const { lat, lng } = e.detail;
        openPlaceModal(null, lat, lng);
    });

    // Place Modal
    btnCloseModal.addEventListener('click', () => {
        modalPlace.classList.add('hidden');
    });

    formPlace.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const placeId = document.getElementById('place-id').value;
        const placeData = {
            name: document.getElementById('place-name').value,
            description: document.getElementById('place-desc').value,
            lat: document.getElementById('place-lat').value,
            lng: document.getElementById('place-lng').value,
        };

        try {
            const submitBtn = formPlace.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;
            submitBtn.innerText = 'กำลังบันทึก...';
            submitBtn.disabled = true;

            if (placeId) {
                await updatePlace(placeId, placeData);
            } else {
                await addPlace(placeData);
            }

            modalPlace.classList.add('hidden');
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
        } catch (err) {
            alert("เกิดข้อผิดพลาด: " + err.message);
        }
    });

    btnDeletePlace.addEventListener('click', async () => {
        const placeId = document.getElementById('place-id').value;
        if (placeId && confirm("คุณแน่ใจหรือไม่ที่จะลบสถานที่นี้?")) {
            try {
                await deletePlace(placeId);
                modalPlace.classList.add('hidden');
            } catch (err) {
                alert("ลบไม่สำเร็จ: " + err.message);
            }
        }
    });

    // AI Sidebar
    btnToggleAi.addEventListener('click', () => {
        aiSidebar.classList.toggle('closed');
    });

    btnCloseAi.addEventListener('click', () => {
        aiSidebar.classList.add('closed');
    });

    btnSendMsg.addEventListener('click', handleChatSubmit);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSubmit();
    });
}

function openPlaceModal(place = null, lat = null, lng = null) {
    formPlace.reset();
    document.getElementById('place-id').value = '';
    
    if (place) {
        modalPlaceTitle.innerText = "แก้ไขสถานที่";
        document.getElementById('place-id').value = place.id;
        document.getElementById('place-name').value = place.name;
        document.getElementById('place-desc').value = place.description || '';
        document.getElementById('place-lat').value = place.lat;
        document.getElementById('place-lng').value = place.lng;
        btnDeletePlace.classList.remove('hidden');
    } else {
        modalPlaceTitle.innerText = "เพิ่มร้านค้า / สถานที่";
        document.getElementById('place-lat').value = lat;
        document.getElementById('place-lng').value = lng;
        btnDeletePlace.classList.add('hidden');
    }
    
    modalPlace.classList.remove('hidden');
}

// AI Chat Logic
function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerHTML = `<div class="msg-bubble">${text.replace(/\\n/g, '<br>')}</div>`;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true;
    
    // Add loading indicator
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = `message ai`;
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = `<div class="msg-bubble"><i class="fa-solid fa-ellipsis fa-fade"></i></div>`;
    chatContainer.appendChild(loadingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    askAI(text, 
        (response) => {
            document.getElementById(loadingId).remove();
            appendMessage('ai', response);
            chatInput.disabled = false;
            chatInput.focus();
        },
        (error) => {
            document.getElementById(loadingId).remove();
            appendMessage('ai', `<span class="text-danger">ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ AI (${error})</span>`);
            chatInput.disabled = false;
        }
    );
}

// Global functions for inline HTML calls (from InfoWindows)
window.askAIAvoidingGlobal = function(placeName) {
    aiSidebar.classList.remove('closed');
    const msg = `ช่วยแนะนำข้อมูล รีวิว หรือสิ่งน่าสนใจเกี่ยวกับ "${placeName}" หน่อยครับ`;
    chatInput.value = msg;
    handleChatSubmit();
};

window.editCustomPlace = function(placeId) {
    const place = customPlacesData.find(p => p.id === placeId);
    if (place) {
        openPlaceModal(place);
    }
};

// Start
document.addEventListener('DOMContentLoaded', init);
