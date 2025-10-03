let routeMap;
let routeLayer;
let markersLayer;
let destinationMarker;
let sourceMarker;

// Initialize map
function initializeMap() {
    routeMap = L.map('route-map').setView([51.505, -0.09], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(routeMap);
    
    markersLayer = L.layerGroup().addTo(routeMap);
    routeLayer = L.layerGroup().addTo(routeMap);

    // Add click event to map
    routeMap.on('click', handleMapClick);
}

// Handle map clicks for destination selection
function handleMapClick(e) {
    const latlng = e.latlng;
    
    // Update destination marker
    if (destinationMarker) {
        routeMap.removeLayer(destinationMarker);
    }
    
    destinationMarker = L.marker([latlng.lat, latlng.lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(routeMap);

    // Update destination input field with coordinates
    document.getElementById('end-location').value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

// Handle current location
function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Update source marker
            if (sourceMarker) {
                routeMap.removeLayer(sourceMarker);
            }

            sourceMarker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(routeMap);

            // Update start location input field
            document.getElementById('start-location').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            
            // Center map on current location
            routeMap.setView([lat, lng], 13);
        },
        (error) => {
            alert('Error getting your location: ' + error.message);
        }
    );
}

// CNG Models database (simplified) - Remove 'kg/min' from filling speed values
const cngModels = {
    tesla_model_3: {
        name: "Tesla Model 3",
        batteryCapacity: 82, // kWh
        range: 358, // km
        fillingSpeed: 250, // kg/min (removed 'kg/min' suffix)
        consumption: 0.229 // kWh/km
    },
    nissan_leaf: {
        name: "Nissan Leaf",
        batteryCapacity: 62,
        range: 385,
        fillingSpeed: 100, // kg/min (removed 'kg/min' suffix)
        consumption: 0.161
    },
    // Add more CNG models
};

// Add this function to calculate the actual route
async function calculateRoute(startCoords, endCoords) {
    const startStr = `${startCoords[1]},${startCoords[0]}`;
    const endStr = `${endCoords[1]},${endCoords[0]}`;
    
    try {
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson`
        );
        
        if (!response.ok) {
            throw new Error('Route calculation failed');
        }
        
        const data = await response.json();
        
        if (data.code !== 'Ok') {
            throw new Error('No route found');
        }
        
        // Calculate segments for battery monitoring
        const coordinates = data.routes[0].geometry.coordinates;
        const segments = [];
        let totalDistance = 0;
        
        for (let i = 0; i < coordinates.length - 1; i++) {
            const distance = calculateSegmentDistance(
                coordinates[i][1], coordinates[i][0],
                coordinates[i + 1][1], coordinates[i + 1][0]
            );
            totalDistance += distance;
            segments.push({
                start: [coordinates[i][1], coordinates[i][0]],
                end: [coordinates[i + 1][1], coordinates[i + 1][0]],
                distance: distance
            });
        }
        
        return {
            coordinates: coordinates.map(coord => [coord[1], coord[0]]),
            distance: totalDistance,
            duration: Math.round(data.routes[0].duration / 60),
            segments: segments
        };
    } catch (error) {
        console.error('Error calculating route:', error);
        throw error;
    }
}

function calculateSegmentDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Update the displayRoute function to handle the new route format
function displayRoute(route, stops) {
    // Clear previous route and markers
    routeLayer.clearLayers();
    markersLayer.clearLayers();
    
    // Draw route line
    const routePath = L.polyline(route.coordinates, {
        color: '#4CAF50',
        weight: 5
    }).addTo(routeLayer);
    
    // Add markers for start and end points
    const startPoint = route.coordinates[0];
    const endPoint = route.coordinates[route.coordinates.length - 1];
    
    // Add route summary if available
    const routeSummary = document.createElement('div');
    routeSummary.className = 'route-summary';
    routeSummary.innerHTML = `
        <div class="summary-item">
            <i class="fas fa-road"></i>
            <span>Distance: ${route.distance.toFixed(1)} km</span>
        </div>
        <div class="summary-item">
            <i class="fas fa-clock"></i>
            <span>Duration: ${route.duration} mins</span>
        </div>
    `;
    document.querySelector('.route-results').prepend(routeSummary);
    
    // Start marker
    L.marker(startPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(markersLayer).bindPopup('Start');
    
    // End marker
    L.marker(endPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(markersLayer).bindPopup('Destination');
    
    // Add markers for CNG filling stops
    stops.forEach((stop, index) => {
        const marker = L.marker([stop.lat, stop.lng], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(markersLayer);
        
        const popupContent = `
            <div class="cng-stop-popup">
                <h3>${stop.name}</h3>
                <p>Arrival Fuel: ${stop.arrivalFuel}%</p>
                <p>Filling Time: ${stop.fillTime} mins</p>
                <p>Departure Fuel: ${stop.departureFuel}%</p>
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
    
    // Update stops list in sidebar
    displayStopsList(stops);
    
    // Fit map to show entire route
    routeMap.fitBounds(routePath.getBounds(), {
        padding: [50, 50]
    });
}

// Display stops list in sidebar
function displayStopsList(stops) {
    const stopsList = document.getElementById('stops-list');
    if (!stops.length) {
        stopsList.innerHTML = '<p>No CNG filling stops needed</p>';
        return;
    }
    
    const stopsHTML = stops.map((stop, index) => `
        <div class="stop-card">
            <h4>Stop ${index + 1}: ${stop.name}</h4>
            <div class="stop-details">
                <p><i class="fas fa-gas-pump"></i> Arrival: ${stop.arrivalFuel}%</p>
                <p><i class="fas fa-clock"></i> Fill time: ${stop.fillTime} mins</p>
                <p><i class="fas fa-tachometer-alt"></i> Departure: ${stop.departureFuel}%</p>
            </div>
        </div>
    `).join('');
    
    stopsList.innerHTML = stopsHTML;
}

// Add this function to clear previous route data
function clearPreviousRoute() {
    // Clear map layers
    if (routeLayer) routeLayer.clearLayers();
    if (markersLayer) markersLayer.clearLayers();
    
    // Clear route summary if it exists
    const existingSummary = document.querySelector('.route-summary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    // Clear CNG filling stops list
    const stopsList = document.getElementById('stops-list');
    if (stopsList) {
        stopsList.innerHTML = '';
    }
}

// Update the form submission handler
document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    clearPreviousRoute();
    
    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    const cngModel = document.getElementById('cng-model').value;
    const currentFuel = document.getElementById('current-fuel').value;
    
    if (!startLocation || !endLocation || !cngModel || !currentFuel) {
        alert('Please fill in all fields');
        return;
    }
    
    // Show loading state
    const routeResults = document.querySelector('.route-results');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = `
        <div class="spinner"></div>
        <p>Calculating optimal route...</p>
    `;
    routeResults.prepend(loadingDiv);
    
    try {
        // Parse coordinates
        const [startLat, startLng] = startLocation.split(',').map(coord => parseFloat(coord.trim()));
        const [endLat, endLng] = endLocation.split(',').map(coord => parseFloat(coord.trim()));
        
        if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
            throw new Error('Invalid coordinates format');
        }
        
        // Calculate route first
        const routeData = await calculateRoute([startLat, startLng], [endLat, endLng]);
        
        // Clean up CNG model data before sending
        const selectedCngModel = cngModels[cngModel];
        if (!selectedCngModel) {
            throw new Error('Invalid CNG model selected');
        }

        const response = await fetch('/api/route-plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                route: routeData,
                cngModel: selectedCngModel,
                currentFuel: parseInt(currentFuel)
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to plan route');
        }
        
        loadingDiv.remove();
        
        if (data.fillingStops) {
            displayRoute(routeData, data.fillingStops);
        } else {
            throw new Error('No CNG filling stops returned');
        }
    } catch (error) {
        loadingDiv.remove();
        console.error('Error planning route:', error);
        alert(error.message || 'Error planning route. Please try again.');
    }
});

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', initializeMap); 