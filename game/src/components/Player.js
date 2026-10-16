import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATH = '/models/tode.glb';
const MODEL_SCALE = 20;

export function createPlayer(onLoad) {
  const player = new THREE.Group();
  player.position.set(0, 0, 0);

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;

      player.add(model);
      onLoad?.();
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return player;
}
