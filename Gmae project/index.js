const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')  //c je context

//zpodesavanje velicine canvasa
function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

//postavljanje vrijednosti
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const rnd = (min, max) => min + Math.random() * (max - min)
const now = () => performance.now()

//kreiranje novog objekta pomocu override
const withOverrides = (obj, overrides) => Object.assign({}, obj, overrides)

//kreiranje igracsa
const createPlayer = (x, y) => ({
  type: 'player',
  x, y,
  radius: 10,
  color: 'white',
  speed: 200, // pixels per second
  vx: 0, vy: 0
})

//kreiranjre projektila
const createProjectile = (x, y, vx, vy, color = 'white') => ({
  type: 'projectile',
  x, y,
  vx, vy,
  radius: 5,
  color
})

const createEnemy = (x, y, radius = rnd(6, 30), color = `hsl(${Math.floor(rnd(0,360))},60%,50%)`, speed = rnd(50, 160)) => ({
  type: 'enemy',
  x, y,
  radius,
  color,
  //velocity pravac * brzina
  vx: 0, vy: 0,
  speed 
})

//kreiranje komadica
const createParticle = (x, y, vx, vy, radius, color) => ({
  type: 'particle',
  x, y, vx, vy, radius, color, alpha: 1
})

//kreiranje udara
const createShockwave = (x, y, color) => ({
  type: 'shockwave',
  x, y,
  radius: 0,
  maxRadius: 80 + Math.random()*40,
  lineWidth: 4,
  alpha: 1,
  color
})

//kreiranje pozadinskih djelica
const createBgParticle = (w, h) => ({
  type: 'bg',
  x: Math.random() * w,
  y: Math.random() * h,
  vx: (Math.random() - 0.5) * 10,
  vy: (Math.random() - 0.5) * 10,
  size: rnd(1, 2.5)
})

// imutabilni kontejner
let state = {
  time: now(),
  player: createPlayer(canvas.width/2, canvas.height/2),
  projectiles: [],
  enemies: [],
  particles: [],
  shockwaves: [],
  bg: Array.from({length: 80}, () => createBgParticle(canvas.width, canvas.height)),
  score: 0,
  running: false,
  input: { w:false, a:false, s:false, d:false },
}

// update funkcija

// update igraceve velocity i vremena
function updatePlayer(player, input, dt) {
  // podesavanje pravca sa w,a,s,d
  let dx = 0, dy = 0
  if (input.w) dy -= 1
  if (input.s) dy += 1
  if (input.a) dx -= 1
  if (input.d) dx += 1

  // normalize
  if (dx !== 0 || dy !== 0) {
    const m = Math.hypot(dx, dy)
    dx = dx / m
    dy = dy / m
  }

  const vx = dx * player.speed
  const vy = dy * player.speed

  let nx = player.x + vx * dt
  let ny = player.y + vy * dt

  // clamp to bounds
  nx = clamp(nx, player.radius, canvas.width - player.radius)
  ny = clamp(ny, player.radius, canvas.height - player.radius)

  return withOverrides(player, { x: nx, y: ny, vx, vy })
}

function updateProjectiles(projectiles, dt) {
  // kretanje i zadrzavanje u ivicama canvasa
  return projectiles
    .map(p => withOverrides(p, {
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt
    }))
    .filter(p => !(p.x + p.radius < 0 ||
                   p.x - p.radius > canvas.width ||
                   p.y + p.radius < 0 ||
                   p.y - p.radius > canvas.height))
}

//funkcija po kojoj protivnik uvijek prati poziciju igraca po x i y osi
function steerEnemyTowards(enemy, player, dt) {
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x)
  const vx = Math.cos(angle) * enemy.speed
  const vy = Math.sin(angle) * enemy.speed
  return withOverrides(enemy, {
    vx, vy,
    x: enemy.x + vx * dt,
    y: enemy.y + vy * dt
  })
}

