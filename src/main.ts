// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet, { LatLng } from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// import board
import { Board } from "./board.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create a game board and map
const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// layer groups
const cacheLayer = leaflet.layerGroup();
map.addLayer(cacheLayer);
const polylineLayer = leaflet.layerGroup();
map.addLayer(polylineLayer);

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

interface Cell {
  readonly i: number;
  readonly j: number;
}

class Cache {
  location: Cell;
  coins: Coin[];

  constructor(location: Cell) {
    this.location = location;
    this.coins = [];
    for (
      let i = 0;
      i < luck([location.i, location.j, "initialValue"].toString()) * 100;
      i++
    ) {
      this.coins.push({ key: `i:${location.i}j:${location.j}$${i}` });
    }
    addCacheUI(this);
  }

  toMomento() {
    return JSON.stringify({
      location: this.location,
      coins: this.coins,
    });
  }

  fromMomento(momento: string) {
    const obj = JSON.parse(momento);
    this.location = obj.location;
    this.coins = obj.coins;
  }
}

function addCacheUI(cache: Cache) {
  const shape = leaflet.circle([
    (0.25 + cache.location.i) * TILE_DEGREES,
    (0.25 + cache.location.j) * TILE_DEGREES,
  ], { radius: 5 });
  shape.addTo(cacheLayer);

  // Handle interactions with the cache
  shape.bindPopup(() => {
    // The popup offers a description buttons to collect and deposit coins
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${cache.location.i},${cache.location.j}". It has value <span id="value">${cache.coins.length}</span>.</div>
                <button id="collect">collect</button> <button id="deposit">deposit</button>`;
    const coinsDiv = document.createElement("div");
    popupDiv.appendChild(coinsDiv);
    updateCoinsUI(cache.coins);

    // collect button functionality
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (cache.coins.length === 0) {
          return;
        }
        playerCoins.push(cache.coins.pop()!);
        updatePlayerInventory();
        updateCoinsUI(cache.coins);
      });

    // deposit button functionality
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins.length === 0) {
          return;
        }
        cache.coins.push(playerCoins.pop()!);
        updatePlayerInventory();
        updateCoinsUI(cache.coins);
      },
    );

    return popupDiv;

    function updateCoinsUI(coins: Coin[]) {
      popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coins
        .length.toString();
      let out = "";
      const printedCoins = coins.length > 5 ? 5 : coins.length;
      for (let i = coins.length - 1; i > coins.length - printedCoins - 1; i--) {
        out += coins[i].key;
        out += "<br>";
      }
      coinsDiv.innerHTML = out;
    }
  });
}

interface Coin {
  key: string;
}

const bus = new EventTarget();
bus.addEventListener("playerMoved", () => {
  generateSurroundingCaches();
  walkHistory.push(playerMarker.getLatLng());
  polyline.setLatLngs(walkHistory);
});

bus.addEventListener("dramaticMovement", () => {
  map.setView(playerMarker.getLatLng(), GAMEPLAY_ZOOM_LEVEL);
});

function notify(event: string) {
  bus.dispatchEvent(new Event(event));
}

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const walkHistory: LatLng[] = [playerMarker.getLatLng()];
const polyline = leaflet.polyline(walkHistory, { color: "red" });
polyline.addTo(polylineLayer);

// Display the player's points
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

// setting up caches
const savedCaches = new Map<string, string>();
const activeCaches = new Map<string, Cache>();

// populate neighborhood with caches
function generateSurroundingCaches() {
  const surroundingCells = board.getCellsNearPoint(playerMarker.getLatLng());
  activeCaches.forEach((cache) => {
    const key = [cache.location.i, cache.location.j].toString();
    savedCaches.set(key, cache.toMomento());
  });
  activeCaches.clear();
  cacheLayer.clearLayers();
  surroundingCells.forEach(({ i, j }) => {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      // spawnCache({ i, j });

      const key = [i, j].toString();
      if (savedCaches.has(key)) {
        const newCache = new Cache({ i, j }); // add recycling of some kind
        newCache.fromMomento(savedCaches.get(key)!);
        activeCaches.set(key, newCache);
      } else {
        const newCache = new Cache({ i, j });
        savedCaches.set(key, newCache.toMomento());
        activeCaches.set(key, newCache);
      }
    }
  });
}
generateSurroundingCaches();

function updatePlayerInventory() {
  statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
}

document.getElementById("north")!.addEventListener("click", () => {
  moveMarker("north");
});

document.getElementById("south")!.addEventListener("click", () => {
  moveMarker("south");
});

document.getElementById("east")!.addEventListener("click", () => {
  moveMarker("east");
});

document.getElementById("west")!.addEventListener("click", () => {
  moveMarker("west");
});

document.getElementById("reset")!.addEventListener("click", () => {
  const confirm = prompt(
    "Are you sure you want to reset the game? Type 'yes' to confirm.",
    "no",
  );
  if (confirm!.toLowerCase() === "yes") resetCommand();
});

document.getElementById("sensor")!.addEventListener("click", () => {
  // Check if geolocation is supported by the browser
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      // Success callback function
      (position) => {
        playerMarker.setLatLng([
          position.coords.latitude,
          position.coords.longitude,
        ]);
        notify("playerMoved");
        notify("dramaticMovement");
      },
      // Error callback function
      (error) => {
        // Handle errors, e.g. user denied location sharing permissions
        console.error("Error getting user location:", error);
      },
    );
  } else {
    // Geolocation is not supported by the browser
    console.error("Geolocation is not supported by this browser.");
  }
});

function resetCommand() {
  playerCoins.length = 0;
  updatePlayerInventory();
  playerMarker.setLatLng(OAKES_CLASSROOM);
  savedCaches.clear();
  activeCaches.clear();
  walkHistory.length = 0;
  notify("playerMoved");
  notify("dramaticMovement");
  localStorage.removeItem("state");
}

function moveMarker(direction: string) {
  const currentLoction = playerMarker.getLatLng();
  switch (direction) {
    case "north":
      playerMarker.setLatLng([
        currentLoction.lat + TILE_DEGREES,
        currentLoction.lng,
      ]);
      break;
    case "south":
      playerMarker.setLatLng([
        currentLoction.lat - TILE_DEGREES,
        currentLoction.lng,
      ]);
      break;
    case "east":
      playerMarker.setLatLng([
        currentLoction.lat,
        currentLoction.lng + TILE_DEGREES,
      ]);
      break;
    case "west":
      playerMarker.setLatLng([
        currentLoction.lat,
        currentLoction.lng - TILE_DEGREES,
      ]);
      break;
    default:
      throw ("Invalid direction");
  }
  notify("playerMoved");
}

function saveState() {
  const state = {
    playerCoins,
    playerLocation: playerMarker.getLatLng(),
    walkHistory,
    savedCaches: Array.from(savedCaches.entries()),
  };
  localStorage.setItem("state", JSON.stringify(state));
}

function loadState() {
  const state = JSON.parse(localStorage.getItem("state") || "{}");
  if (state == "{}") return;

  playerCoins.length = 0;
  playerCoins.push(...state.playerCoins);
  updatePlayerInventory();
  playerMarker.setLatLng(state.playerLocation || OAKES_CLASSROOM);
  walkHistory.length = 0;
  walkHistory.push(...state.walkHistory);
  polyline.setLatLngs(walkHistory);
  savedCaches.clear();
  state.savedCaches.forEach(([key, momento]: [string, string]) => {
    const newCache = new Cache({
      i: +key.split(",")[0],
      j: +key.split(",")[1],
    });
    newCache.fromMomento(momento);
    activeCaches.set(key, newCache);
  });
  notify("playerMoved");
  notify("dramaticMovement");
}

document.addEventListener("DOMContentLoaded", function () {
  loadState();
});

globalThis.addEventListener("beforeunload", function () {
  saveState();
});
