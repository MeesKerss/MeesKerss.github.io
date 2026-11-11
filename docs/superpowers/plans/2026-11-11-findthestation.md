# Find the Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Find the Station", a static browser game at `/findthestation/` where you click the unlabeled dot that matches a station name, set on one MapLibre globe that flies between places (Amsterdam, Netherlands).

**Architecture:** Plain ES modules with no build step. Pure logic (geometry, graph, round engine, progress/unlocks, hit-testing) lives in small modules that are unit-tested with `node --test`. A Node script in `tools/` pulls OpenStreetMap data from Overpass once and writes compact JSON to `data/`, which is committed. One MapLibre GL map handles both the globe and the city map. UI is DOM panels over the map.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), MapLibre GL JS 5.x (globe projection) from unpkg with a pinned exact version, OpenFreeMap vector tiles (no key), Node 20 (`node:test`, built-in `fetch`) for tests and the data tools.

**Spec:** `docs/superpowers/specs/2026-11-11-findthestation-design.md`

## Global Constraints

- Everything is under `findthestation/`. No build step. Pages load ES modules directly with `<script type="module">`.
- No server or backend. All data is static JSON in `findthestation/data/`.
- Style follows the homepage: background `#f0ede8`, ink `#111`, white cards, Inter (Google Fonts), rounded corners, soft shadows.
- Colour only for attention: green `#16a34a` for correct, red `#dc2626` for wrong, amber `#d97706` for the reveal, hints and streak milestones. Dots are `#111` outlines with white fill, and lines are grey `#9a968f`. Real line colours appear only on the reveal and in the pack preview.
- No labels of any kind on the basemap or globe.
- 3 tries per station. Points are 3/2/1. Each station is asked once per run, in random order.
- The unlock threshold is 70% accuracy, defined in data (`packs.json`), not in code.
- Resume is saved for packs with more than 50 stops.
- Hard mode (no route lines) is available for a pack after it has been completed once.
- `localStorage` uses one key, `fts:v1`, and every access is wrapped in try/catch. The game works without storage.
- UI copy is in English. Station names are shown exactly as stored in the data.
- MapLibre is pinned to an exact version (use `5.6.0`, or the latest 5.x that is at least 2 weeks old if 5.6.0 is missing on unpkg).
- Attribution text: "© OpenStreetMap contributors · OpenFreeMap" is visible on the map.
- Respect `prefers-reduced-motion`: replace camera flights with `jumpTo` plus a CSS cross-fade.

## Review Focus

1. **Stacked dots:** Centraal (metro, tram, train) and similar hubs have several dots within a few pixels. The tap should pick the dot whose centre is nearest, not the first one hit. Test: `nearestStop` in Task 7.
2. **Unreachable target:** a ferry stop, or a stop on a disconnected line, has no path in the graph. The hint should fall back to km instead of failing or showing "Infinity stops". Test: Task 5.
3. **Broken storage:** `localStorage` throws (private mode) or holds corrupt JSON. The game should start with empty progress and keep working. Test: Task 6.
4. **Stale resume after a data rebuild:** a saved run refers to stop IDs that no longer exist. That resume should be discarded instead of asking a station that can't be found. Test: Task 6.
5. **Same name, two places:** a bus pack with two "Kerkstraat" stops far apart. Clicking either dot with the target's name counts as correct. Test: Task 5.

---

## File Structure

```
findthestation/
  index.html                 page shell, loads MapLibre + js/main.js
  css/style.css              all styles
  js/geo.js                  haversine, pointInPolygon, simplifyLine, round coords (shared with tools)
  js/graph.js                adjacency graph + BFS hop distance
  js/engine.js               pure round state machine
  js/progress.js             storage, best scores, mastery, unlocks, resume
  js/hit.js                  nearestStop screen-space hit test
  js/data.js                 fetch + cache places/place data
  js/mapview.js              MapLibre map, style, globe/flat, flights, place markers
  js/layers.js               stop + line GeoJSON layers and state colouring
  js/ui.js                   DOM panels: place menu, pack picker, prompt card, toasts, end screen
  js/main.js                 wiring / app controller
  style/basemap.json         generated label-free style
  data/places.json           places index
  data/<place>/stops.json    stops
  data/<place>/lines.json    lines
  data/<place>/packs.json    packs
  tools/build-data.mjs       CLI: node findthestation/tools/build-data.mjs <place>
  tools/build-style.mjs      CLI: regenerates style/basemap.json
  tools/overpass.mjs         fetch with retries, mirror fallback, on-disk cache
  tools/osm.mjs              pure: elements -> stops/lines (merge, simplify)
  tools/packs.mjs            pure: stops/lines/areas -> packs
  tools/configs/amsterdam.json
  tools/configs/netherlands.json
  tools/.cache/              raw Overpass responses (gitignored)
  tests/*.test.mjs           node --test
```

