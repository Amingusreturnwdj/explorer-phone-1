import { loadGoogleMaps, toggleTrackingLocation, renderCustomPlaces, getKnownPlaceNames } from './map.js';
import { initAuth, login, logout, listenToPlaces, addPlace, updatePlace, deletePlace, currentUser } from './firebase.js';
import { askAI, updateAIContextCustomPlaces } from './ai.js';
import { applyTranslations, currentLang, setLanguage, t } from './i18n.js';

// DOM Elements
const btnLogin = document.getElementById('btn-login');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const btnLogout = document.getElementById('btn-logout');
const btnLocation = document.getElementById('btn-location');
const btnAddPlace = document.getElementById('btn-add-place');
const btnLang = document.getElementById('btn-lang');

// Sidebar Elements
const aiSidebar = document.getElementById('ai-sidebar');
const btnToggleAi = document.getElementById('btn-toggle-ai');
const btnCloseAi = document.getElementById('btn-close-ai');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const btnSendMsg = document.getElementById('btn-send-msg');
const btnMic = document.getElementById('btn-mic');

// Modal Elements
const modalPlace = document.getElementById('modal-place');
const btnCloseModal = document.getElementById('btn-close-modal');
const formPlace = document.getElementById('form-place');
const modalPlaceTitle = document.getElementById('modal-place-title');
const btnDeletePlace = document.getElementById('btn-delete-place');

// SOS & Plan Trip Elements
const btnSos = document.getElementById('btn-sos');
const modalSos = document.getElementById('modal-sos');
const btnCloseSos = document.getElementById('btn-close-sos');
const btnSosPolice = document.getElementById('btn-sos-police');
const btnSosHospital = document.getElementById('btn-sos-hospital');
const btnSosShare = document.getElementById('btn-sos-share');
const btnPlanTrip = document.getElementById('btn-plan-trip');

// State
let customPlacesData = [];

