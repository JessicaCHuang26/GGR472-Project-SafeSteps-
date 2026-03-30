/*--------------------------------------------------------------------
STRINGS
--------------------------------------------------------------------*/

const STRINGS = {
  startPlaceholder: "Enter start location",
  endPlaceholder: "Enter destination",
  fastest: "Fastest",
  safest: "Safest",
  both: "Both",
  min: "min",
  fewerIncidents: "% fewer incidents near route",
  similarRisk: "Similar risk level",
  sameRoute: "This is the fastest and safest route available.",
  calculating: "Calculating routes…",
  noRoute: "No route found between these locations.",
  loadingData: "Still loading data, please wait…",
  safetyWarning: "Route passes through a high-crime area. Stay alert.",
  myLocation: "My location",
  showingAll: "Showing all areas",
  showingMod: "Showing Moderate Risk and above",
  showingHigh: "Showing High Risk and above",
  showingDanger: "Showing Danger zones only",
};

function t(key) {
  return STRINGS[key] || key;
}

/*--------------------------------------------------------------------
INITIALIZE MAP
--------------------------------------------------------------------*/

mapboxgl.accessToken =
  "pk.eyJ1IjoiamVzc2ljYWh1YW5nIiwiYSI6ImNtazNjNmdmeTBkN3AzZnEyZHRscHdod28ifQ.Pa9LhzBk1H75KBMwBngDjA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  center: [-79.42, 43.72],
  zoom: 10.2,
  bearing: -17,
  pitch: 0,
});

// Navigation controls (zoom +/-)
map.addControl(
  new mapboxgl.NavigationControl({ showCompass: false }),
  "bottom-right",
);

// Geolocate control (crosshair locate button)
const geolocate = new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: false,
  showUserLocation: false,
  showUserHeadingIndicator: false,
  showAccuracyCircle: false,
});
map.addControl(geolocate, "bottom-right");
geolocate.on("geolocate", (e) => {
  startCoords = [e.coords.longitude, e.coords.latitude];
  startMarker.setLngLat(startCoords).addTo(map);
  const input = document.querySelector("#geocoder-start input");
  if (input) input.value = t("myLocation");
  getRoute();
});

// ------------------------------------------------------------------
// Global data state
// - incidentsData: loaded full incident dataset (all years)
// - filteredIncidentsData: subset for currently selected year
// - neighbourhoodData: crime rates for neighbourhood boundaries
// - cityAvgRate: computed from neighbourhood dataset (for tooltip comparison)
// - selectedYear: year selected by slider (default 2022)
//
// These variables are used across routing + layer rendering logic.
// ------------------------------------------------------------------
let incidentsData = null;
let filteredIncidentsData = null;
let neighbourhoodData = null;
let cityAvgRate = 700;
let selectedYear = 2022;

// Shared style calculation for neighbourhood crime rate; one source-of-truth
const CRIME_RATE_EXPR = [
  "+",
  ["coalesce", ["get", "ASSAULT_RATE_2022"], 0],
  ["coalesce", ["get", "ROBBERY_RATE_2022"], 0],
  ["coalesce", ["get", "SHOOTING_RATE_2022"], 0],
  ["coalesce", ["get", "HOMICIDE_RATE_2022"], 0],
];

function setLayerVisibility(layerId, isVisible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
}

/*--------------------------------------------------------------------
WAIT FOR MAP + DATA BEFORE ADDING LAYERS
--------------------------------------------------------------------*/

const mapReady = new Promise((resolve) => map.on("load", resolve));

const incidentsReady = fetch(
  "https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/data/cleaned/toronto_incidents_by_year.geojson",
)
  .then((res) => {
    if (!res.ok) throw new Error(`Incident file failed to load: ${res.status}`);
    return res.json();
  })
  .then((data) => {
    incidentsData = data;
    updateIncidentYear(selectedYear);
    console.log("Incident data loaded:", incidentsData.features.length);
  })
  .catch((err) => {
    console.error("Incident fetch error:", err);
    setStatus("Incident data failed to load.");
  });