function updateEnemies(enemies, player, projectiles, particles, shockwavesAndScore, dt) {
  const result = enemies.reduce((acc, enemy) => {
    //kretanje protivnik
    const moved = steerEnemyTowards(enemy, player, dt)

    // provjera sudara sa igracem (end game)
    const dToPlayer = Math.hypot(player.x - moved.x, player.y - moved.y)
    if (dToPlayer - moved.radius - player.radius < 1) {
      // stavljanje signala da je igrica zavrsena u akumulatoru (acc)
      acc.hitPlayer = true
      return acc
    }

    // provjera pogodka projektila od strane igraca
    let alive = true
    let projIndexToRemove = -1

    for (let i = 0; i < acc.projectiles.length; i++) {
      const proj = acc.projectiles[i]
      const d = Math.hypot(proj.x - moved.x, proj.y - moved.y)
      if (d - moved.radius - proj.radius < 1) {
        // pogodak
        projIndexToRemove = i

        // kreiranje djelica (Particles) (immutable push -> concat)
        const newParticles = Array.from({length: Math.min(20, Math.floor(moved.radius))}, () => {
          const vvx = (Math.random() - 0.5) * rnd(50, 200) // -0.5 pravac kretanja, rnd(50,200) brzina kretanja izmedju 50 i 200
          const vvy = (Math.random() - 0.5) * rnd(50, 200)
          return createParticle(proj.x, proj.y, vvx, vvy, Math.random()*2, moved.color)
        })
        //ako je protivnik velik, ne kreiraj vise od 20 particles, a ako je manji, kreiraj 5-10 particles
        acc.particles = acc.particles.concat(newParticles)

        // shockwave
        acc.shockwaves = acc.shockwaves.concat([createShockwave(proj.x, proj.y, moved.color)])

        // smanjivanje ili unistavanje
        if (moved.radius > 15) {
          // pri smanjivanju napravi novog protivnika manjeg radiusa
          const shrunk = withOverrides(moved, { radius: moved.radius - 10 })
          acc.enemiesOut = acc.enemiesOut.concat([shrunk])
          acc.scoreDelta += 100
        } else {
          // unistenje, da ne dodaje protivnike u enemyTimeOut
          acc.scoreDelta += 150
        }

        alive = false
        break
      }
    }

    if (projIndexToRemove !== -1) {
      // remove projectile immutably
      acc.projectiles = acc.projectiles.filter((_, idx) => idx !== projIndexToRemove)
    }// preko filtera mi dobijamo novu listu, bez mjenjanja stare

    if (alive) {
      // protivnik se nastavlja kretati ako nije pogodjen
      acc.enemiesOut = acc.enemiesOut.concat([moved])
    }

    return acc
  }, {
    enemiesOut: [],
    particles: particles.slice(),       
    shockwaves: shockwavesAndScore.shockwaves.slice(),
    projectiles: projectiles.slice(),    
    scoreDelta: 0,
    hitPlayer: false
  })

  return {
    enemies: result.enemiesOut,
    particles: result.particles,
    shockwaves: result.shockwaves,
    projectiles: result.projectiles,
    scoreDelta: result.scoreDelta,
    hitPlayer: result.hitPlayer
  }
}

function updateParticles(particles, dt) {
  return particles
    .map(p => {
      const nvx = p.vx * 0.98
      const nvy = p.vy * 0.98
      const nx = p.x + nvx * dt
      const ny = p.y + nvy * dt
      const nalpha = p.alpha - 0.8 * dt // brzina nestajanja
      return withOverrides(p, { vx: nvx, vy: nvy, x: nx, y: ny, alpha: nalpha })
    })
    .filter(p => p.alpha > 0) //particles koji dosegnu da je alpha <=0 nestaju
}

function updateShockwaves(shockwaves, dt) {
  return shockwaves
    .map(s => withOverrides(s, {
      radius: s.radius + 180 * dt,    // prosirenje shockwave-a
      alpha: s.alpha - 1.5 * dt
    }))
    .filter(s => s.alpha > 0)
}

