import RAPIER from '@dimforge/rapier3d-compat'

export class Physics {
  constructor() {
    this.world = null
    this.bodies = new Map()  // mesh.uuid -> { body, collider }
    this.ready = false
  }

  async init() {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.ready = true
  }

  step(delta) {
    if (!this.ready) return
    this.world.timestep = Math.min(delta, 1 / 30)
    this.world.step()
    for (const [uuid, entry] of this.bodies) {
      if (!entry.mesh) continue
      const t = entry.body.translation()
      const r = entry.body.rotation()
      entry.mesh.position.set(t.x, t.y, t.z)
      entry.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  addStaticBox(mesh, w, h, d) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
    const collider = this.world.createCollider(colliderDesc, body)
    this.bodies.set(mesh.uuid || `box-${this.bodies.size}`, { body, collider, mesh: null })
    return { body, collider }
  }

  addKinematicCharacter(position, halfHeight = 0.9, radius = 0.4) {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y + halfHeight, position.z)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight - radius, radius)
    const collider = this.world.createCollider(colliderDesc, body)
    const ctrl = this.world.createCharacterController(0.05)
    ctrl.setApplyImpulsesToDynamicBodies(true)
    ctrl.enableAutostep(0.4, 0.2, true)
    ctrl.enableSnapToGround(0.5)
    return { body, collider, ctrl }
  }
}