const neighbourhoodReady = fetch(
  "https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/Neighbourhood_Crime_Rates.geojson",
)
  .then((res) => res.json())
  .then((data) => {
    neighbourhoodData = data;
    // compute city-wide average for tooltip comparison
    const rates = data.features.map((f) => {
      const p = f.properties;
      return (
        (p.ASSAULT_RATE_2022 || 0) +
        (p.ROBBERY_RATE_2022 || 0) +
        (p.SHOOTING_RATE_2022 || 0) +
        (p.HOMICIDE_RATE_2022 || 0)
      );
    });
    cityAvgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  });

Promise.all([mapReady, incidentsReady, neighbourhoodReady]).then(initLayers);

/*--------------------------------------------------------------------
INIT LAYERS (safe to call again after style switch)
  - Add neighbourhood crime choropleth with hover tooltips
  - Add police station points and subway lines layers
  - Keep each map source/layer addition idempotent (guard map.getSource/map.getLayer)
--------------------------------------------------------------------*/

function initLayers() {
  /*-- NEIGHBOURHOOD CRIME CHOROPLETH --*/

  if (!map.getSource("neighbourhood_crime")) {
    map.addSource("neighbourhood_crime", {
      type: "geojson",
      data: neighbourhoodData,
      generateId: true, // required for featureState hover
    });
  }

  if (!map.getLayer("neighbourhood_crime")) {
    map.addLayer({
      id: "neighbourhood_crime",
      type: "fill",
      source: "neighbourhood_crime",
      paint: {
        // Hover: brighter, more saturated colours; normal: original palette
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          // Hover: saturated yellow → orange → red
          [
            "interpolate",
            ["linear"],
            CRIME_RATE_EXPR,
            200,
            "#FFE566",
            415,
            "#FFB300",
            595,
            "#FF6F00",
            807,
            "#E53935",
            1008,
            "#B71C1C",
            3500,
            "#7B1818",
          ],
          // Normal: soft yellow → orange → red
          [
            "interpolate",
            ["linear"],
            CRIME_RATE_EXPR,
            200,
            "#FFFDE7",
            415,
            "#FFE082",
            595,
            "#FFB74D",
            807,
            "#EF5350",
            1008,
            "#C62828",
            3500,
            "#7B1818",
          ],
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.8,
          0.38,
        ],
        "fill-outline-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          "#444444",
          "#cccccc",
        ],
      },
    });

    // --- Hover: featureState + floating tooltip ---
    let hoveredId = null;
    const tooltip = document.getElementById("hover-tooltip");

    // Metadata for each risk tier
    const LEVEL_META = {
      danger: {
        label: "Danger",
        bg: "#B71C1C",
        desc: "High crime area — exercise caution",
      },
      high: {
        label: "High Risk",
        bg: "#E53935",
        desc: "Higher crime area — take precautions",
      },
      moderate: {
        label: "Moderate Risk",
        bg: "#FF8F00",
        desc: "Some crime activity — stay aware",
      },
      low: { label: "Low Risk", bg: "#F9A825", desc: "Relatively safe area" },
    };

    map.on("mousemove", "neighbourhood_crime", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!e.features.length) return;

      const feat = e.features[0];
      if (hoveredId !== null && hoveredId !== feat.id) {
        map.setFeatureState(
          { source: "neighbourhood_crime", id: hoveredId },
          { hover: false },
        );
      }
      hoveredId = feat.id;
      map.setFeatureState(
        { source: "neighbourhood_crime", id: hoveredId },
        { hover: true },
      );

      // Build tourist-friendly tooltip
      const p = feat.properties;
      const rate = Math.round(
        (p.ASSAULT_RATE_2022 || 0) +
          (p.ROBBERY_RATE_2022 || 0) +
          (p.SHOOTING_RATE_2022 || 0) +
          (p.HOMICIDE_RATE_2022 || 0),
      );
      const key =
        rate >= 1008
          ? "danger"
          : rate >= 807
            ? "high"
            : rate >= 595
              ? "moderate"
              : "low";
      const meta = LEVEL_META[key];

      // How this area compares to city average
      const diff = Math.abs(
        Math.round(((rate - cityAvgRate) / cityAvgRate) * 100),
      );
      const compare =
        rate > cityAvgRate
          ? `${diff}% above city average`
          : rate < cityAvgRate
            ? `${diff}% below city average`
            : "At city average";

      document.getElementById("hover-name").textContent = p.AREA_NAME;

      const lvlEl = document.getElementById("hover-level");
      lvlEl.textContent = meta.label;
      lvlEl.style.background = meta.bg;
      tooltip.style.borderLeftColor = meta.bg;

      document.getElementById("hover-desc").textContent = meta.desc;
      document.getElementById("hover-compare").textContent = compare;

      // Position near cursor, flip left if near right edge
      const x = e.originalEvent.clientX;
      const y = e.originalEvent.clientY;
      const offX = x > window.innerWidth - 230 ? -215 : 15;
      tooltip.style.left = x + offX + "px";
      tooltip.style.top = y - 10 + "px";
      tooltip.style.display = "block";
    });

    map.on("mouseleave", "neighbourhood_crime", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: "neighbourhood_crime", id: hoveredId },
          { hover: false },
        );
        hoveredId = null;
      }
      tooltip.style.display = "none";
    });
  }

  /*-- POLICE STATIONS --*/

  if (!map.getSource("police_stations")) {
    map.addSource("police_stations", {
      type: "geojson",
      data: "https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/Construction%20Features/Police%20Facility%20Locations%20-%204326.geojson",
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
        "circle-opacity": 0.9,
      },
    });

    const policePopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });

    map.on("mouseenter", "police_stations", (e) => {
      map.getCanvas().style.cursor = "pointer";
      policePopup
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML(`<b>${e.features[0].properties.FACILITY} Police Station</b>`)
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
      data: "Construction Features/TTC_SUBWAY_LINES_WGS84.geojson",
    });
  }

  if (!map.getLayer("subway_lines_casing")) {
    map.addLayer({
      id: "subway_lines_casing",
      type: "line",
      source: "subway_lines",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": 8,
        "line-opacity": 1.0,
      },
    });
  }

  if (!map.getLayer("subway_lines")) {
    const lineColorExpr = [
      "match",
      ["get", "ROUTE_NAME"],
      "LINE 1 (YONGE-UNIVERSITY)",
      "#FFD100",
      "LINE 2 (BLOOR - DANFORTH)",
      "#00A651",
      "LINE 3 (SCARBOROUGH)",
      "#0082C8",
      "LINE 4 (SHEPPARD)",
      "#A05EB5",
      "#FFD100",
    ];
    map.addLayer({
      id: "subway_lines",
      type: "line",
      source: "subway_lines",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": lineColorExpr,
        "line-width": 4,
        "line-opacity": 1.0,
      },
    });
  }

  /*--------------------------------------------------------------------
  SUBWAY POPUP
  --------------------------------------------------------------------*/

  const subwayPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10,
  });

  map.on("mouseenter", "subway_lines", (e) => {
    map.getCanvas().style.cursor = "pointer";

    const props = e.features[0].properties;

    const lineName = props.ROUTE_NAME || `Line ${props.LINE}`;

    subwayPopup.setLngLat(e.lngLat).setHTML(`🚇 <b>${lineName}</b>`).addTo(map);
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
let endCoords = null;

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

// Custom Google Maps–style pin markers
function makePinEl(color, label) {
  const el = document.createElement("div");
  el.style.cssText =
    "cursor:pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));";
  el.innerHTML = `
    <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10.667 16 28 16 28S32 26.667 32 16C32 7.163 24.837 0 16 0z"
            fill="${color}"/>
      <circle cx="16" cy="16" r="7" fill="white"/>
      <text x="16" y="20" text-anchor="middle"
            font-size="9" font-weight="700" font-family="-apple-system,sans-serif"
            fill="${color}">${label}</text>
    </svg>`;
  return el;
}

const startMarker = new mapboxgl.Marker({
  element: makePinEl("#34a853", ""),
  anchor: "bottom",
});
const endMarker = new mapboxgl.Marker({
  element: makePinEl("#ea4335", ""),
  anchor: "bottom",
});

/*--------------------------------------------------------------------
RECENT SEARCHES
--------------------------------------------------------------------*/

const RECENT_KEY = "safesteps_recent";
const RECENT_MAX = 5;

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecentSearch(name, coords) {
  if (!name || name === t("myLocation")) return;
  let list = getRecentSearches().filter((r) => r.name !== name);
  list.unshift({ name, coords });
  if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function showRecentDropdown(inputEl, onSelect) {
  removeRecentDropdown();
  const list = getRecentSearches();
  if (!list.length) return;

  const drop = document.createElement("div");
  drop.id = "recent-dropdown";
  drop.innerHTML =
    `<div class="recent-label">Recent</div>` +
    list
      .map(
        (r, i) =>
          `<div class="recent-item" data-i="${i}">
        <span class="recent-name">${r.name}</span>
      </div>`,
      )
      .join("");

  // Position below the input, but below Mapbox suggestions (z-index 9999) so the two lists do not overlap messily.
  const rect = inputEl.getBoundingClientRect();
  drop.style.cssText = `
    position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;
    width:${rect.width}px;z-index:9000;
  `;

  drop.querySelectorAll(".recent-item").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const item = list[parseInt(el.dataset.i)];
      inputEl.value = item.name.trim();
      onSelect(item.name, item.coords);
      removeRecentDropdown();
    });
  });

  document.body.appendChild(drop);
}

