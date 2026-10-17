import * as THREE from 'three';

// Extra gap (in world units) kept between two collision footprints.
// 0: characters stop when their footprints touch.
// Positive: they stop further apart. Negative: they may overlap by that amount.
export const COLLISION_DISTANCE = 0;

const vertex = new THREE.Vector3();

// Radius of a circle on the ground (XY) plane, centred on the model's origin,
// that contains every vertex of the model in its current pose.
// Call it before the model is added to a parent, so its world space is the model's own space.
export function computeCollisionRadius(model) {
  model.updateMatrixWorld(true);
  let radius = 0;

  model.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      // getVertexPosition also applies skinning for skinned meshes
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
    }
  });

  return radius;
}

// Whether moving `entity` to (nextX, nextY) collides with `other`.
// A move away from a character it already overlaps is allowed, so overlapping pairs can separate.
export function blocksMove(entity, nextX, nextY, other) {
  if (other === entity) return false;

  const minDistance =
    (entity.userData.collisionRadius ?? 0) + (other.userData.collisionRadius ?? 0) + COLLISION_DISTANCE;
  const nextDistance = Math.hypot(other.position.x - nextX, other.position.y - nextY);
  if (nextDistance >= minDistance) return false;

  const currentDistance = Math.hypot(other.position.x - entity.position.x, other.position.y - entity.position.y);
  return nextDistance <= currentDistance;
}

export function isMoveBlocked(entity, nextX, nextY, others) {
  return others.some((other) => blocksMove(entity, nextX, nextY, other));
}

const point = new THREE.Vector2();

function distanceToFootprint(footprint, x, y) {
  return footprint.distanceToPoint(point.set(x, y));
}

// Whether moving `entity` to (nextX, nextY) runs into an obstacle's rectangular footprint
// (`userData.footprint`, a Box2 on the ground). As with characters, a move away from an
// obstacle it already overlaps is allowed.
export function hitsObstacle(entity, nextX, nextY, obstacles) {
  const minDistance = (entity.userData.collisionRadius ?? 0) + COLLISION_DISTANCE;

  return obstacles.some((obstacle) => {
    const footprint = obstacle.userData.footprint;
    const nextDistance = distanceToFootprint(footprint, nextX, nextY);
    if (nextDistance >= minDistance) return false;
    return nextDistance <= distanceToFootprint(footprint, entity.position.x, entity.position.y);
  });
}

const closest = new THREE.Vector2();

// For an entity whose step is blocked by an obstacle: a unit direction along the nearest obstacle's
// surface (at right angles to the line from its closest point) that best follows (dirX, dirY).
// At a flat wall this slides along the wall; at a corner it curves around the corner.
// Returns null if there are no obstacles or the entity is inside one.
export function slideAlongObstacle(entity, dirX, dirY, obstacles) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const obstacle of obstacles) {
    const distance = distanceToFootprint(obstacle.userData.footprint, entity.position.x, entity.position.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = obstacle;
    }
  }
  if (!nearest || nearestDistance === 0) return null;

  // Unit vector from the obstacle's closest point out to the entity
  nearest.userData.footprint.clampPoint(point.set(entity.position.x, entity.position.y), closest);
  const normalX = (entity.position.x - closest.x) / nearestDistance;
  const normalY = (entity.position.y - closest.y) / nearestDistance;

  // Turn it 90° to follow the surface, picking the way that best matches the intended direction.
  // When both ways match equally, the same way is always chosen, so the entity can't hesitate.
  let tangentX = -normalY;
  let tangentY = normalX;
  if (tangentX * dirX + tangentY * dirY < 0) {
    tangentX = -tangentX;
    tangentY = -tangentY;
  }
  return { x: tangentX, y: tangentY };
}
