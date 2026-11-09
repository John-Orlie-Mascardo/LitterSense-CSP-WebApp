/**
 * Which way a chart tooltip should open so it never covers the middle of a centered
 * donut chart: away from the center, on the side the pointer is on.
 * Pass the result to Recharts <Tooltip reverseDirection={...} />.
 */
export function tooltipAwayFromCenter(
  pointer: { readonly x: number; readonly y: number },
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
): { x: boolean; y: boolean } {
  return {
    x: pointer.x < box.left + box.width / 2,
    y: pointer.y < box.top + box.height / 2,
  };
}
