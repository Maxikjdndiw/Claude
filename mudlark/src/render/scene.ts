// Renderer, sky, fog, lights and the test ground. Rendering only.
import * as THREE from 'three';
import { GROUND_HALF_SIZE, type CourseBox } from '../sim/testCourse';

const SKY = 0xf3c9a0; // warm late-afternoon haze

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3(-30, 38, -22);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 40, 190);

    // Sky light from above, warm bounce light from the ground.
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x8a6a45, 1.1));
    this.sun = new THREE.DirectionalLight(0xffd9a3, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -28;
    cam.right = cam.top = 28;
    cam.near = 1;
    cam.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.makeGround());
  }

  /** Flat ground with a soft patchwork so you can see how fast you move. */
  private makeGround(): THREE.Mesh {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const tones = ['#8fae62', '#86a65c', '#98b56a', '#7f9f58'];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        // Fixed pattern (no Math.random): the ground looks the same every time.
        ctx.fillStyle = tones[(x * 3 + y * 5 + ((x * y) % 3)) % tones.length];
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.setScalar(GROUND_HALF_SIZE / 16); // one tile = 4 m
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_HALF_SIZE * 2, GROUND_HALF_SIZE * 2),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  /** Adds a box of the test course and returns its mesh. */
  addBox(box: CourseBox): THREE.Mesh {
    const he = box.halfExtents;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2),
      new THREE.MeshLambertMaterial({ color: box.color, flatShading: true }),
    );
    mesh.position.set(box.position.x, box.position.y, box.position.z);
    mesh.quaternion.set(box.rotation.x, box.rotation.y, box.rotation.z, box.rotation.w);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  /** The shadow area is small and follows the player, which keeps shadows sharp. */
  followWithSun(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }
}