// Initialize Application
function init() {
    applyTranslations();
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
    // Lang Toggle
    btnLang.addEventListener('click', () => {
        const newLang = currentLang === 'th' ? 'en' : 'th';
        setLanguage(newLang);
    });

    // SOS Logic
    btnSos.addEventListener('click', () => {
        modalSos.classList.remove('hidden');
    });
    btnCloseSos.addEventListener('click', () => {
        modalSos.classList.add('hidden');
    });
    btnSosPolice.addEventListener('click', () => {
        if(window.findNearestEmergency) window.findNearestEmergency('police');
        modalSos.classList.add('hidden');
    });
    btnSosHospital.addEventListener('click', () => {
        if(window.findNearestEmergency) window.findNearestEmergency('hospital');
        modalSos.classList.add('hidden');
    });
    btnSosShare.addEventListener('click', () => {
        if(window.shareLocation) window.shareLocation();
    });

    // Plan Trip Logic
    btnPlanTrip.addEventListener('click', () => {
        if (customPlacesData.length === 0) {
            alert(t('alert_no_places') || "You haven't saved any places yet.");
            return;
        }
        
        aiSidebar.classList.remove('closed');
        const prompt = `Based on these saved locations:\n${customPlacesData.map(p => '- ' + p.name).join('\n')}\n\nPlease create an optimal 1-day itinerary minimizing travel time in Bangkok. Suggest the order and provide a brief reason.`;
        appendMessage(prompt, 'user');
        
        // Show loading
        const loadingId = 'loading-' + Date.now();
        appendMessage('<i class="fa-solid fa-spinner fa-spin"></i> ' + (t('ai_typing') || 'AI is planning...'), 'ai', loadingId);
        
        askAI(prompt, (aiResponse) => {
            const el = document.getElementById(loadingId);
            if (el) el.remove();
            appendMessage(formatAIResponse(aiResponse), 'ai');
        }, (err) => {
            const el = document.getElementById(loadingId);
            if (el) el.remove();
            appendMessage(`<span class="text-danger"><i class="fa-solid fa-circle-exclamation"></i> Error: ${err.message}</span>`, 'ai');
        });
    });

    // Auth
    btnLogin.addEventListener('click', async () => {
        try {
            await login();
        } catch (e) {}
    });

    btnLogout.addEventListener('click', async () => {
        await logout();
    });

    // Speech-to-Text Logic
    let recognition = null;
    let isRecording = false;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            isRecording = true;
            btnMic.classList.add('recording');
            chatInput.placeholder = currentLang === 'en' ? 'Listening...' : 'กำลังฟัง...';
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (finalTranscript || interimTranscript) {
                chatInput.value = finalTranscript || interimTranscript;
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isRecording = false;
            btnMic.classList.remove('recording');
            chatInput.placeholder = t('chat_placeholder');
        };

        recognition.onend = () => {
            isRecording = false;
            btnMic.classList.remove('recording');
            chatInput.placeholder = t('chat_placeholder');
        };

        btnMic.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.lang = currentLang === 'en' ? 'en-US' : 'th-TH';
                recognition.start();
            }
        });
    } else {
        if (btnMic) btnMic.style.display = 'none'; // Hide if not supported
    }

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
                    alert(t('alert_gps_error') + err);
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
        alert(t('alert_click_map'));
    });

    // Map Click Event (for saving places)
    window.addEventListener('mapClick', (e) => {
        if (!currentUser) {
            alert(t('alert_login_required') || "Please login to save places");
            return;
        }
        
        const { lat, lng } = e.detail;
        openPlaceModal(null, lat, lng);
    });

    // Manual Route Event (for clicking "Navigate Here" on a dropped pin)
    window.addEventListener('manualRoute', (e) => {
        const { lat, lng } = e.detail;
        
        // Ensure sidebar is open
        if (aiSidebar.classList.contains('hidden')) {
            aiSidebar.classList.remove('hidden');
            btnToggleAi.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        }

        const legend = `
            <div style="margin-top: 10px; font-size: 0.8rem; background: var(--bg-light); padding: 8px; border-radius: 8px; line-height: 1.6; color: var(--text-dark);">
                <strong><i class="fa-solid fa-map-location-dot"></i> เส้นทางไปยังพิกัดที่เลือก:</strong><br>
                <span style="color:#3b82f6; font-weight:bold;">■ สีน้ำเงิน</span>: รถเมล์ / รถตู้ <i class="fa-solid fa-arrow-right"></i> <span class="route-time-transit" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span><br>
                <span style="color:#f97316; font-weight:bold;">■ สีส้ม</span>: รถยนต์ / แท็กซี่ <i class="fa-solid fa-arrow-right"></i> <span class="route-time-driving" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span><br>
                <span style="color:#22c55e; font-weight:bold;">■ สีเขียว</span>: เดินเท้า <i class="fa-solid fa-arrow-right"></i> <span class="route-time-walking" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span>
            </div>
        `;
        const text = `นี่คือเส้นทางไปยังจุดที่คุณปักหมุดไว้ครับ!<br><button onclick="window.clearRoute(this)" style="background:#ef4444; color:white; border:none; border-radius:4px; font-size:0.8rem; padding: 6px 10px; margin-top:5px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-eye-slash"></i> ซ่อนเส้นทาง</button>${legend}`;
        appendMessage(text, 'ai');
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
            submitBtn.innerText = t('btn_saving');
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
            alert(t('alert_save_failed') + err.message);
        }
    });

    btnDeletePlace.addEventListener('click', async () => {
        const placeId = document.getElementById('place-id').value;
        if (placeId && confirm(t('alert_delete_confirm'))) {
            try {
                await deletePlace(placeId);
                modalPlace.classList.add('hidden');
            } catch (err) {
                alert(t('alert_delete_failed') + err.message);
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
        modalPlaceTitle.innerText = t('modal_edit_title');
        document.getElementById('place-id').value = place.id;
        document.getElementById('place-name').value = place.name;
        document.getElementById('place-desc').value = place.description || '';
        document.getElementById('place-lat').value = place.lat;
        document.getElementById('place-lng').value = place.lng;
        btnDeletePlace.classList.remove('hidden');
    } else {
        modalPlaceTitle.innerText = t('modal_add_title');
        document.getElementById('place-lat').value = lat;
        document.getElementById('place-lng').value = lng;
        btnDeletePlace.classList.add('hidden');
    }
    
    modalPlace.classList.remove('hidden');
}

// AI Chat Logic
function formatAIResponse(text) {
    let formattedText = text;
    
    // Check for [ROUTE: destination]
    const routeRegex = /\[ROUTE:\s*(.+?)\]/i;
    const match = formattedText.match(routeRegex);
    if (match && match[1]) {
        const destination = match[1].trim();
        if (window.drawRoute) {
            window.drawRoute(destination);
        }
        const legend = `
            <div style="margin-top: 10px; font-size: 0.8rem; background: #f3f4f6; padding: 8px; border-radius: 8px; line-height: 1.6; color: var(--text-dark);">
                <strong><i class="fa-solid fa-map-location-dot"></i> สีเส้นทางและเวลา (จากจุดปัจจุบัน):</strong><br>
                <span style="color:#3b82f6; font-weight:bold;">■ สีน้ำเงิน</span>: รถเมล์ / รถตู้ <i class="fa-solid fa-arrow-right"></i> <span class="route-time-transit" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span><br>
                <span style="color:#f97316; font-weight:bold;">■ สีส้ม</span>: รถยนต์ / แท็กซี่ <i class="fa-solid fa-arrow-right"></i> <span class="route-time-driving" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span><br>
                <span style="color:#22c55e; font-weight:bold;">■ สีเขียว</span>: เดินเท้า <i class="fa-solid fa-arrow-right"></i> <span class="route-time-walking" style="color:var(--primary); font-weight:bold;">กำลังคำนวณ...</span>
            </div>
        `;
        // Remove the tag from displayed text and append the clear button + legend
        formattedText = formattedText.replace(routeRegex, `<br><button onclick="window.clearRoute(this)" style="background:#ef4444; color:white; border:none; border-radius:4px; font-size:0.8rem; padding: 6px 10px; margin-top:5px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-eye-slash"></i> ซ่อนเส้นทาง</button>${legend}`);
    }

    formattedText = formattedText.replace(/\n/g, '<br>');
    
    // Highlight and link places
    const placeNames = getKnownPlaceNames();
    placeNames.forEach(name => {
        if (name.length < 3) return; // Ignore very short names to prevent false positives
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const jsSafeName = name.replace(/'/g, "\\'");
        
        // This regex ensures we don't replace inside existing HTML tags
        const regex = new RegExp(`(${escapedName})(?![^<]*>|[^<>]*<\\/)`, 'gi');
        formattedText = formattedText.replace(regex, `<span class="highlight-place" onclick="window.focusOnPlace('${jsSafeName}')">$1</span>`);
    });
    
    return formattedText;
}

function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    
    if (sender === 'ai') {
        msgDiv.innerHTML = `<div class="msg-bubble">${formatAIResponse(text)}</div>`;
    } else {
        msgDiv.innerHTML = `<div class="msg-bubble">${text.replace(/\n/g, '<br>')}</div>`;
    }
    
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
            appendMessage('ai', `<span class="text-danger">${t('ai_error')} (${error})</span>`);
            chatInput.disabled = false;
        }
    );
}

// Global functions for inline HTML calls (from InfoWindows)
window.askAIAvoidingGlobal = function(placeName) {
    aiSidebar.classList.remove('closed');
    const actionWord = currentLang === 'en' ? "Please recommend or review" : "ช่วยแนะนำข้อมูล รีวิว หรือสิ่งน่าสนใจเกี่ยวกับ";
    const msg = `${actionWord} "${placeName}"`;
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

window.askMenuRecommendations = function(placeName) {
    aiSidebar.classList.remove('closed');
    const prompt = `Can you act as a menu translator and recommend some signature Thai dishes that this street food stall or restaurant ("${placeName}") might have? Please explain the dishes in English.`;
    
    appendMessage(prompt, 'user');
    
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai';
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = '<div class="msg-bubble"><i class="fa-solid fa-ellipsis fa-fade"></i></div>';
    chatContainer.appendChild(loadingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    askAI(prompt, 
        (response) => {
            const el = document.getElementById(loadingId);
            if (el) el.remove();
            appendMessage(formatAIResponse(response), 'ai');
        },
        (error) => {
            const el = document.getElementById(loadingId);
            if (el) el.remove();
            appendMessage(`<span class="text-danger">Error: ${error}</span>`, 'ai');
        }
    );
};
