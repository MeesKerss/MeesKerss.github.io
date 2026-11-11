# Master Prompt — "Find the Station": a station-guessing game on one globe

> Paste this whole document into a fresh build session. It is the full brief.
> Items marked **(builder's call)** were decided while writing this brief, not by the owner. Change them if there's a better option.

## 1. What we're building and why

A new game for **mkers.nl** (this repo, a static GitHub Pages site of browser games with no accounts and no app). It's a **hard quiz about knowing where public-transport stations are**.

The game gives you a station name, for example **"Amstel"**. You're looking at a bare, label-free map with every station drawn as an identical dot and the transit lines drawn between them. You click the dot you think is Amstel.

What makes it special: **every playable place lives on one 3D globe.** When you open the site you see the globe and a city menu. Choosing a place makes the camera fly down and zoom into it, and the globe turns into the flat street map. Switching places (for example from Amsterdam to the Netherlands train network, and later Berlin) **pans across the globe** to the new place. It's never a page load and never a separate screen. Adding a city later should feel like adding one more spot on the same globe.

Success means it feels **clean, minimal and genuinely challenging**. An Amsterdam local should struggle with the tram and bus packs and feel themselves improving.

### Goals
- One continuous globe → city → map experience with smooth camera flights.
- Launch content: **Amsterdam** (metro, tram, bus, ferry, train, plus "everything") and **the Netherlands** (the full NS/train station network).
- A data and structure setup where adding Berlin's U-Bahn or another city means **adding data files, not code**.
- Hard but fair: you always learn something from a wrong answer.

### Non-goals (v1)
- No accounts, no global leaderboards, no multiplayer.
- No server or backend. **None is needed.** Everything is static files, and progress is saved in `localStorage`.
- No live/real-time transit data.

### Anti-goals (failure even if it "works")
- Labels or place names visible on the map during play. That would give the answer away.
- A cluttered, colourful UI. Colour is **only** for things that need the player's attention (see §5).
- Separate pages per city, or hard cuts between the globe and the map.
- Hand-typed station data that drifts out of date. Data must come from a repeatable script.

## 2. Where it lives in the repo

- New folder **`/findthestation/`** (the game is called **Find the Station**, the owner's choice), built like the other games: `index.html` plus `css/` and `js/` subfolders. Plain HTML/CSS/JS with **no build step**, matching the rest of the repo.
- Add a card on the homepage `index.html` in the same `game-row` style as the others, with `--accent` set to a strong transit blue (builder's call).
- Reuse `/shared/css/reset.css` where it fits.
- Data files live in **`/findthestation/data/`** (see §6).
- A data-build script lives in **`/findthestation/tools/`** (Node or Python). It's run by hand, and its output is committed.

## 3. Game flow

### 3.1 Opening: the globe
- Full-screen globe in the site's paper style (see §5), turning slowly. No labels.
- Every playable place has a small marker on the globe, with a **progress ring** around it showing how much of that place you've mastered.
- A clean, minimal menu panel lists the places (v1: *Amsterdam*, *Netherlands*). Hovering or tapping a list item highlights its marker. Clicking a marker or a list item selects that place.

### 3.2 Selecting a place
- The camera **flies from the globe down to the place** (around 2–3 seconds, eased), and the projection blends from globe to flat map as it zooms in.
- The pack picker slides in (see §4): a compact panel listing the packs with best score, progress ring and lock state.
- A "back to globe" control zooms out again. Choosing a different place from the menu **pans across the globe** to it (pull back a little, travel, dive in) instead of returning to the start screen. On touch devices, a horizontal swipe on the place header moves to the next place in the list.

### 3.3 A round
1. Pick a pack, for example "Amsterdam · Metro".
2. The map shows **every stop in that pack as an identical neutral dot**, plus the **route lines connecting them** in neutral grey. Dots don't move, and the map can be panned and zoomed freely.
3. A prompt card at the top shows the target station name in large type.
4. The player gets **3 tries**:
   - **Correct:** the dot flashes green and its name appears. Points are **3 / 2 / 1** depending on the try. Move to the next station.
   - **Wrong:** the clicked dot turns red and shows its real name for about 1.5 seconds ("That's Wibautstraat"), plus a **hint showing how many stops away** the target is along the network ("2 stops away"). For packs where hop distance doesn't make sense, use straight-line distance instead ("1.2 km away"). Wrong dots stay marked for the rest of this station.
   - **After 3 misses:** the correct dot pulses in the attention colour with its name, the lines through it light up in their **real line colours**, and play continues after a tap or a short delay.
5. Every station in the pack is asked **once, in random order**.
6. The end screen shows the score, accuracy percentage, best streak, and **the stations you missed**, which you can tap to see on the map.

### 3.4 Progress and challenge
- A **streak** counter for first-try hits, shown subtly. It turns into an attention colour at milestones such as 5 or 10.
- **Mastery:** a station counts as mastered once you get it right on the first try. Mastered dots appear filled or darker in the pack picker's preview, and mastery feeds the progress rings on the globe.
- **Unlocks:** starter packs are open from the start. Reaching **70% accuracy** in a pack unlocks the bigger packs in the same mode (see §4). The thresholds live in data, not code.
- **Resume:** packs with more than about 50 stops save progress after every answer, so a 1,000-stop bus run can be stopped and continued later.
- **Hard mode** (for each pack, unlocked after one completion): **no route lines are drawn**, only dots.

## 4. Packs (launch content)

A **place** contains **modes**, and each mode contains **packs**. A pack is just a list of stop IDs plus the lines to draw.

**Amsterdam**
| Mode | Packs | Unlock |
|---|---|---|
| Metro | All metro stations (~39) | open (starter) |
| Tram | One pack per tram line; "All tram stops" | lines open; "All" unlocks at 70% on any 3 lines |
| Bus | One pack per GVB bus line; area packs (Centrum, Noord, Oost, West, Nieuw-West, Zuid, Zuidoost); "All bus stops" (~1,000+) | lines and areas open; "All" unlocks at 70% on any 3 areas |
| Ferry | GVB ferries (small pack) | open |
| Train | NS stations within Amsterdam (~10) | open |
| Everything | Every stop of every mode mixed together | unlocks once Metro, Tram-All and Train are each at 70% or more |

**Netherlands (train)**
| Packs | Unlock |
|---|---|
| Intercity stations only | open (starter) |
| One pack per province (12) | open |
| All stations (~400) | unlocks at 70% on Intercity |

Notes:
- Stops with the same name on different platforms or sides of the street (very common for tram and bus) must be **merged into one dot per named stop**. Otherwise the game is unfair.
- The same physical station can appear in several modes, for example Amstel (metro, tram, bus, train). In the "Everything" pack it's one dot, and any mode's line through it counts.
- In each pack, the lines drawn are the routes that serve that pack's stops. For a single-line pack, draw that line strongly and others very faintly, or not at all (builder's call).

## 5. Look and feel

**Follow the homepage style:** warm paper background `#f0ede8`, near-black `#111`, white cards with soft shadows and rounded corners, the **Inter** font, lots of whitespace. Check `index.html` and `shared/css/components.css` and match them.

**The map:**
- Paper-coloured land, soft blue-grey **water**, very light **parks/green**, streets as thin light-grey lines (major roads slightly heavier), **railway lines** as faint dashed lines. **No labels of any kind**: no place names, street names, POIs or shields.
- The globe uses the same palette: paper land, soft water, no labels, thin country borders at most.

**Colour only for attention:**
- Neutral by default: dots are `#111` outlines with white fill, and lines are mid-grey.
- **Green:** correct. **Red:** wrong click. **Amber/orange:** the revealed answer, hints, and streak milestones.
- **Real line colours** (GVB/NS colours from the data) appear only when they're informative, such as on the reveal or in the pack-picker preview.
- Each mode gets one accent colour for its chip in the pack picker (builder's call on the exact palette).

**Motion:** camera flights, dots fading in, small pulse and shake effects for right and wrong answers. Everything is short and eased. Respect `prefers-reduced-motion` by replacing flights with quick cross-fades.

**Mobile first:** thumb-sized dot hit areas (enlarge the invisible tap radius; the nearest dot wins within the radius), prompt card at the top, controls at the bottom, no horizontal page scroll.

## 6. Data

**Source:** OpenStreetMap via the Overpass API (stops, stations, `route=subway|tram|bus|ferry|train` relations, line colours from the `colour` tag). The **build script** in `/findthestation/tools/`:
1. Queries Overpass for a place's bounding box and modes.
2. Merges platforms/stop positions into one stop per name (with an exceptions list for real duplicates).
3. Builds route line geometries and the **stop adjacency graph** (used for "N stops away").
4. Assigns stops to area or province packs using boundary polygons.
5. Writes compact JSON (or GeoJSON) files to `/findthestation/data/<place>/`, plus a `places.json` index.

**Data shape (builder may refine):**
- `places.json`: list of places with `id`, `name`, globe position, default camera, and a list of packs (`id`, `name`, `mode`, unlock rule, file reference).
- `<place>/stops.json`: `id`, `name`, `lat`, `lon`, `modes[]`.
- `<place>/lines.json`: `id`, `ref`, `mode`, `colour`, simplified geometry, ordered stop IDs.
- `<place>/packs.json`: pack definitions as lists of stop IDs and line IDs.

**Adding a new place = run the script with a new config and commit the output.** No game code changes.

Credit OpenStreetMap contributors (ODbL) and the tile provider in a small, unobtrusive attribution on the map.

## 7. Tech (builder's call unless noted)

- **MapLibre GL JS v5** (pinned exact version from a CDN) using its **globe projection**. One map instance handles globe → city zoom → flat map, with `flyTo` for the camera flights. This is what makes "everything on one globe" possible.
- **Basemap:** free vector tiles that need **no API key** (for example OpenFreeMap), with a **custom style JSON in the repo** that removes all label layers and applies the §5 palette.
- Stations and lines are drawn as MapLibre GeoJSON layers (circles and lines), so hit-testing and recolouring are cheap even for ~1,000 bus stops.
- Progress, unlocks, best scores and resume state are stored in `localStorage` under one versioned key. Wrap every access in try/catch, and the game must still work if storage isn't available.
- **No server required.** If shared leaderboards are wanted later, that's the moment a backend becomes necessary, and it's out of scope here.

## 8. Build order (suggested)

1. Data script plus Amsterdam **Metro** data, so we have real data early.
2. A single map screen running the full round loop for Metro (3 tries, hints, scoring, end screen).
3. Globe start screen, place menu and the camera flights between the globe, Amsterdam and the Netherlands.
4. Pack picker, progress saving, unlocks and mastery rings.
5. Fill in the remaining Amsterdam modes and the NL train data (merging stops and area/province packs are the hard data work).
6. Hard mode, streak polish, reduced-motion, mobile pass, homepage card.

## 9. Scope decisions (builder's call, settled while writing)
- **UI language: English**, to match the rest of mkers.nl. Station names are shown exactly as in OSM (Dutch).
- **Amsterdam bus = GVB lines only.** Regional operators (EBS, Connexxion, etc.) are left out of v1 to keep the set focused. They can become an extra pack later.
- **Netherlands train = every passenger rail station**, whichever operator runs it (NS, Arriva, Keolis, Qbuzz…). Closed or freight-only stations are excluded.
- **Amsterdam boundary = the municipality of Amsterdam** (including Noord, Nieuw-West and Zuidoost). Stops just outside it (for example in Diemen or Amstelveen) are included only when they lie on a GVB metro or tram line that runs into the city.

## 10. Left to the builder
Exact colours and accent palette, animation timings, the tap-radius size, the bus area boundaries, the line-highlighting rules in single-line packs, the JSON format details. 
