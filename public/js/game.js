(() => {
  'use strict';

  const C = window.GAME_CONFIG;
  const $ = (id) => document.getElementById(id);

  let renderer, scene, camera, clock;
  let gameStarted = false;
  let won = false;
  let startTime = 0;
  let chaos = 0;
  let winHold = 0;
  let stage = 0;
  let sofaTime = 0;
  let sofaChaos = 0;
  let storyIndex = 0;
  let understandingScore = 0;
  let quizActive = false;
  const quiz = { index: 0, phase: 'self', self: [null, null], guess: [null, null] };
  let lastCommentAt = 0;
  let toastTimer = 0;
  let audioCtx = null;
  let cameraShake = 0;
  let elapsed = 0;
  let currentLevel = 'sofa';
  let dinnerStage = 0;
  let dinnerStartTime = 0;
  let dinnerTime = 0;
  let storyMode = 'intro';
  let startRoute = 'full';
  const skippedLevels = new Set();
  let kitchenChefIndex = 0;
  let lastSpankAt = -9999;

  const keys = Object.create(null);
  const players = [];
  const world = {
    colliders: [],
    particles: [],
    sofa: null,
    goalRing: null,
    rug: null,
    door: null,
    cat: null,
    vase: null,
    dinner: null
  };

  const HANDLE_LOCAL = {
    '-1': new THREE.Vector3(-1.35, 0.68, -0.72),
    '1': new THREE.Vector3(1.35, 0.68, -0.72)
  };

  const tmpV1 = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function damp(current, target, speed, dt) { return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * dt)); }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function bindingDown(binding) {
    if (Array.isArray(binding)) return binding.some(code => !!keys[code]);
    return !!keys[binding];
  }
  function bindingHas(binding, code) {
    return Array.isArray(binding) ? binding.includes(code) : binding === code;
  }
  function angleDamp(current, target, speed, dt) {
    let d = target - current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return current + d * (1 - Math.exp(-speed * dt));
  }

  function rotateXZ(x, z, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: x * c + z * s, z: -x * s + z * c };
  }

  function pointInRect(x, z, r) {
    return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  }

  function nearestPointOnOBB(px, pz, obb) {
    const dx = px - obb.x;
    const dz = pz - obb.z;
    const c = Math.cos(-obb.angle), s = Math.sin(-obb.angle);
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    const qx = clamp(lx, -obb.hx, obb.hx);
    const qz = clamp(lz, -obb.hz, obb.hz);
    const wc = Math.cos(obb.angle), ws = Math.sin(obb.angle);
    return {
      x: obb.x + qx * wc + qz * ws,
      z: obb.z - qx * ws + qz * wc
    };
  }

  function circleHitsOBB(x, z, radius, obb) {
    const q = nearestPointOnOBB(x, z, obb);
    const dx = x - q.x, dz = z - q.z;
    return dx * dx + dz * dz < radius * radius;
  }

  function obbCorners(obb) {
    const pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = rotateXZ(sx * obb.hx, sz * obb.hz, obb.angle);
      pts.push({ x: obb.x + r.x, z: obb.z + r.z });
    }
    return pts;
  }

  function projectPoints(points, axis) {
    let min = Infinity, max = -Infinity;
    for (const p of points) {
      const d = p.x * axis.x + p.z * axis.z;
      min = Math.min(min, d); max = Math.max(max, d);
    }
    return { min, max };
  }

  function obbIntersectsOBB(a, b) {
    const ac = obbCorners(a), bc = obbCorners(b);
    const axes = [];
    for (const ang of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
      axes.push({ x: Math.cos(ang), z: -Math.sin(ang) });
    }
    for (const axis of axes) {
      const pa = projectPoints(ac, axis), pb = projectPoints(bc, axis);
      if (pa.max < pb.min || pb.max < pa.min) return false;
    }
    return true;
  }

  function aabbAsOBB(c) {
    return { x: c.x, z: c.z, hx: c.hx, hz: c.hz, angle: 0 };
  }

  class Player {
    constructor(id, name, color, start, controls) {
      this.id = id;
      this.name = name;
      this.controls = controls;
      this.patience = 100;
      this.grabbing = false;
      this.canGrab = false;
      this.grabSide = null;
      this.start = start.clone();
      this.group = makeCutePlayer(color, id === 1);
      this.group.position.copy(start);
      scene.add(this.group);
      this.velocity = new THREE.Vector3();
      this.facing = new THREE.Vector3(1, 0, 0);
      this.heldItem = null;
      this.lastDinnerInteract = -9999;
    }

    update(dt) {
      const mini = currentLevel === 'dinner' ? world.dinner?.mini : null;
      if (mini?.active && mini.playerIndex === players.indexOf(this)) {
        this.velocity.set(0, 0, 0);
        if (this.heldItem) updateHeldDinnerItem(this);
        updatePlayerFace(this);
        return;
      }

      const x = (bindingDown(this.controls.right) ? 1 : 0) - (bindingDown(this.controls.left) ? 1 : 0);
      const z = (bindingDown(this.controls.back) ? 1 : 0) - (bindingDown(this.controls.forward) ? 1 : 0);
      const dir = new THREE.Vector3(x, 0, z);
      if (dir.lengthSq() > 1) dir.normalize();

      const onRug = currentLevel === 'sofa'
        ? pointInRect(this.group.position.x, this.group.position.z, C.rug)
        : isKitchenSlippery(this.group.position.x, this.group.position.z);
      const accel = onRug ? C.rugAcceleration : C.normalAcceleration;
      const stop = onRug ? C.rugStop : C.normalStop;

      this.velocity.x = damp(this.velocity.x, dir.x * C.playerSpeed, accel, dt);
      this.velocity.z = damp(this.velocity.z, dir.z * C.playerSpeed, accel, dt);
      if (dir.lengthSq() < 0.01) {
        this.velocity.x = damp(this.velocity.x, 0, stop, dt);
        this.velocity.z = damp(this.velocity.z, 0, stop, dt);
      }

      const old = this.group.position.clone();
      this.group.position.addScaledVector(this.velocity, dt);
      this.group.position.x = clamp(this.group.position.x, -9.45, 9.45);
      this.group.position.z = clamp(this.group.position.z, -5.45, 5.45);

      if (playerHitsWorld(this, this.group.position.x, this.group.position.z)) {
        this.group.position.copy(old);
        this.velocity.multiplyScalar(onRug ? 0.72 : 0.12);
      }

      if (dir.lengthSq() > 0.01) {
        this.facing.copy(dir).normalize();
        const targetRot = Math.atan2(dir.x, dir.z);
        this.group.rotation.y = angleDamp(this.group.rotation.y, targetRot, 12, dt);
        this.group.userData.body.position.y = 0.03 + Math.sin(performance.now() * 0.012 + this.id) * 0.032;
      } else {
        this.group.userData.body.position.y = damp(this.group.userData.body.position.y, 0.03, 10, dt);
      }

      if (currentLevel === 'sofa') {
        const handle = getNearestFreeHandle(this, false);
        this.canGrab = !!handle && handle.distance < C.grabDistance;
        this.group.userData.heart.visible = this.canGrab && !this.grabbing;

        if (this.grabbing) {
          const hp = handleWorld(this.grabSide);
          const d = hp.distanceTo(this.group.position);
          if (d > C.tetherDistance) {
            this.release(false);
            toast(`${this.name} lost the sofa. The sofa has boundaries.`);
            beep(170, 0.05, 0.04);
          }
        } else {
          this.patience = clamp(this.patience + C.patienceRecovery * dt, 0, 100);
        }
      } else {
        this.canGrab = !!nearestDinnerAction(this);
        this.group.userData.heart.visible = this.canGrab;
        updateHeldDinnerItem(this);
        this.patience = clamp(this.patience + C.patienceRecovery * 0.45 * dt, 0, 100);
      }

      updatePlayerFace(this);
    }

    toggleGrab() {
      if (!gameStarted || won) return;
      if (currentLevel === 'dinner') {
        dinnerInteract(this);
        return;
      }
      if (this.grabbing) {
        this.release(true);
        return;
      }

      const handle = getNearestFreeHandle(this, true);
      if (handle && handle.distance < C.grabDistance) {
        this.grabbing = true;
        this.grabSide = handle.side;
        toast(`${this.name} grabbed the ${handle.side === -1 ? 'left' : 'right'} handle.`);
        beep(460, 0.06, 0.055);
      } else if (handle && handle.occupied) {
        toast(`${this.name}: that handle is occupied. Try the other end, romantic hero.`);
        beep(120, 0.05, 0.03);
      } else {
        toast(`${this.name} grabbed absolutely nothing.`);
        beep(110, 0.04, 0.025);
      }
    }

    release(withToast) {
      if (!this.grabbing) return;
      this.grabbing = false;
      this.grabSide = null;
      if (withToast) {
        toast(`${this.name} released the sofa. Diplomacy resumes.`);
        beep(220, 0.05, 0.05);
      }
    }

    reset() {
      this.group.position.copy(this.start);
      this.velocity.set(0, 0, 0);
      this.patience = 100;
      this.grabbing = false;
      this.grabSide = null;
      if (this.heldItem) dropDinnerItem(this, true);
      this.heldItem = null;
      this.lastDinnerInteract = -9999;
      updatePlayerFace(this);
    }
  }

  function init() {
    if (!window.THREE) {
      document.body.innerHTML = '<div style="padding:40px;color:white;font-family:sans-serif">Three.js could not load. Check your internet connection and refresh.</div>';
      return;
    }

    renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x160d20);
    scene.fog = new THREE.Fog(0x160d20, 18, 39);

    camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 12.5, 13.5);
    camera.lookAt(0, 0, 0);

    clock = new THREE.Clock();
    buildWorld();
    addLights();
    bindUI();
    setStage(0, true);
    onResize();
    animate();
  }

  function mat(color, rough = 0.7, metal = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  function mesh(geometry, material, cast = true, receive = true) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }


  function makeTextSprite(text, bg = 'rgba(25,14,30,0.88)', fg = '#fff7fb') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bg;
    ctx.fillRect(8, 18, 496, 92);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 18, 496, 92);
    ctx.fillStyle = fg;
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.5, 0.63, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function addWorldLabel(text, x, y, z, scale = 1) {
    const sprite = makeTextSprite(text);
    sprite.position.set(x, y, z);
    sprite.scale.multiplyScalar(scale);
    scene.add(sprite);
    return sprite;
  }

  function buildWorld() {
    const floor = mesh(new THREE.BoxGeometry(20, 0.35, 12), mat(C.colors.floor, 0.92), false, true);
    floor.position.y = -0.22;
    scene.add(floor);

    // HURDLE 1: cursed slippery rug
    const rugMat = new THREE.MeshStandardMaterial({
      color: C.colors.rug,
      roughness: 0.75,
      emissive: 0x29102f,
      emissiveIntensity: 0.55
    });
    world.rug = mesh(new THREE.BoxGeometry(C.rug.maxX - C.rug.minX, 0.035, C.rug.maxZ - C.rug.minZ), rugMat, false, true);
    world.rug.position.set((C.rug.minX + C.rug.maxX) / 2, 0.018, 0);
    scene.add(world.rug);
    addRugStripes();

    // Cozy Corner: the final home for the sofa. No security switches.
    const goalMat = new THREE.MeshStandardMaterial({
      color: C.colors.goal,
      roughness: 0.8,
      transparent: true,
      opacity: 0.34,
      emissive: 0x4a1325,
      emissiveIntensity: 0.75
    });
    world.goalRing = mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.035, 64), goalMat, false, true);
    world.goalRing.position.set(C.goalCenter.x, 0.025, C.goalCenter.z);
    scene.add(world.goalRing);

    const heart = makeHeartMesh(0xffa0b8);
    heart.scale.set(0.7, 0.7, 0.7);
    heart.rotation.x = -Math.PI / 2;
    heart.position.set(C.goalCenter.x, 0.06, C.goalCenter.z);
    heart.material.transparent = true;
    heart.material.opacity = 0.75;
    world.goalHeart = heart;
    scene.add(heart);

    // Divider wall leaves one generous-looking-but-annoying doorway.
    addWall(0.1, -4.3, 0.45, 3.4, 'divider-north');
    addWall(0.1, 4.3, 0.45, 3.4, 'divider-south');

    // Outer walls.
    addWall(-9.92, 0, 0.22, 12, 'outer-left', false);
    addWall(9.92, 0, 0.22, 12, 'outer-right', false);
    addWall(0, -5.92, 20, 0.22, 'outer-top', false);
    addWall(0, 5.92, 20, 0.22, 'outer-bottom', false);

    // Doorway frame.
    const frameMat = mat(0xf8dce8, 0.72);
    for (const z of [-2.55, 2.55]) {
      const post = mesh(new THREE.BoxGeometry(0.7, 2.3, 0.45), frameMat);
      post.position.set(0.05, 1.12, z);
      scene.add(post);
    }
    const lintel = mesh(new THREE.BoxGeometry(0.7, 0.35, 5.55), frameMat);
    lintel.position.set(0.05, 2.15, 0);
    scene.add(lintel);

    // HURDLE 2: petty swinging door.
    world.door = makePettyDoor();
    scene.add(world.door.group);

    // Decorative / hazardous furniture.
    addTable(-6.7, -4.35);
    addPlant(-8.0, 4.25);
    addLamp(8.35, -4.35);
    addTinyCoffin(8.15, 4.25);
    addMovingBoxes(-2.4, 4.35);

    // Fragile vase hurdle.
    world.vase = makeFragileVase(5.15, 1.15);
    scene.add(world.vase.group);

    // Sofa.
    world.sofa = makeSofa();
    world.sofa.position.set(-5.45, 0.55, 0);
    world.sofa.rotation.y = Math.PI / 2;
    world.sofa.userData.homePos = world.sofa.position.clone();
    world.sofa.userData.homeRot = world.sofa.rotation.y;
    world.sofa.userData.slideVel = new THREE.Vector3();
    world.sofa.userData.lastBonk = -9999;
    scene.add(world.sofa);

    // HURDLE 4-ish: criminal cat.
    world.cat = makeCat();
    scene.add(world.cat.group);

    // Ambient hearts.
    for (let i = 0; i < 22; i++) {
      const h = makeHeartMesh(i % 2 ? 0xff6f91 : 0x8f71ff);
      const s = 0.06 + Math.random() * 0.08;
      h.scale.set(s, s, s);
      h.position.set(-9 + Math.random() * 18, 2.5 + Math.random() * 3.2, -5 + Math.random() * 10);
      h.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      h.material.transparent = true;
      h.material.opacity = 0.18;
      scene.add(h);
    }
  }

  function addRugStripes() {
    for (let i = 0; i < 7; i++) {
      const stripe = mesh(new THREE.BoxGeometry(0.12, 0.012, 5.7), mat(i % 2 ? 0x78417f : 0x47234f, 0.95), false, true);
      stripe.position.set(-8.1 + i * 0.82, 0.045, 0);
      stripe.rotation.y = 0.12;
      scene.add(stripe);
    }
  }

  function addLights() {
    scene.add(new THREE.HemisphereLight(0xffe4f2, 0x30183a, 2.15));

    const key = new THREE.DirectionalLight(0xffe2ec, 3.0);
    key.position.set(-4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    scene.add(key);

    const pink = new THREE.PointLight(0xff5c8a, 18, 12, 2);
    pink.position.set(7, 3, 0);
    scene.add(pink);

    const blue = new THREE.PointLight(0x698cff, 12, 10, 2);
    blue.position.set(-6, 3, -2);
    scene.add(blue);
  }

  function addWall(x, z, w, d, name, visible = true) {
    const wall = mesh(new THREE.BoxGeometry(w, visible ? 1.65 : 0.78, d), mat(visible ? C.colors.wall : 0x61435f, 0.84));
    wall.position.set(x, visible ? 0.8 : 0.36, z);
    scene.add(wall);
    world.colliders.push({ x, z, hx: w / 2, hz: d / 2, mesh: wall, name });
  }

  function addTable(x, z) {
    const g = new THREE.Group();
    const top = mesh(new THREE.BoxGeometry(2, 0.18, 1.1), mat(0xb77b69, 0.8));
    top.position.y = 0.95;
    g.add(top);
    for (const dx of [-0.78, 0.78]) for (const dz of [-0.35, 0.35]) {
      const leg = mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), mat(0x81544d, 0.8));
      leg.position.set(dx, 0.45, dz);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    world.colliders.push({ x, z, hx: 1.0, hz: 0.55, mesh: g, name: 'table' });
  }

  function addPlant(x, z) {
    const g = new THREE.Group();
    const pot = mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.6, 16), mat(0xd98c84, 0.9));
    pot.position.y = 0.3;
    g.add(pot);
    for (let i = 0; i < 7; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.25, 12, 10), mat(0x6cc795, 0.92));
      leaf.scale.set(0.55, 1.5, 0.35);
      leaf.position.set(Math.sin(i) * 0.27, 0.72 + Math.random() * 0.45, Math.cos(i) * 0.27);
      leaf.rotation.z = (Math.random() - 0.5) * 0.8;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function addLamp(x, z) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 10), mat(0xc8b8cd, 0.55, 0.2));
    pole.position.y = 0.9;
    g.add(pole);
    const shade = mesh(new THREE.ConeGeometry(0.55, 0.7, 20, 1, true), mat(0xffc9d6, 0.7));
    shade.position.y = 1.85;
    g.add(shade);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function addTinyCoffin(x, z) {
    const g = new THREE.Group();
    const base = mesh(new THREE.BoxGeometry(1.0, 0.28, 1.8), mat(0x372030, 0.75));
    base.position.y = 0.18;
    g.add(base);
    const cross = mesh(new THREE.BoxGeometry(0.08, 0.035, 0.6), mat(0xf2cbd8, 0.7));
    cross.position.set(0, 0.34, 0);
    g.add(cross);
    const cross2 = mesh(new THREE.BoxGeometry(0.35, 0.035, 0.08), mat(0xf2cbd8, 0.7));
    cross2.position.set(0, 0.35, -0.08);
    g.add(cross2);
    g.position.set(x, 0, z);
    g.rotation.y = 0.25;
    scene.add(g);
  }

  function addMovingBoxes(x, z) {
    for (let i = 0; i < 3; i++) {
      const box = mesh(new THREE.BoxGeometry(0.8 + i * 0.08, 0.7, 0.8), mat(0xc69269, 0.94));
      box.position.set(x + i * 0.78, 0.35, z - (i % 2) * 0.58);
      box.rotation.y = (i - 1) * 0.14;
      scene.add(box);
      world.colliders.push({ x: box.position.x, z: box.position.z, hx: 0.42, hz: 0.42, mesh: box, name: 'box' });
    }
  }

  function makePettyDoor() {
    const group = new THREE.Group();
    group.position.set(C.pettyDoor.hingeX, 0, C.pettyDoor.hingeZ);

    const panel = mesh(
      new THREE.BoxGeometry(C.pettyDoor.thickness, 1.9, C.pettyDoor.length),
      mat(0x9f6a92, 0.72)
    );
    panel.position.set(0, 0.95, C.pettyDoor.length / 2);
    group.add(panel);

    const knob = mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(0xffd27f, 0.45, 0.3));
    knob.position.set(0.14, 1.0, C.pettyDoor.length * 0.86);
    group.add(knob);

    const hinge = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 10), mat(0x5b3d58, 0.55, 0.25));
    hinge.position.y = 0.95;
    group.add(hinge);

    return { group, panel, angle: 0, bonkCooldown: 0 };
  }

  function doorOBB() {
    const d = world.door;
    const angle = d.group.rotation.y;
    const localCenter = rotateXZ(0, C.pettyDoor.length / 2, angle);
    return {
      x: C.pettyDoor.hingeX + localCenter.x,
      z: C.pettyDoor.hingeZ + localCenter.z,
      hx: C.pettyDoor.thickness / 2 + 0.03,
      hz: C.pettyDoor.length / 2,
      angle
    };
  }

  function makeFragileVase(x, z) {
    const group = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 16), mat(0xffc4d5, 0.58));
    body.position.y = 0.35;
    group.add(body);
    const neck = mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 16), mat(0xffd5df, 0.58));
    neck.position.y = 0.82;
    group.add(neck);
    for (let i = 0; i < 4; i++) {
      const flower = mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(i % 2 ? 0xff6f91 : 0xffd06f, 0.75));
      flower.position.set((i - 1.5) * 0.13, 1.08 + (i % 2) * 0.08, (i % 2 ? -1 : 1) * 0.08);
      group.add(flower);
    }
    group.position.set(x, 0, z);
    return { group, x, z, broken: false };
  }

  function makeCat() {
    const group = new THREE.Group();
    const black = mat(0x271c2b, 0.85);
    const eyeMat = mat(0xffd85c, 0.45, 0.05);
    const body = mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 10), black);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.34;
    group.add(body);
    const head = mesh(new THREE.SphereGeometry(0.28, 16, 12), black);
    head.position.set(0.42, 0.48, 0);
    group.add(head);
    for (const z of [-0.13, 0.13]) {
      const ear = mesh(new THREE.ConeGeometry(0.11, 0.24, 8), black);
      ear.position.set(0.42, 0.72, z);
      group.add(ear);
      const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
      eye.position.set(0.66, 0.51, z * 0.72);
      group.add(eye);
    }
    const tail = mesh(new THREE.CapsuleGeometry(0.055, 0.55, 6, 8), black);
    tail.position.set(-0.48, 0.5, 0);
    tail.rotation.z = -0.9;
    group.add(tail);
    group.position.set(6.1, 0, -3.9);
    return { group, cooldown: 0, phase: Math.random() * 6 };
  }

  function makeCutePlayer(color, first) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    group.userData.body = body;

    const bodyMat = mat(color, 0.72);
    const skin = mat(0xffd5c7, 0.86);
    const dark = mat(first ? 0x34263b : 0x46283b, 0.9);
    const shoeMat = mat(0x2e2134, 0.8);

    const torso = mesh(new THREE.CapsuleGeometry(0.34, 0.62, 8, 16), bodyMat);
    torso.position.y = 0.67;
    body.add(torso);

    const belly = mesh(new THREE.SphereGeometry(0.24, 16, 12), mat(first ? 0xaedfff : 0xffc4d2, 0.84));
    belly.scale.set(1.2, 1, 0.9);
    belly.position.set(0, 0.52, 0.21);
    body.add(belly);

    const head = mesh(new THREE.SphereGeometry(0.42, 24, 18), skin);
    head.position.y = 1.46;
    body.add(head);

    const hair = mesh(new THREE.SphereGeometry(0.43, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.05), dark);
    hair.position.set(0, 1.59, 0);
    hair.rotation.x = 0.08;
    body.add(hair);

    let bun = null;
    if (!first) {
      bun = mesh(new THREE.SphereGeometry(0.17, 16, 12), dark);
      bun.position.set(0.28, 1.84, 0.02);
      body.add(bun);
    }

    const eyes = [];
    for (const ex of [-0.15, 0.15]) {
      const eye = mesh(new THREE.SphereGeometry(0.043, 12, 8), mat(0x211824, 0.65));
      eye.position.set(ex, 1.5, 0.39);
      body.add(eye);
      eyes.push(eye);
    }

    const brows = [];
    for (const ex of [-0.15, 0.15]) {
      const brow = mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), mat(0x3a2533, 0.8));
      brow.position.set(ex, 1.62, 0.402);
      body.add(brow);
      brows.push(brow);
    }

    const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7f9e, transparent: true, opacity: 0.62 });
    const blushes = [];
    for (const ex of [-0.26, 0.26]) {
      const blush = mesh(new THREE.SphereGeometry(0.055, 10, 8), blushMat, false, false);
      blush.scale.set(1.5, 0.55, 0.35);
      blush.position.set(ex, 1.39, 0.385);
      body.add(blush);
      blushes.push(blush);
    }

    const mouth = mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 18, Math.PI), mat(0x7d4555, 0.6), false, false);
    mouth.position.set(0, 1.29, 0.385);
    mouth.rotation.z = Math.PI;
    body.add(mouth);

    const arms = [];
    for (const sx of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.48, 6, 10), skin);
      arm.position.set(sx * 0.42, 0.77, 0);
      arm.rotation.z = sx * 0.2;
      body.add(arm);
      arms.push(arm);
    }

    const feet = [];
    for (const sx of [-1, 1]) {
      const foot = mesh(new THREE.SphereGeometry(0.13, 12, 8), shoeMat);
      foot.scale.set(1, 0.7, 1.35);
      foot.position.set(sx * 0.18, 0.08, 0.08);
      body.add(foot);
      feet.push(foot);
    }

    const apron = new THREE.Group();
    apron.visible = false;
    const apronFront = mesh(new THREE.BoxGeometry(0.42, 0.56, 0.03), mat(0xfff2d8, 0.9));
    apronFront.position.set(0, 0.56, 0.34);
    apron.add(apronFront);
    const apronPocket = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.035), mat(0xf0d6af, 0.88));
    apronPocket.position.set(0, 0.34, 0.355);
    apron.add(apronPocket);
    const neckBand = mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 18, Math.PI), mat(0xf0d6af, 0.88));
    neckBand.rotation.x = Math.PI / 2;
    neckBand.position.set(0, 1.02, 0.18);
    apron.add(neckBand);
    body.add(apron);

    const runnerBand = new THREE.Group();
    runnerBand.visible = false;
    const sash = mesh(new THREE.BoxGeometry(0.13, 0.85, 0.06), mat(first ? 0x6ac0f4 : 0xffc680, 0.82));
    sash.position.set(0.13, 0.74, 0.28);
    sash.rotation.z = 0.55;
    runnerBand.add(sash);
    const pouch = mesh(new THREE.BoxGeometry(0.22, 0.18, 0.12), mat(0x896a4a, 0.78));
    pouch.position.set(-0.16, 0.36, 0.25);
    runnerBand.add(pouch);
    body.add(runnerBand);

    const chefHat = new THREE.Group();
    chefHat.visible = false;
    const brim = mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.08, 16), mat(0xfffaf5, 0.8));
    brim.position.y = 1.93;
    chefHat.add(brim);
    for (const [dx, dz] of [[0,0],[0.1,0.05],[-0.1,0.03],[0.05,-0.08],[-0.06,-0.06]]) {
      const puff = mesh(new THREE.SphereGeometry(0.13, 14, 10), mat(0xffffff, 0.82));
      puff.position.set(dx, 2.05 + Math.random()*0.05, dz);
      chefHat.add(puff);
    }
    body.add(chefHat);

    let sunflower = null;
    if (!first) {
      sunflower = new THREE.Group();
      const center = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), mat(0x5f4329, 0.78));
      center.rotation.x = Math.PI / 2;
      sunflower.add(center);
      for (let i = 0; i < 10; i++) {
        const petal = mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xffd86a, 0.8));
        petal.scale.set(0.7, 1.25, 0.28);
        const a = (Math.PI * 2 * i) / 10;
        petal.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, -0.004);
        petal.rotation.z = a;
        sunflower.add(petal);
      }
      sunflower.position.set(0.38, 1.86, 0.2);
      sunflower.rotation.y = -0.25;
      body.add(sunflower);
    }

    const heart = makeHeartMesh(0xffffff);
    heart.scale.set(0.12, 0.12, 0.12);
    heart.position.set(0, 2.18, 0);
    heart.visible = false;
    group.add(heart);

    group.userData.heart = heart;
    group.userData.eyes = eyes;
    group.userData.brows = brows;
    group.userData.blushes = blushes;
    group.userData.mouth = mouth;
    group.userData.arms = arms;
    group.userData.feet = feet;
    group.userData.apron = apron;
    group.userData.runnerBand = runnerBand;
    group.userData.chefHat = chefHat;
    group.userData.sunflower = sunflower;
    group.userData.head = head;
    return group;
  }

  function updatePlayerFace(player) {
    const d = world.dinner;
    const urgentStress = currentLevel === 'dinner' && d && ((d.fire || d.sinkLeak) ? 0.45 : (d.urgentStage === 1 ? 0.35 : (d.urgentRemaining > 0 && d.urgentRemaining < 4 ? 0.18 : 0)));
    const t = clamp(1 - player.patience / 100 + urgentStress, 0, 1);
    const squint = clamp(1 - t * 0.78, 0.2, 1);
    for (const eye of player.group.userData.eyes) eye.scale.y = squint;
    const [l, r] = player.group.userData.brows;
    l.rotation.z = 0.08 + t * 0.68;
    r.rotation.z = -0.08 - t * 0.68;
    l.position.y = r.position.y = 1.62 - t * 0.04;
    const mouth = player.group.userData.mouth;
    if (mouth) {
      mouth.scale.x = 0.9 + (1 - t) * 0.2;
      mouth.scale.y = 0.55 + t * 1.05;
      mouth.position.y = 1.285 - t * 0.015;
      mouth.rotation.z = Math.PI + (t > 0.72 ? Math.PI * 0.95 : 0);
    }
    if (player.group.userData.blushes) {
      for (const blush of player.group.userData.blushes) blush.material.opacity = 0.36 + (1 - t) * 0.28;
    }
    if (player.group.userData.body) {
      player.group.userData.body.rotation.z = (player.id === 1 ? 1 : -1) * (t - 0.15) * 0.05;
    }
    if (player.group.userData.sunflower) {
      player.group.userData.sunflower.rotation.z = Math.sin(elapsed * 2.4 + player.id) * 0.05;
    }
  }

  function makeHeartMesh(color) {
    const x = 0, y = 0;
    const shape = new THREE.Shape();
    shape.moveTo(x, y + 0.25);
    shape.bezierCurveTo(x - 0.5, y - 0.15, x - 0.55, y + 0.35, x - 0.25, y + 0.45);
    shape.bezierCurveTo(x - 0.05, y + 0.53, x, y + 0.33, x, y + 0.2);
    shape.bezierCurveTo(x, y + 0.33, x + 0.05, y + 0.53, x + 0.25, y + 0.45);
    shape.bezierCurveTo(x + 0.55, y + 0.35, x + 0.5, y - 0.15, x, y + 0.25);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 });
    geo.center();
    return mesh(geo, mat(color, 0.65), true, true);
  }

  function showSpankPop(position) {
    const el = document.createElement('div');
    el.className = 'spank-pop';
    el.textContent = 'BONK ♥';
    const projected = position.clone().project(camera);
    el.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 760);
  }

  function animateCuteSpankVisual(giverIndex = 1, targetIndex = 0) {
    const giver = players[giverIndex], target = players[targetIndex];
    if (!giver || !target) return;
    const arm = giver.group.userData.arms?.[1] || giver.group.userData.arms?.[0];
    if (arm) {
      const start = arm.rotation.z;
      arm.rotation.z = -1.15;
      setTimeout(() => { arm.rotation.z = 0.72; }, 95);
      setTimeout(() => { arm.rotation.z = start; }, 240);
    }
    target.group.userData.body.rotation.x = -0.16;
    setTimeout(() => { if (target.group?.userData?.body) target.group.userData.body.rotation.x = 0; }, 220);
    const mid = giver.group.position.clone().add(target.group.position).multiplyScalar(0.5);
    mid.y = 1.1;
    spawnBonkParticles(mid, 8);
    showSpankPop(mid);
  }

  function tryCuteSpank(giver) {
    if (!giver || players.indexOf(giver) !== 1 || !players[0] || !gameStarted || won || quizActive) return;
    const now = performance.now();
    if (now - lastSpankAt < 1250) return;
    const target = players[0];
    const dist = distanceXZ(giver.group.position, target.group.position);
    if (dist > 1.35) {
      toast(`${giver.name}: get closer if you want to use the emergency girlfriend BONK.`);
      return;
    }
    lastSpankAt = now;
    const dx = target.group.position.x - giver.group.position.x;
    const dz = target.group.position.z - giver.group.position.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    target.velocity.x += (dx / len) * 1.15;
    target.velocity.z += (dz / len) * 1.15;
    giver.patience = clamp(giver.patience + 4.5, 0, 100);
    target.patience = clamp(target.patience + 1.0, 0, 100);
    animateCuteSpankVisual(1, 0);
    toast(`${giver.name} used F: emergency girlfriend BONK. Anger safely converted into comedy.`);
    setFluffles('A controlled release of girlfriend frustration has been observed. No paperwork will be filed.');
    beep(210, 0.035, 0.035);
    setTimeout(() => beep(720, 0.055, 0.025), 65);
    if (window.NET?.online && window.NET.isHost) window.NET.sendFx('spank', { giverIndex: 1, targetIndex: 0 });
  }

  function makeSofa() {
    const g = new THREE.Group();
    const purple = mat(C.colors.sofa, 0.82);
    const dark = mat(0x6e54cf, 0.86);
    const gold = mat(0xffd06f, 0.65, 0.15);

    const seat = mesh(new THREE.BoxGeometry(3.45, 0.45, 1.25), purple);
    seat.position.y = 0.62;
    g.add(seat);

    const back = mesh(new THREE.BoxGeometry(3.45, 1.05, 0.35), dark);
    back.position.set(0, 1.12, 0.45);
    g.add(back);

    for (const x of [-1.63, 1.63]) {
      const arm = mesh(new THREE.BoxGeometry(0.35, 0.75, 1.28), dark);
      arm.position.set(x, 0.85, 0);
      g.add(arm);
    }

    for (const x of [-1.2, 1.2]) {
      const cushion = mesh(new THREE.BoxGeometry(1.15, 0.22, 1.02), mat(x < 0 ? 0xa28aff : 0x9678ff, 0.9));
      cushion.position.set(x * 0.48, 0.88, -0.04);
      cushion.rotation.y = x * 0.025;
      g.add(cushion);
    }

    for (const x of [-1.35, 1.35]) {
      const handle = mesh(new THREE.TorusGeometry(0.13, 0.045, 10, 18), gold);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(x, 0.68, -0.72);
      g.add(handle);
    }

    for (const x of [-1.35, 1.35]) {
      const leg = mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), mat(0x3f2638, 0.82));
      leg.position.set(x, 0.18, 0);
      g.add(leg);
    }

    return g;
  }

  function handleWorld(side, sofaPos = world.sofa.position, sofaAngle = world.sofa.rotation.y) {
    const local = HANDLE_LOCAL[String(side)];
    const r = rotateXZ(local.x, local.z, sofaAngle);
    return new THREE.Vector3(sofaPos.x + r.x, local.y, sofaPos.z + r.z);
  }

  function getNearestFreeHandle(player, reportOccupied) {
    let best = null;
    for (const side of [-1, 1]) {
      const hp = handleWorld(side);
      const distance = hp.distanceTo(player.group.position);
      const occupied = players.some(p => p !== player && p.grabbing && p.grabSide === side);
      if (!best || distance < best.distance) best = { side, pos: hp, distance, occupied };
    }
    if (best && best.occupied && !reportOccupied) {
      const otherSide = -best.side;
      const hp = handleWorld(otherSide);
      const distance = hp.distanceTo(player.group.position);
      const occupied = players.some(p => p !== player && p.grabbing && p.grabSide === otherSide);
      return { side: otherSide, pos: hp, distance, occupied };
    }
    if (best && best.occupied && reportOccupied) {
      const otherSide = -best.side;
      const hp = handleWorld(otherSide);
      const distance = hp.distanceTo(player.group.position);
      const occupied = players.some(p => p !== player && p.grabbing && p.grabSide === otherSide);
      if (!occupied && distance <= best.distance + 0.5) return { side: otherSide, pos: hp, distance, occupied: false };
    }
    return best;
  }

  function sofaOBB(pos = world.sofa.position, angle = world.sofa.rotation.y) {
    return { x: pos.x, z: pos.z, hx: 1.75, hz: 0.66, angle };
  }

  function playerHitsWorld(player, x, z) {
    for (const c of world.colliders) {
      const nx = clamp(x, c.x - c.hx, c.x + c.hx);
      const nz = clamp(z, c.z - c.hz, c.z + c.hz);
      const dx = x - nx, dz = z - nz;
      if (dx * dx + dz * dz < C.playerRadius * C.playerRadius) return true;
    }

    if (world.door && circleHitsOBB(x, z, C.playerRadius, doorOBB())) return true;

    if (world.sofa && !player.grabbing && circleHitsOBB(x, z, C.playerRadius, sofaOBB())) return true;
    return false;
  }

  function resolvePlayers() {
    if (players.length < 2) return;
    const a = players[0], b = players[1];
    const dx = b.group.position.x - a.group.position.x;
    const dz = b.group.position.z - a.group.position.z;
    const d2 = dx * dx + dz * dz;
    const minD = C.playerRadius * 1.9;
    if (d2 > 0.0001 && d2 < minD * minD) {
      const d = Math.sqrt(d2);
      const push = (minD - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      const aOld = a.group.position.clone(), bOld = b.group.position.clone();
      a.group.position.x -= nx * push;
      a.group.position.z -= nz * push;
      b.group.position.x += nx * push;
      b.group.position.z += nz * push;
      if (playerHitsWorld(a, a.group.position.x, a.group.position.z)) a.group.position.copy(aOld);
      if (playerHitsWorld(b, b.group.position.x, b.group.position.z)) b.group.position.copy(bOld);
    }
  }

  function sofaCollides(pos, angle) {
    const s = sofaOBB(pos, angle);
    for (const c of world.colliders) if (obbIntersectsOBB(s, aabbAsOBB(c))) return { hit: true, type: c.name };
    if (world.door && obbIntersectsOBB(s, doorOBB())) return { hit: true, type: 'petty-door' };
    return { hit: false, type: null };
  }

  function updatePettyDoor(dt) {
    if (!world.door) return;
    const d = world.door;
    const old = d.group.rotation.y;
    const target = Math.sin(elapsed * C.pettyDoor.speed) * C.pettyDoor.swing;
    d.group.rotation.y = target;
    d.bonkCooldown = Math.max(0, d.bonkCooldown - dt);

    // If the door swings into a player, keep the old angle rather than clipping through them.
    const obb = doorOBB();
    if (players.some(p => circleHitsOBB(p.group.position.x, p.group.position.z, C.playerRadius, obb))) {
      d.group.rotation.y = old;
    }
  }

  function updateSofa(dt) {
    const sofa = world.sofa;
    const grabbers = players.filter(p => p.grabbing);
    let desiredPos = sofa.position.clone();
    let desiredAngle = sofa.rotation.y;

    if (grabbers.length === 2) {
      const left = grabbers.find(p => p.grabSide === -1);
      const right = grabbers.find(p => p.grabSide === 1);
      if (left && right) {
        const dx = right.group.position.x - left.group.position.x;
        const dz = right.group.position.z - left.group.position.z;
        if (dx * dx + dz * dz > 0.12) desiredAngle = Math.atan2(-dz, dx);

        desiredPos.set(0, 0.55, 0);
        for (const p of [left, right]) {
          const local = HANDLE_LOCAL[String(p.grabSide)];
          const r = rotateXZ(local.x, local.z, desiredAngle);
          desiredPos.x += p.group.position.x - r.x;
          desiredPos.z += p.group.position.z - r.z;
        }
        desiredPos.multiplyScalar(0.5);
        desiredPos.y = 0.55;

        const fDot = left.facing.dot(right.facing);
        if (fDot < -0.38) {
          for (const p of grabbers) p.patience = clamp(p.patience - C.patienceDrainWhilePullingApart * dt, 0, 100);
          maybeComment('pulling', 1700);
        }
      }
    } else if (grabbers.length === 1) {
      const p = grabbers[0];
      desiredAngle = Math.atan2(p.facing.x, p.facing.z) + Math.PI / 2;
      const local = HANDLE_LOCAL[String(p.grabSide)];
      const r = rotateXZ(local.x, local.z, desiredAngle);
      desiredPos.set(p.group.position.x - r.x, 0.55, p.group.position.z - r.z);
    }

    if (grabbers.length) {
      const oldPos = sofa.position.clone();
      const candidate = sofa.position.clone();
      candidate.x = damp(candidate.x, desiredPos.x, C.sofaFollowSpeed, dt);
      candidate.z = damp(candidate.z, desiredPos.z, C.sofaFollowSpeed, dt);
      const candAngle = angleDamp(sofa.rotation.y, desiredAngle, C.sofaRotateSpeed, dt);
      const collision = sofaCollides(candidate, candAngle);

      if (!collision.hit) {
        sofa.position.x = candidate.x;
        sofa.position.z = candidate.z;
        sofa.rotation.y = candAngle;
        sofa.userData.slideVel.x = clamp((sofa.position.x - oldPos.x) / Math.max(dt, 0.001), -C.sofaMaxSlideSpeed, C.sofaMaxSlideSpeed);
        sofa.userData.slideVel.z = clamp((sofa.position.z - oldPos.z) / Math.max(dt, 0.001), -C.sofaMaxSlideSpeed, C.sofaMaxSlideSpeed);
      } else {
        sofa.userData.slideVel.multiplyScalar(0.25);
        chaos += dt * 0.75;
        for (const p of grabbers) p.patience = clamp(p.patience - C.patienceDrainOnWallFight * dt, 0, 100);
        bonk(collision.type);
      }
    } else {
      const onRug = pointInRect(sofa.position.x, sofa.position.z, C.rug);
      const friction = onRug ? C.sofaRugSlideFriction : C.sofaSlideFriction;
      if (sofa.userData.slideVel.lengthSq() > 0.002) {
        const candidate = sofa.position.clone().addScaledVector(sofa.userData.slideVel, dt);
        const collision = sofaCollides(candidate, sofa.rotation.y);
        if (!collision.hit) {
          sofa.position.x = candidate.x;
          sofa.position.z = candidate.z;
        } else {
          sofa.userData.slideVel.multiplyScalar(-0.18);
          bonk(collision.type);
        }
      }
      sofa.userData.slideVel.x = damp(sofa.userData.slideVel.x, 0, friction, dt);
      sofa.userData.slideVel.z = damp(sofa.userData.slideVel.z, 0, friction, dt);
    }

    sofa.position.y = damp(sofa.position.y, grabbers.length ? 0.575 : 0.55, 9, dt);

    if (pointInRect(sofa.position.x, sofa.position.z, C.rug) && grabbers.length) maybeComment('rug', 3600);

    updateStageFromPosition();
    updateVase();
    updateGoal(dt);

    const low = Math.min(...players.map(p => p.patience));
    if (low < 35) maybeComment('lowPatience', 4500);

    $('grab-hint').classList.toggle('hidden', !players.some(p => p.canGrab && !p.grabbing));
  }

  function bonk(type) {
    const sofa = world.sofa;
    if (performance.now() - sofa.userData.lastBonk < 360) return;
    sofa.userData.lastBonk = performance.now();
    chaos += 1;
    cameraShake = Math.max(cameraShake, 0.16);
    beep(type === 'petty-door' ? 105 : 82, 0.065, 0.06);
    spawnBonkParticles(sofa.position, 6);
    if (type === 'petty-door') maybeComment('door', 1500);
    else maybeComment('wall', 1500);
  }

  function updateVase() {
    if (!world.vase || world.vase.broken) return;
    const s = sofaOBB();
    if (circleHitsOBB(world.vase.x, world.vase.z, 0.34, s)) breakVase();
  }

  function breakVase() {
    const v = world.vase;
    if (v.broken) return;
    v.broken = true;
    chaos += 10;
    cameraShake = Math.max(cameraShake, 0.3);
    for (const p of players) p.patience = clamp(p.patience - C.patienceDrainVase, 0, 100);
    scene.remove(v.group);
    spawnShardParticles(new THREE.Vector3(v.x, 0.4, v.z));
    beep(520, 0.04, 0.05);
    setTimeout(() => beep(300, 0.08, 0.045), 45);
    toast('THE VASE HAS LEFT THE RELATIONSHIP.');
    maybeComment('vase', 0);
  }

  function updateCat(dt) {
    const cat = world.cat;
    if (!cat) return;
    cat.cooldown = Math.max(0, cat.cooldown - dt);
    const t = elapsed + cat.phase;
    const x = 6.25 + Math.sin(t * 0.72) * 2.35;
    const z = Math.sin(t * 1.18) * 3.55;
    const prev = cat.group.position.clone();
    cat.group.position.set(x, 0, z);
    const dx = x - prev.x, dz = z - prev.z;
    if (dx * dx + dz * dz > 0.0001) cat.group.rotation.y = Math.atan2(dx, dz);
    cat.group.userData?.tail && (cat.group.userData.tail.rotation.z = -0.9 + Math.sin(t * 5) * 0.18);

    if (gameStarted && !won && cat.cooldown <= 0 && circleHitsOBB(x, z, 0.36, sofaOBB())) {
      cat.cooldown = 2.4;
      const away = tmpV1.set(world.sofa.position.x - x, 0, world.sofa.position.z - z);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      const candidate = world.sofa.position.clone().addScaledVector(away, 0.42);
      if (!sofaCollides(candidate, world.sofa.rotation.y).hit) world.sofa.position.copy(candidate);
      world.sofa.userData.slideVel.addScaledVector(away, 1.4);
      for (const p of players) p.patience = clamp(p.patience - C.patienceDrainCat, 0, 100);
      chaos += 4;
      cameraShake = Math.max(cameraShake, 0.22);
      toast('THE CAT HAS CHOSEN VIOLENCE.');
      maybeComment('cat', 0);
      beep(760, 0.05, 0.035);
      setTimeout(() => beep(920, 0.04, 0.025), 55);
    }
  }

  function updateGoal(dt) {
    const sofa = world.sofa;
    const inGoal = Math.abs(sofa.position.x - C.goalCenter.x) < C.goalHalfSize.x && Math.abs(sofa.position.z - C.goalCenter.z) < C.goalHalfSize.z;
    if (inGoal && stage >= 2) {
      winHold += dt;
      world.goalRing.material.opacity = 0.48 + 0.16 * Math.sin(performance.now() * 0.008);
      world.goalRing.material.emissiveIntensity = 1.15;
      maybeComment('almostThere', 2800);
      if (winHold >= C.winHoldSeconds) finishMovingTrial();
    } else {
      winHold = 0;
      world.goalRing.material.opacity = stage >= 2 ? 0.4 : 0.28;
      world.goalRing.material.emissiveIntensity = stage >= 2 ? 0.95 : 0.55;
    }
  }

  function updateStageFromPosition() {
    const x = world.sofa.position.x;
    if (stage === 0 && x > -1.45) {
      setStage(1);
      toast('CURSED RUG SURVIVED. TRACTION HAS RETURNED TO THE RELATIONSHIP.');
      beep(520, 0.06, 0.04);
    }
    if (stage <= 1 && x > C.doorwayPassedX) {
      setStage(2);
      toast('SOFA THROUGH. NOW GET IT INTO THE COZY CORNER.');
      beep(620, 0.06, 0.04);
      setTimeout(() => beep(760, 0.07, 0.04), 80);
    }
  }

  function setStage(next, silent = false) {
    stage = Math.max(stage, next);
    const objectives = [
      'Escape the cursed slippery rug with the sofa.',
      'Time the petty door and get the sofa through the doorway.',
      'Get the sofa into the Cozy Corner. Avoid giving the cat ideas.'
    ];
    $('objective').textContent = objectives[stage];
    $('crisis-count').textContent = `${stage + 1}/3`;
    document.querySelectorAll('.crisis-step').forEach((el, i) => {
      el.classList.toggle('active', i === stage);
      el.classList.toggle('done', i < stage);
    });
    if (!silent && stage === 1) maybeComment('door', 0);
    if (!silent && stage === 2) setFluffles('The Cozy Corner is glowing. This is not symbolic. Probably.');
  }

  function spawnBonkParticles(pos, count = 5) {
    for (let i = 0; i < count; i++) {
      const p = makeHeartMesh(i % 2 ? 0xffd06f : 0xff6f91);
      const s = 0.04 + Math.random() * 0.035;
      p.scale.set(s, s, s);
      p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2));
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2);
      p.userData.life = 0.8 + Math.random() * 0.5;
      scene.add(p);
      world.particles.push(p);
    }
  }

  function spawnShardParticles(pos) {
    for (let i = 0; i < 16; i++) {
      const shard = mesh(new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.06), mat(i % 3 ? 0xffc4d5 : 0xff6f91, 0.7));
      shard.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.5, (Math.random() - 0.5) * 0.4));
      shard.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3.5, 1 + Math.random() * 2.8, (Math.random() - 0.5) * 3.5);
      shard.userData.life = 1.1 + Math.random() * 0.6;
      scene.add(shard);
      world.particles.push(shard);
    }
  }

  function updateParticles(dt) {
    for (let i = world.particles.length - 1; i >= 0; i--) {
      const p = world.particles[i];
      p.userData.life -= dt;
      p.userData.vel.y -= 3.2 * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.rotation.x += dt * 5;
      p.rotation.y += dt * 4;
      if (p.material) {
        p.material.transparent = true;
        p.material.opacity = clamp(p.userData.life, 0, 1);
      }
      if (p.userData.life <= 0) {
        scene.remove(p);
        world.particles.splice(i, 1);
      }
    }
  }


  // =============================================================
  // LEVEL TWO — DINNER DATE FROM HELL
  // =============================================================

  function showDinnerIntro() {
    storyMode = 'dinner';
    $('hud').classList.add('hidden');
    document.body.classList.remove('kitchen-mode');
    const chef = players[kitchenChefIndex];
    const runner = players[kitchenChefIndex === 0 ? 1 : 0];
    $('story-kicker').textContent = 'LEVEL TWO · 11:54 PM · KITCHEN';
    $('story-speaker').textContent = 'Dr. Fluffles';
    $('story-title').textContent = 'Dinner Date From Hell';
    $('story-text').textContent = `${chef.name} is the CHEF: stay near the pot, add delivered ingredients, stir, and control the stove. ${runner.name} is the RUNNER: fetch one ingredient at a time. Vegetables must be washed at the sink, chopped on the board, then delivered to the prep tray. ${chef.name} is the CHEF: use close-up pouring/tipping tasks to get ingredients into the pot, then cook and stir. Once pasta is in, the next ingredient becomes urgent.`;
    $('story-progress').textContent = 'LEVEL 2 / 2 · CLEAR ROLES';
    $('story-next').textContent = 'ENTER THE KITCHEN ♥';
    $('story-skip-level').classList.remove('hidden');
    $('story-screen').classList.add('active');
  }

  function startDinnerTrial() {
    currentLevel = 'dinner';
    won = false;
    gameStarted = true;
    dinnerStage = 0;
    dinnerStartTime = performance.now();
    $('story-skip-level').classList.add('hidden');
    setupDinnerScene();
    configureDinnerHUD();
    $('hud').classList.remove('hidden');
    $('kitchen-status').classList.remove('hidden');
    const d = world.dinner;
    const chef = players[d.chefIndex], runner = players[d.runnerIndex];
    setFluffles(`${chef.name} = CHEF. ${runner.name} = RUNNER. First target: PASTA. No committee meeting required.`);
    document.body.classList.add('kitchen-mode');
    showKitchenGuide();
    toast(`${runner.name}: FIND PASTA → PREP TRAY. ${chef.name}: WAIT AT THE POT.`);
    beep(520, 0.06, 0.04);
    setTimeout(() => beep(720, 0.08, 0.035), 90);
  }

  function setupDinnerScene() {
    const preserved = players.map(p => p.patience);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x182036);
    scene.fog = new THREE.Fog(0x182036, 24, 44);

    world.colliders = [];
    world.particles = [];
    world.sofa = null;
    world.goalRing = null;
    world.goalHeart = null;
    world.rug = null;
    world.door = null;
    world.cat = null;
    world.vase = null;
    world.dinner = null;

    buildKitchenWorld();
    addKitchenLights();

    const d = world.dinner;
    const starts = [new THREE.Vector3(), new THREE.Vector3()];
    starts[d.chefIndex].set(-0.75, 0, -2.35);
    starts[d.runnerIndex].set(-7.35, 0, 1.95);
    players.forEach((p, i) => {
      p.start.copy(starts[i]);
      p.group.position.copy(starts[i]);
      p.velocity.set(0, 0, 0);
      p.grabbing = false;
      p.grabSide = null;
      p.heldItem = null;
      p.canGrab = false;
      p.patience = clamp(preserved[i] + 7, 0, 100);
      scene.add(p.group);
      updatePlayerFace(p);
    });

    applyKitchenRolePresentation();
    camera.position.set(0, 12.4, 13.35);
    camera.lookAt(0, 0.45, -0.75);
  }

  function applyKitchenRolePresentation() {
    const d = world.dinner;
    if (!d) return;
    players.forEach((p, i) => {
      const role = i === d.chefIndex ? 'CHEF' : 'RUNNER';
      if (p.group.userData.roleBadge) p.group.remove(p.group.userData.roleBadge);
      const badge = makeTextSprite(role, role === 'CHEF' ? 'rgba(111,76,31,.94)' : 'rgba(31,89,116,.94)', '#fff7e8');
      badge.scale.multiplyScalar(.56);
      badge.position.set(0, 2.55, 0);
      p.group.add(badge);
      p.group.userData.roleBadge = badge;
      if (p.group.userData.apron) p.group.userData.apron.visible = role === 'CHEF';
      if (p.group.userData.chefHat) p.group.userData.chefHat.visible = role === 'CHEF';
      if (p.group.userData.runnerBand) p.group.userData.runnerBand.visible = role === 'RUNNER';
      const label = $(`p${i + 1}-label`);
      if (label) {
        label.textContent = `${p.name.toUpperCase()} · ${role}`;
        label.classList.remove('role-chef','role-runner');
        label.classList.add(role === 'CHEF' ? 'role-chef' : 'role-runner');
      }
    });
    const chef = players[d.chefIndex], runner = players[d.runnerIndex];
    if ($('guide-chef-name')) $('guide-chef-name').textContent = chef.name.toUpperCase();
    if ($('guide-runner-name')) $('guide-runner-name').textContent = runner.name.toUpperCase();
  }

  function buildKitchenWorld() {
    const d = {
      items: [], recipe: new Set(), required: ['pasta', 'tomato', 'onion'], wrongCount: 0,
      stoveOn: false, cook: 0, mealReady: false, fire: false, lastStirAt: 0,
      sinkLeak: false, sinkTriggered: false, sinkFixed: false, leakAge: 0, waterLevel: 0,
      servedCount: 0, platesSpawned: false, catTimer: 13.5, catCalm: 0,
      chefIndex: kitchenChefIndex, runnerIndex: kitchenChefIndex === 0 ? 1 : 0,
      ingredientStep: 0, handoffItem: null, mini: null,
      urgentName: null, urgentRemaining: 0, urgentMax: 0, urgentStage: 0, urgentWarned: false,
      potPos: new THREE.Vector3(-0.7, 0, -3.55), knobPos: new THREE.Vector3(0.55, 0, -3.48),
      handoffPos: new THREE.Vector3(-2.05, 0, -3.55), choppingPos: new THREE.Vector3(-5.65, 0, -3.55),
      sinkPos: new THREE.Vector3(4.15, 0, -3.52), tablePos: new THREE.Vector3(5.65, 0, 2.45),
      spillRect: { minX: 1.65, maxX: 7.6, minZ: -3.45, maxZ: 0.95 },
      initialPatience: players.map(p => p.patience), beacons: {}, decor: [], guideShown: false
    };
    world.dinner = d;

    // Warm tile floor — readable gameplay, actual kitchen mood.
    const floor = mesh(new THREE.BoxGeometry(20, 0.35, 12), mat(0xb98268, 0.96), false, true);
    floor.position.y = -0.22; scene.add(floor);
    for (let x = -9.4; x <= 9.4; x += 1.35) {
      for (let z = -5.35; z <= 5.35; z += 1.35) {
        const ix = Math.round((x + 9.4) / 1.35), iz = Math.round((z + 5.35) / 1.35);
        const c = (ix + iz) % 2 ? 0xe7c8a8 : 0xf4dfc5;
        const tile = mesh(new THREE.BoxGeometry(1.29, 0.022, 1.29), mat(c, 0.9), false, true);
        tile.position.set(x, 0.012, z); scene.add(tile);
      }
    }

    // Cream apartment walls with visible height, but no visual wall in front of the camera.
    addKitchenWall(-9.92, 0, 0.22, 12, 'kitchen-left');
    addKitchenWall(9.92, 0, 0.22, 12, 'kitchen-right');
    addKitchenWall(0, -5.92, 20, 0.22, 'kitchen-back');
    addKitchenBoundary(0, 5.92, 20, 0.22, 'kitchen-front');
    addBacksplash(-1.0, -5.77, 15.6);

    // Lower cabinetry / work zones.
    addKitchenCounter(-5.65, -4.65, 6.15, 1.25, 0xa8b6a0, 'prep-counter', 'sage');
    addKitchenCounter(-0.55, -4.65, 3.25, 1.25, 0xc79b7b, 'stove-counter', 'terracotta');
    addKitchenCounter(4.25, -4.65, 4.8, 1.25, 0xa4b8bd, 'sink-counter', 'blue');

    // Upper cabinetry and open pantry shelf.
    addUpperCabinet(-6.0, -5.46, 3.9, 1.65, 0xe6d5bd);
    addUpperCabinet(1.55, -5.46, 1.8, 1.65, 0xe6d5bd);
    addOpenShelf(-3.15, -5.42, 1.85);

    // Fridge with handles, freezer split and magnets.
    const fridge = mesh(new THREE.BoxGeometry(1.55, 2.85, 1.28), mat(0xdfe7e5, 0.38, 0.12));
    fridge.position.set(-8.65, 1.42, -4.46); scene.add(fridge);
    world.colliders.push({ x:-8.65, z:-4.46, hx:.78, hz:.64, mesh:fridge, name:'fridge' });
    const seam = mesh(new THREE.BoxGeometry(1.42,.035,.02), mat(0x8b9696,.45,.15));
    seam.rotation.x=Math.PI/2; seam.position.set(-8.65,1.92,-3.81); scene.add(seam);
    for (const y of [1.1,2.05]) {
      const handle=mesh(new THREE.CapsuleGeometry(.035,.42,5,8),mat(0x737d7e,.3,.6));
      handle.position.set(-8.13,y,-3.79); scene.add(handle);
    }
    const magnetHeart=makeHeartMesh(0xff7f9e); magnetHeart.scale.set(.13,.13,.13); magnetHeart.position.set(-8.62,1.67,-3.79); scene.add(magnetHeart);
    const note=makeTextSprite('BUY MILK', 'rgba(255,246,194,.96)', '#5a4642'); note.scale.set(.72,.18,1); note.position.set(-8.65,2.28,-3.79); scene.add(note);

    // Real stove + oven front.
    const ovenBody=mesh(new THREE.BoxGeometry(1.85,1.02,1.1),mat(0x504a4d,.42,.2)); ovenBody.position.set(-.55,.55,-4.63); scene.add(ovenBody);
    const ovenGlass=new THREE.Mesh(new THREE.BoxGeometry(1.42,.56,.025),new THREE.MeshStandardMaterial({color:0x15191f,roughness:.2,metalness:.15,transparent:true,opacity:.88}));
    ovenGlass.position.set(-.55,.5,-4.06); scene.add(ovenGlass);
    const ovenHandle=mesh(new THREE.CapsuleGeometry(.035,1.05,5,8),mat(0x8e8888,.3,.62)); ovenHandle.rotation.z=Math.PI/2; ovenHandle.position.set(-.55,.87,-4.02); scene.add(ovenHandle);
    const stove=mesh(new THREE.BoxGeometry(1.85,.12,1.04),mat(0x2d2b2c,.36,.35)); stove.position.set(-.55,1.12,-4.2); scene.add(stove);
    for (const x of [-1.0,-.1]) for (const zz of [-4.45,-4.02]) {
      const ring=mesh(new THREE.TorusGeometry(.23,.035,10,22),mat(0x756f71,.4,.45)); ring.rotation.x=Math.PI/2; ring.position.set(x,1.2,zz); scene.add(ring);
    }
    // Range hood.
    const hood=mesh(new THREE.BoxGeometry(2.15,.24,.9),mat(0xe4ded6,.38,.18)); hood.position.set(-.55,3.08,-5.2); scene.add(hood);
    const hoodStem=mesh(new THREE.BoxGeometry(.85,1.05,.62),mat(0xd9d2ca,.42,.12)); hoodStem.position.set(-.55,3.58,-5.38); scene.add(hoodStem);

    // Pot, handles and subtle steam particles container.
    const potGroup=new THREE.Group();
    const pot=mesh(new THREE.CylinderGeometry(.48,.43,.55,24),mat(0x7e7b78,.28,.6)); pot.position.y=.27; potGroup.add(pot);
    for (const sx of [-1,1]) { const h=mesh(new THREE.BoxGeometry(.5,.08,.12),mat(0x353335,.5)); h.position.set(sx*.62,.36,0); potGroup.add(h); }
    potGroup.position.set(d.potPos.x,1.14,-4.18); scene.add(potGroup); d.potGroup=potGroup;
    const lidKnob=mesh(new THREE.SphereGeometry(.09,10,8),mat(0x343235,.45)); lidKnob.position.set(d.potPos.x,1.79,-4.18); scene.add(lidKnob);

    const knob=mesh(new THREE.CylinderGeometry(.17,.17,.13,16),mat(0xffc768,.4,.24)); knob.rotation.x=Math.PI/2; knob.position.set(d.knobPos.x,.92,-3.98); scene.add(knob); d.knob=knob;
    const cookRing=mesh(new THREE.TorusGeometry(.62,.075,12,32),mat(0x887b83,.5,.1),false,false); cookRing.rotation.x=Math.PI/2; cookRing.position.set(d.potPos.x,1.98,-4.18); scene.add(cookRing); d.cookRing=cookRing;

    const fireGroup=new THREE.Group();
    for(let i=0;i<7;i++){ const f=mesh(new THREE.ConeGeometry(.12+Math.random()*.08,.5+Math.random()*.35,9),mat(i%2?0xff7a35:0xffd44f,.45)); f.position.set((Math.random()-.5)*.75,.38,(Math.random()-.5)*.55); fireGroup.add(f); }
    fireGroup.position.set(d.potPos.x,1.38,-4.18); fireGroup.visible=false; scene.add(fireGroup); d.fireGroup=fireGroup;

    const smokeGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const puff = mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.05, 10, 8), mat(0x8d8690, 0.95), false, false);
      puff.material.transparent = true;
      puff.material.opacity = 0.36;
      puff.position.set((Math.random() - 0.5) * 0.45, 0.2 + i * 0.18, (Math.random() - 0.5) * 0.25);
      puff.userData.base = puff.position.clone();
      smokeGroup.add(puff);
    }
    smokeGroup.position.set(d.potPos.x, 1.65, -4.18);
    smokeGroup.visible = false;
    scene.add(smokeGroup);
    d.smokeGroup = smokeGroup;

    // Sink with inset basin, curved faucet, soap and dish rack.
    const basin=mesh(new THREE.BoxGeometry(1.7,.18,.82),mat(0xbac9ca,.28,.5)); basin.position.set(4.15,1.13,-4.18); scene.add(basin);
    const basinInset=mesh(new THREE.BoxGeometry(1.3,.08,.56),mat(0x7f999c,.34,.42)); basinInset.position.set(4.15,1.19,-4.18); scene.add(basinInset);
    const tap=mesh(new THREE.TorusGeometry(.34,.055,10,20,Math.PI),mat(0xd7e0df,.25,.72)); tap.rotation.z=Math.PI/2; tap.position.set(4.15,1.64,-4.17); scene.add(tap); d.tap=tap;
    const soap=mesh(new THREE.BoxGeometry(.18,.36,.18),mat(0xf0b2b6,.68)); soap.position.set(5.02,1.32,-4.23); scene.add(soap);
    const rack=mesh(new THREE.BoxGeometry(.75,.08,.45),mat(0x6f7d7e,.4,.45)); rack.position.set(3.08,1.23,-4.2); scene.add(rack);
    for(let i=0;i<3;i++){ const plate=mesh(new THREE.CylinderGeometry(.19,.19,.035,18),mat(0xf3eee6,.55)); plate.rotation.z=Math.PI/2; plate.position.set(2.9+i*.17,1.42,-4.2); scene.add(plate); }

    const waterMat=new THREE.MeshStandardMaterial({color:0x6fc7ff,transparent:true,opacity:0,roughness:.25,emissive:0x17436b,emissiveIntensity:.35});
    const water=mesh(new THREE.BoxGeometry(5.8,.025,4.25),waterMat,false,true); water.position.set(4.55,.035,-1.22); water.scale.set(.08,1,.08); scene.add(water); d.water=water;

    // Window over sink — actual apartment-at-night vibe.
    addKitchenWindow(5.65,-5.79,2.8,1.65);

    // Cozy dining nook with chairs, rug, placemats and pendant lamps.
    const nookRug=mesh(new THREE.BoxGeometry(4.65,.025,3.2),mat(0xd6a7a0,.95),false,true); nookRug.position.set(d.tablePos.x,.028,d.tablePos.z); scene.add(nookRug);
    const tableTop=mesh(new THREE.BoxGeometry(3.15,.18,1.78),mat(0xa36f55,.76)); tableTop.position.set(d.tablePos.x,.92,d.tablePos.z); scene.add(tableTop);
    world.colliders.push({x:d.tablePos.x,z:d.tablePos.z,hx:1.57,hz:.89,mesh:tableTop,name:'dining-table'});
    for(const dx of [-1.2,1.2]) for(const dz of [-.58,.58]){ const leg=mesh(new THREE.BoxGeometry(.13,.88,.13),mat(0x6e493b,.82)); leg.position.set(d.tablePos.x+dx,.44,d.tablePos.z+dz); scene.add(leg); }
    addKitchenChair(3.75,2.45,Math.PI/2); addKitchenChair(7.55,2.45,-Math.PI/2);
    for(const dx of [-.65,.65]){ const matPlace=mesh(new THREE.BoxGeometry(.9,.025,.62),mat(0xeac9b0,.9),false,true); matPlace.position.set(d.tablePos.x+dx,1.03,d.tablePos.z); scene.add(matPlace); }
    const tinyVase=mesh(new THREE.CylinderGeometry(.11,.15,.38,12),mat(0xe79a96,.82)); tinyVase.position.set(d.tablePos.x,1.22,d.tablePos.z); scene.add(tinyVase);
    addKitchenPendant(4.95,3.75,1.8); addKitchenPendant(6.35,3.75,1.8);

    // Ingredient placement now makes spatial sense.
    // Pasta on pantry shelf, fresh veg on chopping board, bad ideas elsewhere.
    const board=mesh(new THREE.BoxGeometry(2.25,.07,.72),mat(0xc58d5d,.8)); board.position.set(-5.65,1.18,-4.12); scene.add(board); d.choppingBoard=board;
    const knifeBlade=mesh(new THREE.BoxGeometry(.7,.045,.15),mat(0xcfd5d7,.24,.7)); knifeBlade.position.set(-6.25,1.29,-4.1); knifeBlade.rotation.y=.18; scene.add(knifeBlade);
    const knifeHandle=mesh(new THREE.BoxGeometry(.28,.09,.18),mat(0x5a3d35,.75)); knifeHandle.position.set(-6.72,1.29,-4.18); knifeHandle.rotation.y=.18; scene.add(knifeHandle);
    const prepBowl=mesh(new THREE.CylinderGeometry(.34,.26,.16,20),mat(0xf3e4d5,.52),true,true); prepBowl.position.set(-4.82,1.3,-4.12); scene.add(prepBowl);

    // Shared prep tray: Runner delivers here, Chef takes from here. This creates a clear hand-off.
    const prepTray=mesh(new THREE.BoxGeometry(1.1,.07,.7),mat(0xf1c979,.58,.08),false,true);
    prepTray.position.set(d.handoffPos.x,1.18,-4.12); scene.add(prepTray); d.prepTray=prepTray;
    const prepRim=mesh(new THREE.TorusGeometry(.45,.035,8,24),mat(0xd69c52,.45,.12),false,false); prepRim.rotation.x=Math.PI/2; prepRim.scale.z=.62; prepRim.position.set(d.handoffPos.x,1.24,-4.12); scene.add(prepRim); d.prepRim=prepRim;

    makeDinnerItem('pasta','PASTA',0xf3c862,new THREE.Vector3(-3.25,1.83,-5.25),'ingredient',true,'box');
    makeDinnerItem('tomato','TOMATO',0xe85d58,new THREE.Vector3(-5.98,1.42,-4.08),'ingredient',true,'sphere');
    makeDinnerItem('onion','ONION',0xc8a0df,new THREE.Vector3(-5.25,1.42,-4.08),'ingredient',true,'sphere');
    makeDinnerItem('fish','SUSPICIOUS FISH',0x72b7bd,new THREE.Vector3(-8.0,.36,-3.25),'ingredient',false,'fish');
    makeDinnerItem('chocolate','CHOCOLATE',0x774b3d,new THREE.Vector3(-2.7,1.82,-5.25),'ingredient',false,'box');
    makeDinnerItem('extinguisher','FIRE EXTINGUISHER',0xd94c4f,new THREE.Vector3(8.55,.58,4.4),'extinguisher',false,'extinguisher');

    // Spice jars / mug / kettle / towel = kitchen, not grey-box prototype.
    for(let i=0;i<4;i++){ const jar=mesh(new THREE.CylinderGeometry(.09,.09,.26,12),mat([0xd2a56f,0x8fa66e,0xc87969,0xe0c98c][i],.7)); jar.position.set(-4.65+i*.25,1.28,-4.2); scene.add(jar); }
    const mug=mesh(new THREE.CylinderGeometry(.13,.12,.28,14),mat(0xf1d8dd,.75)); mug.position.set(2.3,1.3,-4.18); scene.add(mug);
    const kettle=mesh(new THREE.SphereGeometry(.28,14,10),mat(0x8f9c9d,.35,.38)); kettle.scale.y=.8; kettle.position.set(1.75,1.4,-4.2); scene.add(kettle);
    const towel=mesh(new THREE.BoxGeometry(.48,.48,.035),mat(0xeab5a5,.95)); towel.position.set(6.15,.85,-4.0); scene.add(towel);

    // Kevin and non-obstructive decor.
    const cat=makeCat(); cat.group.position.set(2.2,0,3.85); scene.add(cat.group); d.cat=cat;
    addKitchenPlant(-8.35,4.35); addKitchenTrashCan(8.45,-.8);
    addWallClock(8.3,-5.72,2.7);

    // Context beacons are hidden until genuinely useful.
    d.beacons.pot = makeKitchenBeacon('CHEF: POT', new THREE.Vector3(d.potPos.x,2.72,-4.02), 0xf3c86d);
    d.beacons.handoff = makeKitchenBeacon('RUNNER: PREP TRAY', new THREE.Vector3(d.handoffPos.x,2.32,-4.02), 0xffd06f);
    d.beacons.chop = makeKitchenBeacon('RUNNER: CHOP HERE', new THREE.Vector3(d.choppingPos.x,2.38,-4.0), 0xffa76f);
    d.beacons.sink = makeKitchenBeacon('RUNNER: TAP', new THREE.Vector3(d.sinkPos.x,2.55,-4.0), 0x6fc7ff);
    d.beacons.extinguisher = makeKitchenBeacon('EXTINGUISHER', new THREE.Vector3(8.55,2.1,4.4), 0xff6b6b);
    d.beacons.table = makeKitchenBeacon('SERVE HERE', new THREE.Vector3(d.tablePos.x,2.35,d.tablePos.z), 0xff9eb4);
    Object.values(d.beacons).forEach(b=>b.visible=false);
  }

  function addKitchenLights() {
    scene.add(new THREE.HemisphereLight(0xffeadb, 0x28304a, 2.35));
    const sun=new THREE.DirectionalLight(0xffead7,2.25); sun.position.set(-5,10,6); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-14; sun.shadow.camera.right=14; sun.shadow.camera.top=12; sun.shadow.camera.bottom=-12; scene.add(sun);
    const counterGlow=new THREE.PointLight(0xffb77a,13,12,2); counterGlow.position.set(-1,3.4,-2.4); scene.add(counterGlow);
    const sinkGlow=new THREE.PointLight(0xffe0b7,8,8,2); sinkGlow.position.set(4.6,3.2,-3.4); scene.add(sinkGlow);
    const diningGlow=new THREE.PointLight(0xffa985,16,10,2); diningGlow.position.set(5.7,3.1,2.5); scene.add(diningGlow);
    const fridgeGlow=new THREE.PointLight(0xaed8ff,5,7,2); fridgeGlow.position.set(-8.0,2.4,-3.3); scene.add(fridgeGlow);
  }

  function addKitchenWall(x,z,w,d,name){
    const wall=mesh(new THREE.BoxGeometry(w,4.5,d),mat(0xf2dfcf,.94),false,true); wall.position.set(x,2.2,z); scene.add(wall); world.colliders.push({x,z,hx:w/2,hz:d/2,mesh:wall,name});
  }
  function addKitchenBoundary(x,z,w,d,name){
    const wall=mesh(new THREE.BoxGeometry(w,.7,d),mat(0x8b6b68,.9),false,true); wall.position.set(x,.33,z); scene.add(wall); world.colliders.push({x,z,hx:w/2,hz:d/2,mesh:wall,name});
  }
  function addBacksplash(x,z,width){
    for(let xx=x-width/2+.35;xx<x+width/2;xx+=.72){ for(let y=1.28;y<2.26;y+=.34){ const c=((Math.round(xx*10)+Math.round(y*10))%3===0)?0xf5d7c8:0xf8e8dd; const t=mesh(new THREE.BoxGeometry(.68,.3,.025),mat(c,.82),false,true); t.position.set(xx,y,z); scene.add(t); } }
  }
  function addUpperCabinet(x,z,w,h,color){
    const body=mesh(new THREE.BoxGeometry(w,h,.52),mat(color,.85)); body.position.set(x,2.62,z); scene.add(body);
    const half=w/2; const doorW=w/2-.08;
    for(const sx of [-1,1]){ const door=mesh(new THREE.BoxGeometry(doorW,h-.16,.035),mat(color===0xe6d5bd?0xf0e2cf:color,.9)); door.position.set(x+sx*(half/2),2.62,z+.28); scene.add(door); const knob=mesh(new THREE.SphereGeometry(.045,8,6),mat(0xb08b5a,.3,.62)); knob.position.set(x+sx*.11,2.62,z+.32); scene.add(knob); }
  }
  function addOpenShelf(x,z,w){
    for(const y of [1.48,2.12]){ const shelf=mesh(new THREE.BoxGeometry(w,.08,.42),mat(0x9b6b4f,.82)); shelf.position.set(x,y,z+.18); scene.add(shelf); }
    for(const sx of [-w/2+.08,w/2-.08]){ const bracket=mesh(new THREE.BoxGeometry(.07,1.0,.35),mat(0x6f5042,.7)); bracket.position.set(x+sx,1.78,z+.18); scene.add(bracket); }
  }
  function addKitchenWindow(x,z,w,h){
    const frame=mesh(new THREE.BoxGeometry(w+.24,h+.24,.08),mat(0xf8eee3,.76),false,true); frame.position.set(x,2.7,z); scene.add(frame);
    const night=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0x17233d})); night.position.set(x,2.7,z+.05); scene.add(night);
    for(let i=0;i<16;i++){ const star=mesh(new THREE.SphereGeometry(.018+Math.random()*.018,6,5),new THREE.MeshBasicMaterial({color:0xfff1bf}),false,false); star.position.set(x-w/2+.14+Math.random()*(w-.28),2.7-h/2+.12+Math.random()*(h-.24),z+.08); scene.add(star); }
    const vbar=mesh(new THREE.BoxGeometry(.07,h,.05),mat(0xf4e6d7,.75)); vbar.position.set(x,2.7,z+.09); scene.add(vbar);
    const hbar=mesh(new THREE.BoxGeometry(w,.07,.05),mat(0xf4e6d7,.75)); hbar.position.set(x,2.7,z+.09); scene.add(hbar);
    for(const sx of [-1,1]){ const curtain=mesh(new THREE.BoxGeometry(.36,h+.3,.05),mat(0xd8898f,.92),false,true); curtain.position.set(x+sx*(w/2+.23),2.7,z+.12); scene.add(curtain); }
  }
  function addKitchenChair(x,z,rot){
    const seat=mesh(new THREE.BoxGeometry(.8,.12,.78),mat(0x8b604b,.8)); seat.position.set(x,.58,z); seat.rotation.y=rot; scene.add(seat);
    const back=mesh(new THREE.BoxGeometry(.8,.82,.11),mat(0x8b604b,.82)); const off=rotateXZ(0,-.34,rot); back.position.set(x+off.x,1.0,z+off.z); back.rotation.y=rot; scene.add(back);
    for(const sx of [-.28,.28]) for(const sz of [-.27,.27]){ const r=rotateXZ(sx,sz,rot); const leg=mesh(new THREE.BoxGeometry(.08,.58,.08),mat(0x664536,.84)); leg.position.set(x+r.x,.29,z+r.z); scene.add(leg); }
  }
  function addKitchenPendant(x,y,z){
    const cord=mesh(new THREE.CylinderGeometry(.018,.018,1.15,8),mat(0x4c4040,.55),false,false); cord.position.set(x,y+.58,z); scene.add(cord);
    const shade=mesh(new THREE.ConeGeometry(.34,.38,20,1,true),mat(0xe8aa76,.72),false,false); shade.position.set(x,y,z); shade.rotation.x=Math.PI; scene.add(shade);
    const bulb=mesh(new THREE.SphereGeometry(.08,10,8),new THREE.MeshStandardMaterial({color:0xffe4ae,emissive:0xffb86b,emissiveIntensity:1.3})); bulb.position.set(x,y-.12,z); scene.add(bulb);
  }
  function addWallClock(x,z,y){
    const face=mesh(new THREE.CylinderGeometry(.42,.42,.08,24),mat(0xf5eee3,.72)); face.rotation.x=Math.PI/2; face.position.set(x,y,z); scene.add(face);
    const hand=mesh(new THREE.BoxGeometry(.035,.29,.025),mat(0x5d4748,.55)); hand.position.set(x,y+.07,z+.05); hand.rotation.z=.55; scene.add(hand);
  }
  function makeKitchenBeacon(text,pos,color){
    const g=new THREE.Group();
    const ringMat=new THREE.MeshStandardMaterial({color,transparent:true,opacity:.62,emissive:color,emissiveIntensity:.55,roughness:.7});
    const ring=mesh(new THREE.TorusGeometry(.34,.055,10,22),ringMat,false,false); ring.rotation.x=Math.PI/2; g.add(ring);
    const arrow=mesh(new THREE.ConeGeometry(.12,.28,8),ringMat,false,false); arrow.rotation.x=Math.PI; arrow.position.y=-.35; g.add(arrow);
    const tag=makeTextSprite(text,'rgba(61,42,37,.88)','#fff5df'); tag.scale.multiplyScalar(.48); tag.position.y=.42; g.add(tag);
    g.position.copy(pos); g.userData.ring=ring; g.userData.baseY=pos.y; scene.add(g); return g;
  }
  function showKitchenGuide(){
    const el=$('kitchen-guide'); if(!el) return; el.classList.remove('hidden','fading');
    setTimeout(()=>{ if(currentLevel!=='dinner') return; el.classList.add('fading'); setTimeout(()=>el.classList.add('hidden'),320); },5600);
  }

  function addKitchenCounter(x, z, w, d, color, name, style='plain') {
    const body=mesh(new THREE.BoxGeometry(w,1.05,d),mat(color,.88)); body.position.set(x,.52,z); scene.add(body);
    const top=mesh(new THREE.BoxGeometry(w+.08,.11,d+.08),mat(0xf1dfcf,.52,.05)); top.position.set(x,1.08,z); scene.add(top);
    // Cabinet doors, frames and tiny brass handles make the counter read as cabinetry.
    const doorCount=Math.max(1,Math.round(w/1.15)); const usable=w-.18; const doorW=usable/doorCount;
    for(let i=0;i<doorCount;i++){
      const dx=x-usable/2+doorW*(i+.5);
      const door=mesh(new THREE.BoxGeometry(doorW-.06,.76,.035),mat(style==='sage'?0xb9c3aa:style==='blue'?0xb7c8ca:0xd3aa8c,.92)); door.position.set(dx,.55,z+d/2+.025); scene.add(door);
      const handle=mesh(new THREE.CapsuleGeometry(.025,.16,4,7),mat(0xa98555,.3,.65)); handle.rotation.z=Math.PI/2; handle.position.set(dx,.72,z+d/2+.06); scene.add(handle);
    }
    world.colliders.push({x,z,hx:w/2,hz:d/2,mesh:body,name});
  }

  function addKitchenPlant(x, z) {
    const pot = mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.52, 14), mat(0xc67875, 0.9));
    pot.position.set(x, 0.26, z);
    scene.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0x69b887, 0.9));
      leaf.scale.set(0.45, 1.45, 0.35);
      leaf.position.set(x + Math.sin(i * 1.7) * 0.22, 0.7 + (i % 2) * 0.18, z + Math.cos(i * 1.7) * 0.22);
      scene.add(leaf);
    }
  }

  function addKitchenTrashCan(x, z) {
    const can = mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.72, 16), mat(0x59616c, 0.55, 0.2));
    can.position.set(x, 0.36, z);
    scene.add(can);
    world.colliders.push({ x, z, hx: 0.4, hz: 0.4, mesh: can, name: 'trash-can' });
  }

  function makeDinnerItem(name, label, color, pos, kind, required, shape) {
    const group=new THREE.Group(); let body;
    if(shape==='sphere'){
      body=mesh(new THREE.SphereGeometry(.28,16,12),mat(color,.72));
      if(name==='tomato'){ const leaf=mesh(new THREE.ConeGeometry(.12,.08,5),mat(0x5f9c65,.8)); leaf.position.y=.28; group.add(leaf); }
      if(name==='onion'){ const tip=mesh(new THREE.ConeGeometry(.07,.12,8),mat(0xd7b6e7,.82)); tip.position.y=.31; group.add(tip); }
    } else if(shape==='fish'){
      body=mesh(new THREE.CapsuleGeometry(.17,.46,6,10),mat(color,.78)); body.rotation.z=Math.PI/2;
      const tail=mesh(new THREE.ConeGeometry(.22,.35,3),mat(color,.78)); tail.rotation.z=-Math.PI/2; tail.position.x=-.48; group.add(tail);
      const eye=mesh(new THREE.SphereGeometry(.035,8,6),mat(0x201a20,.6)); eye.position.set(.34,.08,.16); group.add(eye);
    } else if(shape==='extinguisher'){
      body=mesh(new THREE.CylinderGeometry(.18,.22,.72,14),mat(color,.5,.15));
      const hose=mesh(new THREE.CapsuleGeometry(.035,.45,5,8),mat(0x252128,.6)); hose.rotation.z=Math.PI/2; hose.position.set(.28,.17,0); group.add(hose);
      const pin=mesh(new THREE.BoxGeometry(.12,.08,.05),mat(0xffd26d,.45,.3)); pin.position.set(0,.42,0); group.add(pin);
    } else {
      body=mesh(new THREE.BoxGeometry(.42,.62,.28),mat(color,.72));
      // pasta/chocolate packaging stripe
      const stripe=mesh(new THREE.BoxGeometry(.43,.12,.292),mat(name==='pasta'?0xe95f58:0xe6c5a2,.82)); stripe.position.y=.08; group.add(stripe);
    }
    group.add(body);
    const tag=makeTextSprite(label, required?'rgba(42,76,57,.92)':kind==='extinguisher'?'rgba(132,39,43,.94)':'rgba(69,48,50,.92)');
    tag.position.y=kind==='extinguisher'?1.05:.88; tag.scale.multiplyScalar(kind==='extinguisher'?.52:.44); tag.visible=false; group.add(tag);
    const haloMat=new THREE.MeshStandardMaterial({color:required?0xffd46f:kind==='extinguisher'?0xff6e6e:0xc7a4ba,transparent:true,opacity:required?.48:.2,emissive:required?0xffbd4a:0x6f4659,emissiveIntensity:.7,roughness:.7});
    const halo=mesh(new THREE.TorusGeometry(.38,.035,8,24),haloMat,false,false); halo.rotation.x=Math.PI/2; halo.position.y=-.03; halo.visible=required || kind==='extinguisher'; group.add(halo);
    group.position.copy(pos); scene.add(group);
    const item={name,label,group,kind,required,added:false,delivered:false,heldBy:null,served:false,stolenCount:0,tag,halo,baseY:pos.y,homePos:pos.clone(),washed:name==='pasta',prepared:name==='pasta'};
    group.userData.item=item; world.dinner.items.push(item); return item;
  }

  function makeDinnerPlate(index) {
    const d = world.dinner;
    const group = new THREE.Group();
    const plate = mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 24), mat(0xf5e9ed, 0.48));
    group.add(plate);
    const pasta = mesh(new THREE.TorusGeometry(0.18, 0.07, 8, 18), mat(0xf3c96a, 0.8));
    pasta.rotation.x = Math.PI / 2;
    pasta.position.y = 0.08;
    group.add(pasta);
    group.position.set(-1.18 + index * 1.1, 1.25, -3.75);
    scene.add(group);
    const assignedIndex = index === 0 ? d.chefIndex : d.runnerIndex;
    const roleLabel = assignedIndex === d.chefIndex ? 'CHEF PLATE' : 'RUNNER PLATE';
    const item = { name: `plate${index + 1}`, label: roleLabel, group, kind: 'plate', required: false, added: false, delivered: false, heldBy: null, served: false, stolenCount: 0, assignedIndex };
    group.userData.item = item;
    world.dinner.items.push(item);
    return item;
  }

  function distanceXZ(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function isKitchenSlippery(x, z) {
    const d = world.dinner;
    return !!d && d.waterLevel > 0.08 && pointInRect(x, z, d.spillRect);
  }

  function kitchenRole(player) {
    const d = world.dinner;
    if (!d) return '';
    return players.indexOf(player) === d.chefIndex ? 'chef' : 'runner';
  }

  function activeDinnerIngredient(d = world.dinner) {
    if (!d || d.ingredientStep >= d.required.length) return null;
    return d.required[d.ingredientStep];
  }

  function dinnerItemByName(name) {
    const d = world.dinner;
    return d ? d.items.find(i => i.name === name) : null;
  }

  function nearestDinnerItem(player, maxDistance = 2.05) {
    const d = world.dinner;
    if (!d) return null;
    const role = kitchenRole(player);
    const active = activeDinnerIngredient(d);
    let best = null;

    for (const item of d.items) {
      if (item.added || item.served || item.heldBy) continue;

      // Final serving is shared: either player may take an unserved plate.
      if (d.mealReady) {
        if (item.kind !== 'plate' || item.assignedIndex !== players.indexOf(player)) continue;
      } else if (d.fire) {
        // Kitchen emergency belongs to the Runner.
        if (role !== 'runner' || item.kind !== 'extinguisher') continue;
      } else if (active) {
        // Ingredients are intentionally sequential. Runner fetches; Chef receives.
        if (role === 'runner') {
          if (item.kind !== 'ingredient' || item.name !== active || item.delivered) continue;
        } else {
          if (item.kind !== 'ingredient' || item.name !== active || !item.delivered) continue;
        }
      } else {
        continue;
      }

      const dist = distanceXZ(player.group.position, item.group.position);
      if (dist <= maxDistance && (!best || dist < best.distance)) best = { item, distance: dist };
    }
    return best;
  }

  function getDinnerTask(player) {
    const d = world.dinner;
    if (!d) return 'Wait for the kitchen to load.';
    const role = kitchenRole(player);
    const active = activeDinnerIngredient(d);
    const held = player.heldItem;
    const idx = players.indexOf(player);

    if (d.mini?.active) {
      if (d.mini.playerIndex === idx) {
        if (d.mini.type === 'wash') return `Wash ${d.mini.itemName.toUpperCase()} — hold your interaction key.`;
        if (d.mini.type === 'chop') return `Chop ${d.mini.itemName.toUpperCase()} — tap when the marker crosses green.`;
        if (d.mini.type === 'pour') return `Tip ${d.mini.itemName.toUpperCase()} into the pot — hold steady.`;
      }
      return `${players[d.mini.playerIndex]?.name || 'Partner'} is doing a close-up prep task. Keep the kitchen under control.`;
    }

    if (d.mealReady) {
      if (held && held.kind === 'plate') return 'Carry your plate to the dining table.';
      return 'Pick up YOUR dinner plate and carry it to the table.';
    }

    if (d.fire) {
      if (role === 'runner') {
        if (held && held.kind === 'extinguisher') return 'Take the extinguisher to the burning stove.';
        return 'Get the FIRE EXTINGUISHER and put out the fire.';
      }
      return 'Stay clear of the fire and guide your Runner.';
    }

    if (d.sinkLeak) {
      if (role === 'runner') return 'Go to the sink and TURN OFF THE TAP.';
      return 'Keep stirring — your Runner is handling the sink.';
    }

    if (active) {
      const item = dinnerItemByName(active);
      const label = active.toUpperCase();
      const timer = d.urgentRemaining > 0 ? ` (${Math.ceil(d.urgentRemaining)}s)` : '';
      const burn = d.urgentStage === 1 ? ` ${urgencySubject(active)} is burning!` : '';
      if (role === 'runner') {
        if (held && held.name === active) {
          if (active !== 'pasta' && !held.washed) return `Take ${label} to the SINK and wash it${timer}.`;
          if (active !== 'pasta' && !held.prepared) return `Take ${label} back to the CHOPPING BOARD and chop it${timer}.`;
          return `Bring prepared ${label} to the gold PREP TRAY${timer}.`;
        }
        if (item && item.delivered) return `Wait — Chef is putting ${label} into the pot.${burn}`;
        return `Pick up the glowing ${label}${timer}.${burn}`;
      }
      if (held && held.name === active) return `${active === 'pasta' ? 'Pour' : 'Tip'} ${label} into the pot now.${burn}`;
      if (item && item.delivered) return `Pick up ${label} from the PREP TRAY, then put it into the pot.${burn}`;
      return `Stay by the pot. Runner is preparing ${label}${timer}.${burn}`;
    }

    if (!d.stoveOn) {
      if (role === 'chef') return 'Everything is prepped. TURN ON THE STOVE.';
      return 'Prep complete. Stay ready for kitchen trouble.';
    }

    if (role === 'chef') {
      if (d.cook >= 68 && d.cook <= 94) return 'GREEN ZONE! Turn the stove OFF now.';
      return 'STIR THE POT and watch the cooking meter.';
    }
    return 'Watch for trouble while Chef cooks.';
  }
  function nearestDinnerAction(player) {
    const d = world.dinner;
    if (!d) return null;
    const pos = player.group.position;
    const role = kitchenRole(player);
    const active = activeDinnerIngredient(d);
    const idx = players.indexOf(player);

    if (d.mini?.active && d.mini.playerIndex === idx) return null;

    if (player.heldItem) {
      const held = player.heldItem;
      if (held.kind === 'extinguisher' && role === 'runner' && d.fire && distanceXZ(pos, d.potPos) < 1.95) {
        return { type: 'extinguish', text: 'EXTINGUISH THE FIRE' };
      }
      if (held.kind === 'ingredient') {
        if (role === 'runner' && held.name === active && !held.delivered) {
          if (held.name !== 'pasta' && !held.washed && distanceXZ(pos, d.sinkPos) < 1.95) {
            return { type: 'wash', text: `WASH ${held.label}` };
          }
          if (held.name !== 'pasta' && held.washed && !held.prepared && distanceXZ(pos, d.choppingPos) < 1.9) {
            return { type: 'chop', text: `CHOP ${held.label}` };
          }
          if ((held.name === 'pasta' || held.prepared) && distanceXZ(pos, d.handoffPos) < 1.55) {
            return { type: 'handoff', text: `PLACE ${held.label} ON PREP TRAY` };
          }
        }
        if (role === 'chef' && held.name === active && held.delivered && distanceXZ(pos, d.potPos) < 1.82) {
          return { type: 'add', text: `${held.name === 'pasta' ? 'POUR' : 'TIP'} ${held.label} INTO POT` };
        }
      }
      if (held.kind === 'ingredient') return null;
      if (held.kind === 'plate' && distanceXZ(pos, d.tablePos) < 2.55) return { type: 'serve', text: `SERVE ${held.label}` };
      if (held.kind === 'plate' || held.kind === 'extinguisher') return null;
      return { type: 'drop', text: `DROP ${held.label}` };
    }

    if (d.fire) {
      const item = nearestDinnerItem(player);
      if (item) return { type: 'pickup', text: `PICK UP ${item.item.label}`, item: item.item };
      return null;
    }

    if (d.sinkLeak && role === 'runner') {
      if (distanceXZ(pos, d.sinkPos) < 1.95) return { type: 'sink', text: 'TURN OFF THE FLOODING TAP' };
      return null;
    }

    if (role === 'chef' && !d.mealReady && !active) {
      const nearKnob = distanceXZ(pos, d.knobPos) < 1.32;
      const nearPot = distanceXZ(pos, d.potPos) < 1.55;
      if (!d.stoveOn && nearKnob) return { type: 'stove', text: 'TURN ON STOVE' };
      if (d.stoveOn && d.cook >= 68 && d.cook <= 94 && nearKnob) return { type: 'stove', text: 'TURN OFF STOVE' };
      if (d.stoveOn && nearPot) return { type: 'stir', text: 'STIR THE POT' };
      if (d.stoveOn && nearKnob) return { type: 'stove', text: 'TURN OFF STOVE' };
    }

    const item = nearestDinnerItem(player);
    if (item) return { type: 'pickup', text: `PICK UP ${item.item.label}`, item: item.item };

    if (!active && !d.sinkLeak && !d.fire && !d.mealReady && d.cat && distanceXZ(pos, d.cat.group.position) < 1.15) return { type: 'petcat', text: 'PET KEVIN (TEMPORARY CEASEFIRE)' };

    const other = players.find(p => p !== player);
    if (!active && !d.sinkLeak && !d.fire && !d.mealReady && other && distanceXZ(pos, other.group.position) < 1.0) return { type: 'hug', text: 'EMERGENCY HUG — BOTH PRESS INTERACT' };
    return null;
  }
  function dinnerInteract(player) {
    const d = world.dinner;
    if (!d) return;
    ensureAudio();
    const guide=$('kitchen-guide'); if(guide && !guide.classList.contains('hidden')) { guide.classList.add('fading'); setTimeout(()=>guide.classList.add('hidden'),300); }
    const action = nearestDinnerAction(player);
    if (!action) {
      const role = kitchenRole(player).toUpperCase();
      toast(`${player.name} · ${role}: ${getDinnerTask(player)}`);
      beep(150, 0.035, 0.018);
      return;
    }

    if (player.heldItem) {
      const item = player.heldItem;
      if (action.type === 'extinguish') extinguishDinnerFire(player, item);
      else if (action.type === 'wash') startKitchenMini('wash', player, item);
      else if (action.type === 'chop') startKitchenMini('chop', player, item);
      else if (action.type === 'handoff') deliverIngredientToTray(player, item);
      else if (action.type === 'add') addIngredientToPot(player, item);
      else if (action.type === 'serve') serveDinnerPlate(player, item);
      else dropDinnerItem(player, false);
      return;
    }

    if (action.type === 'pickup') { holdDinnerItem(player, action.item); return; }
    if (action.type === 'sink') {
      d.sinkLeak = false; d.sinkFixed = true; d.leakAge = 0; setDinnerStage(2); chaos += 1;
      player.patience = clamp(player.patience + 4, 0, 100);
      toast(`${player.name} turned off the tap. The kitchen reluctantly stops becoming a pool.`);
      setFluffles('Plumbing solved by direct communication. Unexpectedly efficient.'); beep(620, 0.06, 0.035); return;
    }
    if (action.type === 'stir') {
      d.lastStirAt = elapsed; d.potGroup.rotation.y += 0.35;
      spawnBonkParticles(new THREE.Vector3(d.potPos.x, 1.4, -4.18), 2);
      toast(`${player.name} stirred the pot. For once, literally.`); beep(480, 0.045, 0.025); return;
    }
    if (action.type === 'stove') { toggleDinnerStove(player); return; }
    if (action.type === 'petcat') {
      d.catCalm = 7.0; player.patience = clamp(player.patience + 2.5, 0, 100);
      toast(`${player.name} negotiated a seven-second peace treaty with Kevin.`);
      setFluffles('The cat has accepted affection as a temporary bribe. Corruption works.'); beep(760, 0.05, 0.025); return;
    }
    if (action.type === 'hug') {
      const other = players.find(p => p !== player); const now = performance.now(); player.lastDinnerInteract = now;
      if (other && now - other.lastDinnerInteract < 850) {
        for (const p of players) p.patience = clamp(p.patience + 9, 0, 100);
        spawnBonkParticles(player.group.position.clone().add(other.group.position).multiplyScalar(0.5), 10);
        toast('EMERGENCY HUG SUCCESSFUL. DINNER CONTINUES TO EXIST UNSUPERVISED.');
        setFluffles('Affection detected during active kitchen risk. Reckless. Effective.'); beep(760, 0.08, 0.035); setTimeout(() => beep(920, 0.09, 0.03), 80);
      } else toast(`${player.name} is requesting an emergency hug. The other suspect must also press interact.`);
    }
  }
  function kitchenMiniKeyLabel(playerIndex) {
    if (window.NET?.online && window.NET?.started) return 'E';
    return playerIndex === 1 ? 'ENTER' : 'E';
  }

  function startKitchenMini(type, player, item) {
    const d = world.dinner;
    if (!d || d.mini?.active || !item) return;
    const playerIndex = players.indexOf(player);
    d.mini = {
      active: true,
      type,
      playerIndex,
      itemName: item.name,
      progress: 0,
      marker: 0.12,
      dir: 1,
      holding: false,
      hits: 0,
      misses: 0
    };
    player.velocity.set(0, 0, 0);
    const verb = type === 'wash' ? 'WASH' : type === 'chop' ? 'CHOP' : item.name === 'pasta' ? 'POUR' : 'TIP';
    toast(`${player.name}: ${verb} ${item.label}. CLOSE-UP TASK STARTED.`);
    if (type === 'wash') setFluffles('Clean vegetables. A shocking display of standards. Hold the interaction key until the sink has done something useful.');
    if (type === 'chop') setFluffles('Knife timing exercise. Tap when the marker is green. Fingers are not an ingredient.');
    if (type === 'pour') setFluffles('Steady hands. Tip the ingredient into the pot without decorating the floor.');
    updateKitchenMiniUI();
  }

  function handleKitchenMiniInput(playerIndex, down) {
    const d = world.dinner;
    const mini = d?.mini;
    if (!mini?.active || mini.playerIndex !== playerIndex) return;
    if (mini.type === 'chop') {
      if (!down) return;
      const good = mini.marker >= 0.27 && mini.marker <= 0.73;
      mini.progress = clamp(mini.progress + (good ? 22 : 10), 0, 100);
      if (good) {
        mini.hits += 1;
        beep(650 + mini.hits * 35, 0.035, 0.022);
      } else {
        mini.misses += 1;
        players[playerIndex].patience = clamp(players[playerIndex].patience - 1.2, 0, 100);
        chaos += 0.5;
        beep(170, 0.04, 0.02);
      }
      if (mini.progress >= 100) finishKitchenMini();
    } else {
      mini.holding = !!down;
    }
    updateKitchenMiniUI();
  }

  function updateKitchenMini(dt) {
    const d = world.dinner;
    const mini = d?.mini;
    if (!mini?.active) { updateKitchenMiniUI(); return; }

    const speed = mini.type === 'chop' ? 1.55 : 1.15;
    mini.marker += mini.dir * dt * speed;
    if (mini.marker >= 1) { mini.marker = 1; mini.dir = -1; }
    if (mini.marker <= 0) { mini.marker = 0; mini.dir = 1; }

    if (mini.type === 'wash' && mini.holding) {
      mini.progress = clamp(mini.progress + dt * 43, 0, 100);
      if (Math.floor(mini.progress) % 18 === 0) spawnBonkParticles(new THREE.Vector3(d.sinkPos.x, 1.3, -4.1), 1);
    }
    if (mini.type === 'pour' && mini.holding) {
      const steady = mini.marker >= 0.2 && mini.marker <= 0.8;
      mini.progress = clamp(mini.progress + dt * (steady ? 37 : 22), 0, 100);
      if (!steady) {
        chaos += dt * 0.35;
        players[mini.playerIndex].patience = clamp(players[mini.playerIndex].patience - dt * 0.14, 0, 100);
      }
    }
    if (mini.progress >= 100) finishKitchenMini();
    updateKitchenMiniUI();
  }

  function finishKitchenMini() {
    const d = world.dinner;
    const mini = d?.mini;
    if (!mini?.active) return;
    const player = players[mini.playerIndex];
    const item = dinnerItemByName(mini.itemName);
    const type = mini.type;
    d.mini = null;

    if (type === 'wash' && item) {
      item.washed = true;
      player.patience = clamp(player.patience + 1.5, 0, 100);
      toast(`${item.label} washed. NOW BACK TO THE CHOPPING BOARD.`);
      setFluffles('Vegetable hygiene completed. Please enjoy this brief period of competence.');
      beep(720, 0.06, 0.03);
    } else if (type === 'chop' && item) {
      item.prepared = true;
      item.label = `CHOPPED ${item.name.toUpperCase()}`;
      player.patience = clamp(player.patience + 2.2, 0, 100);
      toast(`${item.name.toUpperCase()} chopped. TAKE IT TO THE PREP TRAY.`);
      setFluffles('Acceptable knife work. The cutting board has chosen not to press charges.');
      beep(820, 0.055, 0.03);
    } else if (type === 'pour' && item) {
      toast(`${item.name.toUpperCase()} successfully transferred. Very little is on the floor.`);
      finalizeIngredientToPot(player, item);
    }
    updateKitchenMiniUI();
    updateKitchenHUD();
  }

  function updateKitchenMiniUI() {
    const panel = $('kitchen-task-screen');
    if (!panel) return;
    const d = world.dinner;
    const mini = d?.mini;
    if (!mini?.active) {
      panel.classList.add('hidden');
      panel.classList.remove('active-player', 'spectator');
      return;
    }
    panel.classList.remove('hidden');
    const localIndex = window.NET?.online && window.NET?.started ? window.NET.playerIndex : mini.playerIndex;
    const activeHere = localIndex === mini.playerIndex;
    panel.classList.toggle('active-player', activeHere);
    panel.classList.toggle('spectator', !activeHere);
    const item = dinnerItemByName(mini.itemName);
    const name = (item?.name || mini.itemName).toUpperCase();
    const actor = players[mini.playerIndex]?.name || 'Partner';
    const titles = {
      wash: `Wash the ${name}`,
      chop: `Chop the ${name}`,
      pour: `${mini.itemName === 'pasta' ? 'Pour the pasta' : `Tip the ${name}`} into the pot`
    };
    const subtitles = {
      wash: 'Hold interact to rinse it properly.',
      chop: 'Tap interact when the moving marker is inside the green zone.',
      pour: 'Hold interact. Keep the moving marker near the green zone for a clean pour.'
    };
    const emoji = mini.type === 'wash' ? '💦' : mini.type === 'chop' ? (mini.itemName === 'tomato' ? '🍅🔪' : '🧅🔪') : (mini.itemName === 'pasta' ? '🍝🥘' : '🥣🥘');
    $('task-kicker').textContent = activeHere ? `${actor.toUpperCase()} · YOUR TASK` : `${actor.toUpperCase()} IS WORKING`;
    $('task-title').textContent = titles[mini.type] || 'Kitchen task';
    $('task-subtitle').textContent = subtitles[mini.type] || '';
    $('task-emoji').textContent = emoji;
    $('task-progress-fill').style.width = `${clamp(mini.progress, 0, 100)}%`;
    $('task-progress-text').textContent = `${Math.round(mini.progress)}%`;
    $('task-marker').style.left = `${clamp(mini.marker, 0, 1) * 100}%`;
    $('task-safe-zone').style.left = mini.type === 'wash' ? '0%' : mini.type === 'chop' ? '27%' : '20%';
    $('task-safe-zone').style.width = mini.type === 'wash' ? '100%' : mini.type === 'chop' ? '46%' : '60%';
    const key = kitchenMiniKeyLabel(mini.playerIndex);
    $('task-control').textContent = activeHere ? `${mini.type === 'chop' ? 'TAP' : 'HOLD'} ${key}` : 'PARTNER TASK';
    $('task-observer-note').textContent = activeHere
      ? 'Your partner can keep moving while you do this.'
      : 'You can keep moving and handle your own kitchen responsibilities.';
  }

  function urgencyDuration(name) {
    if (name === 'tomato') return 30;
    if (name === 'onion') return 26;
    return 0;
  }

  function urgencySubject(name) {
    if (name === 'tomato') return 'PASTA';
    if (name === 'onion') return 'SAUCE';
    return 'DINNER';
  }

  function startDinnerUrgency(name) {
    const d = world.dinner;
    if (!d || !name) return;
    d.urgentName = name;
    d.urgentMax = urgencyDuration(name);
    d.urgentRemaining = d.urgentMax;
    d.urgentStage = 0;
    d.urgentWarned = false;
    if (d.smokeGroup) d.smokeGroup.visible = false;
  }

  function clearDinnerUrgency() {
    const d = world.dinner;
    if (!d) return;
    d.urgentName = null;
    d.urgentRemaining = 0;
    d.urgentMax = 0;
    d.urgentStage = 0;
    d.urgentWarned = false;
    if (d.smokeGroup) d.smokeGroup.visible = false;
  }

  function deliverIngredientToTray(player, item) {
    const d = world.dinner;
    if (!d || !item || item.name !== activeDinnerIngredient(d)) return;
    item.heldBy = null;
    item.delivered = true;
    player.heldItem = null;
    item.group.position.set(d.handoffPos.x, 1.48, -4.12);
    item.group.scale.setScalar(1);
    d.handoffItem = item;
    player.patience = clamp(player.patience + 1.5, 0, 100);
    toast(`${player.name} delivered ${item.label}. CHEF — YOUR TURN.`);
    setFluffles(`Clean hand-off. ${players[d.chefIndex].name} now owns the dangerous part of the process.`);
    beep(610, 0.055, 0.03);
    updateKitchenHUD();
  }

  function holdDinnerItem(player, item) {
    if (!item || item.heldBy) return;
    item.heldBy = player;
    player.heldItem = item;
    item.group.scale.setScalar(0.92);
    toast(`${player.name} picked up ${item.label}.`);
    beep(520, 0.045, 0.03);
  }

  function updateHeldDinnerItem(player) {
    const item = player.heldItem;
    if (!item) return;
    const f = player.facing.lengthSq() > 0.01 ? player.facing : tmpV1.set(1, 0, 0);
    item.group.position.set(
      player.group.position.x + f.x * 0.72,
      item.kind === 'plate' ? 1.12 : 1.0,
      player.group.position.z + f.z * 0.72
    );
    item.group.rotation.y = player.group.rotation.y;
  }

  function dropDinnerItem(player, silent = false) {
    const item = player.heldItem;
    if (!item) return;
    const f = player.facing.lengthSq() > 0.01 ? player.facing : tmpV1.set(1, 0, 0);
    item.group.position.set(
      clamp(player.group.position.x + f.x * 0.95, -8.8, 8.8),
      item.kind === 'extinguisher' ? 0.42 : item.kind === 'plate' ? 0.18 : 0.3,
      clamp(player.group.position.z + f.z * 0.95, -4.9, 4.9)
    );
    item.group.scale.setScalar(1);
    item.heldBy = null;
    player.heldItem = null;
    if (!silent) {
      toast(`${player.name} dropped ${item.label}. No paperwork required.`);
      beep(220, 0.04, 0.025);
    }
  }

  function addIngredientToPot(player, item) {
    const d = world.dinner;
    const active = activeDinnerIngredient(d);
    if (!item || item.name !== active || !item.delivered || kitchenRole(player) !== 'chef') {
      toast('That is not the Chef\'s current ingredient. Follow your task card.');
      return;
    }
    if (item.name !== 'pasta' && !item.prepared) {
      toast(`${item.label} still needs chopping.`);
      return;
    }
    startKitchenMini('pour', player, item);
  }

  function finalizeIngredientToPot(player, item) {
    const d = world.dinner;
    if (!d || !item) return;
    item.heldBy = null;
    item.added = true;
    player.heldItem = null;
    d.handoffItem = null;
    scene.remove(item.group);

    d.recipe.add(item.name);
    d.ingredientStep += 1;
    player.patience = clamp(player.patience + 2.5, 0, 100);
    toast(`${item.label} made it into the pot. TEAM HAND-OFF COMPLETE.`);
    beep(650 + d.recipe.size * 80, 0.06, 0.035);

    const garnish = mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(item.name === 'tomato' ? 0xef5e67 : item.name === 'onion' ? 0xc79ce8 : 0xf1ca67, 0.75));
    garnish.position.set(d.potPos.x + (Math.random() - 0.5) * 0.35, 1.48, -4.18 + (Math.random() - 0.5) * 0.25);
    scene.add(garnish);

    const next = activeDinnerIngredient(d);
    if (next) {
      startDinnerUrgency(next);
      setFluffles(`${item.label} is in. Runner: prep ${next.toUpperCase()} quickly. ${urgencySubject(next)} will not wait politely.`);
      toast(`NEXT: ${next.toUpperCase()} — WASH, CHOP, DELIVER.`);
    } else {
      clearDinnerUrgency();
      setDinnerStage(1);
      toast('PREP COMPLETE. CHEF: TURN ON THE STOVE. RUNNER: STAND BY FOR TROUBLE.');
      setFluffles('The mise en place survived. I am as disappointed as I am impressed.');
    }
    updateKitchenHUD();
  }

  function toggleDinnerStove(player) {
    const d = world.dinner;
    if (d.fire) {
      toast('THE STOVE IS CURRENTLY ON FIRE. THIS IS NOT A SETTINGS ISSUE.');
      return;
    }
    if (d.mealReady) {
      toast('Dinner is already cooked. Please stop improving it.');
      return;
    }
    if (d.recipe.size < d.required.length) {
      toast('The pot is emotionally and nutritionally incomplete.');
      setFluffles(`Missing ${d.required.filter(x => !d.recipe.has(x)).join(' + ')}.`);
      beep(130, 0.05, 0.025);
      return;
    }

    if (!d.stoveOn) {
      d.stoveOn = true;
      d.lastStirAt = elapsed;
      d.knob.material.color.setHex(0xff735d);
      toast(`${player.name} turned the stove ON. A timer has begun judging you.`);
      beep(540, 0.06, 0.035);
    } else {
      if (d.cook >= 68 && d.cook <= 94) {
        completeDinnerCooking(player);
      } else {
        d.stoveOn = false;
        d.knob.material.color.setHex(0xffd06f);
        if (d.cook < 68) {
          toast(`Too early: ${Math.round(d.cook)}%. The pasta is still emotionally unavailable.`);
          setFluffles('You may turn it back on. Unlike trust, pasta is relatively forgiving.');
        }
        beep(250, 0.05, 0.025);
      }
    }
  }

  function completeDinnerCooking(player) {
    const d = world.dinner;
    d.stoveOn = false;
    d.mealReady = true;
    clearDinnerUrgency();
    d.knob.material.color.setHex(0x6fdc8f);
    d.cookRing.material.color.setHex(0x6fdc8f);
    players.forEach(p => p.patience = clamp(p.patience + 7, 0, 100));
    setDinnerStage(3);
    spawnDinnerPlates();
    toast(`DINNER COOKED AT ${Math.round(d.cook)}%. THIS COUNTS AS A MIRACLE.`);
    setFluffles('Two plates have appeared. Carry both to the table. Gravity remains enabled.');
    beep(700, 0.08, 0.04);
    setTimeout(() => beep(920, 0.1, 0.035), 90);
  }

  function burnDinner() {
    const d = world.dinner;
    if (d.fire) return;
    if (d.mini?.active) {
      d.mini = null;
      updateKitchenMiniUI();
    }
    const runner = players[d.runnerIndex];
    if (runner?.heldItem?.kind === 'ingredient') {
      const held = runner.heldItem;
      held.heldBy = null;
      runner.heldItem = null;
      held.group.position.copy(held.homePos);
      held.group.scale.setScalar(1);
    }
    d.stoveOn = false;
    d.fire = true;
    if (d.smokeGroup) d.smokeGroup.visible = false;
    d.fireGroup.visible = true;
    d.knob.material.color.setHex(0xd73d45);
    setDinnerStage(2);
    chaos += 14;
    players.forEach(p => p.patience = clamp(p.patience - 8, 0, 100));
    cameraShake = Math.max(cameraShake, 0.38);
    toast('THE PASTA HAS ACHIEVED COMBUSTION. GET THE EXTINGUISHER.');
    setFluffles('Fire. Excellent. The extinguisher is on the opposite side of the room for educational reasons.');
    beep(120, 0.15, 0.055);
    setTimeout(() => beep(90, 0.2, 0.05), 180);
  }

  function extinguishDinnerFire(player, item) {
    const d = world.dinner;
    if (!d.fire) return;
    d.fire = false;
    d.fireGroup.visible = false;
    if (d.smokeGroup) d.smokeGroup.visible = false;
    d.cook = 60;
    d.lastStirAt = elapsed;
    d.knob.material.color.setHex(0xffd06f);
    item.heldBy = null;
    player.heldItem = null;
    item.group.position.set(8.55, .58, 4.4);
    item.group.scale.setScalar(1);
    setDinnerStage(1);
    player.velocity.addScaledVector(player.facing, -2.0);
    cameraShake = Math.max(cameraShake, 0.18);
    toast(`${player.name} extinguished dinner. The pasta has been granted a second chance.`);
    setFluffles('Fire resolved. Resume cooking at your earliest emotional convenience.');
    beep(840, 0.09, 0.035);
  }

  function spawnDinnerPlates() {
    const d = world.dinner;
    if (d.platesSpawned) return;
    d.platesSpawned = true;
    makeDinnerPlate(0);
    makeDinnerPlate(1);
  }

  function serveDinnerPlate(player, item) {
    const d = world.dinner;
    item.heldBy = null;
    item.served = true;
    player.heldItem = null;
    const slot = d.servedCount;
    item.group.position.set(d.tablePos.x + (slot === 0 ? -0.62 : 0.62), 1.05, d.tablePos.z);
    item.group.rotation.set(0, 0, 0);
    item.group.scale.setScalar(1);
    d.servedCount += 1;
    player.patience = clamp(player.patience + 3, 0, 100);
    toast(`${player.name} delivered plate ${d.servedCount}/2. DO NOT CELEBRATE WHILE CARRYING CERAMICS.`);
    beep(660 + d.servedCount * 120, 0.07, 0.035);
    updateKitchenHUD();
    if (d.servedCount >= 2) setTimeout(finishDinnerTrial, 650);
  }

  function finishDinnerTrial() {
    if (won || currentLevel !== 'dinner') return;
    won = true;
    gameStarted = false;
    dinnerTime = (performance.now() - dinnerStartTime) / 1000;
    const d = world.dinner;
    for (let i = 0; i < 24; i++) spawnBonkParticles(d.tablePos.clone().setY(1.0), 1);
    toast('DINNER DATE SURVIVED. BOTH PLATES HAVE LEGAL STATUS AS FOOD.');
    setFluffles('Two physical trials passed. I regret to inform you that I now have questions.');
    beep(660, 0.1, 0.05);
    setTimeout(() => beep(880, 0.12, 0.045), 100);
    scheduleNetworkFlow('startPartnerQuiz', 1100);
  }

  function updateDinner(dt) {
    const d = world.dinner;
    if (!d) return;

    updateDinnerCat(dt);
    updateKitchenMini(dt);

    if (d.fire) {
      d.fireGroup.children.forEach((flame, i) => {
        flame.scale.y = 0.82 + Math.sin(elapsed * 8 + i) * 0.24;
        flame.rotation.y += dt * (i % 2 ? 2.5 : -2.2);
      });
    }
    if (d.smokeGroup) {
      d.smokeGroup.children.forEach((puff, i) => {
        puff.position.y = puff.userData.base.y + Math.sin(elapsed * 2.5 + i) * 0.06 + (d.urgentStage === 1 ? 0.08 : 0);
        puff.position.x = puff.userData.base.x + Math.sin(elapsed * 1.8 + i) * 0.025;
        puff.material.opacity = d.urgentStage === 1 ? 0.28 + Math.sin(elapsed * 4 + i) * 0.04 : 0.2;
      });
    }

    if (!gameStarted || won) {
      updateKitchenHUD();
      return;
    }

    const active = activeDinnerIngredient(d);
    if (active && d.recipe.size > 0 && !d.mealReady && !d.fire) {
      if (d.urgentName !== active || d.urgentRemaining <= 0) startDinnerUrgency(active);
      d.urgentRemaining -= dt;
      if (!d.urgentWarned && d.urgentRemaining <= d.urgentMax * 0.45) {
        d.urgentWarned = true;
        toast(`HURRY — ${active.toUpperCase()} IS NEEDED SOON.`);
        setFluffles(`${urgencySubject(active)} is starting to complain. Consider moving faster than a committee.`);
        beep(410, 0.05, 0.03);
      }
      if (d.urgentRemaining <= 0) {
        if (d.urgentStage === 0) {
          d.urgentStage = 1;
          d.urgentRemaining = 6.0;
          d.urgentWarned = true;
          if (d.smokeGroup) d.smokeGroup.visible = true;
          chaos += 4;
          players.forEach(p => p.patience = clamp(p.patience - 5, 0, 100));
          toast(`${urgencySubject(active)} IS BURNING — ADD ${active.toUpperCase()} NOW!`);
          setFluffles(`Delay acknowledged. ${urgencySubject(active)} has entered a dramatic smoking phase.`);
          beep(180, 0.11, 0.05);
        } else {
          burnDinner();
        }
      }
    } else if (!active || d.mealReady || d.fire) {
      clearDinnerUrgency();
    }

    if (d.stoveOn && !d.fire && !d.mealReady) {
      const stale = elapsed - d.lastStirAt;
      const rate = stale > 6.8 ? 10.4 : 6.6;
      d.cook += dt * rate;
      if (stale > 6.8) {
        players.forEach(p => p.patience = clamp(p.patience - 0.65 * dt, 0, 100));
        if (Math.floor(elapsed * 2) % 8 === 0) setFluffles('Nobody is stirring. The pot is developing independent political views.');
      }

      if (!d.sinkTriggered && d.cook >= 42) {
        d.sinkTriggered = true;
        d.sinkLeak = true;
        d.leakAge = 0;
        setDinnerStage(2);
        toast('THE SINK HAS STARTED FLOODING. OF COURSE IT HAS.');
        setFluffles('One of you should keep stirring. The other may wish to address the indoor lake. Communication opportunity detected.');
        beep(340, 0.08, 0.035);
      }

      if (d.cook >= 100) burnDinner();
    }

    if (d.sinkLeak) {
      d.leakAge += dt;
      d.waterLevel = clamp(d.waterLevel + dt * 0.135, 0, 1);
      if (d.leakAge > 8) {
        chaos += dt * 0.75;
        players.forEach(p => p.patience = clamp(p.patience - 0.45 * dt, 0, 100));
      }
    } else {
      d.waterLevel = clamp(d.waterLevel - dt * 0.07, 0, 1);
    }
    d.water.scale.x = 0.08 + d.waterLevel * 0.92;
    d.water.scale.z = 0.08 + d.waterLevel * 0.92;
    d.water.material.opacity = d.waterLevel * 0.34;

    const c = clamp(d.cook, 0, 100);
    if (c < 55) d.cookRing.material.color.setHex(0x7d7188);
    else if (c < 68) d.cookRing.material.color.setHex(0xffd06f);
    else if (c <= 94) d.cookRing.material.color.setHex(0x6fdc8f);
    else d.cookRing.material.color.setHex(0xff5e62);
    d.cookRing.rotation.z += dt * (d.stoveOn ? 1.4 : 0.25);
    d.cookRing.scale.setScalar(0.9 + c / 500);

    updateKitchenHUD();

    const low = Math.min(...players.map(p => p.patience));
    if (low < 30) maybeComment('lowPatience', 4600);
  }

  function updateDinnerCat(dt) {
    const d = world.dinner;
    if (!d || !d.cat) return;
    const cat = d.cat;
    d.catCalm = Math.max(0, d.catCalm - dt);
    const t = elapsed + cat.phase;
    const x = 1.7 + Math.sin(t * 0.55) * 5.9;
    const z = 2.2 + Math.sin(t * 0.93) * 2.15;
    const prevX = cat.group.position.x;
    const prevZ = cat.group.position.z;
    cat.group.position.set(x, 0, z);
    const dx = x - prevX, dz = z - prevZ;
    if (dx * dx + dz * dz > 0.0001) cat.group.rotation.y = Math.atan2(dx, dz);

    // v1.1: Kevin may judge the ingredients, but he never moves them.
    if (!gameStarted || won || d.catCalm > 0) return;
    d.catTimer -= dt;
    if (d.catTimer <= 0) {
      d.catTimer = 13 + Math.random() * 7;
      const active = activeDinnerIngredient(d);
      if (active) {
        const item = dinnerItemByName(active);
        if (item && !item.heldBy && !item.delivered && !item.added) {
          chaos += 0.5;
          toast(`KEVIN IS JUDGING THE ${item.name.toUpperCase()}. HE IS NOT ALLOWED TO MOVE IT ANYMORE.`);
          setFluffles('Following a formal complaint, Kevin has lost ingredient relocation privileges.');
          beep(760, 0.035, 0.018);
        }
      }
    }
  }

  function configureDinnerHUD() {
    const track = $('crisis-track');
    track.innerHTML = [
      ['1', 'Team Hand-offs'],
      ['2', 'Chef Cooks'],
      ['3', 'Runner Crisis'],
      ['4', 'Serve Together']
    ].map((x, i) => `<div class="crisis-step${i === 0 ? ' active' : ''}" data-step="${i}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
    applyKitchenRolePresentation();
    setDinnerStage(0, true);
    updateKitchenHUD();
  }

  function setDinnerStage(next, silent = false) {
    dinnerStage = Math.max(dinnerStage, next);
    const d = world.dinner;
    const chef = d ? players[d.chefIndex] : players[0];
    const runner = d ? players[d.runnerIndex] : players[1];
    let objective = `${runner.name} (RUNNER): fetch → wash → chop → prep tray. ${chef.name} (CHEF): pour/tip ingredients into the pot.`;
    if (dinnerStage === 1) objective = `${chef.name} (CHEF) cooks and stirs. ${runner.name} (RUNNER) watches for trouble.`;
    if (dinnerStage === 2) {
      if (d && d.fire) objective = `${runner.name} (RUNNER): get the extinguisher. ${chef.name} (CHEF): stay clear.`;
      else if (d && d.sinkLeak) objective = `${runner.name} (RUNNER): turn off the tap. ${chef.name} (CHEF): keep stirring.`;
      else objective = `${chef.name} (CHEF): finish cooking. ${runner.name} (RUNNER): stay ready.`;
    }
    if (dinnerStage >= 3) objective = 'Dinner is ready. BOTH of you take one plate each to the dining table.';
    $('objective').textContent = objective;
    $('crisis-count').textContent = `${dinnerStage + 1}/4`;
    document.querySelectorAll('.crisis-step').forEach((el, i) => {
      el.classList.toggle('active', i === dinnerStage);
      el.classList.toggle('done', i < dinnerStage);
    });
    if (!silent) updateKitchenHUD();
  }

  function updateKitchenHUD() {
    const d = world.dinner; if (!d || !$('kitchen-status')) return;
    const active = activeDinnerIngredient(d);

    for (const name of ['pasta','tomato','onion']) {
      const el = $(`recipe-${name}`);
      if (!el) continue;
      el.classList.toggle('done', d.recipe.has(name));
      el.classList.toggle('active-next', name === active);
      el.classList.toggle('waiting', !!active && name !== active && !d.recipe.has(name));
    }

    $('cook-percent').textContent = `${Math.round(clamp(d.cook,0,100))}%`;
    $('cook-fill').style.width = `${clamp(d.cook,0,100)}%`;
    $('cook-fill').classList.toggle('green', d.cook >= 68 && d.cook <= 94 && !d.fire);
    $('cook-fill').classList.toggle('danger', d.cook > 94 || d.fire);
    $('served-count').textContent = `${d.servedCount}/2 plates`;

    const chef = players[d.chefIndex], runner = players[d.runnerIndex];
    const phase = $('kitchen-phase');
    if (phase) {
      if (d.fire) phase.textContent = `🔥 ${runner.name}: extinguisher!`;
      else if (d.sinkLeak) phase.textContent = `💦 ${runner.name}: fix sink · ${chef.name}: keep stirring`;
      else if (d.mealReady) phase.textContent = '🍽 One plate each → dining table';
      else if (active) {
        const item = dinnerItemByName(active);
        const countdown = d.urgentRemaining > 0 ? ` · ⏱ ${Math.ceil(d.urgentRemaining)}s` : '';
        if (d.urgentStage === 1) {
          phase.textContent = `🔥 ${urgencySubject(active)} burning — ${active.toUpperCase()} NOW!`;
        } else if (d.mini?.active) {
          phase.textContent = `🔎 ${players[d.mini.playerIndex].name}: ${d.mini.type.toUpperCase()} ${d.mini.itemName.toUpperCase()}`;
        } else if (item?.delivered) {
          phase.textContent = `👨‍🍳 ${chef.name}: ${active === 'pasta' ? 'pour' : 'tip'} ${active.toUpperCase()} into pot${countdown}`;
        } else if (active !== 'pasta' && item?.heldBy && !item.washed) {
          phase.textContent = `💦 ${runner.name}: wash ${active.toUpperCase()}${countdown}`;
        } else if (active !== 'pasta' && item?.heldBy && item.washed && !item.prepared) {
          phase.textContent = `🔪 ${runner.name}: chop ${active.toUpperCase()}${countdown}`;
        } else {
          phase.textContent = `🏃 ${runner.name}: prepare ${active.toUpperCase()}${countdown}`;
        }
      }
      else if (d.stoveOn) phase.textContent = d.cook >= 68 && d.cook <= 94 ? `✓ ${chef.name}: TURN STOVE OFF!` : `👨‍🍳 ${chef.name}: stir + watch meter`;
      else phase.textContent = `👨‍🍳 ${chef.name}: turn stove on`;
    }

    // Persistent role/task cards. Actionable nearby interaction replaces the task text.
    const actionWrap = $('action-prompts');
    if (actionWrap) actionWrap.classList.remove('hidden');
    players.forEach((p, i) => {
      const a = nearestDinnerAction(p);
      const role = kitchenRole(p).toUpperCase();
      const card = $(`p${i+1}-action-card`), text = $(`p${i+1}-action-text`), name = $(`p${i+1}-action-name`);
      if (!card) return;
      card.classList.remove('hidden');
      name.textContent = `${p.name.toUpperCase()} · ${role}`;
      text.textContent = a ? friendlyDinnerAction(a.text) : getDinnerTask(p);
      card.classList.toggle('ready-action', !!a);
    });
    $('grab-hint').classList.add('hidden');

    updateKitchenItemGuides();
    updateKitchenBeacons();
    updateKitchenMiniUI();
  }

  function friendlyDinnerAction(text) {
    return text.replace('PICK UP ','Pick up ')
      .replace('PLACE ','Place ')
      .replace(' ON PREP TRAY',' on prep tray')
      .replace('ADD ','Add ')
      .replace('WASH ','Wash ')
      .replace('CHOP ','Chop ')
      .replace('POUR ','Pour ')
      .replace('TIP ','Tip ')
      .replace(' INTO POT',' into pot')
      .replace(' TO POT',' to pot')
      .replace('DROP ','Drop ')
      .replace('SERVE ','Serve ')
      .replace('STIR THE POT','Stir the pot')
      .replace('TURN ON STOVE','Turn stove on')
      .replace('TURN OFF STOVE','Turn stove off')
      .replace('TURN OFF THE FLOODING TAP','Turn off the tap')
      .replace('EXTINGUISH THE FIRE','Use extinguisher')
      .replace('PET KEVIN (TEMPORARY CEASEFIRE)','Pet Kevin')
      .replace('EMERGENCY HUG — BOTH PRESS INTERACT','Emergency hug — both press');
  }

  function updateKitchenItemGuides() {
    const d = world.dinner; if (!d) return;
    const pulse = .86 + Math.sin(elapsed * 4) * .12;
    const active = activeDinnerIngredient(d);
    for (const item of d.items) {
      const near = players.some(p => distanceXZ(p.group.position,item.group.position) < 2.55);
      const important = (item.kind === 'ingredient' && item.name === active && !item.added) || (item.kind === 'extinguisher' && d.fire) || (item.kind === 'plate' && d.mealReady && !item.served);
      if (item.tag) item.tag.visible = !item.added && !item.served && (important || item.heldBy);
      if (item.halo) {
        const should = important && !item.heldBy && !(item.kind === 'ingredient' && item.delivered);
        item.halo.visible = should;
        const isUrgentIngredient = item.kind === 'ingredient' && item.name === active && d.urgentRemaining > 0;
        item.halo.scale.setScalar(should ? (isUrgentIngredient ? pulse * 1.18 : pulse) : 1);
        if (should && isUrgentIngredient) {
          item.halo.material.color.setHex(d.urgentStage === 1 ? 0xff6b68 : 0xffd46f);
          item.halo.material.emissive.setHex(d.urgentStage === 1 ? 0xff3a34 : 0xffbd4a);
        }
      }
    }
    if (d.prepRim) {
      const handoffNeeded = !!active && !dinnerItemByName(active)?.delivered;
      d.prepRim.material.emissive = d.prepRim.material.emissive || new THREE.Color(0xffc45f);
      d.prepRim.material.emissiveIntensity = handoffNeeded ? .6 + Math.sin(elapsed * 4) * .18 : .08;
    }
  }

  function updateKitchenBeacons() {
    const d = world.dinner; if (!d || !d.beacons) return;
    const active = activeDinnerIngredient(d);
    const activeItem = active ? dinnerItemByName(active) : null;
    const show = {pot:false,handoff:false,chop:false,sink:false,extinguisher:false,table:false};
    if (d.fire) show.extinguisher = true;
    else if (d.sinkLeak) show.sink = true;
    else if (d.mealReady) show.table = true;
    else if (active) {
      if (activeItem && activeItem.delivered) show.pot = true;
      else if (active !== 'pasta' && activeItem?.heldBy && !activeItem.washed) show.sink = true;
      else if (active !== 'pasta' && activeItem?.heldBy && activeItem.washed && !activeItem.prepared) show.chop = true;
      else show.handoff = true;
    } else show.pot = true;

    for (const [k,b] of Object.entries(d.beacons)) {
      b.visible = !!show[k];
      if (b.visible) {
        b.position.y = b.userData.baseY + Math.sin(elapsed*3.4+k.length)*.08;
        b.rotation.y += .008;
        const r=b.userData.ring; if(r) r.scale.setScalar(.92+Math.sin(elapsed*4)*.08);
      }
    }
  }

  function resetDinnerLevel(showToast = true) {
    won = false;
    gameStarted = true;
    dinnerStage = 0;
    dinnerStartTime = performance.now();
    chaos = sofaChaos;
    setupDinnerScene();
    players.forEach(p => p.patience = 100);
    configureDinnerHUD();
    $('hud').classList.remove('hidden');
    $('kitchen-status').classList.remove('hidden');
    $('action-prompts').classList.remove('hidden');
    setFluffles('Dinner trial reset. The fire department has forgotten your address.');
    if (showToast) toast('DINNER RESET. KEVIN DENIES EVERYTHING.');
    updateHUD();
  }

  function updateCamera(dt) {
    if (players.length < 2) return;
    let mid;
    if (currentLevel === 'sofa' && world.sofa) {
      mid = players[0].group.position.clone().add(players[1].group.position).add(world.sofa.position).multiplyScalar(1 / 3);
      mid.x *= 0.62;
      mid.z *= 0.45;
    } else {
      mid = players[0].group.position.clone().add(players[1].group.position).multiplyScalar(0.5);
      mid.x *= 0.48;
      mid.z *= 0.32;
    }
    const desired = new THREE.Vector3(mid.x, currentLevel === 'dinner' ? 12.4 : 12.45, mid.z + (currentLevel === 'dinner' ? 13.35 : 13.5));
    camera.position.lerp(desired, 1 - Math.exp(-2.8 * dt));

    if (cameraShake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * cameraShake;
      camera.position.y += (Math.random() - 0.5) * cameraShake * 0.5;
      camera.position.z += (Math.random() - 0.5) * cameraShake;
      cameraShake = damp(cameraShake, 0, 8, dt);
    }
    camera.lookAt(mid.x, 0.25, mid.z - 0.7);
  }

  function updateHUD() {
    for (const [i, p] of players.entries()) {
      $(`p${i + 1}-meter`).style.width = `${p.patience}%`;
      $(`p${i + 1}-state`).textContent = patienceLabel(p.patience);
    }
  }

  function patienceLabel(v) {
    if (v > 78) return 'Suspiciously calm';
    if (v > 55) return 'Mild concern';
    if (v > 32) return 'Passive-aggressive';
    if (v > 12) return '“I’m fine.”';
    return 'Relationship loading…';
  }

  function maybeComment(type, cooldown) {
    const now = performance.now();
    if (now - lastCommentAt < cooldown) return;
    lastCommentAt = now;
    setFluffles(rand(C.fluffles[type]));
  }

  function setFluffles(text) { $('fluffles-line').textContent = text; }

  function toast(text, fromNetwork = false) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1850);
    if (!fromNetwork && window.NET?.online && window.NET?.isHost && window.NET?.started) {
      window.NET.sendFx('toast', { text });
    }
  }

  function finishMovingTrial() {
    if (won) return;
    won = true;
    gameStarted = false;
    for (const p of players) p.release(false);
    sofaTime = (performance.now() - startTime) / 1000;
    sofaChaos = chaos;

    beep(660, 0.11, 0.07);
    setTimeout(() => beep(880, 0.13, 0.065), 100);
    setTimeout(() => beep(1100, 0.18, 0.06), 210);
    for (let i = 0; i < 28; i++) spawnBonkParticles(world.sofa.position, 1);

    setFluffles('The sofa survived. Unfortunately, humans require food.');
    toast('LEVEL ONE PASSED. PLEASE PROCEED TO THE KITCHEN OF CONSEQUENCES.');
    scheduleNetworkFlow('showDinnerIntro', 1050);
  }

  function startPartnerQuiz() {
    quizActive = true;
    understandingScore = 0;
    quiz.index = 0;
    quiz.phase = 'self';
    quiz.self = [null, null];
    quiz.guess = [null, null];
    gameStarted = false;
    document.body.classList.remove('kitchen-mode');
    $('story-screen').classList.remove('active');
    $('story-skip-level').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('quiz-screen').classList.add('active');
    $('quiz-skip').classList.remove('hidden');
    $('quiz-p1-name').textContent = players[0].name.toUpperCase();
    $('quiz-p2-name').textContent = players[1].name.toUpperCase();
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const q = C.quizQuestions[quiz.index];
    quiz.phase = 'self';
    quiz.self = [null, null];
    quiz.guess = [null, null];
    $('quiz-progress').textContent = `QUESTION ${quiz.index + 1} / ${C.quizQuestions.length}`;
    $('understanding-live').textContent = `UNDERSTANDING ${understandingScore} / ${C.quizQuestions.length * 2}`;
    $('quiz-prompt').textContent = q.prompt;
    $('quiz-instruction').textContent = 'ROUND 1 — Choose your OWN answer privately. Do not announce it.';
    $('quiz-options').innerHTML = '';
    q.options.forEach((option, i) => {
      const card = document.createElement('div');
      card.className = 'quiz-option';
      const n = document.createElement('b');
      n.textContent = String(i + 1);
      const t = document.createElement('span');
      t.textContent = option;
      card.append(n, t);
      $('quiz-options').appendChild(card);
    });
    setQuizPlayerStatus(0, false, 'CHOOSING…');
    setQuizPlayerStatus(1, false, 'CHOOSING…');
    $('quiz-result').classList.add('hidden');
    $('quiz-next').classList.add('hidden');
  }

  function setQuizPlayerStatus(index, locked, text) {
    const box = index === 0 ? document.querySelector('.p1-private') : document.querySelector('.p2-private');
    const label = $(`quiz-p${index + 1}-status`);
    box.classList.toggle('locked', locked);
    label.textContent = text;
  }

  function handleQuizKey(code) {
    if (!quizActive || quiz.phase === 'result') return false;
    const p1Map = { KeyW: 0, KeyA: 1, KeyS: 2, KeyD: 3 };
    const p2Map = { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3 };
    let playerIndex = -1;
    let choice = null;
    if (Object.prototype.hasOwnProperty.call(p1Map, code)) {
      playerIndex = 0;
      choice = p1Map[code];
    } else if (Object.prototype.hasOwnProperty.call(p2Map, code)) {
      playerIndex = 1;
      choice = p2Map[code];
    } else {
      return false;
    }

    const target = quiz.phase === 'self' ? quiz.self : quiz.guess;
    if (target[playerIndex] !== null) return true;
    target[playerIndex] = choice;
    setQuizPlayerStatus(playerIndex, true, 'LOCKED ✓');
    beep(playerIndex === 0 ? 520 : 680, 0.05, 0.03);

    if (target[0] !== null && target[1] !== null) {
      if (quiz.phase === 'self') {
        setTimeout(() => {
          quiz.phase = 'guess';
          setQuizPlayerStatus(0, false, 'GUESSING…');
          setQuizPlayerStatus(1, false, 'GUESSING…');
          $('quiz-instruction').textContent = `ROUND 2 — Now guess what YOUR PARTNER chose. ${players[0].name} guesses ${players[1].name}; ${players[1].name} guesses ${players[0].name}.`;
          toast('NO DISCUSSION. DR. FLUFFLES CAN HEAR WHISPERING.');
        }, 420);
      } else {
        setTimeout(revealQuizAnswer, 420);
      }
    }
    return true;
  }

  function revealQuizAnswer() {
    if (quiz.phase !== 'guess') return;
    quiz.phase = 'result';
    const q = C.quizQuestions[quiz.index];
    const p1Correct = quiz.guess[0] === quiz.self[1];
    const p2Correct = quiz.guess[1] === quiz.self[0];
    understandingScore += (p1Correct ? 1 : 0) + (p2Correct ? 1 : 0);

    const result = $('quiz-result');
    result.innerHTML = '';
    const line1 = document.createElement('div');
    const line2 = document.createElement('div');
    const verdict = document.createElement('div');
    line1.textContent = `${players[0].name} chose “${q.options[quiz.self[0]]}”. ${players[1].name} guessed “${q.options[quiz.guess[1]]}”. ${p2Correct ? '✓' : '✗'}`;
    line2.textContent = `${players[1].name} chose “${q.options[quiz.self[1]]}”. ${players[0].name} guessed “${q.options[quiz.guess[0]]}”. ${p1Correct ? '✓' : '✗'}`;
    verdict.textContent = p1Correct && p2Correct
      ? 'Dr. Fluffles: Disturbingly synchronized.'
      : p1Correct || p2Correct
        ? 'Dr. Fluffles: One of you listens. Promising.'
        : 'Dr. Fluffles: Excellent. Fresh evidence.';
    verdict.style.marginTop = '8px';
    verdict.style.color = '#ffb2c5';
    verdict.style.fontWeight = '800';
    result.append(line1, line2, verdict);
    result.classList.remove('hidden');
    $('understanding-live').textContent = `UNDERSTANDING ${understandingScore} / ${C.quizQuestions.length * 2}`;
    $('quiz-instruction').textContent = 'REVEAL — Evidence has been entered into the relationship file.';
    $('quiz-next').textContent = quiz.index === C.quizQuestions.length - 1 ? 'SEE FINAL RELATIONSHIP REPORT' : 'NEXT QUESTION';
    $('quiz-next').classList.remove('hidden');
    if (p1Correct || p2Correct) beep(900, 0.08, 0.035);
    else beep(180, 0.08, 0.035);
  }

  function nextQuizQuestion() {
    if (quiz.phase !== 'result') return;
    if (quiz.index < C.quizQuestions.length - 1) {
      quiz.index += 1;
      renderQuizQuestion();
    } else {
      finishEpisode();
    }
  }

  function skipCurrentLevel() {
    ensureAudio();
    if (!players.length) return;

    if (currentLevel === 'sofa' && gameStarted && !won) {
      skippedLevels.add('sofa');
      gameStarted = false;
      won = true;
      for (const p of players) p.release(false);
      sofaTime = 0;
      sofaChaos = chaos;
      toast('MOVING DAY SKIPPED. THE SOFA HAS BEEN OUTSOURCED TO PROFESSIONALS.');
      setFluffles('A skip button. Finally, a healthy boundary. Proceed to dinner.');
      beep(470, .06, .035);
      setTimeout(showDinnerIntro, 550);
      return;
    }

    if (currentLevel === 'dinner' && gameStarted && !won) {
      skippedLevels.add('dinner');
      gameStarted = false;
      won = true;
      dinnerTime = 0;
      for (const p of players) if (p.heldItem) dropDinnerItem(p, true);
      $('hud').classList.add('hidden');
      document.body.classList.remove('kitchen-mode');
      toast('DINNER SKIPPED. TAKEOUT HAS ENTERED THE RELATIONSHIP.');
      beep(470, .06, .035);
      setTimeout(startPartnerQuiz, 450);
    }
  }

  function skipStoryLevel() {
    ensureAudio();
    if (storyMode === 'dinner') {
      skippedLevels.add('dinner');
      dinnerTime = 0;
      $('story-screen').classList.remove('active');
      $('story-skip-level').classList.add('hidden');
      startPartnerQuiz();
      return;
    }
    // This path is kept for future level-intro cards.
    if (storyMode === 'intro') {
      skippedLevels.add('sofa');
      sofaTime = 0;
      $('story-screen').classList.remove('active');
      showDinnerIntro();
    }
  }

  function skipQuiz() {
    if (!quizActive) return;
    skippedLevels.add('quiz');
    understandingScore = 0;
    quizActive = false;
    $('quiz-screen').classList.remove('active');
    finishEpisode();
  }

  function finishEpisode() {
    quizActive = false;
    gameStarted = false;
    document.body.classList.remove('kitchen-mode');
    $('quiz-screen').classList.remove('active');
    $('hud').classList.add('hidden');
    $('time-score').textContent = formatTime(sofaTime + dinnerTime);
    const avg = Math.round(players.reduce((a, p) => a + p.patience, 0) / players.length);
    $('patience-score').textContent = `${avg}%`;
    $('chaos-score').textContent = Math.round(chaos);
    $('understanding-score').textContent = skippedLevels.has('quiz') ? 'SKIPPED' : `${understandingScore}/${C.quizQuestions.length * 2}`;

    const max = C.quizQuestions.length * 2;
    const dinnerNote = skippedLevels.has('dinner')
      ? ' Dinner was skipped in favor of the ancient technology known as takeout.'
      : dinnerTime > 0 ? ` You survived dinner in ${formatTime(dinnerTime)}.` : '';
    const sofaNote = skippedLevels.has('sofa') ? ' Moving Day was skipped.' : '';
    const quizNote = skippedLevels.has('quiz') ? ' The understanding questions were skipped, so no emotional statistics were harmed.' : '';

    const understandingText = skippedLevels.has('quiz')
      ? `${players[0].name} and ${players[1].name} declined further questioning.`
      : understandingScore >= max - 1
        ? `${players[0].name} and ${players[1].name} know each other suspiciously well.`
        : understandingScore >= Math.ceil(max * 0.6)
          ? `You know each other. Selective amnesia remains under investigation.`
          : understandingScore >= Math.ceil(max * 0.35)
            ? `Love detected. Documentation incomplete.`
            : `The apartment is yours. A follow-up interview has been aggressively recommended.`;
    $('win-summary').textContent = understandingText + sofaNote + dinnerNote + quizNote;

    let grade;
    if (skippedLevels.size) {
      const labels = [...skippedLevels].map(x => x === 'sofa' ? 'Moving Day' : x === 'dinner' ? 'Dinner' : 'Questions');
      grade = `custom route · skipped ${labels.join(' + ')}`;
    } else {
      const composite = understandingScore * 8 + avg - Math.min(chaos, 25);
      grade = composite > 135 ? 'concerningly synchronized'
        : composite > 105 ? 'chaotic but emotionally operational'
          : composite > 75 ? 'cute, with patch notes required'
            : 'Dr. Fluffles has scheduled a follow-up';
    }
    $('relationship-grade').textContent = `Compatibility grade: ${grade}`;
    setFluffles(rand(C.fluffles.win));
    $('win-screen').classList.add('active');
  }

  function formatTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function startGame() {
    ensureAudio();
    const n1 = $('p1-name').value.trim() || 'You';
    const n2 = $('p2-name').value.trim() || 'Her';

    if (!players.length) {
      const p1Controls = window.NET?.online
        ? { forward: ['KeyW','ArrowUp'], back: ['KeyS','ArrowDown'], left: ['KeyA','ArrowLeft'], right: ['KeyD','ArrowRight'], grab: 'KeyE' }
        : { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', grab: 'KeyE' };
      players.push(new Player(1, n1, C.colors.playerOne, new THREE.Vector3(-8.05, 0, -1.25), p1Controls));
      const p2Controls = window.NET?.online
        ? { forward: 'RemoteW', back: 'RemoteS', left: 'RemoteA', right: 'RemoteD', grab: 'RemoteE' }
        : { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', grab: 'Enter' };
      players.push(new Player(2, n2, C.colors.playerTwo, new THREE.Vector3(-8.05, 0, 1.25), p2Controls));
    } else {
      players[0].name = n1;
      players[1].name = n2;
    }

    skippedLevels.clear();
    sofaTime = 0;
    dinnerTime = 0;
    understandingScore = 0;
    chaos = 0;
    sofaChaos = 0;
    document.body.classList.remove('kitchen-mode');
    $('p1-label').textContent = n1.toUpperCase();
    $('p2-label').textContent = n2.toUpperCase();
    $('p1-label').classList.remove('role-chef','role-runner');
    $('p2-label').classList.remove('role-chef','role-runner');
    $('start-screen').classList.remove('active');
    $('win-screen').classList.remove('active');
    $('quiz-screen').classList.remove('active');
    $('story-screen').classList.remove('active');
    $('hud').classList.add('hidden');
    gameStarted = false;
    won = false;
    quizActive = false;

    if (startRoute === 'kitchen') {
      skippedLevels.add('sofa');
      sofaTime = 0;
      showDinnerIntro();
    } else if (startRoute === 'quiz') {
      skippedLevels.add('sofa');
      skippedLevels.add('dinner');
      startPartnerQuiz();
    } else {
      showStoryIntro();
    }

    beep(440, 0.06, 0.04);
    setTimeout(() => beep(660, 0.08, 0.04), 90);
  }

  function showStoryIntro() {
    storyMode = 'intro';
    storyIndex = 0;
    $('story-skip-level').classList.add('hidden');
    $('story-screen').classList.add('active');
    renderStoryCard();
  }

  function renderStoryCard() {
    const card = C.story[storyIndex];
    $('story-kicker').textContent = card.kicker;
    $('story-speaker').textContent = card.speaker;
    $('story-title').textContent = card.title;
    $('story-text').textContent = card.text;
    $('story-progress').textContent = `${storyIndex + 1} / ${C.story.length}`;
    const atLevelIntro = storyIndex === C.story.length - 1;
    $('story-next').textContent = atLevelIntro ? 'START TRIAL ONE' : 'CONTINUE';
    $('story-skip-level').classList.toggle('hidden', !atLevelIntro);
  }

  function advanceStory() {
    if (storyMode === 'dinner') {
      $('story-screen').classList.remove('active');
      $('story-skip-level').classList.add('hidden');
      startDinnerTrial();
      return;
    }
    if (storyIndex < C.story.length - 1) {
      storyIndex += 1;
      renderStoryCard();
      beep(360 + storyIndex * 90, 0.045, 0.025);
    } else {
      $('story-screen').classList.remove('active');
      $('story-skip-level').classList.add('hidden');
      startPhysicalTrial();
    }
  }

  function startPhysicalTrial() {
    currentLevel = 'sofa';
    document.body.classList.remove('kitchen-mode');
    players.forEach((p,i) => {
      const badge = p.group.userData.roleBadge;
      if (badge) { p.group.remove(badge); p.group.userData.roleBadge = null; }
      const label = $(`p${i+1}-label`);
      if (label) { label.textContent = p.name.toUpperCase(); label.classList.remove('role-chef','role-runner'); }
    });
    resetGame(false);
    $('kitchen-status').classList.add('hidden');
    $('action-prompts').classList.add('hidden');
    $('hud').classList.remove('hidden');
    setFluffles(rand(C.fluffles.intro));
    toast('TRIAL ONE: GET THE SOFA HOME. TRY TO REMAIN CIVIL.');
  }

  function resetGame(showToast = true) {
    if (currentLevel === 'dinner') {
      resetDinnerLevel(showToast);
      return;
    }
    won = false;
    quizActive = false;
    gameStarted = true;
    chaos = 0;
    winHold = 0;
    stage = 0;
    elapsed = 0;
    startTime = performance.now();
    for (const p of players) p.reset();

    world.sofa.position.copy(world.sofa.userData.homePos);
    world.sofa.rotation.y = world.sofa.userData.homeRot;
    world.sofa.position.y = 0.55;
    world.sofa.userData.slideVel.set(0, 0, 0);

    if (world.vase.broken) {
      world.vase.broken = false;
      scene.add(world.vase.group);
    }

    world.goalRing.material.opacity = 0.28;
    world.goalRing.material.emissiveIntensity = 0.55;
    world.goalHeart.material.opacity = 0.75;

    $('win-screen').classList.remove('active');
    $('quiz-screen').classList.remove('active');
    setStage(0, true);
    setFluffles(rand(C.fluffles.intro));
    if (showToast) toast('TRIAL RESET. PREVIOUS EVIDENCE SHREDDED.');
    updateHUD();
  }

  function replayEpisode() {
    window.location.reload();
  }

  function startOnlineSession(payload = {}) {
    const names = Array.isArray(payload.names) ? payload.names : ['You', 'Her'];
    $('p1-name').value = names[0] || 'You';
    $('p2-name').value = names[1] || 'Her';
    startRoute = ['full', 'kitchen', 'quiz'].includes(payload.route) ? payload.route : 'full';
    startGame();
  }

  function scheduleNetworkFlow(action, delay) {
    setTimeout(() => {
      if (window.NET?.online) {
        if (window.NET.isHost) window.NET.sendFlow(action);
      } else {
        runFlow(action);
      }
    }, delay);
  }

  function requestFlow(action) {
    if (window.NET?.online && window.NET?.started) {
      if (window.NET.isHost) window.NET.sendFlow(action);
      else toast('The host controls story, skipping and restarts. Your job is currently chaos.');
      return;
    }
    runFlow(action);
  }

  function runFlow(action, data = null) {
    switch (action) {
      case 'advanceStory': advanceStory(); break;
      case 'skipStoryLevel': skipStoryLevel(); break;
      case 'nextQuizQuestion': nextQuizQuestion(); break;
      case 'skipQuiz': skipQuiz(); break;
      case 'skipCurrentLevel': skipCurrentLevel(); break;
      case 'resetGame': if (!quizActive && players.length) resetGame(); break;
      case 'replayEpisode': replayEpisode(); break;
      case 'showDinnerIntro': showDinnerIntro(); break;
      case 'startPartnerQuiz': startPartnerQuiz(); break;
      default: console.warn('Unknown network flow action', action, data);
    }
  }

  function handleRemoteInput(code, down) {
    if (!window.NET?.isHost || !players[1]) return;
    if (quizActive) {
      if (down) {
        const map = { KeyW: 'ArrowUp', KeyA: 'ArrowLeft', KeyS: 'ArrowDown', KeyD: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowLeft', ArrowDown: 'ArrowDown', ArrowRight: 'ArrowRight' };
        if (map[code]) handleQuizKey(map[code]);
      }
      return;
    }
    if (code === 'KeyF') {
      if (down) tryCuteSpank(players[1]);
      return;
    }
    const d = world.dinner;
    if (currentLevel === 'dinner' && d?.mini?.active && d.mini.playerIndex === 1 && code === 'KeyE') {
      handleKitchenMiniInput(1, down);
      return;
    }
    const map = {
      KeyW: 'RemoteW', KeyS: 'RemoteS', KeyA: 'RemoteA', KeyD: 'RemoteD',
      ArrowUp: 'RemoteW', ArrowDown: 'RemoteS', ArrowLeft: 'RemoteA', ArrowRight: 'RemoteD',
      KeyE: 'RemoteE'
    };
    const remoteCode = map[code];
    if (!remoteCode) return;
    if (down && !keys[remoteCode] && remoteCode === 'RemoteE') players[1].toggleGrab();
    keys[remoteCode] = !!down;
  }

  function networkObjectState(object) {
    if (!object) return null;
    return {
      p: [object.position.x, object.position.y, object.position.z],
      ry: object.rotation.y
    };
  }

  function getSnapshot() {
    const snap = {
      level: currentLevel,
      gameStarted,
      won,
      chaos,
      stage,
      dinnerStage,
      elapsed,
      fluffles: $('fluffles-line')?.textContent || '',
      objective: $('objective')?.textContent || '',
      players: players.map(p => ({
        p: [p.group.position.x, p.group.position.y, p.group.position.z],
        ry: p.group.rotation.y,
        patience: p.patience,
        grabbing: p.grabbing,
        grabSide: p.grabSide,
        heldItem: p.heldItem?.name || null
      })),
      sofa: currentLevel === 'sofa' && world.sofa ? networkObjectState(world.sofa) : null,
      door: currentLevel === 'sofa' && world.door?.group ? { ry: world.door.group.rotation.y } : null,
      cat: world.cat?.group ? networkObjectState(world.cat.group) : null,
      vaseBroken: !!world.vase?.broken,
      dinner: null,
      quiz: quizActive ? {
        index: quiz.index,
        phase: quiz.phase,
        self: [...quiz.self],
        guess: [...quiz.guess],
        score: understandingScore,
        ui: {
          progress: $('quiz-progress')?.textContent || '',
          understanding: $('understanding-live')?.textContent || '',
          instruction: $('quiz-instruction')?.textContent || '',
          p1Status: $('quiz-p1-status')?.textContent || '',
          p2Status: $('quiz-p2-status')?.textContent || '',
          resultHTML: $('quiz-result')?.innerHTML || '',
          resultHidden: $('quiz-result')?.classList.contains('hidden') ?? true,
          nextHidden: $('quiz-next')?.classList.contains('hidden') ?? true,
          nextText: $('quiz-next')?.textContent || ''
        }
      } : null
    };

    if (currentLevel === 'dinner' && world.dinner) {
      const d = world.dinner;
      snap.dinner = {
        cook: d.cook,
        stoveOn: d.stoveOn,
        mealReady: d.mealReady,
        fire: d.fire,
        sinkLeak: d.sinkLeak,
        sinkTriggered: d.sinkTriggered,
        sinkFixed: d.sinkFixed,
        waterLevel: d.waterLevel,
        servedCount: d.servedCount,
        ingredientStep: d.ingredientStep,
        recipe: [...d.recipe],
        urgentName: d.urgentName,
        urgentRemaining: d.urgentRemaining,
        urgentMax: d.urgentMax,
        urgentStage: d.urgentStage,
        chefIndex: d.chefIndex,
        runnerIndex: d.runnerIndex,
        mini: d.mini ? { ...d.mini } : null,
        items: d.items.map(item => ({
          name: item.name,
          p: [item.group.position.x, item.group.position.y, item.group.position.z],
          ry: item.group.rotation.y,
          scale: item.group.scale.x,
          added: item.added,
          delivered: item.delivered,
          served: item.served,
          washed: !!item.washed,
          prepared: !!item.prepared,
          heldBy: item.heldBy ? players.indexOf(item.heldBy) : -1
        })),
        cat: d.cat?.group ? networkObjectState(d.cat.group) : null
      };
    }
    return snap;
  }

  function setNetTarget(object, state) {
    if (!object || !state?.p) return;
    object.userData.netTargetPos = new THREE.Vector3(state.p[0], state.p[1], state.p[2]);
    object.userData.netTargetRot = state.ry ?? object.rotation.y;
  }

  function syncQuizSnapshot(qs) {
    if (!qs || !quizActive) return;
    quiz.index = qs.index;
    quiz.phase = qs.phase;
    quiz.self = [...qs.self];
    quiz.guess = [...qs.guess];
    understandingScore = qs.score;
    const ui = qs.ui || {};
    if ($('quiz-progress')) $('quiz-progress').textContent = ui.progress || $('quiz-progress').textContent;
    if ($('understanding-live')) $('understanding-live').textContent = ui.understanding || $('understanding-live').textContent;
    if ($('quiz-instruction')) $('quiz-instruction').textContent = ui.instruction || $('quiz-instruction').textContent;
    if ($('quiz-p1-status')) $('quiz-p1-status').textContent = ui.p1Status || '';
    if ($('quiz-p2-status')) $('quiz-p2-status').textContent = ui.p2Status || '';
    const r = $('quiz-result');
    if (r) { r.innerHTML = ui.resultHTML || ''; r.classList.toggle('hidden', !!ui.resultHidden); }
    const n = $('quiz-next');
    if (n) { n.textContent = ui.nextText || n.textContent; n.classList.toggle('hidden', !!ui.nextHidden); }
    const p1Locked = qs.phase === 'self' ? qs.self[0] !== null : qs.phase !== 'self';
    const p2Locked = qs.phase === 'self' ? qs.self[1] !== null : qs.phase !== 'self';
    document.querySelector('.p1-private')?.classList.toggle('locked', p1Locked);
    document.querySelector('.p2-private')?.classList.toggle('locked', p2Locked);
  }

  function applySnapshot(snap) {
    if (!snap || window.NET?.isHost) return;
    currentLevel = snap.level || currentLevel;
    gameStarted = !!snap.gameStarted;
    won = !!snap.won;
    chaos = Number(snap.chaos || 0);
    stage = Number(snap.stage || 0);
    dinnerStage = Number(snap.dinnerStage || 0);
    if (snap.fluffles && $('fluffles-line')) $('fluffles-line').textContent = snap.fluffles;
    if (snap.objective && $('objective')) $('objective').textContent = snap.objective;

    snap.players?.forEach((ps, i) => {
      const p = players[i];
      if (!p) return;
      setNetTarget(p.group, ps);
      p.patience = ps.patience;
      p.grabbing = !!ps.grabbing;
      p.grabSide = ps.grabSide;
    });

    if (snap.sofa && world.sofa) setNetTarget(world.sofa, snap.sofa);
    if (snap.door && world.door?.group) world.door.group.rotation.y = snap.door.ry;
    if (snap.cat && world.cat?.group) setNetTarget(world.cat.group, snap.cat);

    if (world.vase) {
      if (snap.vaseBroken && !world.vase.broken) {
        world.vase.broken = true;
        scene.remove(world.vase.group);
      }
    }

    if (snap.dinner && world.dinner) {
      const d = world.dinner, sd = snap.dinner;
      d.cook = sd.cook;
      d.stoveOn = sd.stoveOn;
      d.mealReady = sd.mealReady;
      d.fire = sd.fire;
      d.sinkLeak = sd.sinkLeak;
      d.sinkTriggered = sd.sinkTriggered;
      d.sinkFixed = sd.sinkFixed;
      d.waterLevel = sd.waterLevel;
      d.servedCount = sd.servedCount;
      d.ingredientStep = sd.ingredientStep;
      d.recipe = new Set(sd.recipe || []);
      d.urgentName = sd.urgentName;
      d.urgentRemaining = sd.urgentRemaining;
      d.urgentMax = sd.urgentMax;
      d.urgentStage = sd.urgentStage;
      d.chefIndex = sd.chefIndex;
      d.runnerIndex = sd.runnerIndex;
      d.mini = sd.mini ? { ...sd.mini } : null;
      if (d.fireGroup) d.fireGroup.visible = !!d.fire;
      if (d.smokeGroup) d.smokeGroup.visible = !!d.urgentStage && !d.fire;
      if (d.water) {
        d.water.scale.x = 0.08 + d.waterLevel * 0.92;
        d.water.scale.z = 0.08 + d.waterLevel * 0.92;
        d.water.material.opacity = d.waterLevel * 0.34;
      }
      for (const si of sd.items || []) {
        const item = d.items.find(x => x.name === si.name);
        if (!item) continue;
        item.added = !!si.added;
        item.delivered = !!si.delivered;
        item.served = !!si.served;
        item.washed = !!si.washed;
        item.prepared = !!si.prepared;
        if (item.prepared && item.kind === 'ingredient' && item.name !== 'pasta') item.label = `CHOPPED ${item.name.toUpperCase()}`;
        item.heldBy = si.heldBy >= 0 ? players[si.heldBy] : null;
        item.group.position.set(si.p[0], si.p[1], si.p[2]);
        item.group.rotation.y = si.ry || 0;
        item.group.scale.setScalar(si.scale || 1);
        if (item.added) {
          if (item.group.parent) scene.remove(item.group);
        } else if (!item.group.parent) {
          scene.add(item.group);
        }
      }
      players.forEach((p, i) => {
        const name = snap.players?.[i]?.heldItem;
        p.heldItem = name ? d.items.find(x => x.name === name) || null : null;
      });
      if (sd.cat && d.cat?.group) setNetTarget(d.cat.group, sd.cat);
      applyKitchenRolePresentation();
      updateKitchenHUD();
    }

    syncQuizSnapshot(snap.quiz);
    updateHUD();
  }

  function smoothNetworkGuest(dt) {
    const smoothObject = (object, speed = 14) => {
      if (!object?.userData?.netTargetPos) return;
      object.position.lerp(object.userData.netTargetPos, 1 - Math.exp(-speed * dt));
      object.rotation.y = angleDamp(object.rotation.y, object.userData.netTargetRot, speed, dt);
    };
    players.forEach(p => { smoothObject(p.group, 16); updatePlayerFace(p); });
    if (currentLevel === 'sofa') {
      smoothObject(world.sofa, 15);
      smoothObject(world.cat?.group, 10);
    } else if (world.dinner) {
      smoothObject(world.dinner.cat?.group, 10);
    }
  }

  function applyFx(payload = {}) {
    if (payload.type === 'toast' && payload.data?.text) toast(payload.data.text, true);
    if (payload.type === 'spank') animateCuteSpankVisual(payload.data?.giverIndex ?? 1, payload.data?.targetIndex ?? 0);
  }

  function bindUI() {
    $('play-btn').addEventListener('click', startGame);
    $('story-next').addEventListener('click', () => requestFlow('advanceStory'));
    $('story-skip-level').addEventListener('click', () => requestFlow('skipStoryLevel'));
    $('quiz-next').addEventListener('click', () => requestFlow('nextQuizQuestion'));
    $('quiz-skip').addEventListener('click', () => requestFlow('skipQuiz'));
    $('skip-level-btn').addEventListener('click', () => requestFlow('skipCurrentLevel'));
    $('again-btn').addEventListener('click', () => requestFlow('replayEpisode'));
    $('restart-btn').addEventListener('click', () => requestFlow('resetGame'));
    document.querySelectorAll('.route-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        startRoute = btn.dataset.route || 'full';
        document.querySelectorAll('.route-btn').forEach(b => b.classList.toggle('active', b === btn));
        beep(520, .035, .018);
      });
    });
    window.addEventListener('resize', onResize);

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space'].includes(e.code)) e.preventDefault();

      if (window.NET?.online && window.NET?.started && !window.NET.isHost) {
        if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyE','KeyF'].includes(e.code)) {
          if (!keys[e.code]) window.NET.sendInput(e.code, true);
          keys[e.code] = true;
        }
        return;
      }

      if (quizActive) {
        if (!keys[e.code]) handleQuizKey(e.code);
        keys[e.code] = true;
        return;
      }

      if (!keys[e.code]) {
        if (e.code === 'KeyR' && players.length && gameStarted) requestFlow('resetGame');
        if (e.code === 'KeyF' && players[1] && (!window.NET?.online || window.NET.playerIndex === 1)) tryCuteSpank(players[1]);
        const d = world.dinner;
        let miniHandled = false;
        if (currentLevel === 'dinner' && d?.mini?.active) {
          const activePlayer = players[d.mini.playerIndex];
          if (activePlayer && bindingHas(activePlayer.controls.grab, e.code)) {
            handleKitchenMiniInput(d.mini.playerIndex, true);
            miniHandled = true;
          }
        }
        if (!miniHandled) for (const p of players) if (bindingHas(p.controls.grab, e.code)) p.toggleGrab();
      }
      keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      if (window.NET?.online && window.NET?.started && !window.NET.isHost && ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyE','KeyF'].includes(e.code)) {
        window.NET.sendInput(e.code, false);
      } else if (currentLevel === 'dinner' && world.dinner?.mini?.active) {
        const activePlayer = players[world.dinner.mini.playerIndex];
        if (activePlayer && bindingHas(activePlayer.controls.grab, e.code)) handleKitchenMiniInput(world.dinner.mini.playerIndex, false);
      }
      keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      if (window.NET?.online && window.NET?.started && !window.NET.isHost) {
        for (const code of ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyE','KeyF']) if (keys[code]) window.NET.sendInput(code, false);
      }
      for (const k in keys) keys[k] = false;
    });
  }

  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio available */ }
    }
  }

  function beep(freq = 440, dur = 0.06, vol = 0.04) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }

  function onResize() {
    if (!renderer || !camera) return;
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.033);
    elapsed += dt;

    const guestClient = !!(window.NET?.online && window.NET?.started && !window.NET.isHost);
    if (guestClient) {
      smoothNetworkGuest(dt);
      updateParticles(dt);
      if (players.length) updateCamera(dt);
      renderer.render(scene, camera);
      return;
    }

    if (currentLevel === 'sofa') {
      updatePettyDoor(dt);
      updateCat(dt);
    } else {
      updateDinner(dt);
    }

    if (gameStarted && !won) {
      for (const p of players) p.update(dt);
      resolvePlayers();
      if (currentLevel === 'sofa') updateSofa(dt);
      updateHUD();
    }

    updateParticles(dt);
    if (players.length) updateCamera(dt);
    if (world.goalRing && !won) world.goalRing.rotation.y += dt * 0.12;
    renderer.render(scene, camera);
  }

  window.GameSync = {
    startOnlineSession,
    runFlow,
    handleRemoteInput,
    getSnapshot,
    applySnapshot,
    applyFx
  };

  init();
})();
