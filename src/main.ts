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
  zoomControl: true,
  scrollWheelZoom: true,
});

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

interface Cache {
  location: Cell;
  coins: Coin[];
}

interface Coin {
  key: string;
}

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
// const originCell = board.getCellForPoint(OAKES_CLASSROOM);
const surroundingCells = board.getCellsNearPoint(OAKES_CLASSROOM);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

// Add caches to the map by cell numbers
function spawnCache(cell: Cell) {
  // Add a rectangle to the map to represent the cache
  const rect = leaflet.circle([
    cell.i * TILE_DEGREES,
    cell.j * TILE_DEGREES,
  ], { radius: 5 });
  rect.addTo(map);

  const coins: Coin[] = [];
  for (
    let i = 0;
    i < luck([cell.i, cell.j, "initialValue"].toString()) * 100;
    i++
  ) {
    coins.push({ key: `i:${cell.i}j:${cell.j}$${i}` });
  }
  // Handle interactions with the cache
  rect.bindPopup(() => {
    console.log(coins);
    // The popup offers a description buttons to collect and deposit coins
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${cell.i},${cell.j}". It has value <span id="value">${coins.length}</span>.</div>
                <button id="collect">collect</button> <button id="deposit">deposit</button>`;

    // collect button functionality
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (coins.length === 0) {
          return;
        }
        playerCoins.push(coins.pop()!);
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coins
          .length.toString();
        statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
      });

    // deposit button functionality
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins.length === 0) {
          return;
        }
        coins.push(playerCoins.pop()!);
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coins
          .length.toString();
        statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
      },
    );

    return popupDiv;
  });
}

// populate neighborhood with caches
surroundingCells.forEach(({ i, j }) => {
  // If location i,j is lucky enough, spawn a cache!
  if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
    spawnCache({ i, j });
  }
});
