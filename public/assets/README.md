# Assets — Manual Download Required

Place files at exact paths below before running tasks that depend on them.

## Character (Task 4)

Download from https://www.mixamo.com (free, requires Adobe sign-in):

1. **Character:** search "Y Bot" or "Business Casual Man" → DOWNLOAD as FBX (T-pose, with skin)
2. Convert FBX → GLB at https://anyconv.com/fbx-to-gltf-converter/
3. Save as `models/agent.glb`

**Animations** (apply to same character on Mixamo, download "without skin"):

- Idle (search "Idle") → `models/anim-idle.glb`
- Walking (search "Walking") → `models/anim-walk.glb`
- Running (search "Running") → `models/anim-run.glb`
- Pistol Idle (search "Pistol Idle") → `models/anim-pistol-idle.glb`
- Firing (search "Firing Rifle" or "Pistol Whip") → `models/anim-pistol-fire.glb`
- Sword Slash (search "Standing Melee Combo Attack") → `models/anim-sword.glb`

## Enemies (Task 7)

- Mixamo character "Maw J Laygo" or "Mremireh O Desbiens" → `models/enemy.glb`
- Animations: idle, walk, fire → `models/enemy-anim-idle.glb`, `models/enemy-anim-walk.glb`, `models/enemy-anim-fire.glb`

## Environment (Task 11+)

- From https://kenney.nl (CC0):
  - Modular city kit OR sci-fi facility kit → unzip → save GLBs to `models/env/`

## HDR Sky (Task 9)

- From https://polyhaven.com/hdris (CC0):
  - "studio_small_09_1k.hdr" → save to `hdr/sky.hdr`

## Audio (Task 10)

- From https://freesound.org or https://pixabay.com/sound-effects (CC0):
  - `audio/footstep.wav`
  - `audio/pistol-shot.wav`
  - `audio/sword-swing.wav`
  - `audio/ambient-hum.mp3` (60s loopable)
  - `audio/portal-activate.wav`
  - `audio/ui-confirm.wav`

## Cel-shading (Task 14)

- Download `textures/toon-ramp.png` (3-band gradient strip 256×16) from https://github.com/mrdoob/three.js/blob/master/examples/textures/gradientMaps/threeTone.jpg
