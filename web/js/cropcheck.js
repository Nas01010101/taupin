// Is the square an active crop field? Taupin rule: a crop needs open ground, so when half or more
// of the cells sit under lidar canopy of 3 m or more, the square cannot be one field of crops.
// The park square in the demo is 68 % trees and reads "not an active crop field". Pure functions.
export const TREE_M = 3;
export const MAX_TREE_SHARE = 0.5;

// canopy: decoded lidar canopy heights in metres, NaN for no data; absent where there is no lidar.
// Returns 0..1 or null.
export function treeShare(canopy) {
  let trees = 0, n = 0;
  for (const h of canopy ?? []) {
    if (Number.isNaN(h)) continue;
    n++;
    if (h >= TREE_M) trees++;
  }
  return n ? trees / n : null;
}

// share: from treeShare; areaHa: the square; openHa: open ground where traps can go (may be absent).
export function cropStatus(share, areaHa, openHa) {
  if (share == null) return null;
  const pct = Math.round(share * 100), active = share < MAX_TREE_SHARE;
  const open = openHa != null ? `, ${openHa} ha open` : '';
  return {
    active, treePct: pct,
    text: active
      ? `Active crop field: ${pct} % of ${areaHa} ha under trees of 3 m or more${open}`
      : `Not an active crop field: ${pct} % of ${areaHa} ha under trees of 3 m or more${open}. Rotation results here only demonstrate the app`,
  };
}
