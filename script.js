/*--------------------------------------------------------------------
INITIALIZE MAP
--------------------------------------------------------------------*/

mapboxgl.accessToken =
  "pk.eyJ1IjoiamVzc2ljYWh1YW5nIiwiYSI6ImNtazNjNmdmeTBkN3AzZnEyZHRscHdod28ifQ.Pa9LhzBk1H75KBMwBngDjA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/jessicahuang/cmmnx7kte003n01s125302mbb",
  center: [-79.36, 43.73],
  zoom: 10.2,
  bearing: -17,
  pitch: 0,
});

let incidentsData = null;

/*--------------------------------------------------------------------
WAIT FOR MAP + DATA BEFORE ADDING LAYERS  (fixes race condition)
--------------------------------------------------------------------*/

const mapReady = new Promise(resolve => map.on("load", resolve));

const dataReady = fetch("data/cleaned/toronto_incidents.geojson")
  .then(res => res.json())
  .then(data => { incidentsData = data; });

Promise.all([mapReady, dataReady]).then(initLayers);

/*--------------------------------------------------------------------
INIT LAYERS
--------------------------------------------------------------------*/

function initLayers() {

  /*-- NEIGHBOURHOOD CRIME CHOROPLETH (local file, 2022 violent crime rate) --*/

  map.addSource("neighbourhood_crime", {
    type: "geojson",
    data: "Neighbourhood_Crime_Rates.geojson",
  });

  map.addLayer({
    id: "neighbourhood_crime",
    type: "fill",
    source: "neighbourhood_crime",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["+",
          ["coalesce", ["get", "ASSAULT_RATE_2022"], 0],
          ["coalesce", ["get", "ROBBERY_RATE_2022"], 0],
          ["coalesce", ["get", "SHOOTING_RATE_2022"], 0],
          ["coalesce", ["get", "HOMICIDE_RATE_2022"], 0]
        ],
        200,  "#fff5f0",
        415,  "#fcbba1",
        595,  "#fb6a4a",
        807,  "#de2d26",
        1008, "#a50f15",
        3500, "#67000d"
      ],
      "fill-opacity": 0.5,
      "fill-outline-color": "#cccccc",
    },
  });

  /*-- NEIGHBOURHOOD CRIME HOVER POPUP --*/

  map.on("click", "neighbourhood_crime", (e) => {
    const p = e.features[0].properties;
    const rate = (
      (p.ASSAULT_RATE_2022 || 0) +
      (p.ROBBERY_RATE_2022 || 0) +
      (p.SHOOTING_RATE_2022 || 0) +
      (p.HOMICIDE_RATE_2022 || 0)
    ).toFixed(0);

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <b>${p.AREA_NAME}</b><br>
        Violent crime rate (2022): ${rate} per 100k
      `)
      .addTo(map);
  });

  map.on("mouseenter", "neighbourhood_crime", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "neighbourhood_crime", () => {
    map.getCanvas().style.cursor = "";
  });

  /*-- TTC STOPS --*/

  map.addSource("ttc_stops", {
    type: "geojson",
    data: "Construction Features/ttc_stops.geojson"
  });

  map.addLayer({
    id: "ttc_stops",
    type: "circle",
    source: "ttc_stops",
    paint: {
      "circle-radius": 4,
      "circle-color": "#e31837",
      "circle-opacity": 0.8,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });


}


/*--------------------------------------------------------------------
GEOCODER
--------------------------------------------------------------------*/

let startCoords = null;
let endCoords = null;

const startGeocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  placeholder: "Enter start location",
  countries: "ca",
  bbox: [-79.6393, 43.581, -79.1156, 43.8555],
  types: "address,place",
});

const endGeocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  placeholder: "Enter destination",
  countries: "ca",
  bbox: [-79.6393, 43.581, -79.1156, 43.8555],
  types: "address,place",
});

document.getElementById("geocoder-start").appendChild(startGeocoder.onAdd(map));
document.getElementById("geocoder-end").appendChild(endGeocoder.onAdd(map));

// Custom markers for start and end
const startMarkerEl = document.createElement("div");
startMarkerEl.className = "custom-marker marker-start";
const endMarkerEl = document.createElement("div");
endMarkerEl.className = "custom-marker marker-end";

let startMarker = new mapboxgl.Marker({ element: startMarkerEl, anchor: "bottom" });
let endMarker   = new mapboxgl.Marker({ element: endMarkerEl,   anchor: "bottom" });

startGeocoder.on("result", (e) => {
  startCoords = e.result.center;
  startMarker.setLngLat(startCoords).addTo(map);
  map.flyTo({ center: startCoords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

endGeocoder.on("result", (e) => {
  endCoords = e.result.center;
  endMarker.setLngLat(endCoords).addTo(map);
  map.flyTo({ center: endCoords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

/*--------------------------------------------------------------------
ROUTE MODE TOGGLE
--------------------------------------------------------------------*/

let routeMode = "both"; // "both" | "fastest" | "safest"

document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    routeMode = btn.dataset.mode;
    document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    applyRouteMode();
  });
});

function applyRouteMode() {
  if (map.getLayer("route-fastest")) {
    map.setLayoutProperty("route-fastest", "visibility",
      routeMode === "safest" ? "none" : "visible");
  }
  if (map.getLayer("route-safest")) {
    map.setLayoutProperty("route-safest", "visibility",
      routeMode === "fastest" ? "none" : "visible");
  }

  const fastestRow = document.getElementById("fastest-row");
  const safestRow = document.getElementById("safest-row");
  if (fastestRow) fastestRow.style.display = routeMode === "safest" ? "none" : "flex";
  if (safestRow) safestRow.style.display = routeMode === "fastest" ? "none" : "flex";
}

document.getElementById("swap-btn").addEventListener("click", () => {
  const tmpCoords = startCoords;
  startCoords = endCoords;
  endCoords = tmpCoords;

  const startInput = document.querySelector("#geocoder-start input");
  const endInput = document.querySelector("#geocoder-end input");
  const tmpVal = startInput.value;
  startInput.value = endInput.value;
  endInput.value = tmpVal;

  if (startCoords) startMarker.setLngLat(startCoords).addTo(map);
  if (endCoords)   endMarker.setLngLat(endCoords).addTo(map);

  getRoute();
});

/*--------------------------------------------------------------------
CLEAR ROUTES
--------------------------------------------------------------------*/

function clearRoutes() {
  ["fastest", "safest"].forEach(label => {
    if (map.getLayer("route-" + label)) map.removeLayer("route-" + label);
    if (map.getSource("route-" + label)) map.removeSource("route-" + label);
  });
}

/*--------------------------------------------------------------------
ROUTING
--------------------------------------------------------------------*/

let neighbourhoodData = null;

fetch("Neighbourhood_Crime_Rates.geojson")
  .then(res => res.json())
  .then(data => { neighbourhoodData = data; });

async function fetchWalkingRoute(coords) {
  const coordStr = coords.map(c => c.join(",")).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?overview=full&geometries=geojson&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.routes && data.routes[0] ? data.routes[0] : null;
}

function routeRiskPerKm(route) {
  const geojson = { type: "Feature", geometry: route.geometry };
  const buffer = turf.buffer(geojson, 0.05, { units: "kilometers" });
  const nearby = turf.pointsWithinPolygon(incidentsData, buffer);
  let risk = 0;
  nearby.features.forEach(f => { risk += Number(f.properties.weight); });
  return risk / (route.distance / 1000);
}

function crimeRateAt(lon, lat) {
  if (!neighbourhoodData) return 0;
  const pt = turf.point([lon, lat]);
  for (const f of neighbourhoodData.features) {
    if (turf.booleanPointInPolygon(pt, f)) {
      const p = f.properties;
      return (p.ASSAULT_RATE_2022 || 0) +
             (p.ROBBERY_RATE_2022 || 0) +
             (p.SHOOTING_RATE_2022 || 0) +
             (p.HOMICIDE_RATE_2022 || 0);
    }
  }
  return 0;
}

function generateWaypointCandidates() {
  // Sample points along the direct line at 25%, 50%, 75%
  // and offset them perpendicular at ±300m and ±600m
  const line = turf.lineString([startCoords, endCoords]);
  const totalDist = turf.length(line, { units: "kilometers" });

  const candidates = [];
  const offsets = [0.3, 0.6]; // km perpendicular offset
  const fractions = [0.25, 0.5, 0.75];

  fractions.forEach(frac => {
    const along = turf.along(line, totalDist * frac, { units: "kilometers" });
    const [lon, lat] = along.geometry.coordinates;

    // Perpendicular bearing
    const bearing = turf.bearing(turf.point(startCoords), turf.point(endCoords));
    const perpLeft  = (bearing - 90 + 360) % 360;
    const perpRight = (bearing + 90) % 360;

    offsets.forEach(dist => {
      [perpLeft, perpRight].forEach(bear => {
        const dest = turf.destination([lon, lat], dist, bear, { units: "kilometers" });
        candidates.push(dest.geometry.coordinates);
      });
    });
  });

  return candidates;
}

async function getRoute() {

  if (!startCoords || !endCoords) return;

  if (!incidentsData) {
    setStatus("Still loading incident data, please wait...");
    return;
  }

  clearRoutes();
  setStatus("Calculating routes...");
  document.getElementById("info").style.display = "none";

  let fastestRoute, safestRoute;

  try {
    // Fastest: direct route
    fastestRoute = await fetchWalkingRoute([startCoords, endCoords]);
    if (!fastestRoute) {
      setStatus("No route found between these locations.");
      return;
    }

    // Safest: try candidate waypoints, pick best within time budget
    const maxDuration = fastestRoute.duration * 1.4; // max 40% longer
    const candidates = generateWaypointCandidates();

    // Sort candidates by crime rate at that point (lowest first)
    candidates.sort((a, b) => crimeRateAt(a[0], a[1]) - crimeRateAt(b[0], b[1]));

    const fastRisk = routeRiskPerKm(fastestRoute);

    for (const waypoint of candidates.slice(0, 6)) {
      const detourRoute = await fetchWalkingRoute([startCoords, waypoint, endCoords]);
      if (!detourRoute) continue;
      if (detourRoute.duration > maxDuration) continue;

      const detourRisk = routeRiskPerKm(detourRoute);
      if (detourRisk < fastRisk * 0.9) { // at least 10% safer
        safestRoute = detourRoute;
        break;
      }
    }
  } catch (err) {
    setStatus("Failed to fetch routes. Check your connection.");
    return;
  }

  setStatus("");

  addRouteLayer("fastest", fastestRoute.geometry, "#1976d2");

  const fastestMin = Math.round(fastestRoute.duration / 60);
  document.getElementById("fastest-time").innerText = fastestMin + " min";

  if (safestRoute) {
    addRouteLayer("safest", safestRoute.geometry, "#388e3c");

    const safestMin = Math.round(safestRoute.duration / 60);
    const fastRisk = routeRiskPerKm(fastestRoute);
    const safeRisk = routeRiskPerKm(safestRoute);
    const reduction = Math.round((1 - safeRisk / fastRisk) * 100);

    document.getElementById("safest-row").style.display = "block";
    document.getElementById("same-route-note").style.display = "none";
    document.getElementById("safest-time").innerText = safestMin + " min";
    document.getElementById("safest-reduction").innerText =
      reduction > 0 ? reduction + "% fewer incidents near route" : "similar risk level";
  } else {
    document.getElementById("safest-row").style.display = "none";
    document.getElementById("same-route-note").style.display = "block";
  }

  document.getElementById("info").style.display = "block";
  applyRouteMode();
}

function addRouteLayer(label, geometry, color) {
  map.addSource("route-" + label, {
    type: "geojson",
    data: { type: "Feature", geometry }
  });
  map.addLayer({
    id: "route-" + label,
    type: "line",
    source: "route-" + label,
    paint: { "line-color": color, "line-width": 5, "line-opacity": 0.9 }
  });
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.innerText = msg;
  el.style.display = msg ? "block" : "none";
}
