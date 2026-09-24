// =============================================================
// Circuit Builder — manual terminal-to-terminal wiring.
//
// Nothing is pre-assigned: the student drags a wire from any terminal to
// any other terminal. The circuit is validated as a genuine series loop
// (each of the 3 components used exactly once, each terminal used exactly
// once, forming a single closed cycle) rather than by matching components
// to labelled slots.
// =============================================================

window.circuitBuilderState = { connected: false };

(function () {
  const svg = document.getElementById("circuitSvg");
  const wiresLayer = document.getElementById("wiresLayer");
  const tempWire = document.getElementById("tempWire");
  const statusText = document.getElementById("builderStatusText");
  const launchBtn = document.getElementById("launchExperimentBtn");
  const resetBtn = document.getElementById("resetWiringBtn");
  const overlay = document.getElementById("simLockOverlay");
  if (!svg || !wiresLayer) return;

  const terminals = Array.from(svg.querySelectorAll(".terminal"));
  const REQUIRED_WIRES = 3;
  let wires = [];            // [{ a: "battery:pos", b: "resistor:a", el }]
  let pendingTerminal = null; // first terminal of the wire being drawn

  // ---- audio feedback ----
  let audioCtx = null;
  function beep(freq, duration, type) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* no audio available */ }
  }
  const beepConnect = () => beep(760, 0.12, "sine");
  const beepReject = () => beep(170, 0.22, "square");
  const beepComplete = () => { beep(660, 0.12); setTimeout(() => beep(990, 0.18), 120); };

  function key(el) {
    return `${el.dataset.component}:${el.dataset.terminal}`;
  }
  function pos(el) {
    return { x: parseFloat(el.dataset.cx), y: parseFloat(el.dataset.cy) };
  }
  function terminalUsed(el) {
    const k = key(el);
    return wires.some((w) => w.a === k || w.b === k);
  }

  function flashMessage(msg, isError) {
    statusText.textContent = msg;
    statusText.classList.toggle("error", !!isError);
    if (isError) {
      setTimeout(() => {
        statusText.classList.remove("error");
        refreshStatus();
      }, 2200);
    }
  }

  function refreshStatus() {
    if (window.circuitBuilderState.connected) return;
    statusText.textContent = `${wires.length} / ${REQUIRED_WIRES} wires connected`;
    statusText.classList.remove("complete");
  }

  // ---- series-loop validation ----
  // Valid iff: 3 wires, every terminal used exactly once, no wire joins two
  // terminals of the same component, and traversing component->wire->component
  // visits all three components and returns to the start.
  function validateCircuit() {
    if (wires.length !== REQUIRED_WIRES) return false;

    const adjacency = {}; // component -> [connected components]
    for (const w of wires) {
      const [ca] = w.a.split(":");
      const [cb] = w.b.split(":");
      if (ca === cb) return false; // shorted component
      (adjacency[ca] = adjacency[ca] || []).push(cb);
      (adjacency[cb] = adjacency[cb] || []).push(ca);
    }

    const comps = Object.keys(adjacency);
    if (comps.length !== 3) return false;
    // In a single closed series loop every component has exactly 2 neighbours
    if (!comps.every((c) => adjacency[c].length === 2)) return false;

    // Walk the loop and confirm it's one cycle covering all 3 components
    let current = comps[0];
    let previous = null;
    const visited = new Set([current]);
    for (let i = 0; i < 3; i++) {
      const next = adjacency[current].find((n) => n !== previous) ?? adjacency[current][0];
      previous = current;
      current = next;
      if (i < 2) {
        if (visited.has(current)) return false; // closed too early
        visited.add(current);
      }
    }
    return visited.size === 3 && current === comps[0];
  }

  function drawWire(aEl, bEl) {
    const p1 = pos(aEl), p2 = pos(bEl);
    // Route with a gentle curve so wires read as physical leads, not straight lines
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const sag = Math.min(len * 0.18, 42);
    const cx = midX - (dy / len) * sag;
    const cy = midY + (dx / len) * sag;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`);
    path.setAttribute("class", "wire");
    wiresLayer.appendChild(path);
    return path;
  }

  function addWire(aEl, bEl) {
    const el = drawWire(aEl, bEl);
    wires.push({ a: key(aEl), b: key(bEl), el });
    aEl.classList.add("connected");
    bEl.classList.add("connected");
    beepConnect();

    if (wires.length === REQUIRED_WIRES) {
      if (validateCircuit()) {
        statusText.textContent = "✓ Valid series circuit — ready to launch!";
        statusText.classList.add("complete");
        launchBtn.disabled = false;
        beepComplete();
        if (typeof logActivity === "function") {
          logActivity("ohm", "circuit_wired_correctly", { wires: wires.map((w) => `${w.a}-${w.b}`) });
        }
      } else {
        flashMessage("✕ Not a valid series loop — check the guidelines and reset.", true);
        beepReject();
        if (typeof logActivity === "function") {
          logActivity("ohm", "circuit_wiring_invalid", { wires: wires.map((w) => `${w.a}-${w.b}`) });
        }
      }
    } else {
      refreshStatus();
    }
  }

  function tryConnect(aEl, bEl) {
    if (!aEl || !bEl || aEl === bEl) return;
    if (terminalUsed(bEl)) {
      flashMessage("✕ That terminal already has a wire.", true);
      beepReject();
      return;
    }
    if (aEl.dataset.component === bEl.dataset.component) {
      flashMessage("✕ Can't wire a component to itself — that shorts it out.", true);
      beepReject();
      return;
    }
    if (wires.length >= REQUIRED_WIRES) {
      flashMessage("✕ All wires used — reset to rewire.", true);
      beepReject();
      return;
    }
    addWire(aEl, bEl);
  }

  function clearPending() {
    if (pendingTerminal) pendingTerminal.classList.remove("pending");
    pendingTerminal = null;
    tempWire.style.display = "none";
  }

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    const src = evt.touches ? evt.touches[0] : evt;
    pt.x = src.clientX; pt.y = src.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ---- interaction: click-then-click, or press-and-drag ----
  terminals.forEach((el) => {
    const start = (evt) => {
      evt.preventDefault();
      if (window.circuitBuilderState.connected) return;
      if (terminalUsed(el)) {
        flashMessage("✕ That terminal already has a wire.", true);
        beepReject();
        return;
      }
      if (pendingTerminal && pendingTerminal !== el) {
        tryConnect(pendingTerminal, el);
        clearPending();
        return;
      }
      pendingTerminal = el;
      el.classList.add("pending");
      const p = pos(el);
      tempWire.setAttribute("x1", p.x);
      tempWire.setAttribute("y1", p.y);
      tempWire.setAttribute("x2", p.x);
      tempWire.setAttribute("y2", p.y);
      tempWire.style.display = "";
    };

    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: false });

    // finishing a drag on top of another terminal
    el.addEventListener("mouseup", (evt) => {
      if (pendingTerminal && pendingTerminal !== el) {
        evt.stopPropagation();
        tryConnect(pendingTerminal, el);
        clearPending();
      }
    });
  });

  svg.addEventListener("mousemove", (evt) => {
    if (!pendingTerminal) return;
    const p = svgPoint(evt);
    tempWire.setAttribute("x2", p.x);
    tempWire.setAttribute("y2", p.y);
  });
  svg.addEventListener("touchmove", (evt) => {
    if (!pendingTerminal) return;
    evt.preventDefault();
    const p = svgPoint(evt);
    tempWire.setAttribute("x2", p.x);
    tempWire.setAttribute("y2", p.y);
  }, { passive: false });

  svg.addEventListener("touchend", (evt) => {
    if (!pendingTerminal) return;
    const t = evt.changedTouches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY);
    if (target && target.classList.contains("terminal") && target !== pendingTerminal) {
      tryConnect(pendingTerminal, target);
      clearPending();
    }
  });

  // clicking empty board space cancels the in-progress wire
  svg.addEventListener("click", (evt) => {
    if (evt.target === svg || evt.target.tagName === "rect" || evt.target.tagName === "text") {
      clearPending();
    }
  });

  // ---- reset ----
  resetBtn.addEventListener("click", () => {
    wires.forEach((w) => w.el.remove());
    wires = [];
    clearPending();
    terminals.forEach((t) => t.classList.remove("connected", "pending"));
    launchBtn.disabled = true;
    statusText.classList.remove("complete", "error");
    refreshStatus();
    if (typeof logActivity === "function") logActivity("ohm", "circuit_reset", {});
  });

  // ---- launch ----
  launchBtn.addEventListener("click", () => {
    if (!validateCircuit()) return;
    window.circuitBuilderState.connected = true;
    if (overlay) overlay.style.display = "none";
    launchBtn.textContent = "✓ Simulation Live";
    launchBtn.disabled = true;
    svg.classList.add("locked");
    if (typeof logActivity === "function") logActivity("ohm", "circuit_launched", {});
    document.dispatchEvent(new CustomEvent("circuitLaunched"));
  });

  refreshStatus();
})();
