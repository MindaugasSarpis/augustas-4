// Volumetric space station rendered in WebGL2 (orthographic, station units: x right, y down, z towards the viewer).
// The canvas covers local -420..420 × -210..210. The porthole (radius 44 at the front of the main module)
// is a real hole: those fragments are discarded so the lab layers underneath show through.
window.createStation = function (canvas) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;

  const VS = `#version 300 es
    in vec3 p; in vec3 n; in float m; in vec2 t;
    uniform mat3 R; uniform vec2 hsz;
    out vec3 vN; out vec3 vP; flat out float vM; out vec2 vT;
    void main(){
      vec3 q = R * p;
      vN = R * n; vP = p; vM = m; vT = t;
      gl_Position = vec4(q.x / hsz.x, -q.y / hsz.y, -q.z / 600.0, 1.0);
    }`;
  const FS = `#version 300 es
    precision highp float;
    in vec3 vN; in vec3 vP; flat in float vM; in vec2 vT;
    uniform float beacon;
    out vec4 o;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    void main(){
      int M = int(vM + 0.5);
      // porthole: a real hole in the front of the main module
      if (M == 0 && vP.z > 0.0 && vP.x * vP.x + vP.y * vP.y < 44.0 * 44.0) discard;
      vec3 N = normalize(gl_FrontFacing ? vN : -vN);
      vec3 L = normalize(vec3(-0.45, -0.7, 0.55));      // sun: upper left, in front
      vec3 V = vec3(0.0, 0.0, 1.0);
      vec3 H = normalize(L + V);
      float diff = max(dot(N, L), 0.0);
      float spec = pow(max(dot(N, H), 0.0), 40.0);
      float earthshine = max(N.y, 0.0) * 0.35;        // blue light from the planet below
      // units per pixel: fade fine patterns out when they get smaller than a few pixels (no shimmer)
      float upp = fwidth(vP.x) + fwidth(vP.y) + fwidth(vP.z);
      float fine = 1.0 - smoothstep(1.5, 4.0, upp);
      vec3 base; float ks = 0.5;
      if (M == 0 || M == 8) {                           // white hull with panel seams
        base = vec3(0.86, 0.88, 0.92);
        float seam = smoothstep(0.0, 0.6 + upp, abs(fract(vP.x / 44.0 + 0.5) - 0.5) * 44.0);
        float ring = smoothstep(0.0, 0.8 + upp, abs(fract(atan(vP.y, vP.z) / 1.5708 + 0.5) - 0.5) * 30.0);
        base *= 1.0 - 0.45 * fine * (1.0 - min(seam, ring));
        base *= 0.92 + 0.08 * noise(vP.xy * 0.4) * fine;
      } else if (M == 1) {                              // gold multi-layer insulation
        float w = noise(vP.xy * 0.18 + vP.z * 0.05) * 0.6 + noise(vP.yz * 0.5) * 0.4;
        base = mix(vec3(0.55, 0.38, 0.12), vec3(0.95, 0.78, 0.38), w);
        float strap = smoothstep(0.93 - upp / 26.0, 0.93 + upp / 26.0, fract(vP.x / 26.0)) * fine;
        base = mix(base, vec3(0.25, 0.17, 0.06), strap * 0.7);
        ks = 0.9;
      } else if (M == 2) {                              // truss lattice
        float d = fract((vP.x + vP.y + vP.z) / 16.0);
        float stripe = mix(0.5, smoothstep(0.45 - upp / 16.0, 0.45 + upp / 16.0, d), fine);
        base = mix(vec3(0.25, 0.28, 0.34), vec3(0.78, 0.82, 0.88), stripe);
        ks = 0.2;
      } else if (M == 3) {                              // solar cells
        vec2 c = fract(vT / vec2(12.0, 14.0));
        vec2 aa = vec2(upp / 12.0, upp / 14.0);
        float line = smoothstep(0.08 - aa.x, 0.08 + aa.x, c.x) * smoothstep(0.07 - aa.y, 0.07 + aa.y, c.y);
        line = mix(0.86, line, fine);
        base = mix(vec3(0.05, 0.09, 0.2), vec3(0.12, 0.24, 0.55), line);
        base += vec3(0.08, 0.1, 0.16) * mix(0.5, smoothstep(0.5 - aa.y, 0.5 + aa.y, c.y), fine) * line;
        ks = 0.6; spec = pow(max(dot(N, H), 0.0), 12.0);
      } else if (M == 4) {                              // radiator
        base = vec3(0.9, 0.92, 0.95) * (0.8 + 0.2 * mix(0.88, smoothstep(0.12 - upp / 9.0, 0.12 + upp / 9.0, fract(vT.x / 9.0)), fine));
        ks = 0.15;
      } else if (M == 5) {                              // beacon
        o = vec4(mix(vec3(0.35, 0.05, 0.05), vec3(1.0, 0.35, 0.3), beacon), 1.0); return;
      } else if (M == 6) {                              // porthole bezel: brushed steel
        float a = atan(vP.y, vP.x);
        float b = 0.55 + 0.45 * sin(a * 2.0 + 0.8);
        base = mix(vec3(0.2, 0.22, 0.27), vec3(0.93, 0.95, 0.98), b);
        float r = length(vP.xy);
        base *= 0.75 + 0.25 * smoothstep(40.0, 42.0, r) * (1.0 - smoothstep(50.0, 52.0, r));
        ks = 0.8;
      } else {                                          // dark fittings
        base = vec3(0.22, 0.25, 0.3); ks = 0.4;
      }
      vec3 col = base * (0.16 + 0.84 * diff) + vec3(0.25, 0.45, 0.9) * earthshine * base
                 + vec3(1.0) * spec * ks * (0.3 + 0.7 * diff);
      o = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`;
  const sh = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(h)); return null; } return h; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); return null; }
  gl.useProgram(pr);

  // ---------- geometry ----------
  const P = [], Nn = [], Mm = [], T = [], I = [];
  let vcount = 0;
  const push = (p, n, m, t) => { P.push(...p); Nn.push(...n); Mm.push(m); T.push(...t); return vcount++; };
  const quad = (a, b, c, d) => I.push(a, b, c, a, c, d);

  // capsule along x: cylinder with hemispherical caps
  function capsule(x0, x1, r, m, seg = 36, capSeg = 8) {
    const rings = [];
    const addRing = (x, rr, nx) => {   // nx: normal x component (0 on the barrel)
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
        const ny = cy * Math.sqrt(1 - nx * nx), nz = sz * Math.sqrt(1 - nx * nx);
        ring.push(push([x, rr * cy, rr * sz], [nx, ny, nz], m, [x, a * r]));
      }
      rings.push(ring);
    };
    for (let j = capSeg; j >= 1; j--) { const t = j / capSeg * Math.PI / 2; addRing(x0 - r * Math.sin(t) * 0.6, r * Math.cos(t), -Math.sin(t)); }
    addRing(x0, r, 0); addRing(x1, r, 0);
    for (let j = 1; j <= capSeg; j++) { const t = j / capSeg * Math.PI / 2; addRing(x1 + r * Math.sin(t) * 0.6, r * Math.cos(t), Math.sin(t)); }
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++)
      quad(rings[k][i], rings[k + 1][i], rings[k + 1][i + 1], rings[k][i + 1]);
  }
  function cylinderY(x, z, y0, y1, r, m, seg = 16) {   // vertical post
    const r0 = [], r1 = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      r0.push(push([x + r * c, y0, z + r * s], [c, 0, s], m, [0, 0])); r1.push(push([x + r * c, y1, z + r * s], [c, 0, s], m, [0, 0])); }
    for (let i = 0; i < seg; i++) quad(r0[i], r0[i + 1], r1[i + 1], r1[i]);
  }
  function box(x0, x1, y0, y1, z0, z1, m) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const f = (pts, n) => { const ids = pts.map(p => push(p, n, m, [p[0], p[1]])); quad(ids[0], ids[1], ids[2], ids[3]); };
    f([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [0, 0, 1]);
    f([[x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]], [0, 0, -1]);
    f([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]);
    f([[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], [1, 0, 0]);
    f([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], [0, -1, 0]);
    f([[x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]], [0, 1, 0]);
  }
  function panel(x0, x1, y0, y1, z, m) {   // thin double-sided sheet
    box(x0, x1, y0, y1, z - 0.6, z + 0.6, m);
  }
  function sphere(cx, cy, cz, r, m, seg = 12) {
    const rings = [];
    for (let j = 0; j <= seg; j++) { const t = j / seg * Math.PI, ring = [];
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2;
        const n = [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)];
        ring.push(push([cx + r * n[0], cy + r * n[1], cz + r * n[2]], n, m, [0, 0])); }
      rings.push(ring); }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) quad(rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]);
  }
  function annulus(cx, cy, z, r0, r1, m, seg = 48) {
    const a0 = [], a1 = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      a0.push(push([cx + r0 * c, cy + r0 * s, z], [0, 0, 1], m, [0, 0])); a1.push(push([cx + r1 * c, cy + r1 * s, z], [0, 0, 1], m, [0, 0])); }
    for (let i = 0; i < seg; i++) quad(a0[i], a0[i + 1], a1[i + 1], a1[i]);
  }

  // main module (with the porthole), couplings, gold side modules
  capsule(-100, 100, 38, 0);
  capsule(-212, -118, 44, 1); capsule(118, 212, 44, 1);
  box(-116, -100, -46, 46, -46, 46, 8); box(100, 116, -46, 46, -46, 46, 8);
  annulus(0, 0, 38.5, 40, 53, 6);
  annulus(0, 0, 38.2, 34, 40.5, 7);
  // truss (two segments so nothing shows through the porthole) and solar wings
  box(-392, -214, -7, 7, -26, -12, 2); box(214, 392, -7, 7, -26, -12, 2);
  for (const sx of [-1, 1]) {
    panel(sx * 205, sx * 385, -78, -8, -19, 3); panel(sx * 205, sx * 385, 8, 78, -19, 3);
    box(sx * 205, sx * 385, -3, 3, -22, -16, 2);
    panel(sx * 236, sx * 290, 12, 102, -19, 4);           // radiator
  }
  // antenna + beacon, small dish post
  cylinderY(0, 0, -108, -38, 2.5, 7);
  sphere(0, -114, 0, 7, 5);
  cylinderY(70, 0, -70, -36, 2, 7); sphere(70, -74, 0, 9, 8, 10);

  const buf = (data, loc, size) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(pr, loc); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
  };
  buf(P, "p", 3); buf(Nn, "n", 3); buf(Mm, "m", 1); buf(T, "t", 2);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW);

  const uR = gl.getUniformLocation(pr, "R"), uHalf = gl.getUniformLocation(pr, "hsz"), uBeacon = gl.getUniformLocation(pr, "beacon");
  gl.uniform2f(uHalf, 420, 210);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
  gl.clearColor(0, 0, 0, 0);
  gl.viewport(0, 0, canvas.width, canvas.height);

  // CSS-compatible rotation: rotateX(ax) · rotateY(ay), y down, z towards the viewer
  function matrix(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    // column-major mat3 for p' = Rx · Ry · p
    return new Float32Array([
      cy, sx * sy, -cx * sy,
      0, cx, sx,
      sy, -sx * cy, cx * cy,
    ]);
  }
  return {
    resize(w, h) { gl.viewport(0, 0, w, h); },
    draw(axDeg, ayDeg, beacon) {
      gl.uniformMatrix3fv(uR, false, matrix(axDeg * Math.PI / 180, ayDeg * Math.PI / 180));
      gl.uniform1f(uBeacon, beacon);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, I.length, gl.UNSIGNED_INT, 0);
    },
  };
};