function updateBg(bg, player, dt) {
  // parallax: bg particles move opposite to player movement
  return bg
    .map(b => {
      const nx = b.x + b.vx * dt - player.vx * dt * 0.4
      const ny = b.y + b.vy * dt - player.vy * dt * 0.4
      // wrap
      const wx = (nx + canvas.width) % canvas.width
      const wy = (ny + canvas.height) % canvas.height
      return withOverrides(b, { x: wx, y: wy })
    })
}

// ----------------- Actions (pure-ish; they return new state slices) -----------------
function spawnEnemyAction(w, h) {
  // spawn on edge
  let x, y
  if (Math.random() < 0.5) {
    x = Math.random() < 0.5 ? -50 : w + 50
    y = Math.random() * h
  } else {
    x = Math.random() * w
    y = Math.random() < 0.5 ? -50 : h + 50
  }
  return createEnemy(x, y)
}

function shootAction(player, pointerX, pointerY) {
  const angle = Math.atan2(pointerY - player.y, pointerX - player.x)
  const speed = 700
  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed
  return createProjectile(player.x, player.y, vx, vy, 'white')
}

// ----------------- Renderer (impure, reads state) -----------------
const Renderer = {
  render(state) {
    // clear
    c.fillStyle = 'rgba(0,0,0,0.17)'
    c.fillRect(0, 0, canvas.width, canvas.height)

    // bg
    c.save()
    c.globalAlpha = 0.55
    state.bg.forEach(b => {
      c.beginPath()
      c.arc(b.x, b.y, b.size, 0, Math.PI*2)
      c.fillStyle = 'rgba(255,255,255,0.4)'
      c.fill()
    })
    c.restore()

    // bg connections (sparse so not heavy)
    for (let i=0;i<state.bg.length;i++){
      for (let j=i+1;j<state.bg.length;j++){
        const a = state.bg[i], b = state.bg[j]
        const d = Math.hypot(a.x-b.x, a.y-b.y)
        if (d < 120) {
          c.beginPath()
          c.moveTo(a.x, a.y)
          c.lineTo(b.x, b.y)
          c.strokeStyle = 'rgba(255,255,255,0.08)'
          c.lineWidth = 1
          c.stroke()
        }
      }
    }

    // player
    c.beginPath()
    c.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI*2)
    c.fillStyle = state.player.color
    c.fill()

    // projectiles
    state.projectiles.forEach(p => {
      c.beginPath()
      c.arc(p.x, p.y, p.radius, 0, Math.PI*2)
      c.fillStyle = p.color
      c.fill()
    })

    // enemies (with glow)
    state.enemies.forEach(e => {
      c.save()
      c.shadowBlur = e.radius * 2
      c.shadowColor = e.color
      c.beginPath()
      c.arc(e.x, e.y, e.radius, 0, Math.PI*2)
      c.fillStyle = e.color
      c.fill()
      c.restore()
    })

    // particles
    state.particles.forEach(p => {
      c.save()
      c.globalAlpha = p.alpha
      c.beginPath()
      c.arc(p.x, p.y, p.radius, 0, Math.PI*2)
      c.fillStyle = p.color
      c.fill()
      c.restore()
    })

    // shockwaves
    state.shockwaves.forEach(s => {
      c.save()
      c.globalAlpha = s.alpha
      c.beginPath()
      c.arc(s.x, s.y, s.radius, 0, Math.PI*2)
      c.strokeStyle = s.color
      c.lineWidth = s.lineWidth
      c.stroke()
      c.restore()
    })

    // UI
    c.fillStyle = 'white'
    c.font = '18px sans-serif'
    c.fillText(`Score: ${state.score}`, 20, 30)
  }
}

