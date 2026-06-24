import { CONFIG } from './config.js';
import { updateAIContextLocation, updateAIContextPlaces } from './ai.js';
import { t, currentLang } from './i18n.js';

let map;
let placesService;
let infoWindow;
let geocoder;
let directionsService;
let directionsRenderer;
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
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false
    });

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
    geocoder.geocode({ location: location, language: currentLang }, (results, status) => {
        let address = t('unknown_location');
        if (status === "OK" && results[0]) {
            address = results[0].formatted_address;
        }
        updateAIContextLocation(address, location.lat, location.lng);
    });
}

export function loadGoogleMaps() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places,geometry&language=${currentLang}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

let watchId = null;
let lastFetchedPosition = null;

export function toggleTrackingLocation(onStateChange, onError) {
    if (!navigator.geolocation) {
        if (onError) onError(t('alert_no_gps'));
        return;
    }

    if (watchId !== null) {
        // Stop tracking
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (onStateChange) onStateChange(false);
        return;
    }

    // Start tracking
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            
            if (currentPositionMarker) {
                currentPositionMarker.setPosition(pos);
            } else {
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
                    title: t('tooltip_location')
                });
            }

            // Calculate distance to last fetched position
            let distance = 9999;
            if (lastFetchedPosition && google.maps.geometry) {
                distance = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(pos.lat, pos.lng),
                    new google.maps.LatLng(lastFetchedPosition.lat, lastFetchedPosition.lng)
                );
            }

            // Only fetch nearby places and reverse geocode if moved > 50 meters
            // This prevents spamming the API and saves quota
            if (!lastFetchedPosition || distance > 50) {
                lastFetchedPosition = pos;
                map.panTo(pos);
                map.setZoom(16);
                searchNearbyPlaces(pos);
                updateLocationContext(pos);
            } else {
                // Just pan to follow user smoothly without re-fetching everything
                map.panTo(pos);
            }

            if (onStateChange) onStateChange(true);
        },
        (error) => {
            if (onError) onError(error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        }
    );
}