function removeRecentDropdown() {
  const existing = document.getElementById("recent-dropdown");
  if (existing) existing.remove();
}

function attachRecentSearch(geocoderId, onSelect) {
  // Wait for geocoder to render its input
  setTimeout(() => {
    const input = document.querySelector(`#${geocoderId} input`);
    if (!input) return;
    input.addEventListener("focus", () => showRecentDropdown(input, onSelect));
    input.addEventListener("input", () => {
      // Keep recent history visible while input is empty; close once user starts typing.
      // This avoids premature hide due to Mapbox internal updates.
      if (input.value.trim() !== "") {
        removeRecentDropdown();
      }
    });
    input.addEventListener("blur", () => setTimeout(removeRecentDropdown, 150));
  }, 500);
}

attachRecentSearch("geocoder-start", (name, coords) => {
  startCoords = coords;
  startMarker.setLngLat(coords).addTo(map);
  map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

attachRecentSearch("geocoder-end", (name, coords) => {
  endCoords = coords;
  endMarker.setLngLat(coords).addTo(map);
  map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

startGeocoder.on("result", (e) => {
  startCoords = e.result.center;
  saveRecentSearch(
    e.result.place_name?.split(",")[0] || e.result.text,
    startCoords,
  );
  startMarker.setLngLat(startCoords).addTo(map);
  map.flyTo({ center: startCoords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

endGeocoder.on("result", (e) => {
  endCoords = e.result.center;
  saveRecentSearch(
    e.result.place_name?.split(",")[0] || e.result.text,
    endCoords,
  );
  endMarker.setLngLat(endCoords).addTo(map);
  map.flyTo({ center: endCoords, zoom: Math.max(map.getZoom(), 13) });
  getRoute();
});

/*--------------------------------------------------------------------
GPS BUTTON (panel button kept for accessibility)
--------------------------------------------------------------------*/

document.getElementById("gps-btn").addEventListener("click", () => {
  geolocate.trigger();
});

/*--------------------------------------------------------------------
LANDMARKS
--------------------------------------------------------------------*/

document.querySelectorAll(".landmark-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    endCoords = [parseFloat(btn.dataset.lng), parseFloat(btn.dataset.lat)];
    endMarker.setLngLat(endCoords).addTo(map);
    const input = document.querySelector("#geocoder-end input");
    if (input) input.value = btn.textContent.trim();
    map.flyTo({ center: endCoords, zoom: Math.max(map.getZoom(), 14) });
    getRoute();
  });
});

/*--------------------------------------------------------------------
POLICE STATION TOGGLE
--------------------------------------------------------------------*/

document.getElementById("police-toggle").addEventListener("change", (e) => {
  setLayerVisibility("police_stations", e.target.checked);
});

/*--------------------------------------------------------------------
SUBWAY TOGGLE
--------------------------------------------------------------------*/

document.getElementById("subway-toggle").addEventListener("change", (e) => {
  setLayerVisibility("subway_lines", e.target.checked);
  setLayerVisibility("subway_lines_casing", e.target.checked);
});

/*--------------------------------------------------------------------
ROUTE MODE TOGGLE
--------------------------------------------------------------------*/

let routeMode = "both";

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    routeMode = btn.dataset.mode;
    document
      .querySelectorAll(".toggle-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyRouteMode();
  });
});

function applyRouteMode() {
  ["fastest", "safest"].forEach((label) => {
    const vis =
      (label === "fastest" && routeMode === "safest") ||
      (label === "safest" && routeMode === "fastest")
        ? "none"
        : "visible";
    setLayerVisibility("route-" + label, vis === "visible");
    setLayerVisibility("route-" + label + "-glow", vis === "visible");
  });
  const fastestRow = document.getElementById("fastest-row");
  const safestRow = document.getElementById("safest-row");
  if (fastestRow) {
    fastestRow.style.display = routeMode === "safest" ? "none" : "flex";
    fastestRow.classList.toggle("active-route", routeMode === "fastest");
  }
  if (safestRow) {
    safestRow.style.display = routeMode === "fastest" ? "none" : "flex";
    safestRow.classList.toggle("active-route", routeMode === "safest");
  }
}

// Click on route row to toggle showing only that route
document.getElementById("fastest-row").addEventListener("click", () => {
  routeMode = routeMode === "fastest" ? "both" : "fastest";
  document.querySelectorAll(".toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === routeMode);
  });
  applyRouteMode();
});

document.getElementById("safest-row").addEventListener("click", () => {
  routeMode = routeMode === "safest" ? "both" : "safest";
  document.querySelectorAll(".toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === routeMode);
  });
  applyRouteMode();
});

