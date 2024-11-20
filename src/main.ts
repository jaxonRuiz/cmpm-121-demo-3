// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

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

const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});
const cacheLayer = leaflet.layerGroup();
map.addLayer(cacheLayer);

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const savedCaches = new Map<string, string>();
const activeCaches = new Map<string, Cache>();

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
    this.addShape();
  }
  addShape() {
    const shape = leaflet.circle([
      (0.25 + this.location.i) * TILE_DEGREES,
      (0.25 + this.location.j) * TILE_DEGREES,
    ], { radius: 5 });
    shape.addTo(cacheLayer);

    // Handle interactions with the cache
    shape.bindPopup(() => {
      // The popup offers a description buttons to collect and deposit coins
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
                  <div>There is a cache here at "${this.location.i},${this.location.j}". It has value <span id="value">${this.coins.length}</span>.</div>
                  <button id="collect">collect</button> <button id="deposit">deposit</button>`;
      const coinsDiv = document.createElement("div");
      popupDiv.appendChild(coinsDiv);
      updateCoinsUI(this.coins);

      // collect button functionality
      popupDiv
        .querySelector<HTMLButtonElement>("#collect")!
        .addEventListener("click", () => {
          if (this.coins.length === 0) {
            return;
          }
          playerCoins.push(this.coins.pop()!);
          updatePlayerInventory();
          updateCoinsUI(this.coins);
        });

      // deposit button functionality
      popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
        "click",
        () => {
          if (playerCoins.length === 0) {
            return;
          }
          this.coins.push(playerCoins.pop()!);
          updatePlayerInventory();
          updateCoinsUI(this.coins);
        },
      );

      return popupDiv;

      function updateCoinsUI(coins: Coin[]) {
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coins
          .length.toString();
        let out = "";
        const printedCoins = coins.length > 5 ? 5 : coins.length;
        for (let i = coins.length - 1; i > coins.length - printedCoins; i--) {
          out += coins[i].key;
          out += "<br>";
        }
        coinsDiv.innerHTML = out;
      }
    });
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

interface Coin {
  key: string;
}

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
// const originCell = board.getCellForPoint(OAKES_CLASSROOM);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);

playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

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
});

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
  generateSurroundingCaches();
}
