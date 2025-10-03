let map;
let userMarker = null;
let stationMarkers = [];
let routingControl = null;
let accuracyCircle = null;
let isMapInitialized = false;
let searchRadius = 5;
let radiusCircle = null;

document.addEventListener('DOMContentLoaded', function() {
    const mapContainer = document.getElementById('map');
    if (mapContainer && !isMapInitialized) {
        initMap();
    }
    initSidebarToggle();

    // Add modal functionality
    const aboutBtn = document.querySelector('.about-btn');
    const modal = document.getElementById('aboutModal');
    const closeBtn = document.querySelector('.close-modal');

    aboutBtn.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

function initMap() {
    if (isMapInitialized) {
        return;
    }

    map = L.map('map').setView([28.6139, 77.2090], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    map.on('click', function(e) {
        handleLocationSelect(e.latlng.lat, e.latlng.lng);
    });

    const locationButton = document.getElementById('location-button');
    if (locationButton) {
        locationButton.addEventListener('click', getCurrentLocation);
    }

    // Add radius slider functionality
    const radiusSlider = document.getElementById('radius-slider');
    const radiusValue = document.getElementById('radius-value');
    
    radiusSlider.addEventListener('input', function(e) {
        searchRadius = parseInt(e.target.value);
        radiusValue.textContent = searchRadius;
        
        if (userMarker) {
            updateRadiusCircle(userMarker.getLatLng());
        }
        
        if (userMarker) {
            const pos = userMarker.getLatLng();
            fetchNearbyStations(pos.lat, pos.lng);
        }
    });

    isMapInitialized = true;
}

function getCurrentLocation() {
    const button = document.getElementById('location-button');
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
    button.disabled = true;

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        resetLocationButton(button);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            handleLocationSelect(lat, lng);
            map.setView([lat, lng], 14);
            resetLocationButton(button);
        },
        function(error) {
            let errorMessage = "Error getting your location. ";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += "Please enable location services.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += "Location unavailable.";
                    break;
                case error.TIMEOUT:
                    errorMessage += "Request timed out.";
                    break;
                default:
                    errorMessage += "An unknown error occurred.";
            }
            alert(errorMessage);
            resetLocationButton(button);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function resetLocationButton(button) {
    button.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
    button.disabled = false;
}

function handleLocationSelect(lat, lng) {
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    userMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        })
    }).addTo(map);
    userMarker.bindPopup("Your Location").openPopup();

    updateRadiusCircle([lat, lng]);
    fetchNearbyStations(lat, lng);
}

function fetchNearbyStations(lat, lng) {
    // Show loading state
    const stationList = document.getElementById('station-list');
    stationList.innerHTML = '<div class="loading">Finding CNG stations...</div>';

    fetch(`/api/stations/${lat}/${lng}?radius=${searchRadius}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            // Filter stations within radius
            const stations = filterStationsWithinRadius(data.stations, {lat, lng});
            if (stations.length === 0) {
                stationList.innerHTML = '<div class="no-stations">No CNG stations found within ' + searchRadius + 'km radius</div>';
            } else {
                displayStations(stations);
            }
        })
        .catch(error => {
            console.error('Error fetching stations:', error);
            alert('Error fetching nearby stations. Please try again.');
        });
}

function filterStationsWithinRadius(stations, center) {
    return stations.filter(station => {
        const stationPos = station.position || { lat: station.lat, lng: station.lng };
        const distance = calculateDistance(
            center.lat,
            center.lng,
            stationPos.lat,
            stationPos.lng
        );
        return distance <= searchRadius;
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function displayStations(stations) {
    // Clear existing markers
    stationMarkers.forEach(marker => map.removeLayer(marker));
    stationMarkers = [];
    
    const stationList = document.getElementById('station-list');
    stationList.innerHTML = ''; // Clear existing list
    
    const bounds = L.latLngBounds();
    
    stations.forEach((station, index) => {
        const position = station.position || { lat: station.lat, lng: station.lng };
        const distance = userMarker ? 
            calculateDistance(
                userMarker.getLatLng().lat,
                userMarker.getLatLng().lng,
                position.lat,
                position.lng
            ).toFixed(2) : '?';
        
        const marker = L.marker([position.lat, position.lng], {
            icon: getCustomIcon(station.type || 'default', station.active_chargers > 0)
        }).addTo(map);
        
        const popupContent = `
            <div class="station-popup">
                <h3>${station.name}</h3>
                <div class="station-details">
                    <p><i class="fas fa-gas-pump"></i> ${station.active_chargers}/${station.total_chargers} CNG Pumps</p>
                    <p><i class="fas fa-clock"></i> ${station.wait_time.toFixed(2)} mins wait</p>
                    <p><i class="fas fa-bolt"></i> ${station.power || '50'} kW</p>
                    <p><i class="fas fa-map-marker-alt"></i> ${distance} km away</p>
                </div>
                <button onclick="getDirections(${position.lat}, ${position.lng})" class="direction-btn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        stationMarkers.push(marker);
        bounds.extend([position.lat, position.lng]);

        // Create station card with distance
        const stationCard = document.createElement('div');
        stationCard.className = 'station-card';
        stationCard.innerHTML = `
            <h3>${station.name}</h3>
            <div class="station-details">
                <p><i class="fas fa-charging-station"></i> ${station.active_chargers}/${station.total_chargers} Chargers</p>
                <p><i class="fas fa-clock"></i> ${station.wait_time.toFixed(2)} mins wait</p>
                <p><i class="fas fa-bolt"></i> ${station.power || '50'} kW</p>
                <p><i class="fas fa-map-marker-alt"></i> ${distance} km away</p>
            </div>
            <button onclick="getDirections(${position.lat}, ${position.lng})" class="direction-btn">
                <i class="fas fa-directions"></i> Get Directions
            </button>
        `;

        stationCard.addEventListener('click', () => {
            map.setView([position.lat, position.lng], 15);
            marker.openPopup();
        });

        stationList.appendChild(stationCard);
    });

    // Fit map to show all markers and radius circle
    if (stationMarkers.length > 0) {
        if (userMarker) {
            bounds.extend(userMarker.getLatLng());
        }
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15
        });
    }
}

// Reference to fetchNearbyStations function from main.js