import { CONFIG } from './config.js';
import { updateAIContextLocation } from './ai.js';

let map;
let placesService;
let infoWindow;
let geocoder;
let markers = [];
let customMarkers = [];
let currentPositionMarker = null;

// The callback for script load
window.initMap = function() {
    // Default location (e.g., Bangkok)
    const center = { lat: 13.7563, lng: 100.5018 };

    map = new google.maps.Map(document.getElementById("map"), {
        center: center,
        zoom: 13,
        mapId: 'DEMO_MAP_ID', // Requires mapId for AdvancedMarkerView if used, but we'll use standard for compatibility or standard markers
        disableDefaultUI: true,
        zoomControl: true,
    });

    infoWindow = new google.maps.InfoWindow();
    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();

    // Click event for adding new places
    map.addListener("click", (mapsMouseEvent) => {
        const latLng = mapsMouseEvent.latLng;
        // Dispatch custom event to be handled by app.js
        window.dispatchEvent(new CustomEvent('mapClick', { 
            detail: { lat: latLng.lat(), lng: latLng.lng() }
        }));
    });

    // Try finding places nearby initially
    searchNearbyPlaces(center);
    updateLocationContext(center);
};

function updateLocationContext(location) {
    if (!geocoder) return;
    geocoder.geocode({ location: location }, (results, status) => {
        let address = "ตำแหน่งที่ไม่ทราบชื่อ";
        if (status === "OK" && results[0]) {
            address = results[0].formatted_address;
        }
        updateAIContextLocation(address, location.lat, location.lng);
    });
}

export function loadGoogleMaps() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

export function getCurrentLocation(onSuccess, onError) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                
                if (currentPositionMarker) {
                    currentPositionMarker.setMap(null);
                }

                currentPositionMarker = new google.maps.Marker({
                    position: pos,
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: "#4F46E5",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2,
                    },
                    title: "ตำแหน่งของคุณ"
                });

                map.setCenter(pos);
                map.setZoom(15);
                searchNearbyPlaces(pos);
                updateLocationContext(pos);
                if (onSuccess) onSuccess(pos);
            },
            () => {
                if (onError) onError(true);
            }
        );
    } else {
        if (onError) onError(false);
    }
}

export function searchNearbyPlaces(location) {
    const request = {
        location: location,
        radius: '2000',
        type: ['restaurant', 'tourist_attraction']
    };

    placesService.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            clearMarkers();
            for (let i = 0; i < Math.min(results.length, 20); i++) {
                createMarker(results[i]);
            }
        }
    });
}

function clearMarkers() {
    for (let i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
    markers = [];
}

export function clearCustomMarkers() {
    for (let i = 0; i < customMarkers.length; i++) {
        customMarkers[i].setMap(null);
    }
    customMarkers = [];
}

function createMarker(place) {
    if (!place.geometry || !place.geometry.location) return;

    const marker = new google.maps.Marker({
        map,
        position: place.geometry.location,
        title: place.name,
        icon: place.types.includes('restaurant') ? 'http://maps.google.com/mapfiles/ms/icons/restaurant.png' : 'http://maps.google.com/mapfiles/ms/icons/camera.png'
    });

    google.maps.event.addListener(marker, "click", () => {
        // Fetch detailed info including reviews
        const request = {
            placeId: place.place_id,
            fields: ['name', 'rating', 'reviews', 'formatted_address', 'url']
        };

        placesService.getDetails(request, (placeDetails, status) => {
            let content = `
                <div style="max-width: 250px; font-family: 'Prompt', sans-serif;">
                    <h3 style="margin: 0 0 5px 0; color: #4F46E5; font-size: 1.1rem;">${place.name}</h3>
            `;
            
            if (status === google.maps.places.PlacesServiceStatus.OK && placeDetails) {
                if (placeDetails.rating) {
                    content += `<p style="margin: 0 0 5px 0;">⭐ ${placeDetails.rating} / 5</p>`;
                }
                if (placeDetails.formatted_address) {
                    content += `<p style="margin: 0 0 10px 0; font-size: 0.85rem; color: #666;">${placeDetails.formatted_address}</p>`;
                }
                if (placeDetails.reviews && placeDetails.reviews.length > 0) {
                    const review = placeDetails.reviews[0];
                    content += `
                        <div style="background: #f9f9f9; padding: 8px; border-radius: 4px; font-size: 0.8rem; margin-bottom: 10px; font-style: italic;">
                            "${review.text.substring(0, 80)}..." <br>
                            <small>- ${review.author_name}</small>
                        </div>
                    `;
                }
                if (placeDetails.url) {
                    content += `<a href="${placeDetails.url}" target="_blank" style="color: #4F46E5; font-size: 0.85rem; text-decoration: none;">ดูบน Google Maps</a><br>`;
                }
            } else {
                 if (place.rating) {
                    content += `<p style="margin: 0 0 5px 0;">⭐ ${place.rating} / 5</p>`;
                }
            }

            content += `
                <button onclick="window.askAIAvoidingGlobal('${place.name.replace(/'/g, "\\'")}')" 
                        style="margin-top: 10px; background: #4F46E5; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-family: 'Prompt', sans-serif;">
                    <i class="fa-solid fa-robot"></i> ถาม AI เกี่ยวกับที่นี่
                </button>
                </div>
            `;

            infoWindow.setContent(content);
            infoWindow.open(map, marker);
        });
    });

    markers.push(marker);
}

export function renderCustomPlaces(places, currentUserId) {
    clearCustomMarkers();
    
    places.forEach(place => {
        const marker = new google.maps.Marker({
            map,
            position: { lat: parseFloat(place.lat), lng: parseFloat(place.lng) },
            title: place.name,
            icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' // Custom places are blue
        });

        google.maps.event.addListener(marker, "click", () => {
            const isOwner = currentUserId === place.userId;
            
            let content = `
                <div style="max-width: 250px; font-family: 'Prompt', sans-serif;">
                    <h3 style="margin: 0 0 5px 0; color: #10B981; font-size: 1.1rem;">${place.name}</h3>
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem;">${place.description || 'ไม่มีรายละเอียด'}</p>
                    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #666;">เพิ่มโดย: ${place.userName || 'Unknown'}</p>
                    <button onclick="window.askAIAvoidingGlobal('${place.name.replace(/'/g, "\\'")}')" 
                            style="margin-bottom: 10px; background: #4F46E5; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-family: 'Prompt', sans-serif;">
                        <i class="fa-solid fa-robot"></i> ถาม AI เกี่ยวกับที่นี่
                    </button>
            `;
            
            if (isOwner) {
                content += `
                    <div style="display: flex; gap: 5px; margin-top: 5px;">
                        <button onclick="window.editCustomPlace('${place.id}')" style="flex: 1; background: #F59E0B; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer;">แก้ไข</button>
                    </div>
                `;
            }
            
            content += `</div>`;
            infoWindow.setContent(content);
            infoWindow.open(map, marker);
        });
        
        customMarkers.push(marker);
    });
}