/*--------------------------------------------------------------------
COLLAPSIBLE PANELS
--------------------------------------------------------------------*/

function initCollapsible(headerId, bodyId, openDisplay) {
  const header = document.getElementById(headerId);
  const body = document.getElementById(bodyId) || header?.nextElementSibling;
  if (!header || !body) return;
  header.addEventListener("click", () => {
    const isOpen = body.style.display !== "none";
    body.style.display = isOpen ? "none" : openDisplay || "block";
    header.classList.toggle("open", !isOpen);
  });
}

initCollapsible("landmarks-toggle", "landmarks-grid", "flex");
initCollapsible("layers-toggle", "layers-body", "block");

// Expand Popular Destinations when search is focused
setTimeout(() => {
  document
    .querySelectorAll("#geocoder-start input, #geocoder-end input")
    .forEach((inp) => {
      inp.addEventListener("focus", () => {
        const grid = document.getElementById("landmarks-grid");
        const toggle = document.getElementById("landmarks-toggle");
        if (grid && grid.style.display === "none") {
          grid.style.display = "flex";
          toggle?.classList.add("open");
        }
      });
    });
}, 600);

/*--------------------------------------------------------------------
SWAP DESTINATION/ORIGIN
--------------------------------------------------------------------*/

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
  if (endCoords) endMarker.setLngLat(endCoords).addTo(map);

  getRoute();
});

