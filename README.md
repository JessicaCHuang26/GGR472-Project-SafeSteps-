# SafeStep Toronto

An interactive pedestrian safety map for Toronto, built for GGR472 at the University of Toronto. It helps users, especially tourists navigate the city by comparing the fastest and safest walking routes based on real crime data.

**Live site**: https://jessicachuang26.github.io/GGR472-Project-SafeSteps-/

## Features

- **Route planning** — Enter a start and destination to get walking directions
- **Fastest vs. Safest routes** — The app computes both and lets you compare them side by side
- **Crime risk choropleth** — Neighbourhoods are shaded by violent crime rate (2022); hover to see details
- **Safety score** — Each route is scored by incident density (weighted crimes per km of route)
- **Popular landmarks** — One-tap shortcuts to common Toronto destinations
- **GPS / current location** — Set your current position as the start point
- **Police stations** — Toggle nearby police station locations on/off
- **Recent searches** — Last 5 searched addresses are saved locally
- **Welcome guide** — First-time onboarding modal with usage instructions

## Data Sources

| Dataset | Source |
|---|---|
| Assault incidents | [Toronto Police Service Open Data](https://data.tps.ca/maps/b4d0398d37eb4aa184065ed625ddb922) |
| Shooting incidents | [Toronto Police Service Open Data](https://data.tps.ca/maps/64ddeca12da34403869968ec725e23c4) |
| Robbery incidents | [Toronto Police Service Open Data](https://data.tps.ca/datasets/d0e1e98de5f945faa2fe635dee3f4062_0/explore) |
| Pedestrian KSI | [Toronto Police Service Open Data](https://data.tps.ca/datasets/a96252bf61b84fc68c3926bb7485970e_0/explore) |
| Traffic collisions | [Toronto Police Service Open Data](https://data.tps.ca/datasets/bc4c72a793014a55a674984ef175a6f3_0/explore) |
| Neighbourhood crime rates | [City of Toronto Open Data](https://open.toronto.ca/dataset/neighbourhood-crime-rates/) |
| Police facility locations | [City of Toronto Open Data](https://open.toronto.ca/dataset/police-facility-locations/) |
| Routing | Mapbox Directions API (walking profile) |
| Basemap | Mapbox Streets v12 |

All crime data covers the year 2022.


## How It Works

### Safety Score
Each route is buffered by 50 m and all crime incidents within that corridor are summed by weight:

| Incident type | Weight |
|---|---|
| Shooting | 5 |
| Homicide | 5 |
| Robbery | 4 |
| Assault | 3 |
| Pedestrian KSI | 3 |
| Traffic collision | 2 |

The total weight is divided by route length (km) to produce a **risk per km** score. The safest route is the one with the lowest risk/km among all candidates within 1.4× the fastest route's duration.

### Route Generation
1. A direct A→B walking route is fetched from the Mapbox Directions API
2. Candidate waypoints are generated along perpendicular offsets at 25%, 50%, and 75% of the direct path (±300 m and ±600 m)
3. All candidate routes are fetched in parallel
4. The route with the lowest duration is labelled **Fastest**; the route with the lowest risk/km (within the time budget) is labelled **Safest**


## Tech Stack

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — map rendering and routing
- [Turf.js](https://turfjs.org/) — spatial analysis (buffering, point-in-polygon)
- [Mapbox Geocoder](https://github.com/mapbox/mapbox-gl-geocoder) — address search
- Vanilla JavaScript, HTML, CSS — no frameworks


## Project Structure

```
├── index.html                  Main page
├── script.js                   Map logic, routing, UI
├── style.css                   Styling
├── logo.png                    App logo
├── Neighbourhood_Crime_Rates.geojson
├── data/
│   └── cleaned/
│       ├── toronto_incidents.geojson   Cleaned & weighted crime points
│       └── toronto_incidents_cleaned.csv
└── Construction Features/
    ├── ttc_stops.geojson
    └── Police Facility Locations - 4326.geojson
```

## Team

GGR472 Group Project — University of Toronto, 2025
