/* =========================================================
   RAKSHANOVA — SCRIPT.JS
   -----------------------------------------------------------
   This file is split into clearly labelled parts:
   1. Sample data (shelters, blocked roads, rescue vehicles)
   2. Small helper functions (distance/time math)
   3. Map setup (Leaflet)
   4. Putting markers on the map
   5. Dashboard numbers
   6. Route planner logic
   7. Hero button behaviour
   All of this runs after the page finishes loading, inside
   the DOMContentLoaded listener at the very bottom of the file.
   ========================================================= */

/* ---------- 1. SAMPLE DATA ----------
   In a real app this would come from a server/API. For the MVP
   we just hard-code arrays of objects. Each object is one
   "thing" on the map. Coordinates are [latitude, longitude]. */

// Where "you" are standing right now (sample location in Nashik).
const USER_LOCATION = { lat: 19.9930, lng: 73.7850 };

const SHELTERS = [
  {
    id: 'shelter-1',
    name: 'Nashik Central Relief Shelter',
    coords: [20.0025, 73.7900],
    capacity: 500,
    availableBeds: 120,
    supplies: 'Food & water available',
    contact: '1800-000-111 (demo)',
    // A few waypoints that make a simulated "safe" path from the
    // user's location to this shelter. In the MVP these are just
    // hand-picked points — no real routing engine is involved yet.
    routeWaypoints: [
      [19.9930, 73.7850],
      [19.9965, 73.7862],
      [20.0000, 73.7888],
      [20.0025, 73.7900],
    ],
  },
  {
    id: 'shelter-2',
    name: 'Godavari Riverside Shelter',
    coords: [19.9950, 73.7950],
    capacity: 300,
    availableBeds: 40,
    supplies: 'Limited food, water available',
    contact: '1800-000-112 (demo)',
    routeWaypoints: [
      [19.9930, 73.7850],
      [19.9938, 73.7900],
      [19.9950, 73.7950],
    ],
  },
  {
    id: 'shelter-3',
    name: 'College Ground Emergency Camp',
    coords: [20.0100, 73.7800],
    capacity: 250,
    availableBeds: 60,
    supplies: 'Food & water available',
    contact: '1800-000-113 (demo)',
    routeWaypoints: [
      [19.9930, 73.7850],
      [19.9985, 73.7810],
      [20.0100, 73.7800],
    ],
  },
];

// Each blocked road is drawn as a line between two points.
const BLOCKED_ROADS = [
  { id: 'road-1', name: 'Nashik–Pune Highway', reason: 'Flooding', coords: [[19.9900, 73.7830], [19.9850, 73.7950]] },
  { id: 'road-2', name: 'Godavari Bridge Road', reason: 'Bridge partially collapsed', coords: [[19.9945, 73.7920], [19.9970, 73.7960]] },
  { id: 'road-3', name: 'College Road', reason: 'Waterlogged', coords: [[20.0020, 73.7830], [20.0080, 73.7815]] },
  { id: 'road-4', name: 'Old Agra Road', reason: 'Landslide debris', coords: [[19.9990, 73.7960], [20.0040, 73.8000]] },
  { id: 'road-5', name: 'Trimbak Road', reason: 'Fallen trees', coords: [[19.9880, 73.7780], [19.9930, 73.7740]] },
];

const RESCUE_VEHICLES = [
  { id: 'vehicle-1', name: 'Ambulance Unit 7', coords: [20.0000, 73.7850], status: 'Active' },
  { id: 'vehicle-2', name: 'Fire Rescue Unit 3', coords: [19.9990, 73.7920], status: 'Active' },
];

// Sample weather — no real API in this MVP.
const WEATHER_SAMPLE = { condition: 'Heavy Rain', tempC: 26, rainfallMm: 64 };


/* ---------- 2. HELPER FUNCTIONS ---------- */

/**
 * Haversine formula: calculates the straight-line distance in
 * kilometres between two [lat, lng] points on Earth. This is the
 * standard formula used any time you need "distance between two
 * GPS coordinates" — worth remembering, you'll reuse it often.
 */
function distanceKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Adds up the distance across every waypoint-to-waypoint segment. */
function totalRouteDistance(waypoints) {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += distanceKm(waypoints[i], waypoints[i + 1]);
  }
  return total;
}

/** Turns a distance into a rough travel time, assuming 25 km/h
 * (a reasonable average speed for a car moving carefully through
 * a disaster-affected area — this is a simple assumption, not a
 * real traffic calculation). */
function estimateMinutes(km) {
  const speedKmh = 25;
  return Math.round((km / speedKmh) * 60);
}

/** Builds a small colored circle marker icon (a Leaflet "divIcon").
 * We use this instead of image files so the MVP has zero extra
 * assets to manage — the icon is just HTML + CSS. */