Run all tests with: `node --test findthestation/tests/*.test.mjs`

### Data contracts (used by every task)

```js
// places.json
{ places: [{ id: "amsterdam", name: "Amsterdam", center: [4.90, 52.37], zoom: 11.5,
             bounds: [[w,s],[e,n]], data: "amsterdam" }] }

// <place>/stops.json   (ids unique per place, slug of name + "-2" etc. on collision)
{ stops: [{ id: "amstel", name: "Amstel", lat: 52.3466, lon: 4.9177, modes: ["subway","tram","bus","train"] }] }

// <place>/lines.json   mode ∈ subway|tram|bus|ferry|train
{ lines: [{ id: "subway-51", ref: "51", mode: "subway", colour: "#F69931",
            coords: [[[lon,lat],...], ...],   // MultiLineString, simplified, 5 decimals
            stops: ["isolatorweg", ...],      // union of stops, any order
            edges: [["a","b"], ...] }] }      // consecutive-stop pairs, deduped, unordered

// <place>/packs.json
{ packs: [{ id: "amsterdam/metro", name: "Metro", mode: "subway", group: "Metro",
            stops: [ids], lines: [ids], focusLines: [ids] | undefined,
            unlock: { type: "open" } |
                    { type: "accuracy", min: 0.7, of: [packIds], count: 3 } }] }
```

---

### Task 1: Scaffold, test harness, geometry and graph helpers

**Files:**
- Create: `findthestation/js/geo.js`, `findthestation/js/graph.js`, `findthestation/tests/geo.test.mjs`, `findthestation/tests/graph.test.mjs`, `findthestation/.gitignore` (contains `tools/.cache/`)

**Interfaces:**
- Produces:
  - `haversineKm([lon,lat], [lon,lat]) -> number`
  - `pointInPolygon([lon,lat], rings: number[][][]) -> boolean` (rings[0] is the outer ring and the rest are holes; even-odd rule). Also `pointInMultiPolygon(pt, polys: number[][][][]) -> boolean`
  - `simplifyLine(coords: number[][], tolerance: number) -> number[][]` (Douglas–Peucker, keeps the endpoints)
  - `roundCoord([lon,lat], decimals=5) -> [lon,lat]`
  - `buildGraph(lines: {edges: [string,string][]}[]) -> Map<string, Set<string>>`
  - `hopDistance(graph, fromId, toId) -> number | null` (BFS, `null` when unreachable, `0` when from === to)

- [ ] **Step 1: Write failing tests**

```js
// geo.test.mjs
test('haversine Amsterdam CS -> Utrecht CS ≈ 34km', () => {
  const d = haversineKm([4.9003, 52.3789], [5.1100, 52.0894]);
  assert.ok(d > 33 && d < 36);
});
test('pointInPolygon square and hole', () => {
  const sq = [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[4,4],[6,4],[6,6],[4,6],[4,4]]];
  assert.equal(pointInPolygon([1,1], sq), true);
  assert.equal(pointInPolygon([5,5], sq), false);
  assert.equal(pointInPolygon([11,5], sq), false);
});
test('simplifyLine drops collinear points, keeps ends', () => {
  assert.deepEqual(simplifyLine([[0,0],[1,0.00001],[2,0]], 0.001), [[0,0],[2,0]]);
});
// graph.test.mjs
test('hopDistance counts stops along edges', () => {
  const g = buildGraph([{ edges: [['a','b'],['b','c']] }, { edges: [['c','d']] }]);
  assert.equal(hopDistance(g, 'a', 'd'), 3);
  assert.equal(hopDistance(g, 'a', 'a'), 0);
  assert.equal(hopDistance(g, 'a', 'zz'), null);
});
```

