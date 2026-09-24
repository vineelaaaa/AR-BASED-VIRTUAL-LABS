// =============================================================
// Ohm's Law Circuit Lab — interactive 3D scene (Three.js)
// V = I x R   |   I = V / R   |   P = V x I
// The scene builds immediately but sits behind a lock overlay
// until the drag-and-drop circuit builder reports "connected".
// =============================================================

(function () {
  const host = document.getElementById("canvasHost");
  const width = host.clientWidth;
  const height = host.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f6fd);
  scene.fog = new THREE.Fog(0xf3f6fd, 14, 30);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(6, 5, 9);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.target.set(0, 0.3, 0);

  // ---- Lighting ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.PointLight(0x0891a8, 1.0, 30);
  key.position.set(5, 8, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0xc97a1c, 0.4, 30);
  rim.position.set(-6, 4, -4);
  scene.add(rim);

  // ---- Bench / base plate ----
  const bench = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: 0xe7ecf5, metalness: 0.1, roughness: 0.9 })
  );
  bench.position.y = -1.6;
  scene.add(bench);
  const grid = new THREE.GridHelper(11, 22, 0xc7d1e3, 0xd8e0ee);
  grid.position.y = -1.49;
  scene.add(grid);

  // ---- Circuit loop path ----
  const pts = [
    new THREE.Vector3(-3, 1, 0),
    new THREE.Vector3(3, 1, 0),
    new THREE.Vector3(3, -1, 0),
    new THREE.Vector3(-3, -1, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.02);
  const wireGeo = new THREE.TubeGeometry(curve, 200, 0.05, 12, true);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x7c8aa8, metalness: 0.5, roughness: 0.35 });
  const wire = new THREE.Mesh(wireGeo, wireMat);
  scene.add(wire);

  const circuitGroup = new THREE.Group();
  scene.add(circuitGroup);

  // ---- Battery (left side) ----
  const battery = new THREE.Group();
  const battBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.5, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2b3a5c, metalness: 0.3, roughness: 0.5 })
  );
  battery.add(battBody);
  const battPlus = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.12, 0.74),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x551111 })
  );
  battPlus.position.y = 0.75;
  battery.add(battPlus);
  const battMinus = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.12, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  battMinus.position.y = -0.75;
  battery.add(battMinus);
  battery.position.set(-3, 0, 0);
  circuitGroup.add(battery);

  function makeLabel(text, color) {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.4, 0.4, 0.4);
    return sprite;
  }
  const plusLabel = makeLabel("+", "#ff6b6b");
  plusLabel.position.set(-3, 0.95, 0.5);
  scene.add(plusLabel);
  const minusLabel = makeLabel("−", "#101a2e");
  minusLabel.position.set(-3, -0.95, 0.5);
  scene.add(minusLabel);

  // ---- Resistor (right side) ----
  const resistor = new THREE.Group();
  const resBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 1.3, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8d2a0, roughness: 0.6 })
  );
  resistor.add(resBody);
  const bandColors = [0x8b5a2b, 0x000000, 0xff6b6b, 0xc97a1c];
  bandColors.forEach((c, i) => {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.335, 0.335, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: c })
    );
    band.position.y = -0.45 + i * 0.28;
    resistor.add(band);
  });
  resistor.position.set(3, 0, 0);
  circuitGroup.add(resistor);

  // ---- Ammeter (top) ----
  const ammeter = new THREE.Group();
  const ammBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.25, 32),
    new THREE.MeshStandardMaterial({ color: 0x2b3a5c, metalness: 0.4, roughness: 0.4 })
  );
  ammBody.rotation.x = Math.PI / 2;
  ammeter.add(ammBody);
  const ammFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 32),
    new THREE.MeshStandardMaterial({ color: 0xf3f6fd, emissive: 0x0f3a37 })
  );
  ammFace.position.z = 0.13;
  ammeter.add(ammFace);
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.03, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0891a8, emissive: 0x0891a8 })
  );
  needle.position.set(0.16, 0, 0.15);
  needle.geometry.translate(-0.16, 0, 0);
  ammeter.add(needle);
  ammeter.position.set(0, 1, 0);
  circuitGroup.add(ammeter);

  // ---- Current-flow particles ----
  const PARTICLE_COUNT = 26;
  const particles = [];
  const particleGeo = new THREE.SphereGeometry(0.07, 12, 12);
  const particleMat = new THREE.MeshStandardMaterial({
    color: 0x0891a8, emissive: 0x0891a8, emissiveIntensity: 1.4,
  });
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat);
    const t0 = i / PARTICLE_COUNT;
    p.userData.t = t0;
    const pos = curve.getPointAt(t0);
    p.position.copy(pos);
    scene.add(p);
    particles.push(p);
  }

  // =========================================================
  // Physics state
  // =========================================================
  const voltageSlider = document.getElementById("voltageSlider");
  const resistanceSlider = document.getElementById("resistanceSlider");
  const vVal = document.getElementById("vVal");
  const rVal = document.getElementById("rVal");
  const currentReadout = document.getElementById("currentReadout");
  const powerReadout = document.getElementById("powerReadout");

  let V = parseFloat(voltageSlider.value);
  let R = parseFloat(resistanceSlider.value);
  let I = V / R;

  function update() {
    V = parseFloat(voltageSlider.value);
    R = parseFloat(resistanceSlider.value);
    I = V / R;
    const P = V * I;

    vVal.textContent = V.toFixed(1) + " V";
    rVal.textContent = R.toFixed(0) + " Ω";
    currentReadout.textContent = I.toFixed(3) + " A";
    powerReadout.textContent = P.toFixed(2) + " W";

    const angle = THREE.MathUtils.clamp(I * 8, -1.3, 1.3);
    needle.rotation.z = angle;
    particleMat.emissiveIntensity = THREE.MathUtils.clamp(0.6 + I * 2, 0.6, 3.5);
  }

  let debounceTimer = null;
  function logChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      logActivity("ohm", "adjust_parameters", { voltage: V, resistance: R, current: I.toFixed(3) });
    }, 800);
  }

  voltageSlider.addEventListener("input", () => { update(); logChange(); });
  resistanceSlider.addEventListener("input", () => { update(); logChange(); });

  document.getElementById("resetBtn").addEventListener("click", () => {
    voltageSlider.value = 6; resistanceSlider.value = 10;
    update(); logActivity("ohm", "reset", {});
  });
  document.getElementById("randomBtn").addEventListener("click", () => {
    voltageSlider.value = (Math.random() * 19 + 1).toFixed(1);
    resistanceSlider.value = Math.round(Math.random() * 99 + 1);
    update(); logActivity("ohm", "randomize", { voltage: V, resistance: R });
  });

  update();
  logActivity("ohm", "open_experiment", {});

  if (typeof window.registerARScene === "function") {
    window.registerARScene({
      scene, camera, renderer, controls,
      groundY: -1.5, fogNear: 14, orbitTargetY: 0.3,
      hideInAR: [bench, grid],
    });
  }

  // Expose current readout for the mock test tab
  window.getOhmState = () => ({ v: V, r: R, i: I });

  // =========================================================
  // Animation loop — particles only flow once circuit is "live"
  // =========================================================
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const isLive = window.circuitBuilderState && window.circuitBuilderState.connected;

    if (isLive) {
      const speed = THREE.MathUtils.clamp(I * 0.12, 0.01, 0.9);
      particles.forEach((p) => {
        p.userData.t = (p.userData.t + speed * dt) % 1;
        const pos = curve.getPointAt(p.userData.t);
        p.position.copy(pos);
      });
      circuitGroup.rotation.y += 0.0015;
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
