/*--------------------------------------------------------------------
STRINGS
--------------------------------------------------------------------*/

const STRINGS = {
  startPlaceholder: "Enter start location",
  endPlaceholder:   "Enter destination",
  fastest:          "Fastest",
  safest:           "Safest",
  both:             "Both",
  min:              "min",
  fewerIncidents:   "% fewer incidents near route",
  similarRisk:      "Similar risk level",
  sameRoute:        "This is the fastest and safest route available.",
  calculating:      "Calculating routes…",
  noRoute:          "No route found between these locations.",
  loadingData:      "Still loading data, please wait…",
  safetyWarning:    "⚠️ Route passes through a high-crime area. Stay alert.",
  myLocation:       "My location",
  showingAll:       "Showing all areas",
  showingMod:       "Showing Moderate Risk and above",
  showingHigh:      "Showing High Risk and above",
  showingDanger:    "Showing Danger zones only",
};

function t(key) { return STRINGS[key] || key; }

/*--------------------------------------------------------------------
INITIALIZE MAP
--------------------------------------------------------------------*/

mapboxgl.accessToken =
  "pk.eyJ1IjoiamVzc2ljYWh1YW5nIiwiYSI6ImNtazNjNmdmeTBkN3AzZnEyZHRscHdod28ifQ.Pa9LhzBk1H75KBMwBngDjA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-79.36, 43.73],
  zoom: 10.2,
  bearing: -17,
  pitch: 0,
});

let incidentsData    = null;
let neighbourhoodData = null;
let cityAvgRate      = 700;   // updated once data loads

/*--------------------------------------------------------------------
WAIT FOR MAP + DATA BEFORE ADDING LAYERS
--------------------------------------------------------------------*/

const mapReady = new Promise(resolve => map.on("load", resolve));

const incidentsReady = fetch("https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/data/cleaned/toronto_incidents.geojson")
  .then(res => res.json())
  .then(data => { incidentsData = data; });

const neighbourhoodReady = fetch("https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/Neighbourhood_Crime_Rates.geojson")
  .then(res => res.json())
  .then(data => {
    neighbourhoodData = data;
    // compute city-wide average for tooltip comparison
    const rates = data.features.map(f => {
      const p = f.properties;
      return (p.ASSAULT_RATE_2022||0)+(p.ROBBERY_RATE_2022||0)+
             (p.SHOOTING_RATE_2022||0)+(p.HOMICIDE_RATE_2022||0);
    });
    cityAvgRate = rates.reduce((a,b)=>a+b,0) / rates.length;
  });

Promise.all([mapReady, incidentsReady, neighbourhoodReady]).then(initLayers);

/*--------------------------------------------------------------------
INIT LAYERS  (safe to call again after style switch)
--------------------------------------------------------------------*/

