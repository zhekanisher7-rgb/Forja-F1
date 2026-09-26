import * as THREE from 'three';
import type { VehicleState } from '../physics/VehiclePhysics';

export type CameraMode = 'chase' | 'cockpit';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private target = new THREE.Vector3();
  private currentPos = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1200);
    this.camera.position.set(0, 8, -12);
  }

  toggle(): void {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
  }

  setMode(m: CameraMode): void {
    this.mode = m;
  }

  update(state: VehicleState, dt: number): void {
    const y = state.y ?? 0;
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

    if (this.mode === 'chase') {
      const lookAhead = Math.min(12, 4 + Math.abs(state.speed) * 0.15);
      this.target.set(state.x, y + 0.8, state.z).addScaledVector(forward, lookAhead);
      const desired = new THREE.Vector3(state.x, y, state.z)
        .addScaledVector(forward, -8 - Math.abs(state.speed) * 0.04)
        .add(new THREE.Vector3(0, 3.2 + Math.abs(state.speed) * 0.01, 0));
      desired.addScaledVector(right, state.angularVel * 2);

      const lerp = 1 - Math.pow(0.001, dt);
      this.currentPos.lerp(desired, Math.min(1, lerp * 3));
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.target);
      this.camera.fov = 55 + Math.min(15, Math.abs(state.speed) * 0.12);
      this.camera.updateProjectionMatrix();
    } else {
      const pos = new THREE.Vector3(state.x, y + 0.85, state.z).addScaledVector(forward, 0.45);
      this.camera.position.copy(pos);
      const look = pos.clone().addScaledVector(forward, 10).add(new THREE.Vector3(0, 0.1, 0));
      this.camera.lookAt(look);
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
      this.currentPos.copy(pos);
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
