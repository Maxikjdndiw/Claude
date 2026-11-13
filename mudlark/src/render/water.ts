// The water surface: moving ripples, a reflection of the sky that gets
// stronger at flat viewing angles, and a glint of the sun.
import * as THREE from 'three';
import type { SkyUniforms } from './scene';

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform float time;
uniform float night;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 horizon;
uniform vec3 zenith;
uniform float fogNear;
uniform float fogFar;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Height of the ripples at a point.
float wave(vec2 p) {
  return noise(p * 0.35 + time * vec2(0.25, 0.12)) + 0.5 * noise(p * 0.9 - time * vec2(0.2, 0.3)) + 0.25 * noise(p * 2.3 + time * 0.4);
}

void main() {
  vec2 p = vWorld.xz;
  float e = 0.3;
  float h0 = wave(p);
  vec3 n = normalize(vec3((h0 - wave(p + vec2(e, 0.0))) * 0.9, e, (h0 - wave(p + vec2(0.0, e))) * 0.9));
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 v = toEye / dist;
  // Far away the ripples are smaller than a pixel: fade them out.
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 200.0, dist)));

  float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.6, r.y));
  vec3 deep = vec3(0.04, 0.2, 0.27) * (1.0 - night * 0.75);
  vec3 color = mix(deep, sky, fresnel);
  color += sunColor * pow(max(dot(r, sunDir), 0.0), 220.0) * 1.6;

  float fog = smoothstep(fogNear, fogFar, dist);
  color = mix(color, horizon, fog);
  gl_FragColor = vec4(color, mix(0.7, 0.97, fresnel));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeWater(sky: SkyUniforms, fog: THREE.Fog): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: sky.time,
      night: sky.night,
      sunDir: sky.sunDir,
      sunColor: sky.sunColor,
      horizon: sky.horizon,
      zenith: sky.zenith,
      fogNear: { value: fog.near },
      fogFar: { value: fog.far },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}