/*--------------------------------------------------------------------
CLEAR ROUTES
--------------------------------------------------------------------*/

function clearRoutes() {
  ["fastest", "safest"].forEach((label) => {
    if (map.getLayer("route-" + label + "-glow"))
      map.removeLayer("route-" + label + "-glow");
    if (map.getLayer("route-" + label)) map.removeLayer("route-" + label);
    if (map.getSource("route-" + label)) map.removeSource("route-" + label);
  });
  document.getElementById("route-panel").style.display = "none";
}

/*--------------------------------------------------------------------
ROUTING
--------------------------------------------------------------------*/

async function fetchWalkingRoute(coords) {
  const coordStr = coords.map((c) => c.join(",")).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?overview=full&geometries=geojson&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.routes && data.routes[0] ? data.routes[0] : null;
}

// Compute normalized risk score for a route in incidents per km.
// - Convert route geometry to a polygon buffer (50m) to capture nearby incidents
// - Count incident weights inside buffered area
// - Divide by route length in km to normalize across distances
function routeRiskPerKm(route) {
  const geojson = { type: "Feature", geometry: route.geometry };
  const buffer = turf.buffer(geojson, 0.05, { units: "kilometers" });

  const yearlyIncidents = getIncidentDataForCurrentYear();
  const nearby = turf.pointsWithinPolygon(yearlyIncidents, buffer);

  let risk = 0;
  nearby.features.forEach((f) => {
    risk += Number(f.properties.weight);
  });
  console.log(
    "Scoring using year:",
    selectedYear,
    "filtered incidents:",
    filteredIncidentsData.features.length,
  );

  return risk / (route.distance / 1000);
}