- [ ] **Step 2:** Run `node --test findthestation/tests/*.test.mjs`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `geo.js` and `graph.js` as ES modules with named exports.
- [ ] **Step 4:** Run the tests. Expected: all PASS.
- [ ] **Step 5:** Commit: `git add findthestation && git commit -m "findthestation: geo + graph helpers"`

---

### Task 2: OSM → stops and lines (pure transform)

**Files:**
- Create: `findthestation/tools/osm.mjs`, `findthestation/tests/osm.test.mjs`

**Interfaces:**
- Consumes: `simplifyLine`, `roundCoord`, `haversineKm` from `js/geo.js`
- Produces: `buildNetwork(elements, opts) -> { stops: Stop[], lines: Line[] }`, where
  - `elements` are Overpass JSON elements from `out geom` (route relations with `members[].geometry` for ways and `members[].lat/lon` for nodes, plus `members[].role`)
  - `opts = { modes: string[], stripPrefixes: string[], aliases: {[name]: canonicalName}, mergeMeters: 300, tolerance: 0.00005 }`
  - `cleanName(raw, stripPrefixes, aliases) -> string`, exported for tests

**Rules (these decide behaviour, so they're spelled out):**
- Mode comes from `tags.route` (`subway`, `tram`, `bus`, `ferry`, `train`, and `light_rail` maps to `tram`).
- Stop members are those with role matching `/^(stop|platform)(_entry_only|_exit_only)?$/` that have a name (`tags.name` on the member node, which comes from a separate `node(r)` output merged by id).
- `cleanName`: trim, remove any `stripPrefixes` entry followed by `", "` or `" "` at the start (for example `"Amsterdam, Dam"` → `"Dam"`), then apply `aliases`.
- Merge stops with **the same cleaned name within `mergeMeters`** of the cluster's first point into one stop (with averaged lat/lon and the union of modes). The same name further away becomes a separate stop, with id suffix `-2`, `-3`.
- One line per `(mode, ref)`, merging both directions: `coords` is the union of member way geometries (each simplified, rounded), `stops` is the union of stop ids, and `edges` is consecutive stop pairs in each relation's member order, deduped as unordered pairs, with self-pairs dropped.
- `colour` comes from `tags.colour`, falling back to `#111`.
- Stop `id` = name lowercased, accents removed, non-alphanumerics → `-`, trimmed of `-`.

- [ ] **Step 1: Write failing tests** with a hand-made fixture of 2 relations (metro 52 in both directions, sharing stops "Noord", "Noorderpark", "Centraal Station"), where one direction has its platform nodes 120 m away from the other's:

```js
test('merges both directions into one line and one stop per name', () => {
  const { stops, lines } = buildNetwork(fixture, opts);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, 'subway-52');
  assert.deepEqual(stops.map(s => s.id).sort(), ['centraal-station','noord','noorderpark']);
  assert.deepEqual(lines[0].edges.length, 2);
});
test('same name far apart stays separate', () => { /* two "Kerkstraat" 3km apart -> ids kerkstraat, kerkstraat-2 */ });
test('cleanName strips prefix and applies alias', () => {
  assert.equal(cleanName('Amsterdam, Dam', ['Amsterdam'], {}), 'Dam');
  assert.equal(cleanName('Amsterdam Centraal', [], {'Amsterdam Centraal': 'Centraal Station'}), 'Centraal Station');
});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `osm.mjs`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `findthestation: OSM network transform`

---

### Task 3: Pack generation and the data CLI (produces real data)

**Files:**
- Create: `findthestation/tools/packs.mjs`, `findthestation/tools/overpass.mjs`, `findthestation/tools/build-data.mjs`, `findthestation/tools/configs/amsterdam.json`, `findthestation/tools/configs/netherlands.json`, `findthestation/tests/packs.test.mjs`
- Create (generated): `findthestation/data/places.json`, `findthestation/data/amsterdam/{stops,lines,packs}.json`, `findthestation/data/netherlands/{stops,lines,packs}.json`

**Interfaces:**
- Consumes: `buildNetwork` (Task 2), `pointInMultiPolygon` (Task 1)
- Produces:
  - `buildPacks(placeId, network, areas, config) -> Pack[]`, where `areas = { [areaName]: polys }`
  - `overpass(query, cacheKey) -> elements` (tries `overpass-api.de`, then `overpass.kumi.systems`, then `overpass.private.coffee`. Up to 4 attempts with 15 s/30 s/60 s backoff on 429/502/504. Caches raw JSON in `tools/.cache/<cacheKey>.json` and reuses it unless `--fresh` is passed. Sends User-Agent `findthestation-data-builder`.)
  - CLI: `node findthestation/tools/build-data.mjs amsterdam|netherlands [--fresh]` writes the three data files and upserts the place in `places.json`.

**Config contents (decided here):**
- `amsterdam.json`: `name "Amsterdam"`, `center [4.90,52.37]`, `zoom 11.5`. The boundary is the relation `["boundary"="administrative"]["admin_level"="8"]["name"="Amsterdam"]`. Routes are `route~"subway|tram|bus|ferry"` with `operator="GVB"` in bbox `52.27,4.72,52.44,5.08`, plus `route=train` in the same bbox. Areas are the `admin_level=9` stadsdelen inside the boundary (Centrum, Noord, Oost, West, Nieuw-West, Zuid, Zuidoost; Westpoort is merged into West). `stripPrefixes ["Amsterdam"]`. `aliases {"Amsterdam Centraal": "Centraal Station", "Station Zuid": "Zuid", "Station RAI": "RAI"}`, and these get extended after inspecting the output in Step 6.
- Stop inclusion for Amsterdam: keep a stop if it lies in the boundary, OR it's a `subway`/`tram` stop on a line with at least one stop inside the boundary. For train, keep only stations inside the boundary.
- `netherlands.json`: `name "Netherlands"`, `center [5.3,52.2]`, `zoom 6.8`, all `route=train` relations in the area `["ISO3166-1"="NL"]`, excluding `tags.historic` / `service=tourist` / `railway:preserved`. Areas are the `admin_level=4` provinces. `stripPrefixes []`.
- Intercity: a station served by any relation whose `tags.service == "long_distance"` or whose name matches `/intercity/i`.

**Packs produced (spec §4; ids are `<place>/<slug>`):**
- Amsterdam: `metro` (open), `tram-<ref>` per line (open, `focusLines:[that line]`), `tram-all` (accuracy 0.7 of all tram-line packs, count 3), `bus-<ref>` per line (open), `bus-area-<slug>` per area (open), `bus-all` (accuracy 0.7 of area packs, count 3), `ferry` (open), `train` (open), `everything` (accuracy 0.7 of `[metro, tram-all, train]`, count 3).
- Netherlands: `intercity` (open), `province-<slug>` ×12 (open), `all` (accuracy 0.7 of `[intercity]`, count 1).
- A pack's `lines` = every line of that pack's mode that serves at least one of its stops. `group` is the display heading (Metro/Tram/Bus/Ferry/Train/Everything, or Intercity/Provinces/All for NL).

- [ ] **Step 1: Write failing tests** for `buildPacks` using a tiny network (2 tram lines, 1 bus line, 2 areas):

```js
test('per-line tram packs, tram-all locked by 3-of rule', () => {
  const packs = buildPacks('amsterdam', net, areas, cfg);
  const all = packs.find(p => p.id === 'amsterdam/tram-all');
  assert.deepEqual(all.unlock, { type:'accuracy', min:0.7, of:['amsterdam/tram-1','amsterdam/tram-2'], count:3 });
  assert.deepEqual(packs.find(p => p.id === 'amsterdam/tram-1').focusLines, ['tram-1']);
});
test('bus area pack contains only stops inside that area', () => { /* ... */ });
test('no empty packs are emitted', () => { /* area with zero stops -> omitted */ });
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `packs.mjs`, `overpass.mjs`, `build-data.mjs`, and the two configs. The CLI only does orchestration (query → `buildNetwork` → stop inclusion → `buildPacks` → write JSON with 0-indent for size).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Run `node findthestation/tools/build-data.mjs amsterdam` and `node findthestation/tools/build-data.mjs netherlands`. Expected: the script prints counts, and these sanity ranges hold: Amsterdam metro 35–45 stops, tram lines 12–16, bus stops 700–1600, ferry 3–15 stops, train 8–14 stations; Netherlands all 380–420 stations, intercity 60–120, 12 province packs. Each `stops.json` should be under 300 KB, and `lines.json` under 1.5 MB (raise `tolerance` if not).
- [ ] **Step 6:** Spot-check the hubs: Amstel, Centraal Station, Zuid and Sloterdijk should each be **one** stop in the Amsterdam `stops.json` with multiple modes. Add any `aliases` that are needed and rerun from cache.
- [ ] **Step 7:** Commit: `findthestation: data pipeline + Amsterdam and Netherlands data`

---

### Task 4: Label-free basemap style

**Files:**
- Create: `findthestation/tools/build-style.mjs`, generated `findthestation/style/basemap.json`

**Interfaces:**
- Produces: `style/basemap.json`, a valid MapLibre style using OpenFreeMap's `openmaptiles` source (`https://tiles.openfreemap.org/planet`), with **no `symbol` layers**, a `projection: {type: "globe"}` field, and a `sky`/background that matches the paper style.

- [ ] **Step 1:** Write `build-style.mjs`. It fetches `https://tiles.openfreemap.org/styles/positron`, drops every layer with `type === "symbol"` and drops `glyphs`/`sprite`, then recolours by layer id pattern: background/landcover → `#f0ede8`, water → `#c9d6dc`, park/landuse grass/wood → `#e3e6d6`, roads → `#ffffff` with casing `#dedad3` (motorway/trunk slightly wider), rail → `#c4bfb6` dashed `[2,2]`, buildings → `#e8e4dd` at opacity 0.6, boundaries → `#cfcac2`. It also adds `"projection": {"type":"globe"}` and writes the result with 2-space indent.
- [ ] **Step 2:** Run `node findthestation/tools/build-style.mjs`. Then verify: `node -e "const s=require('./findthestation/style/basemap.json');if(s.layers.some(l=>l.type==='symbol'))throw 1;console.log(s.layers.length,'layers ok')"` prints `N layers ok`.
- [ ] **Step 3:** Commit: `findthestation: label-free basemap style`

---

### Task 5: Round engine

**Files:**
- Create: `findthestation/js/engine.js`, `findthestation/tests/engine.test.mjs`

**Interfaces:**
- Consumes: `hopDistance`, `haversineKm`
- Produces:
  - `createRun({ stops: Stop[], order?: string[], rng?: () => number }) -> Run`, where `Run = { order: string[], index, tries, score, streak, bestStreak, results: {id, points, tries}[], wrongIds: string[] }`. When `order` is omitted it's a Fisher–Yates shuffle with `rng`.
  - `currentTarget(run, stopsById) -> Stop | null`
  - `guess(run, clickedId, ctx) -> { outcome: 'correct'|'wrong'|'reveal', points, hint?: {kind:'hops'|'km', value:number}, clickedName }`, where `ctx = { stopsById, graph }`. It mutates `run`. Correct means `stopsById[clickedId].name === target.name`. Points are `[3,2,1][tries]`. Wrong increments `tries` and adds to `wrongIds`. The 3rd wrong guess gives `'reveal'` with 0 points. The hint is hops when `hopDistance` isn't null, otherwise km rounded to 0.1.
  - `advance(run) -> boolean` moves to the next station (resets `tries`/`wrongIds`). Returns `false` when the run is finished.
  - `summary(run) -> { score, maxScore, accuracy, bestStreak, missed: string[] }`. Accuracy = first-try-correct count / total. `missed` = ids with 0 points.
  - Streak: +1 on a first-try correct answer, reset to 0 on anything else. `bestStreak` is the maximum.

- [ ] **Step 1: Write failing tests**

```js
test('3/2/1 points then reveal', () => { /* correct first try -> 3; wrong, correct -> 2; wrong x3 -> outcome 'reveal', points 0 */ });
test('hint uses hops when connected, km when not', () => {
  // graph a-b-c, target c; click a -> {kind:'hops', value:2}; isolated ferry stop f -> {kind:'km'}
});
test('same-name stop counts as correct', () => { /* kerkstraat & kerkstraat-2 both "Kerkstraat" */ });
test('every stop asked exactly once', () => { /* createRun with seeded rng; advance until false; set of asked === all ids */ });
test('summary accuracy counts first-try only', () => { /* 2 stops: 3pts, 2pts -> accuracy 0.5, maxScore 6 */ });
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `engine.js`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `findthestation: round engine`

---

### Task 6: Progress, unlocks, mastery, resume

**Files:**
- Create: `findthestation/js/progress.js`, `findthestation/tests/progress.test.mjs`

**Interfaces:**
- Produces:
  - `loadProgress(storage = globalThis.localStorage) -> Progress`. It never throws. Returns `{packs:{}, resume:{}}` on missing/corrupt data or when storage throws.
  - `saveProgress(progress, storage)`. Never throws.
  - `Progress.packs[packId] = { bestScore, bestAccuracy, bestStreak, completed, mastered: string[] }`
  - `recordRun(progress, packId, summary, firstTryIds: string[]) -> Progress`. Updates bests, `completed += 1`, and unions `mastered`.
  - `isUnlocked(pack, progress) -> boolean`. `open` → true. `accuracy` → true when at least `count` packs in `of` have `bestAccuracy >= min`.
  - `canHardMode(packId, progress) -> boolean` (`completed >= 1`)
  - `placeMastery(progress, packs, stopCount) -> number` (0..1, unique mastered stop ids across the place's packs / stopCount)
  - `saveResume(progress, packId, run)`, `getResume(progress, packId, stopsById) -> Run | null`. Returns null and deletes the entry if any id in `run.order` is missing from `stopsById`. `clearResume(progress, packId)`.
  - `RESUME_MIN_STOPS = 50`

- [ ] **Step 1: Write failing tests**

```js
test('loadProgress survives throwing and corrupt storage', () => {
  const throwing = { getItem(){ throw new Error('blocked'); }, setItem(){ throw new Error('blocked'); } };
  assert.deepEqual(loadProgress(throwing), { packs:{}, resume:{} });
  assert.deepEqual(loadProgress(fakeStorage({ 'fts:v1': '{not json' })), { packs:{}, resume:{} });
  assert.doesNotThrow(() => saveProgress({packs:{},resume:{}}, throwing));
});
test('unlock: 3 of tram lines at >=70%', () => { /* 2 at 0.8 -> false; third at 0.7 -> true; 0.69 doesn't count */ });
test('stale resume is discarded', () => { /* order has 'gone' id -> getResume null and entry removed */ });
test('mastery is unique across packs', () => { /* same stop mastered in two packs counts once */ });
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `progress.js`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `findthestation: progress, unlocks, resume`

---

### Task 7: Playable map, from a single pack to the end screen

**Files:**
- Create: `findthestation/index.html`, `findthestation/css/style.css`, `findthestation/js/hit.js`, `findthestation/js/data.js`, `findthestation/js/mapview.js`, `findthestation/js/layers.js`, `findthestation/js/ui.js`, `findthestation/js/main.js`, `findthestation/tests/hit.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1, 5 and 6, plus the data files (Task 3) and the style (Task 4)
- Produces:
  - `nearestStop(points: {id,x,y}[], click: {x,y}, radiusPx) -> id | null` (minimum Euclidean distance within the radius)
  - `loadPlaces() -> places`, `loadPlace(dataId) -> { stops, lines, packs, stopsById, linesById }` (memoized)
  - `createMap(container) -> maplibregl.Map` (style `style/basemap.json`, `attributionControl` with the custom text)
  - `showPack(map, place, pack, { hard }) / clearPack(map)`. Adds sources `fts-lines` and `fts-stops` and layers `fts-lines` (line), `fts-lines-focus`, `fts-stops` (circle). Stop state is driven by feature-state `{ state: 'idle'|'wrong'|'correct'|'reveal'|'mastered' }` via `setStopState(map, id, state)` and `resetStopStates(map)`. `highlightLinesThrough(map, stopId)` paints those lines in their real `colour`.
  - `ui.showPrompt(name, triesLeft)`, `ui.toast(text, kind)`, `ui.showEnd(summary, missedStops, onReplay, onBack)`, `ui.setStreak(n)`
- Circle radius: 4 px at zoom 11, 7 px at zoom 15 (interpolate). Hit radius: 22 px for touch (`pointerType !== 'mouse'`), 14 px for mouse. The click handler projects only the stops in the current pack's `stops` that are inside the viewport.
- Wrong-click label: a temporary MapLibre `Popup` (no close button, CSS class `fts-tag-wrong`) showing the clicked name for 1.5 s, plus the hint toast ("2 stops away" / "1.2 km away").
- Reveal: `setStopState(target,'reveal')` (amber pulse via CSS on a Marker overlay, because circle layers can't animate), `highlightLinesThrough`, the name tag, then "Next" button or auto-advance after 2.5 s.
- For this task only, `main.js` boots straight into `amsterdam/metro` (temporary until Task 8).

- [ ] **Step 1: Write failing test**

```js
test('nearestStop picks the closest centre among stacked dots', () => {
  const pts = [{id:'tram',x:100,y:100},{id:'metro',x:104,y:100},{id:'train',x:110,y:100}];
  assert.equal(nearestStop(pts, {x:105,y:101}, 22), 'metro');
  assert.equal(nearestStop(pts, {x:200,y:200}, 22), null);
});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement `hit.js`. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Implement the page and modules above. Layout: full-screen map, prompt card fixed top-centre (white card, name in 1.6 rem/800, three small try pips), streak chip top-right, toast bottom-centre, end screen as a centred card in the homepage `.sbox` style.
- [ ] **Step 6: Verify in a browser.** Run `python -m http.server 8765` from the repo root and open `http://localhost:8765/findthestation/`. Use Playwright through the `webapp-testing` skill if available, otherwise check manually. Expected: label-free map of Amsterdam; ~40 dots plus grey metro lines; the prompt shows a station; clicking the wrong dot turns it red, shows its name and a hop hint; 3 misses reveal it in amber with coloured lines; the end screen appears after the last station. Check the browser console has no errors.
- [ ] **Step 7:** Commit: `findthestation: playable map loop`

---

### Task 8: Globe start screen, places, flights, swipe

**Files:**
- Modify: `findthestation/js/mapview.js`, `findthestation/js/ui.js`, `findthestation/js/main.js`, `findthestation/css/style.css`

**Interfaces:**
- Produces:
  - `showGlobe(map)`: `flyTo({center:[4.9,50], zoom:1.6})` and starts a slow auto-rotation (0.6 °/s via `requestAnimationFrame` easing of the centre longitude). Rotation stops on user interaction and on place selection.
  - `flyToPlace(map, place, { fromPlace }) -> Promise`. If `fromPlace` is set, it first zooms out to `min(place.zoom, fromPlace.zoom) - 3` at the midpoint, then flies to the place. Duration is about 2500 ms with `curve: 1.6`. It resolves on `moveend`. With reduced motion it uses `jumpTo`, and the `.fade` class cross-fades the map container over 250 ms.
  - `addPlaceMarkers(map, places, masteryById, onSelect)` adds HTML markers: an 18 px dot inside an SVG progress ring (stroke `#111`, track `#dedad3`). `updatePlaceMarker(id, mastery)`.
  - `ui.showPlaceMenu(places, onSelect)`: bottom-left card on desktop, bottom sheet on mobile, with Inter headings. Hovering an item adds `.hover` to its marker.
  - `ui.showPlaceHeader(place, { onBack, onSwipe(dir) })`: header with place name, "← Globe" button, and a horizontal swipe of more than 60 px (pointer events) calls `onSwipe(±1)`.
- App states in `main.js`: `globe` → `place` (pack picker, Task 9) → `play` → `end`. Switching places from the `place` state calls `flyToPlace` with `fromPlace`.

- [ ] **Step 1:** Implement the above. The temporary auto-boot from Task 7 is replaced by the globe state. For now, selecting a place starts its first open pack, until Task 9.
- [ ] **Step 2: Verify in a browser.** Expected: the page opens on a turning globe with no labels and two ringed markers (Amsterdam, Netherlands). Clicking Amsterdam flies in. Swiping or the menu switches to the Netherlands with a pull-back-and-pan. "← Globe" zooms back out. With reduced motion emulated (Playwright `reducedMotion: 'reduce'` or devtools), transitions are instant cross-fades. No console errors.
- [ ] **Step 3:** Commit: `findthestation: globe, places, flights`

---

### Task 9: Pack picker, unlocks, resume, hard mode, streaks

**Files:**
- Modify: `findthestation/js/ui.js`, `findthestation/js/main.js`, `findthestation/js/layers.js`, `findthestation/css/style.css`

**Interfaces:**
- Consumes: `isUnlocked`, `canHardMode`, `getResume`, `saveResume`, `clearResume`, `recordRun`, `placeMastery`, `RESUME_MIN_STOPS` (Task 6)
- Produces: `ui.showPackPicker(place, packs, progress, { onPlay(packId, { hard, resume }) })`
  - Packs are grouped by `group`, each group with a mode chip in its accent (Metro `#2563eb`, Tram `#7c3aed`, Bus `#0891b2`, Ferry `#0d9488`, Train `#d97706`, Everything `#111`). For the NL groups, Intercity/Provinces/All all use Train amber.
  - Each row shows the name, stop count, best score/accuracy, and a small progress ring (mastered/stops). Locked rows are greyed and show the rule ("70% on 3 tram lines"). Tram/bus line packs sit behind a collapsible "Lines (14)" sub-list so the panel stays short.
  - A "Continue (123/980)" button appears when a resume exists. A "Hard" toggle appears when `canHardMode` is true.
  - Hovering a row previews the pack: its lines in real colours and its stops as dots, then `fitBounds` to the pack's stops.
- In play: `saveResume` after every answered station when the pack has more than `RESUME_MIN_STOPS` stops. On finish: `clearResume`, `recordRun`, `saveProgress`, `updatePlaceMarker`. Mastered stops get the `mastered` state in previews (filled `#111`).
- Streak chip: hidden at 0, shown in ink from 1, turns amber with a small pop at 5/10/25.
- Hard mode: `showPack(..., { hard: true })` adds no line layers.

- [ ] **Step 1:** Implement the above.
- [ ] **Step 2: Verify in a browser.** Expected: the Amsterdam picker lists the Metro/Tram/Bus/Ferry/Train/Everything groups, and Tram-All, Bus-All and Everything are locked with readable rules. Finishing Metro updates its best score and the globe ring. In the devtools console, setting progress so that 3 tram lines are at 0.8 unlocks Tram-All after a reload. Quitting a bus area pack with >50 stops midway and reloading offers Continue at the same station. Hard mode shows dots only.
- [ ] **Step 3:** Commit: `findthestation: pack picker, unlocks, resume, hard mode`

---

### Task 10: Homepage card, mobile pass, final verification

**Files:**
- Modify: `index.html` (add a `game-row` card linking `/findthestation/` with `--accent: #2563eb`, matching the existing rows' markup, including title and short description "Guess where every station is.")
- Modify: `findthestation/css/style.css`, `findthestation/index.html` as needed

- [ ] **Step 1:** Add the homepage card by copying the structure of the `/chess/` row at `index.html:372`.
- [ ] **Step 2: Mobile pass.** Check with a 390×844 viewport: no horizontal scroll, 16 px side gutters, the prompt card doesn't cover more than the top 20% of the screen, the pack picker is a scrollable bottom sheet, tap targets are at least 44 px, and tapping close to a dot hits it (22 px radius).
- [ ] **Step 3:** Run `node --test findthestation/tests/*.test.mjs`. Expected: all PASS. Do a full browser run-through: globe → Amsterdam → Metro (finish) → back → Netherlands → Intercity (a few stations) → globe. No console errors.
- [ ] **Step 4:** Commit: `findthestation: homepage card + mobile polish`