function initLayers() {

  /*-- NEIGHBOURHOOD CRIME CHOROPLETH --*/

  if (!map.getSource("neighbourhood_crime")) {
    map.addSource("neighbourhood_crime", {
      type: "geojson",
      data: neighbourhoodData,
      generateId: true,          // required for featureState hover
    });
  }

  // Helpers for rate expression (reused in both hover and normal paint)
  const rateExpr = ["+",
    ["coalesce", ["get", "ASSAULT_RATE_2022"],  0],
    ["coalesce", ["get", "ROBBERY_RATE_2022"],  0],
    ["coalesce", ["get", "SHOOTING_RATE_2022"], 0],
    ["coalesce", ["get", "HOMICIDE_RATE_2022"], 0]
  ];

  if (!map.getLayer("neighbourhood_crime")) {
    map.addLayer({
      id: "neighbourhood_crime",
      type: "fill",
      source: "neighbourhood_crime",
      paint: {
        // Hover: brighter, more saturated colours; normal: original palette
        "fill-color": [
          "case", ["boolean", ["feature-state", "hover"], false],
          ["interpolate", ["linear"], rateExpr,
            200,  "#8DC4A4",
            415,  "#6BAAA0",
            595,  "#D97F7D",
            807,  "#A84A4C",
            1008, "#861C23",
            3500, "#5A0A0D"
          ],
          ["interpolate", ["linear"], rateExpr,
            200,  "#DDEBE5",
            415,  "#C0D7C9",
            595,  "#DFB7B5",
            807,  "#BD7577",
            1008, "#A74249",
            3500, "#8B1E21"
          ]
        ],
        "fill-opacity": [
          "case", ["boolean", ["feature-state", "hover"], false],
          0.85,
          0.5
        ],
        "fill-outline-color": [
          "case", ["boolean", ["feature-state", "hover"], false],
          "#444444",
          "#cccccc"
        ],
      },
    });

    // --- Hover: featureState + floating tooltip ---
    let hoveredId = null;
    const tooltip = document.getElementById("hover-tooltip");

    // Metadata for each risk tier
    const LEVEL_META = {
      danger:   { label: "Danger",        bg: "#8B1E21", desc: "High crime area — exercise caution" },
      high:     { label: "High Risk",     bg: "#A74249", desc: "Higher crime area — take precautions" },
      moderate: { label: "Moderate Risk", bg: "#BD7577", desc: "Some crime activity — stay aware" },
      low:      { label: "Low Risk",      bg: "#6BAAA0", desc: "Relatively safe area" },
    };

    map.on("mousemove", "neighbourhood_crime", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!e.features.length) return;

      const feat = e.features[0];
      if (hoveredId !== null && hoveredId !== feat.id) {
        map.setFeatureState({ source: "neighbourhood_crime", id: hoveredId }, { hover: false });
      }
      hoveredId = feat.id;
      map.setFeatureState({ source: "neighbourhood_crime", id: hoveredId }, { hover: true });

      // Build tourist-friendly tooltip
      const p    = feat.properties;
      const rate = Math.round(
        (p.ASSAULT_RATE_2022  || 0) + (p.ROBBERY_RATE_2022  || 0) +
        (p.SHOOTING_RATE_2022 || 0) + (p.HOMICIDE_RATE_2022 || 0)
      );
      const key  = rate >= 1008 ? "danger" : rate >= 807 ? "high" : rate >= 595 ? "moderate" : "low";
      const meta = LEVEL_META[key];

      // How this area compares to city average
      const diff    = Math.abs(Math.round(((rate - cityAvgRate) / cityAvgRate) * 100));
      const compare = rate > cityAvgRate
        ? `${diff}% above city average`
        : rate < cityAvgRate
          ? `${diff}% below city average`
          : "At city average";

      document.getElementById("hover-name").textContent = p.AREA_NAME;

      const lvlEl = document.getElementById("hover-level");
      lvlEl.textContent      = meta.label;
      lvlEl.style.background = meta.bg;
      tooltip.style.borderLeftColor = meta.bg;

      document.getElementById("hover-desc").textContent    = meta.desc;
      document.getElementById("hover-compare").textContent = compare;

      // Position near cursor, flip left if near right edge
      const x    = e.originalEvent.clientX;
      const y    = e.originalEvent.clientY;
      const offX = x > window.innerWidth - 230 ? -215 : 15;
      tooltip.style.left    = (x + offX) + "px";
      tooltip.style.top     = (y - 10)   + "px";
      tooltip.style.display = "block";
    });

    map.on("mouseleave", "neighbourhood_crime", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState({ source: "neighbourhood_crime", id: hoveredId }, { hover: false });
        hoveredId = null;
      }
      tooltip.style.display = "none";
    });
  }

  /*-- POLICE STATIONS --*/

  if (!map.getSource("police_stations")) {
    map.addSource("police_stations", {
      type: "geojson",
      data: "https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/Construction%20Features/Police%20Facility%20Locations%20-%204326.geojson"
    });
  }

  if (!map.getLayer("police_stations")) {
    map.addLayer({
      id: "police_stations",
      type: "circle",
      source: "police_stations",
      paint: {
        "circle-radius": 6,
        "circle-color": "#1565c0",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9
      }
    });

    const policePopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

    map.on("mouseenter", "police_stations", (e) => {
      map.getCanvas().style.cursor = "pointer";
      policePopup.setLngLat(e.features[0].geometry.coordinates)
        .setHTML(`🚔 <b>${e.features[0].properties.FACILITY}</b>`)
        .addTo(map);
    });
    map.on("mouseleave", "police_stations", () => {
      map.getCanvas().style.cursor = "";
      policePopup.remove();
    });
  }

  /*--------------------------------------------------------------------
  TTC SUBWAY LINES
  --------------------------------------------------------------------*/

  if (!map.getSource("subway_lines")) {
    map.addSource("subway_lines", {
      type: "geojson",
      data: "Construction Features/TTC_SUBWAY_LINES_WGS84.geojson"
    });
  }

  if (!map.getLayer("subway_lines")) {
    map.addLayer({
      id: "subway_lines",
      type: "line",
      source: "subway_lines",
      layout: {
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {

        "line-color": [
          "match",
          ["get", "ROUTE_NAME"],

          "LINE 1 (YONGE-UNIVERSITY)", "#FFD100",   // Line 1 Yonge-University (yellow)
          "LINE 2 (BLOOR - DANFORTH)", "#00A651",   // Line 2 Bloor-Danforth (green)
          "LINE 3 (SCARBOROUGH)", "#0082C8",   // Line 3 Scarborough (blue)
          "LINE 4 (SHEPPARD)", "#A05EB5",   // Line 4 Sheppard (purple)

          "#FFD100"
        ],

        "line-width": 4,
        "line-opacity": 0.9
      }
    });
  }

  /*--------------------------------------------------------------------
  SUBWAY POPUP
  --------------------------------------------------------------------*/

  const subwayPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10
  });

  map.on("mouseenter", "subway_lines", (e) => {

    map.getCanvas().style.cursor = "pointer";

    const props = e.features[0].properties;

    const lineName = props.ROUTE_NAME || `Line ${props.LINE}`;

    subwayPopup
      .setLngLat(e.lngLat)
      .setHTML(`🚇 <b>${lineName}</b>`)
      .addTo(map);

  });

  map.on("mouseleave", "subway_lines", () => {

    map.getCanvas().style.cursor = "";
    subwayPopup.remove();

  });

}