// ----------------- Main pure step function -----------------
// returns new state given old state and dt(seconds)
function step(oldState, dt) {
  if (oldState.gameOver) return oldState;   

  const t0 = oldState;

  // update player
  const newPlayer = updatePlayer(t0.player, t0.input, dt);

  // update projectiles
  let newProjectiles = updateProjectiles(t0.projectiles, dt);

  // enemy update & handle collisions
  const enemyResult = updateEnemies(
    t0.enemies,
    newPlayer,
    newProjectiles,
    t0.particles,
    { shockwaves: t0.shockwaves, scoreDelta: 0 },
    dt
  );

  // update particles, shockwaves, background
  const newParticles = updateParticles(enemyResult.particles, dt);
  const newShockwaves = updateShockwaves(enemyResult.shockwaves, dt);
  const newBg = updateBg(t0.bg, newPlayer, dt);

  // FINAL RETURN — this is where gameOver goes
  const newState = {
    time: now(),
    player: newPlayer,
    projectiles: enemyResult.projectiles,
    enemies: enemyResult.enemies,
    particles: newParticles,
    shockwaves: newShockwaves,
    bg: newBg,
    score: t0.score + enemyResult.scoreDelta,
    running: t0.running,
    input: t0.input,
    gameOver: enemyResult.hitPlayer
  };

  return newState;
}


// ----------------- Game loop & side-effect glue -----------------
let animationId = null
let lastTime = now()

function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05) // cap dt
  lastTime = ts

  state = step(state, dt)

  // if enemy hit player, end game
  // updateEnemies set hitPlayer flag via acc.hitPlayer (we handled by making running false outside; check simple heuristic:)
  // We detect if any enemy overlaps player here (final safety)
 if (state.gameOver) {
  state = withOverrides(state, { running: false })
  cancelAnimationFrame(animationId)
  if (modalElement) modalElement.style.display = 'block'
  if (modalScoreElement) modalScoreElement.innerHTML = state.score
  return
}


  Renderer.render(state)

  if (state.running) animationId = requestAnimationFrame(gameLoop)
}

// ----------------- Input handlers (impure events update state immutably) -----------------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
    state = withOverrides(state, { input: withOverrides(state.input, { [k]: true }) })
  }
})

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
    state = withOverrides(state, { input: withOverrides(state.input, { [k]: false }) })
  }
})

// click to shoot (state replaced immutably)
canvas.addEventListener('click', (e) => {
  // pointer relative to canvas
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  const proj = shootAction(state.player, px, py)
  state = withOverrides(state, { projectiles: state.projectiles.concat([proj]) })
})

// restart/start controls
if (startButton) startButton.addEventListener('click', () => {
  state = withOverrides({
    time: now(),
    player: createPlayer(canvas.width/2, canvas.height/2),
    projectiles: [],
    enemies: [],
    particles: [],
    shockwaves: [],
    bg: Array.from({length:80}, () => createBgParticle(canvas.width, canvas.height)),
    score: 0,
    running: true,
    input: { w:false,a:false,s:false,d:false }
  }, {})
  lastTime = now()
  animationId = requestAnimationFrame(gameLoop)
  if (startModalElement) startModalElement.style.display = 'none'
})

if (button) button.addEventListener('click', () => {
  // restart same as start
  if (modalElement) modalElement.style.display = 'none'
  state = withOverrides({
    time: now(),
    player: createPlayer(canvas.width/2, canvas.height/2),
    projectiles: [],
    enemies: [],
    particles: [],
    shockwaves: [],
    bg: Array.from({length:80}, () => createBgParticle(canvas.width, canvas.height)),
    score: 0,
    running: true,
    input: { w:false,a:false,s:false,d:false }
  }, {})
  lastTime = now()
  animationId = requestAnimationFrame(gameLoop)
})

// spawn enemies via immutable addition to state every N ms
const spawnInterval = setInterval(() => {
  if (!state.running) return
  const e = spawnEnemyAction(canvas.width, canvas.height)
  state = withOverrides(state, { enemies: state.enemies.concat([e]) })
}, 1000)

// init
initBgParticles && initBgParticles() // (keeps compatibility if defined earlier, otherwise ignored)
state = withOverrides(state, { running: false }) // start when user clicks start
// optional automatic start:
// state = withOverrides(state, { running: true }); animationId = requestAnimationFrame(gameLoop)

console.log('Functional game loaded — call Start to begin (click start button).')
