// =============================================================
// Convex / Concave Lens Optics Lab — interactive 3D scene
// Lens formula (Cartesian sign convention): 1/v - 1/u = 1/f
// Magnification: m = v/u
// =============================================================

(function () {
  const host = document.getElementById("canvasHost");
  const width = host.clientWidth;
  const height = host.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f6fd);
  scene.fog = new THREE.Fog(0xf3f6fd, 20, 45);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(3, 4, 12);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 26;
  controls.target.set(0, 0.6, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.PointLight(0x0891a8, 1.0, 40);
  key.position.set(6, 10, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0xc97a1c, 0.4, 40);
  rim.position.set(-6, 4, -6);
  scene.add(rim);

  // ---- Optical bench ----
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.15, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xe7ecf5, roughness: 0.9 })
  );
  bench.position.y = -1.4;
  scene.add(bench);
  const grid = new THREE.GridHelper(16, 32, 0xc7d1e3, 0xd8e0ee);
  grid.position.y = -1.32;
  scene.add(grid);

  // ---- Principal axis ----
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-8, 0, 0), new THREE.Vector3(8, 0, 0),
  ]);
  const axisMat = new THREE.LineDashedMaterial({ color: 0x9aa6bd, dashSize: 0.2, gapSize: 0.12 });
  const axisLine = new THREE.Line(axisGeo, axisMat);
  axisLine.computeLineDistances();
  scene.add(axisLine);

  // =========================================================
  // Lens geometry (true spherical-cap solid of revolution)
  // =========================================================
  const APERTURE = 1.4;      // lens radius (vertical extent)
  const CURVE_RADIUS = 2.6;  // radius of curvature of each surface

  let lensMesh = null;
  function buildLens(type) {
    if (lensMesh) { scene.remove(lensMesh); lensMesh.geometry.dispose(); }

    const steps = 28;
    const points = [];
    const centerHalf = type === "convex" ? 0.32 : 0.06;
    const sag = (rho) => CURVE_RADIUS - Math.sqrt(Math.max(CURVE_RADIUS * CURVE_RADIUS - rho * rho, 0));

    // Trace from front pole -> rim -> back pole (Lathe revolves around Y = optical axis)
    for (let i = 0; i <= steps; i++) {
      const rho = (APERTURE * i) / steps;
      const s = sag(rho);
      const zFront = type === "convex" ? centerHalf - s : centerHalf + s;
      points.push(new THREE.Vector2(rho, zFront));
    }
    for (let i = steps; i >= 0; i--) {
      const rho = (APERTURE * i) / steps;
      const s = sag(rho);
      const zBack = type === "convex" ? -(centerHalf - s) : -(centerHalf + s);
      points.push(new THREE.Vector2(rho, zBack));
    }

    const geo = new THREE.LatheGeometry(points, 48);
    geo.rotateZ(Math.PI / 2); // align revolve axis (Y) with our optical axis (X)
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0891a8, transparent: true, opacity: 0.35, roughness: 0.05,
      metalness: 0, transmission: 0.6, thickness: 0.5, side: THREE.DoubleSide,
    });
    lensMesh = new THREE.Mesh(geo, mat);
    scene.add(lensMesh);
  }

  // lens rim ring for visibility
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(APERTURE, 0.03, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x2b3a5c })
  );
  rimRing.rotation.y = Math.PI / 2;
  scene.add(rimRing);

  // focal point markers
  function makeFocalDot() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xc97a1c, emissive: 0xc97a1c, emissiveIntensity: 0.6 })
    );
  }
  const f1Dot = makeFocalDot(); scene.add(f1Dot);
  const f2Dot = makeFocalDot(); scene.add(f2Dot);

  function makeTextLabel(text, color) {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 48;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 48, 32);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(0.6, 0.3, 0.6);
    return sprite;
  }
  const f1Label = makeTextLabel("F", "#c97a1c"); scene.add(f1Label);
  const f2Label = makeTextLabel("F'", "#c97a1c"); scene.add(f2Label);

  // ---- Object & image arrows ----
  function makeArrow(color) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1, 8),
      new THREE.MeshStandardMaterial({ color })
    );
    group.add(shaft);
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.22, 12),
      new THREE.MeshStandardMaterial({ color })
    );
    head.position.y = 0.5;
    group.add(head);
    return group;
  }
  const objectArrow = makeArrow(0x101a2e);
  scene.add(objectArrow);
  const imageArrowSolid = makeArrow(0x0891a8);
  scene.add(imageArrowSolid);

  // ---- Rays ----
  function drawRay(mesh, points, dashed) {
    if (mesh) scene.remove(mesh);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: 0xc97a1c, dashSize: 0.18, gapSize: 0.1 })
      : new THREE.LineBasicMaterial({ color: 0xc97a1c, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    scene.add(line);
    return line;
  }

  // =========================================================
  // UI + physics
  // =========================================================
  const convexBtn = document.getElementById("convexBtn");
  const concaveBtn = document.getElementById("concaveBtn");
  const objectSlider = document.getElementById("objectSlider");
  const focalSlider = document.getElementById("focalSlider");
  const uVal = document.getElementById("uVal");
  const fVal = document.getElementById("fVal");
  const vReadout = document.getElementById("vReadout");
  const mReadout = document.getElementById("mReadout");
  const natureReadout = document.getElementById("natureReadout");
  const orientReadout = document.getElementById("orientReadout");
  const resetBtn = document.getElementById("resetBtn");

  let lensType = "convex";
  const WORLD_SCALE = 0.08; // cm -> world units

  function setLensType(type) {
    lensType = type;
    convexBtn.className = type === "convex" ? "btn btn-solid btn-sm" : "btn btn-ghost btn-sm";
    concaveBtn.className = type === "concave" ? "btn btn-solid btn-sm" : "btn btn-ghost btn-sm";
    buildLens(type);
    update();
    logActivity("lens", "set_lens_type", { type });
  }
  convexBtn.addEventListener("click", () => setLensType("convex"));
  concaveBtn.addEventListener("click", () => setLensType("concave"));

  function update() {
    const u = parseFloat(objectSlider.value);
    const f = parseFloat(focalSlider.value);
    uVal.textContent = u.toFixed(0) + " cm";
    fVal.textContent = f.toFixed(0) + " cm";

    const uSigned = -u;
    const fSigned = lensType === "convex" ? f : -f;
    const denom = (1 / fSigned) + (1 / uSigned);

    let v, m, real, infinite = false;
    if (Math.abs(denom) < 1e-6) {
      infinite = true;
      v = uSigned > 0 ? 1e6 : -1e6;
      m = 0;
      real = true;
    } else {
      v = 1 / denom;
      m = v / uSigned;
      real = v > 0;
    }

    vReadout.textContent = infinite ? "∞ (at infinity)" : v.toFixed(2) + " cm";
    mReadout.textContent = infinite ? "—" : m.toFixed(2);
    natureReadout.textContent = real ? "Real" : "Virtual";
    orientReadout.textContent = (m < 0) ? "Inverted" : "Erect";

    // ---- 3D placement ----
    const objX = uSigned * WORLD_SCALE;
    const f1X = -Math.abs(fSigned) * WORLD_SCALE;
    const f2X = Math.abs(fSigned) * WORLD_SCALE;

    f1Dot.position.set(f1X, 0, 0);
    f2Dot.position.set(f2X, 0, 0);
    f1Label.position.set(f1X, 0.22, 0);
    f2Label.position.set(f2X, 0.22, 0);

    const clampedV = infinite ? Math.sign(v) * 6 / WORLD_SCALE : v;
    const clampedM = infinite ? 0 : m;
    const imgX = clampedV * WORLD_SCALE;

    // ---- object & image arrows (fixed display height so it stays readable) ----
    const OBJ_DISPLAY_H = 0.9;
    objectArrow.scale.set(1, OBJ_DISPLAY_H, 1);
    objectArrow.position.set(objX, 0, 0);

    const imgDisplayH = OBJ_DISPLAY_H * clampedM;
    imageArrowSolid.visible = real;
    imageArrowSolid.scale.set(1, Math.max(Math.abs(imgDisplayH), 0.02), 1);
    imageArrowSolid.position.set(imgX, 0, 0);
    imageArrowSolid.rotation.z = imgDisplayH < 0 ? Math.PI : 0;

    // ---- rays: object top -> lens plane -> image top ----
    const objTopDisplay = new THREE.Vector3(objX, OBJ_DISPLAY_H, 0);
    const lensTopPoint = new THREE.Vector3(0, OBJ_DISPLAY_H, 0);
    const lensCenterPoint = new THREE.Vector3(0, 0, 0);
    const imgTopPoint = new THREE.Vector3(imgX, imgDisplayH, 0);

    // ray 1: travels parallel to axis to the lens, then bends toward the image point
    const ray1Incoming = drawRay(null, [objTopDisplay, lensTopPoint], false);
    const ray1Outgoing = drawRay(null, [lensTopPoint, imgTopPoint], !real);
    // ray 2: straight line through the optical centre to the image point
    const ray2 = drawRay(null, [objTopDisplay, lensCenterPoint, imgTopPoint], !real);

    if (window.__lensRayCache) window.__lensRayCache.forEach((r) => scene.remove(r));
    window.__lensRayCache = [ray1Incoming, ray1Outgoing, ray2];
  }

  window.getLensState = () => ({
    type: lensType,
    u: parseFloat(objectSlider.value),
    f: parseFloat(focalSlider.value),
  });

  let debounceTimer = null;
  function logChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      logActivity("lens", "adjust_parameters", window.getLensState());
    }, 800);
  }

  objectSlider.addEventListener("input", () => { update(); logChange(); });
  focalSlider.addEventListener("input", () => { update(); logChange(); });
  resetBtn.addEventListener("click", () => {
    objectSlider.value = 30; focalSlider.value = 15;
    setLensType("convex");
  });

  buildLens("convex");
  update();
  logActivity("lens", "open_experiment", {});

  if (typeof window.registerARScene === "function") {
    window.registerARScene({
      scene, camera, renderer, controls,
      groundY: -1.4, fogNear: 20, orbitTargetY: 0.6,
      hideInAR: [bench, grid],
    });
  }

  // =========================================================
  // Animation loop
  // =========================================================
  function animate() {
    requestAnimationFrame(animate);
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