function pinIcon(emoji, className) {
  return L.divIcon({
    html: `<div class="map-pin ${className}">${emoji}</div>`,
    className: '', // stop Leaflet adding its own default styling
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}


/* ---------- 3. MAP SETUP ---------- */

let map;             // will hold the Leaflet map instance
let routeLayer;       // holds the currently drawn route line, so we can remove it before drawing a new one

function initMap() {
  map = L.map('map').setView([USER_LOCATION.lat, USER_LOCATION.lng], 13);

  // OpenStreetMap tiles — free, no API key needed.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  addUserMarker();
  addShelterMarkers();
  addBlockedRoads();
  addVehicleMarkers();
}


/* ---------- 4. MARKERS ---------- */

function addUserMarker() {
  L.marker([USER_LOCATION.lat, USER_LOCATION.lng], {
    icon: pinIcon('📍', 'pin-user'),
  })
    .addTo(map)
    .bindPopup('<strong>You are here</strong><br/>(sample location)');
}

function addShelterMarkers() {
  SHELTERS.forEach((shelter) => {
    const marker = L.marker(shelter.coords, { icon: pinIcon('🏠', 'pin-shelter') }).addTo(map);

    // Clicking the marker shows details in BOTH a map popup
    // and the side panel (see part 6) — good for teaching two
    // ways to react to the same click.
    marker.on('click', () => showShelterDetails(shelter));

    marker.bindPopup(`<strong>${shelter.name}</strong><br/>Beds available: ${shelter.availableBeds}`);
  });
}

function addBlockedRoads() {
  BLOCKED_ROADS.forEach((road) => {
    // The line itself, drawn in red and dashed.
    L.polyline(road.coords, {
      color: '#e23d3d',
      weight: 5,
      dashArray: '8 8',
      opacity: 0.85,
    })
      .addTo(map)
      .bindPopup(`<strong>${road.name}</strong><br/>Blocked — ${road.reason}`);

    // A small icon marker at the midpoint of the line, purely so
    // it's easy to spot & click even when zoomed out.
    const mid = [
      (road.coords[0][0] + road.coords[1][0]) / 2,
      (road.coords[0][1] + road.coords[1][1]) / 2,
    ];
    L.marker(mid, { icon: pinIcon('🚧', 'pin-road') })
      .addTo(map)
      .bindPopup(`<strong>${road.name}</strong><br/>Blocked — ${road.reason}`);
  });
}

function addVehicleMarkers() {
  RESCUE_VEHICLES.forEach((vehicle) => {
    L.marker(vehicle.coords, { icon: pinIcon('🚑', 'pin-vehicle') })
      .addTo(map)
      .bindPopup(`<strong>${vehicle.name}</strong><br/>Status: ${vehicle.status}`);
  });
}


/* ---------- 5. DASHBOARD NUMBERS ---------- */

function fillDashboard() {
  document.getElementById('stat-shelters').textContent = SHELTERS.length;
  document.getElementById('stat-roads').textContent = BLOCKED_ROADS.length;
  document.getElementById('stat-vehicles').textContent = RESCUE_VEHICLES.length;

  document.getElementById('stat-weather').textContent =
    `${WEATHER_SAMPLE.tempC}°C, ${WEATHER_SAMPLE.condition}`;
  document.getElementById('stat-weather-sub').textContent =
    `Rainfall (24h): ${WEATHER_SAMPLE.rainfallMm} mm — sample data`;
}


/* ---------- 6. ROUTE PLANNER + SHELTER DETAILS PANEL ---------- */

function populateDestinationSelect() {
  const select = document.getElementById('destination-select');
  SHELTERS.forEach((shelter) => {
    const option = document.createElement('option');
    option.value = shelter.id;
    option.textContent = shelter.name;
    select.appendChild(option);
  });
}

function showShelterDetails(shelter) {
  const distance = distanceKm([USER_LOCATION.lat, USER_LOCATION.lng], shelter.coords);

  document.getElementById('sd-name').textContent = shelter.name;
  document.getElementById('sd-distance').textContent = `${distance.toFixed(1)} km`;
  document.getElementById('sd-capacity').textContent = shelter.capacity;
  document.getElementById('sd-beds').textContent = shelter.availableBeds;
  document.getElementById('sd-supplies').textContent = shelter.supplies;
  document.getElementById('sd-contact').textContent = shelter.contact;

  document.getElementById('shelter-details').classList.remove('hidden');
}

function calculateRoute() {
  const selectedId = document.getElementById('destination-select').value;
  const shelter = SHELTERS.find((s) => s.id === selectedId);
  if (!shelter) return;

  // Remove any route drawn from a previous click, so routes don't stack up.
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  routeLayer = L.polyline(shelter.routeWaypoints, {
    color: '#2f8fa3',
    weight: 5,
    opacity: 0.9,
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

  const km = totalRouteDistance(shelter.routeWaypoints);
  const minutes = estimateMinutes(km);

  document.getElementById('route-distance').textContent = `${km.toFixed(1)} km`;
  document.getElementById('route-time').textContent = `${minutes} min`;
  document.getElementById('route-result').classList.remove('hidden');

  showShelterDetails(shelter);
}


/* ---------- 7. HERO BUTTONS ---------- */

function setupHeroButtons() {
  document.getElementById('btn-find-shelter').addEventListener('click', () => {
    document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btn-find-route').addEventListener('click', () => {
    document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('route-panel').style.outline = '2px solid #2f8fa3';
    setTimeout(() => {
      document.getElementById('route-panel').style.outline = 'none';
    }, 1200);
  });
}


/* ---------- RUN EVERYTHING ONCE THE PAGE HAS LOADED ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  fillDashboard();
  populateDestinationSelect();
  setupHeroButtons();

  document.getElementById('btn-calculate-route').addEventListener('click', calculateRoute);
});