/*--------------------------------------------------------------------
GEOCODER
--------------------------------------------------------------------*/

let startCoords = null;
let endCoords   = null;

const startGeocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  placeholder: t("startPlaceholder"),
  countries: "ca",
  bbox: [-79.6393, 43.581, -79.1156, 43.8555],
  types: "address,place,poi",
});

const endGeocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  placeholder: t("endPlaceholder"),
  countries: "ca",
  bbox: [-79.6393, 43.581, -79.1156, 43.8555],
  types: "address,place,poi",
});

document.getElementById("geocoder-start").appendChild(startGeocoder.onAdd(map));
document.getElementById("geocoder-end").appendChild(endGeocoder.onAdd(map));

// Custom markers
const startMarkerEl = document.createElement("div");
startMarkerEl.className = "custom-marker marker-start";
const endMarkerEl = document.createElement("div");
endMarkerEl.className = "custom-marker marker-end";

const startMarker = new mapboxgl.Marker({ element: startMarkerEl, anchor: "bottom" });
const endMarker   = new mapboxgl.Marker({ element: endMarkerEl,   anchor: "bottom" });

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
GPS BUTTON
--------------------------------------------------------------------*/

document.getElementById("gps-btn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      startCoords = [pos.coords.longitude, pos.coords.latitude];
      startMarker.setLngLat(startCoords).addTo(map);
      map.flyTo({ center: startCoords, zoom: Math.max(map.getZoom(), 14) });
      const input = document.querySelector("#geocoder-start input");
      if (input) input.value = t("myLocation");
      getRoute();
    },
    () => { alert("Could not retrieve your location. Please enable location services."); }
  );
});

/*--------------------------------------------------------------------
LANDMARKS
--------------------------------------------------------------------*/

document.querySelectorAll(".landmark-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    endCoords = [parseFloat(btn.dataset.lng), parseFloat(btn.dataset.lat)];
    endMarker.setLngLat(endCoords).addTo(map);
    const input = document.querySelector("#geocoder-end input");
    if (input) input.value = btn.textContent;
    map.flyTo({ center: endCoords, zoom: Math.max(map.getZoom(), 14) });
    getRoute();
  });
});

/*--------------------------------------------------------------------
POLICE STATION TOGGLE
--------------------------------------------------------------------*/

