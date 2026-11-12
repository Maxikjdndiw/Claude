// Draws the winch rope as a chain of thin cylinders.
// A slack rope sags; a tight rope is straight and turns red under load.
import * as THREE from 'three';

const SEGMENTS = 10;
const UP = new THREE.Vector3(0, 1, 0);

export class RopeView {
  readonly group = new THREE.Group();
  private material = new THREE.MeshLambertMaterial({ color: 0xd8c49a });
  private pieces: THREE.Mesh[] = [];
  private slackColor = new THREE.Color(0xd8c49a);
  private tightColor = new THREE.Color(0xd9402a);
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor() {
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
    for (let i = 0; i < SEGMENTS; i++) {
      const m = new THREE.Mesh(geo, this.material);
      m.castShadow = true;
      this.pieces.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  /**
   * @param slack   rope length minus straight distance (metres, 0 when tight)
   * @param strain  0..1, how close the rope is to its maximum pull
   * @param groundY lowest height the rope may sag to at its middle
   */
  update(from: THREE.Vector3, to: THREE.Vector3, slack: number, strain: number, groundY: number): void {
    this.group.visible = true;
    this.material.color.copy(this.slackColor).lerp(this.tightColor, strain);
    const sag = Math.min(Math.sqrt(Math.max(0, slack)) * 1.2, Math.max(0, (from.y + to.y) / 2 - groundY - 0.05));
    const point = (t: number, out: THREE.Vector3) => out.lerpVectors(from, to, t).setY(THREE.MathUtils.lerp(from.y, to.y, t) - sag * 4 * t * (1 - t));
    for (let i = 0; i < SEGMENTS; i++) {
      point(i / SEGMENTS, this.a);
      point((i + 1) / SEGMENTS, this.b);
      const piece = this.pieces[i];
      this.dir.subVectors(this.b, this.a);
      const length = this.dir.length();
      piece.position.addVectors(this.a, this.b).multiplyScalar(0.5);
      piece.scale.set(1, length, 1);
      piece.quaternion.setFromUnitVectors(UP, this.dir.divideScalar(length || 1));
    }
  }

  hide(): void {
    this.group.visible = false;
  }
}