export function searchNearbyPlaces(location) {
    const request = {
        location: location,
        radius: '2000',
        type: ['restaurant', 'tourist_attraction'],
        language: currentLang
    };

    placesService.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            clearMarkers();
            for (let i = 0; i < Math.min(results.length, 20); i++) {
                createMarker(results[i]);
            }
            // Send the results to AI context
            updateAIContextPlaces(results);
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
            fields: ['name', 'rating', 'reviews', 'formatted_address', 'url'],
            language: currentLang
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
                    content += `<a href="${placeDetails.url}" target="_blank" style="color: #4F46E5; font-size: 0.85rem; text-decoration: none;">${t('view_on_maps')}</a><br>`;
                }
            } else {
                 if (place.rating) {
                    content += `<p style="margin: 0 0 5px 0;">⭐ ${place.rating} / 5</p>`;
                }
            }

            content += `
                <button onclick="window.askAIAvoidingGlobal('${place.name.replace(/'/g, "\\'")}')" 
                        style="margin-top: 10px; background: #4F46E5; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-family: 'Prompt', sans-serif;">
                    <i class="fa-solid fa-robot"></i> ${t('ask_ai_btn')}
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
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem;">${place.description || t('no_details')}</p>
                    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #666;">${t('added_by')}: ${place.userName || 'Unknown'}</p>
                    <button onclick="window.askAIAvoidingGlobal('${place.name.replace(/'/g, "\\'")}')" 
                            style="margin-bottom: 10px; background: #4F46E5; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-family: 'Prompt', sans-serif;">
                        <i class="fa-solid fa-robot"></i> ${t('ask_ai_btn')}
                    </button>
            `;
            
            if (isOwner) {
                content += `
                    <div style="display: flex; gap: 5px; margin-top: 5px;">
                        <button onclick="window.editCustomPlace('${place.id}')" style="flex: 1; background: #F59E0B; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer;">${t('btn_edit')}</button>
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

export function getKnownPlaceNames() {
    const names = [];
    markers.forEach(m => { if (m.title) names.push(m.title); });
    customMarkers.forEach(m => { if (m.title) names.push(m.title); });
    // Unique and sort by length descending to prevent nested replacements
    return [...new Set(names)].sort((a, b) => b.length - a.length);
}

export function focusOnPlace(name) {
    const allMarkers = [...markers, ...customMarkers];
    const marker = allMarkers.find(m => m.title && m.title.toLowerCase() === name.toLowerCase());
    if (marker) {
        map.panTo(marker.getPosition());
        map.setZoom(18);
        google.maps.event.trigger(marker, 'click');
        
        // On mobile, maybe close the AI sidebar so user can see the map
        if (window.innerWidth < 768) {
            document.getElementById('ai-sidebar').classList.add('closed');
        }
    }
}
window.focusOnPlace = focusOnPlace;

export function drawRoute(destinationName) {
    if (!lastFetchedPosition && !currentPositionMarker) {
        alert(t('alert_no_gps') || "Please enable GPS first");
        return;
    }

    const origin = lastFetchedPosition || currentPositionMarker.getPosition();
    clearRoute(); // Clear any existing routes first

    // Try to find destination coordinates
    const allMarkers = [...markers, ...customMarkers];
    const marker = allMarkers.find(m => m.title && m.title.toLowerCase().includes(destinationName.toLowerCase()));
    
    let destinationLocation;
    if (marker) {
        destinationLocation = marker.getPosition();
        calculateAndDisplayMultipleRoutes(origin, destinationLocation);
    } else {
        // If not in known markers, geocode it
        geocoder.geocode({ address: destinationName }, (results, status) => {
            if (status === 'OK' && results[0]) {
                destinationLocation = results[0].geometry.location;
                calculateAndDisplayMultipleRoutes(origin, destinationLocation);
            } else {
                console.error('Geocode was not successful: ' + status);
            }
        });
    }
}

// Store multiple renderers
let routeRenderers = [];

function calculateAndDisplayMultipleRoutes(origin, destination) {
    if (!directionsService) return;
    
    // TRANSIT (Bus/Train) -> Blue
    displaySingleRoute(origin, destination, google.maps.TravelMode.TRANSIT, '#3b82f6', false);
    
    // DRIVING (Taxi/Car) -> Orange
    displaySingleRoute(origin, destination, google.maps.TravelMode.DRIVING, '#f97316', true);
    
    // WALKING -> Green
    displaySingleRoute(origin, destination, google.maps.TravelMode.WALKING, '#22c55e', true);
}

function displaySingleRoute(origin, destination, mode, color, suppressMarkers) {
    const routeClass = getRouteClassByMode(mode);
    const elementsToUpdate = document.querySelectorAll(routeClass);
    elementsToUpdate.forEach(el => el.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณ...`);

    directionsService.route({
        origin: origin,
        destination: destination,
        travelMode: mode
    }, (response, status) => {
        if (status === 'OK') {
            const renderer = new google.maps.DirectionsRenderer({
                map: map,
                suppressMarkers: suppressMarkers,
                polylineOptions: {
                    strokeColor: color,
                    strokeOpacity: 0.8,
                    strokeWeight: 6
                }
            });
            renderer.setDirections(response);
            routeRenderers.push(renderer);
            
            const duration = response.routes[0].legs[0].duration.text;
            const distance = response.routes[0].legs[0].distance.text;
            
            elementsToUpdate.forEach(el => {
                el.innerText = `ใช้เวลา ${duration} (${distance})`;
            });
        } else {
            elementsToUpdate.forEach(el => {
                el.innerText = `ไม่มีเส้นทางรองรับ`;
            });
        }
    });
}

function getRouteClassByMode(mode) {
    if (mode === google.maps.TravelMode.TRANSIT) return '.route-time-transit';
    if (mode === google.maps.TravelMode.DRIVING) return '.route-time-driving';
    if (mode === google.maps.TravelMode.WALKING) return '.route-time-walking';
    return '';
}

export function clearRoute() {
    // Legacy support for single renderer
    if (directionsRenderer) {
        directionsRenderer.setDirections({routes: []});
    }
    // Clear all multi-mode renderers
    routeRenderers.forEach(r => r.setMap(null));
    routeRenderers = [];
}
window.drawRoute = drawRoute;
window.clearRoute = clearRoute;
