// =============================================================
// Simple Pendulum Lab — interactive 3D scene (Three.js)
// Numerically integrates theta'' = -(g/L) sin(theta) - c*theta'
// Displayed period uses the small-angle formula T = 2*pi*sqrt(L/g)
// =============================================================

(function () {
  const host = document.getElementById("canvasHost");
  const width = host.clientWidth;
  const height = host.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f6fd);
  scene.fog = new THREE.Fog(0xf3f6fd, 16, 32);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(5, 2.5, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  controls.target.set(0, 0.5, 0);

  scene.add(new THREE.AmbientLight(0x8899cc, 0.6));
  const key = new THREE.PointLight(0x4be9e0, 1.1, 30);
  key.position.set(5, 8, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0xffb454, 0.5, 30);
  rim.position.set(-6, 3, -4);
  scene.add(rim);

  // ---- Bench ----
  const bench = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: 0xe7ecf5, metalness: 0.1, roughness: 0.9 })
  );
  bench.position.y = -2.6;
  scene.add(bench);
  const grid = new THREE.GridHelper(10, 20, 0xc7d1e3, 0xd8e0ee);
  grid.position.y = -2.49;
  scene.add(grid);

  // ---- Stand (frame) ----
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2b3a5c, metalness: 0.6, roughness: 0.35 });
  const TOP_Y = 2.2;
  const legGeo = new THREE.CylinderGeometry(0.07, 0.09, TOP_Y - (-2.6), 12);

  const legL = new THREE.Mesh(legGeo, standMat);
  legL.position.set(-1.2, (TOP_Y + -2.6) / 2, -1.0);
  scene.add(legL);
  const legR = new THREE.Mesh(legGeo, standMat);
  legR.position.set(1.2, (TOP_Y + -2.6) / 2, -1.0);
  scene.add(legR);

  const crossGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12);
  const crossBar = new THREE.Mesh(crossGeo, standMat);
  crossBar.rotation.z = Math.PI / 2;
  crossBar.position.set(0, TOP_Y, -1.0);
  scene.add(crossBar);

  // pivot point (small sphere)
  const pivotGeo = new THREE.SphereGeometry(0.09, 16, 16);
  const pivotMat = new THREE.MeshStandardMaterial({ color: 0xffb454, emissive: 0x3a2200 });
  const pivot = new THREE.Mesh(pivotGeo, pivotMat);
  pivot.position.set(0, TOP_Y, 0);
  scene.add(pivot);

  // protractor arc (visual reference)
  const arcPts = [];
  const arcRadius = 1.0;
  for (let i = -90; i <= 90; i += 5) {
    const rad = THREE.MathUtils.degToRad(i);
    arcPts.push(new THREE.Vector3(Math.sin(rad) * arcRadius, TOP_Y - Math.cos(rad) * arcRadius, 0));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
  const arcMat = new THREE.LineDashedMaterial({ color: 0x5f7196, dashSize: 0.05, gapSize: 0.05 });
  const arcLine = new THREE.Line(arcGeo, arcMat);
  arcLine.computeLineDistances();
  scene.add(arcLine);

  // ---- String + Bob ----
  let stringMesh = null;
  const bobGeo = new THREE.SphereGeometry(0.28, 32, 32);
  const bobMat = new THREE.MeshStandardMaterial({ color: 0x4be9e0, emissive: 0x0f3a37, metalness: 0.4, roughness: 0.3 });
  const bob = new THREE.Mesh(bobGeo, bobMat);
  scene.add(bob);

  // trailing arc showing recent path (visual "AR motion trail")
  const TRAIL_LEN = 40;
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  const trailMat = new THREE.LineBasicMaterial({ color: 0x4be9e0, transparent: true, opacity: 0.35 });
  const trail = new THREE.Line(trailGeo, trailMat);
  scene.add(trail);
  let trailBuffer = [];

  function updateString(bobPos) {
    if (stringMesh) scene.remove(stringMesh);
    const pts = [new THREE.Vector3(0, TOP_Y, 0), bobPos];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x101a2e });
    stringMesh = new THREE.Line(geo, mat);
    scene.add(stringMesh);
  }

  // =========================================================
  // Physics state
  // =========================================================
  const lengthSlider = document.getElementById("lengthSlider");
  const gravitySlider = document.getElementById("gravitySlider");
  const angleSlider = document.getElementById("angleSlider");
  const dampingSlider = document.getElementById("dampingSlider");
  const lVal = document.getElementById("lVal");
  const gVal = document.getElementById("gVal");
  const aVal = document.getElementById("aVal");
  const dVal = document.getElementById("dVal");
  const periodReadout = document.getElementById("periodReadout");
  const freqReadout = document.getElementById("freqReadout");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");

  let L = parseFloat(lengthSlider.value);
  let g = parseFloat(gravitySlider.value);
  let theta = THREE.MathUtils.degToRad(parseFloat(angleSlider.value));
  let omega = 0;
  let damping = parseFloat(dampingSlider.value);
  let running = true;

  function computeVisualScale() {
    // Keep bob reachable on screen regardless of L (1 to 3.5 world units)
    return THREE.MathUtils.clamp(L, 0.3, 3);
  }

  function refreshReadouts() {
    L = parseFloat(lengthSlider.value);
    g = parseFloat(gravitySlider.value);
    damping = parseFloat(dampingSlider.value);
    lVal.textContent = L.toFixed(1) + " m";
    gVal.textContent = g.toFixed(1) + " m/s²";
    aVal.textContent = angleSlider.value + "°";
    dVal.textContent = damping.toFixed(2);

    const T = 2 * Math.PI * Math.sqrt(L / g);
    periodReadout.textContent = T.toFixed(2) + " s";
    freqReadout.textContent = (1 / T).toFixed(2) + " Hz";
  }

  function releasePendulum() {
    theta = THREE.MathUtils.degToRad(parseFloat(angleSlider.value));
    omega = 0;
    trailBuffer = [];
    running = true;
    pauseBtn.textContent = "Pause";
    refreshReadouts();
    logActivity("pendulum", "release", { length: L, gravity: g, angle: angleSlider.value });
  }

  let debounceTimer = null;
  function logChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      logActivity("pendulum", "adjust_parameters", { length: L, gravity: g, damping });
    }, 800);
  }

  [lengthSlider, gravitySlider, dampingSlider].forEach((el) =>
    el.addEventListener("input", () => { refreshReadouts(); logChange(); })
  );
  angleSlider.addEventListener("input", () => { refreshReadouts(); });
  angleSlider.addEventListener("change", () => { releasePendulum(); });

  pauseBtn.addEventListener("click", () => {
    running = !running;
    pauseBtn.textContent = running ? "Pause" : "Resume";
  });
  resetBtn.addEventListener("click", releasePendulum);

  refreshReadouts();
  logActivity("pendulum", "open_experiment", {});
  window.getPendulumState = () => ({ l: L, g: g });

  if (typeof window.registerARScene === "function") {
    window.registerARScene({
      scene, camera, renderer, controls,
      groundY: -2.6, fogNear: 14, orbitTargetY: 0.5,
      hideInAR: [bench, grid],
    });
  }

  // =========================================================
  // Animation loop — RK4-ish semi-implicit Euler integration
  // =========================================================
  const clock = new THREE.Clock();

  function step(dt) {
    const Lv = computeVisualScale();
    const angAccel = -(g / Math.max(L, 0.1)) * Math.sin(theta) - damping * omega;
    omega += angAccel * dt;
    theta += omega * dt;

    const x = Lv * Math.sin(theta);
    const y = TOP_Y - Lv * Math.cos(theta);
    const bobPos = new THREE.Vector3(x, y, 0);
    bob.position.copy(bobPos);
    updateString(bobPos);

    trailBuffer.push(bobPos.clone());
    if (trailBuffer.length > TRAIL_LEN) trailBuffer.shift();
    const posAttr = trail.geometry.attributes.position;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const p = trailBuffer[i] || bobPos;
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
  }

  // initialize bob position at t=0
  step(0);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.033);
    if (running) {
      // sub-step for stability
      const sub = 4;
      for (let i = 0; i < sub; i++) step(dt / sub);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    const w = host.clientWidth, h = host.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
})();
