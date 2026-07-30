export interface LocationViewport {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function areLocationViewportsEqual(
  left: LocationViewport | null,
  right: LocationViewport,
) {
  return (
    left !== null &&
    left.west === right.west &&
    left.south === right.south &&
    left.east === right.east &&
    left.north === right.north
  );
}
