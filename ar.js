// =============================================================
// AR View — real camera passthrough for the 3D experiments.
//
// Turning on AR:
//   1. opens the device's rear camera via getUserMedia and paints it
//      behind the WebGL canvas,
//   2. makes the Three.js scene background transparent so the 3D model
//      appears to sit in the room in front of you,
//   3. grounds the model with a soft contact shadow so it reads as a
//      physical object on a surface rather than a floating sprite,
//   4. on phones/tablets, couples the camera to the device's gyroscope so
//      moving your device looks around the model (real AR parallax).
//
// Experiment scenes register themselves via window.registerARScene(...).
// =============================================================

window.__arScene = null;

// Each experiment scene calls this once it has built its scene/camera/renderer.
window.registerARScene = function (payload) {
  window.__arScene = payload; // { scene, camera, renderer, controls, sceneRoot, groundY }
  if (window.__arPendingEnable) {
    window.__arPendingEnable = false;
    document.getElementById("arToggleBtn")?.click();
  }
};

(function () {
  const toggleBtn = document.getElementById("arToggleBtn");
  const video = document.getElementById("arVideo");
  const stage = document.getElementById("canvasStage");
  const hud = document.getElementById("arHud");
  if (!toggleBtn || !video || !stage) return;

  let arOn = false;
  let stream = null;
  let shadowMesh = null;
  let orientationHandler = null;
  let savedBackground = null;
  let savedCamPos = null;

  function setStatus(msg) {
    const hint = stage.closest(".canvas-panel")?.querySelector(".canvas-hint");
    if (hint) hint.textContent = msg;
  }

  // ---- Soft contact shadow so the model looks grounded in the room ----
  function makeContactShadow(THREE, groundY) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = groundY + 0.02;
    return mesh;
  }

  async function enableAR() {
    const ar = window.__arScene;
    if (!ar) {
      window.__arPendingEnable = true;
      setStatus("Preparing scene…");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("This browser can't access a camera — AR view unavailable.");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (err) {
      setStatus("Camera permission denied — AR view needs camera access.");
      return;
    }

    video.srcObject = stream;
    await video.play().catch(() => {});

    const THREE = window.THREE;
    // Make the WebGL layer transparent so the camera feed shows through
    savedBackground = ar.scene.background;
    ar.scene.background = null;
    if (ar.scene.fog) ar.scene.fog.near = 1000; // disable fog washing out the model
    ar.renderer.setClearColor(0x000000, 0);

    // Hide the opaque bench/grid that only makes sense on a desk view
    (ar.hideInAR || []).forEach((obj) => { if (obj) obj.visible = false; });

    // Add the grounding shadow
    if (!shadowMesh) shadowMesh = makeContactShadow(THREE, ar.groundY ?? -1.5);
    ar.scene.add(shadowMesh);

    // ---- Gyroscope parallax on mobile ----
    savedCamPos = ar.camera.position.clone();
    const startDistance = ar.camera.position.length();
    let baseBeta = null, baseGamma = null;

    orientationHandler = (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma; }
      const dBeta = THREE.MathUtils.degToRad(e.beta - baseBeta);
      const dGamma = THREE.MathUtils.degToRad(e.gamma - baseGamma);
      const yaw = THREE.MathUtils.clamp(dGamma, -1.2, 1.2);
      const pitch = THREE.MathUtils.clamp(dBeta, -0.9, 0.9);
      ar.camera.position.set(
        startDistance * Math.sin(yaw) * Math.cos(pitch),
        startDistance * Math.sin(pitch) + (ar.orbitTargetY ?? 0.4),
        startDistance * Math.cos(yaw) * Math.cos(pitch)
      );
      ar.camera.lookAt(ar.controls.target);
    };

    // iOS 13+ requires an explicit permission prompt for motion sensors
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === "granted") window.addEventListener("deviceorientation", orientationHandler);
      } catch (e) { /* user declined; touch controls still work */ }
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", orientationHandler);
    }

    stage.classList.add("ar-active");
    if (hud) hud.classList.add("show");
    toggleBtn.classList.add("active");
    toggleBtn.textContent = "✕ Exit AR";
    arOn = true;
    setStatus("Move your device around the model");
    if (typeof logActivity === "function") {
      logActivity(document.body.dataset.experiment || "unknown", "ar_view_enabled", {});
    }
  }

  function disableAR() {
    const ar = window.__arScene;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;

    if (ar) {
      ar.scene.background = savedBackground;
      if (ar.scene.fog) ar.scene.fog.near = ar.fogNear ?? 14;
      ar.renderer.setClearColor(0x000000, 1);
      (ar.hideInAR || []).forEach((obj) => { if (obj) obj.visible = true; });
      if (shadowMesh) ar.scene.remove(shadowMesh);
      if (savedCamPos) ar.camera.position.copy(savedCamPos);
      ar.camera.lookAt(ar.controls.target);
    }

    if (orientationHandler) {
      window.removeEventListener("deviceorientation", orientationHandler);
      orientationHandler = null;
    }

    stage.classList.remove("ar-active");
    if (hud) hud.classList.remove("show");
    toggleBtn.classList.remove("active");
    toggleBtn.textContent = "📷 AR View";
    arOn = false;
    setStatus("drag to rotate · scroll to zoom");
  }

  toggleBtn.addEventListener("click", () => {
    if (arOn) disableAR(); else enableAR();
  });

  window.addEventListener("beforeunload", () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  });
})();