// Return combined risk rate for the neighbourhood containing the point.
// This is used for route high-crime warning checks.
function crimeRateAt(lon, lat) {
  if (!neighbourhoodData) return 0;
  const pt = turf.point([lon, lat]);
  for (const f of neighbourhoodData.features) {
    if (turf.booleanPointInPolygon(pt, f)) {
      const p = f.properties;
      return (
        (p.ASSAULT_RATE_2022 || 0) +
        (p.ROBBERY_RATE_2022 || 0) +
        (p.SHOOTING_RATE_2022 || 0) +
        (p.HOMICIDE_RATE_2022 || 0)
      );
    }
  }
  return 0;
}

// Returns true if the route passes through any neighbourhood classified as High risk.
// This performs uniformly spaced sampling along route geometry to avoid expensive curve checks.
function routePassesThroughHighCrime(route) {
  if (!neighbourhoodData) return false;
  const line = turf.lineString(route.geometry.coordinates);
  const len = turf.length(line, { units: "kilometers" });
  const steps = Math.max(Math.ceil(len / 0.2), 5);
  for (let i = 0; i <= steps; i++) {
    const dist = (i / steps) * len;
    const pt = turf.along(line, dist, { units: "kilometers" });
    if (crimeRateAt(...pt.geometry.coordinates) > 807) return true;
  }
  return false;
}

function generateWaypointCandidates() {
  const line = turf.lineString([startCoords, endCoords]);
  const totalDist = turf.length(line, { units: "kilometers" });
  const bearing = turf.bearing(turf.point(startCoords), turf.point(endCoords));
  const offset = Math.min(0.4, totalDist * 0.15); // scale offset with route length

  // Only try midpoint, offset left and right — 2 candidates total
  const mid = turf.along(line, totalDist * 0.5, { units: "kilometers" });
  const [lon, lat] = mid.geometry.coordinates;

  return [
    turf.destination([lon, lat], offset, (bearing - 90 + 360) % 360, {
      units: "kilometers",
    }).geometry.coordinates,
    turf.destination([lon, lat], offset, (bearing + 90) % 360, {
      units: "kilometers",
    }).geometry.coordinates,
  ];
}

function updateIncidentYear(year) {
  selectedYear = Number(year);

  if (!incidentsData || !incidentsData.features) {
    filteredIncidentsData = null;
    return;
  }

  // Filter incidents for the selected year and onwards (e.g., 2023 includes 2023 + 2024)
  filteredIncidentsData = {
    type: "FeatureCollection",
    features: incidentsData.features.filter(
      (f) => Number(f.properties.year) >= selectedYear,
    ),
  };

  // Update UI label to show year range
  const yearValue = document.getElementById("year-value");
  if (yearValue) {
    yearValue.textContent = `${selectedYear} to 2024`;
  }

  console.log(
    `Year range ${selectedYear}-2024: ${filteredIncidentsData.features.length} incidents`,
  );
}

function getIncidentDataForCurrentYear() {
  return filteredIncidentsData || incidentsData;
}

