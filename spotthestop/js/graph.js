// Stop adjacency graph and hop distance (BFS).
export function buildGraph(lines) {
  const g = new Map();
  const add = (a, b) => {
    if (!g.has(a)) g.set(a, new Set());
    g.get(a).add(b);
  };
  for (const line of lines) {
    for (const [a, b] of line.edges || []) {
      if (a === b) continue;
      add(a, b);
      add(b, a);
    }
  }
  return g;
}

export function hopDistance(graph, from, to) {
  if (from === to) return 0;
  if (!graph.has(from) || !graph.has(to)) return null;
  const seen = new Set([from]);
  let frontier = [from];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next = [];
    for (const n of frontier) {
      for (const m of graph.get(n)) {
        if (m === to) return depth;
        if (!seen.has(m)) { seen.add(m); next.push(m); }
      }
    }
    frontier = next;
  }
  return null;
}