document.getElementById("police-toggle").addEventListener("change", (e) => {
  if (map.getLayer("police_stations")) {
    map.setLayoutProperty("police_stations", "visibility",
      e.target.checked ? "visible" : "none");
  }
});

/*--------------------------------------------------------------------
SUBWAY TOGGLE
--------------------------------------------------------------------*/

document.getElementById("subway-toggle").addEventListener("change", (e) => {
  if (map.getLayer("subway_lines")) {
    map.setLayoutProperty(
      "subway_lines",
      "visibility",
      e.target.checked ? "visible" : "none"
    );
  }
});

/*--------------------------------------------------------------------
ROUTE MODE TOGGLE
--------------------------------------------------------------------*/

let routeMode = "both";

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
  const safestRow  = document.getElementById("safest-row");
  if (fastestRow) fastestRow.style.display = routeMode === "safest"  ? "none" : "flex";
  if (safestRow)  safestRow.style.display  = routeMode === "fastest" ? "none" : "flex";
}

document.getElementById("swap-btn").addEventListener("click", () => {
  const tmpCoords = startCoords;
  startCoords = endCoords;
  endCoords   = tmpCoords;

  const startInput = document.querySelector("#geocoder-start input");
  const endInput   = document.querySelector("#geocoder-end input");
  const tmpVal = startInput.value;
  startInput.value = endInput.value;
  endInput.value   = tmpVal;

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
  document.getElementById("route-toggle").style.display = "none";
}

/*--------------------------------------------------------------------
ROUTING
--------------------------------------------------------------------*/

async function fetchWalkingRoute(coords) {
  const coordStr = coords.map(c => c.join(",")).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?overview=full&geometries=geojson&access_token=${mapboxgl.accessToken}`;
  const res  = await fetch(url);
  const data = await res.json();
  return data.routes && data.routes[0] ? data.routes[0] : null;
}

function routeRiskPerKm(route) {
  const geojson = { type: "Feature", geometry: route.geometry };
  const buffer  = turf.buffer(geojson, 0.05, { units: "kilometers" });
  const nearby  = turf.pointsWithinPolygon(incidentsData, buffer);
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
      return (p.ASSAULT_RATE_2022 || 0) + (p.ROBBERY_RATE_2022 || 0) +
             (p.SHOOTING_RATE_2022 || 0) + (p.HOMICIDE_RATE_2022 || 0);
    }
  }
  return 0;
}

// Returns true if the route passes through any neighbourhood with combined rate > 807 (High)
function routePassesThroughHighCrime(route) {
  if (!neighbourhoodData) return false;
  const line = turf.lineString(route.geometry.coordinates);
  const len  = turf.length(line, { units: "kilometers" });
  const steps = Math.max(Math.ceil(len / 0.2), 5);
  for (let i = 0; i <= steps; i++) {
    const dist = (i / steps) * len;
    const pt   = turf.along(line, dist, { units: "kilometers" });
    if (crimeRateAt(...pt.geometry.coordinates) > 807) return true;
  }
  return false;
}

function generateWaypointCandidates() {
  const line      = turf.lineString([startCoords, endCoords]);
  const totalDist = turf.length(line, { units: "kilometers" });
  const candidates = [];
  const offsets    = [0.3, 0.6];
  const fractions  = [0.25, 0.5, 0.75];
  const bearing    = turf.bearing(turf.point(startCoords), turf.point(endCoords));

  fractions.forEach(frac => {
    const along = turf.along(line, totalDist * frac, { units: "kilometers" });
    const [lon, lat] = along.geometry.coordinates;
    offsets.forEach(dist => {
      [(bearing - 90 + 360) % 360, (bearing + 90) % 360].forEach(bear => {
        const dest = turf.destination([lon, lat], dist, bear, { units: "kilometers" });
        candidates.push(dest.geometry.coordinates);
      });
    });
  });

  return candidates;
}

async function getRoute() {
  if (!startCoords || !endCoords) return;
  if (!incidentsData) { setStatus(t("loadingData")); return; }

  clearRoutes();
  setStatus(t("calculating"));
  document.getElementById("info").style.display = "none";
  document.getElementById("safety-warning").style.display = "none";

  let allRoutes = [];

  try {
    // Fetch direct route + all waypoint routes in parallel
    const directRoute = await fetchWalkingRoute([startCoords, endCoords]);
    if (!directRoute) { setStatus(t("noRoute")); return; }
    allRoutes.push(directRoute);

    const waypointCandidates = generateWaypointCandidates();
    const waypointRoutes = await Promise.all(
      waypointCandidates.map(wp =>
        fetchWalkingRoute([startCoords, wp, endCoords]).catch(() => null)
      )
    );
    waypointRoutes.forEach(r => { if (r) allRoutes.push(r); });
  } catch {
    setStatus("Failed to fetch routes. Check your connection.");
    return;
  }

  // Fastest = minimum duration across all candidates
  const fastestRoute = allRoutes.reduce((a, b) => a.duration <= b.duration ? a : b);

  // Safest = minimum risk/km, restricted to routes within 140% of fastest duration
  const maxDuration = fastestRoute.duration * 1.4;
  const safetyPool  = allRoutes.filter(r => r.duration <= maxDuration);
  const safestRoute = safetyPool.reduce((a, b) =>
    routeRiskPerKm(a) <= routeRiskPerKm(b) ? a : b
  );

  // Same route if duration matches (within 5 seconds)
  const isSameRoute = Math.abs(fastestRoute.duration - safestRoute.duration) < 5;

  setStatus("");

  addRouteLayer("fastest", fastestRoute.geometry, "#42ccc5");
  document.getElementById("fastest-time").innerText =
    Math.round(fastestRoute.duration / 60) + " " + t("min");

  if (!isSameRoute) {
    addRouteLayer("safest", safestRoute.geometry, "#3cd649");
    const fastRisk  = routeRiskPerKm(fastestRoute);
    const safeRisk  = routeRiskPerKm(safestRoute);
    const reduction = Math.round((1 - safeRisk / fastRisk) * 100);

    document.getElementById("safest-row").style.display = "flex";
    document.getElementById("same-route-note").style.display = "none";
    document.getElementById("safest-time").innerText =
      Math.round(safestRoute.duration / 60) + " " + t("min");
    document.getElementById("safest-reduction").innerText =
      reduction > 0 ? reduction + t("fewerIncidents") : t("similarRisk");
  } else {
    document.getElementById("safest-row").style.display = "none";
    document.getElementById("same-route-note").style.display = "block";
    document.getElementById("same-route-note").textContent = t("sameRoute");
  }

  // Safety warning if best safe route still goes through high-crime area
  if (routePassesThroughHighCrime(isSameRoute ? fastestRoute : safestRoute)) {
    const warn = document.getElementById("safety-warning");
    warn.textContent = t("safetyWarning");
    warn.style.display = "block";
  }

  document.getElementById("info").style.display = "block";
  document.getElementById("route-toggle").style.display = "flex";
  applyRouteMode();

  // Fit map to show full routes
  const bounds = new mapboxgl.LngLatBounds();
  fastestRoute.geometry.coordinates.forEach(c => bounds.extend(c));
  if (!isSameRoute) safestRoute.geometry.coordinates.forEach(c => bounds.extend(c));
  map.fitBounds(bounds, { padding: 80 });
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

/*--------------------------------------------------------------------
RISK LEVEL SLIDER
--------------------------------------------------------------------*/

const RISK_THRESHOLDS  = [0, 595, 807, 1008];
const RISK_LABEL_KEYS  = ["showingAll", "showingMod", "showingHigh", "showingDanger"];

const rateFilterExpr = ["+",
  ["coalesce", ["get", "ASSAULT_RATE_2022"],  0],
  ["coalesce", ["get", "ROBBERY_RATE_2022"],  0],
  ["coalesce", ["get", "SHOOTING_RATE_2022"], 0],
  ["coalesce", ["get", "HOMICIDE_RATE_2022"], 0]
];

document.getElementById("risk-slider").addEventListener("input", (e) => {
  const idx       = parseInt(e.target.value);
  const threshold = RISK_THRESHOLDS[idx];
  document.getElementById("risk-slider-label").textContent = t(RISK_LABEL_KEYS[idx]);

  if (map.getLayer("neighbourhood_crime")) {
    map.setFilter("neighbourhood_crime",
      threshold === 0 ? null : [">=", rateFilterExpr, threshold]
    );
  }
});