// Main route resolution pipeline triggered when user selects both origin and destination.
// Steps:
// 1) fetch direct and additional waypoint-routed alternatives
// 2) choose fastest and safest candidate within 40% time buffer
// 3) render route lines and UI summary
// 4) apply safety flag for high-crime neighbourhoods
async function getRoute() {
  if (!startCoords || !endCoords) return;

  if (!incidentsData) {
    setStatus("Incident data file has not loaded yet.");
    return;
  }

  if (!filteredIncidentsData) {
    setStatus("Filtered incident data is not ready yet.");
    return;
  }

  if (!filteredIncidentsData.features.length) {
    setStatus(`No incident records found for ${selectedYear}.`);
    return;
  }

  clearRoutes();
  setStatus(t("calculating"));
  document.getElementById("info").style.display = "none";
  document.getElementById("safety-warning").style.display = "none";

  let allRoutes = [];

  try {
    const directRoute = await fetchWalkingRoute([startCoords, endCoords]);
    if (!directRoute) {
      setStatus(t("noRoute"));
      return;
    }
    allRoutes.push(directRoute);

    const waypointCandidates = generateWaypointCandidates();
    const waypointRoutes = await Promise.all(
      waypointCandidates.map((wp) =>
        fetchWalkingRoute([startCoords, wp, endCoords]).catch(() => null),
      ),
    );

    waypointRoutes.forEach((r) => {
      if (r) allRoutes.push(r);
    });
  } catch {
    setStatus("Failed to fetch routes. Check your connection.");
    return;
  }

  const fastestRoute = allRoutes.reduce((a, b) =>
    a.duration <= b.duration ? a : b,
  );

  const maxDuration = fastestRoute.duration * 1.4;
  const safetyPool = allRoutes.filter((r) => r.duration <= maxDuration);
  const safestRoute = safetyPool.reduce((a, b) =>
    routeRiskPerKm(a) <= routeRiskPerKm(b) ? a : b,
  );

  const isSameRoute =
    Math.abs(fastestRoute.duration - safestRoute.duration) < 5;

  setStatus("");

  addRouteLayer("fastest", fastestRoute.geometry, "#42ccc5");
  document.getElementById("fastest-time").innerText =
    Math.round(fastestRoute.duration / 60) + " " + t("min");

  if (!isSameRoute) {
    addRouteLayer("safest", safestRoute.geometry, "#3cd649");
    const fastRisk = routeRiskPerKm(fastestRoute);
    const safeRisk = routeRiskPerKm(safestRoute);
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

  if (routePassesThroughHighCrime(isSameRoute ? fastestRoute : safestRoute)) {
    const warn = document.getElementById("safety-warning");
    warn.textContent = t("safetyWarning");
    warn.style.display = "block";
  }

  document.getElementById("info").style.display = "block";
  document.getElementById("route-panel").style.display = "flex";
  applyRouteMode();

  const bounds = new mapboxgl.LngLatBounds();
  fastestRoute.geometry.coordinates.forEach((c) => bounds.extend(c));
  if (!isSameRoute) {
    safestRoute.geometry.coordinates.forEach((c) => bounds.extend(c));
  }
  map.fitBounds(bounds, { padding: 80 });
}

// Add route display layers for a given route direction (fastest/safest).
// Renders both a glow underlay and a crisp main path.
function addRouteLayer(label, geometry, color) {
  map.addSource("route-" + label, {
    type: "geojson",
    data: { type: "Feature", geometry },
  });
  // Glow layer (wide + blurred)
  map.addLayer({
    id: "route-" + label + "-glow",
    type: "line",
    source: "route-" + label,
    paint: {
      "line-color": color,
      "line-width": 14,
      "line-opacity": 0.25,
      "line-blur": 6,
    },
  });
  // Main route line
  map.addLayer({
    id: "route-" + label,
    type: "line",
    source: "route-" + label,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": color, "line-width": 7, "line-opacity": 1.0 },
  });
}

// Show or hide the loading / status overlay in the UI.
function setStatus(msg) {
  const modal = document.getElementById("loading-modal");
  const text = document.getElementById("loading-text");

  if (msg) {
    text.innerText = msg;
    modal.style.display = "flex";
  } else {
    modal.style.display = "none";
  }
}

const yearSlider = document.getElementById("year-slider");
const yearValue = document.getElementById("year-value");

if (yearSlider && yearValue) {
  yearSlider.addEventListener("input", (e) => {
    const year = Number(e.target.value);

    updateIncidentYear(year);

    if (startCoords && endCoords) {
      getRoute();
    }
  });
}

/*--------------------------------------------------------------------
RISK LEVEL DROPDOWN
--------------------------------------------------------------------*/

const RISK_THRESHOLDS = [0, 595, 807, 1008];
const RISK_LABEL_KEYS = [
  "showingAll",
  "showingMod",
  "showingHigh",
  "showingDanger",
];

const rateFilterExpr = CRIME_RATE_EXPR;

document.getElementById("risk-filter").addEventListener("change", (e) => {
  const value = e.target.value;

  if (!map.getLayer("neighbourhood_crime")) return;

  let filter = null;

  if (value === "low") {
    filter = ["<", rateFilterExpr, 595];
  }

  if (value === "moderate") {
    filter = ["all", [">=", rateFilterExpr, 595], ["<", rateFilterExpr, 807]];
  }

  if (value === "high") {
    filter = ["all", [">=", rateFilterExpr, 807], ["<", rateFilterExpr, 1008]];
  }

  if (value === "danger") {
    filter = [">=", rateFilterExpr, 1008];
  }

  map.setFilter("neighbourhood_crime", filter);
});
