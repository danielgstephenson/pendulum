import { Vec2 } from 'planck'
import { Fighter } from './fighter'
import { Game } from '../game'
import { GuardArea } from '../features/guardArea'
import { Player } from './player'
import { clampVec, dirFromTo, getAngleDiff, project, randomDir, range, rotate, twoPi, vecToAngle, whichMax, whichMin } from '../math'
import { Torso } from '../features/torso'

export class Guard extends Fighter {
  guardArea: GuardArea
  safeDistance: number
  closeDistance: number
  randomDir = randomDir()

  constructor (game: Game, position: Vec2) {
    super(game, position)
    this.game.guards.set(this.id, this)
    this.spawnPoint = position
    this.team = 2
    const guardAreas = this.game.cavern.guardAreas.filter(guardArea => {
      const worldTransform = guardArea.actor.body.getTransform()
      return guardArea.polygon.testPoint(worldTransform, this.spawnPoint)
    })
    if (guardAreas.length === 0) throw new Error(`No guardArea at (${this.spawnPoint.x},${this.spawnPoint.y})`)
    this.weapon.body.setLinearVelocity(randomDir())
    this.guardArea = guardAreas[0]
    this.safeDistance = 2 * this.reach
    this.closeDistance = 0.5 * this.reach
    console.log('guard', this.game.guards.size)
    this.respawn()
  }

  respawn (): void {
    super.respawn()
    this.body.setPosition(this.spawnPoint)
    this.randomDir = randomDir()
  }

  preStep (): void {
    super.preStep()
  }

  postStep (): void {
    super.postStep()
    const player = this.getNearestPlayer()
    if (player == null) return
    const playerDistance = Vec2.distance(this.spawnPoint, player.position)
    if (this.dead && this.guardArea.players.size === 0 && playerDistance > 10) {
      this.respawn()
    }
    this.moveDir = this.getMove()
  }

  getMove (): Vec2 {
    if (this.dead) return Vec2(0, 0)
    const player = this.getTargetPlayer()
    if (player == null) return this.getHomeMove()
    const distToPlayer = Vec2.distance(this.position, player.position)
    if (distToPlayer > 50) return this.getHomeMove()
    if (distToPlayer > this.safeDistance) return this.getChaseMove(player)
    return this.getFightMove(player)
  }

  getHomeMove (): Vec2 {
    const distToHome = Vec2.distance(this.position, this.spawnPoint)
    const dirToHome = dirFromTo(this.position, this.spawnPoint)
    if (distToHome > 5) return this.avoidWalls(dirToHome)
    if (this.spinIsSlow()) return this.getSwingMove()
    return Vec2(0, 0)
  }

  getChaseMove (player: Player): Vec2 {
    if (this.spinIsSlow()) return this.getSwingMove()
    const toPlayer = dirFromTo(this.position, player.position)
    const targetVelocity = Vec2.combine(1, player.velocity, 1.2 * this.maxSpeed, toPlayer)
    const chaseMove = dirFromTo(this.velocity, targetVelocity)
    return chaseMove
  }

  getFightMove (player: Player): Vec2 {
    if (this.halo.wallPoints.length > 0) {
      const fromPlayer = dirFromTo(player.position, this.position)
      return this.avoidWalls(fromPlayer)
    }
    const dirFromPlayer = dirFromTo(player.position, this.position)
    const targetPosition = Vec2.combine(1, player.position, this.safeDistance, dirFromPlayer)
    const dirToTarget = dirFromTo(this.position, targetPosition)
    const targetVelocity = Vec2.combine(1, player.velocity, this.maxSpeed, dirToTarget)
    const fightMove = dirFromTo(this.velocity, targetVelocity)
    return fightMove
  }

  avoidWalls (targetDir: Vec2): Vec2 {
    if (this.halo.wallPoints.length === 0) return targetDir
    const distances = this.halo.wallPoints.map(wallPoint => {
      return Vec2.distance(this.position, wallPoint)
    })
    const nearWallPoint = this.halo.wallPoints[whichMin(distances)]
    const fromWallDir = dirFromTo(nearWallPoint, this.position)
    if (Vec2.dot(fromWallDir, targetDir) >= 0) return targetDir
    const options = [rotate(fromWallDir, 0.5 * Math.PI), rotate(fromWallDir, -0.5 * Math.PI)]
    const optionDots = options.map(option => Vec2.dot(option, targetDir))
    const sideDir = options[whichMax(optionDots)]
    return sideDir
  }

  getAdvantage (player: Fighter, guardAdvance: number, playerAdvance: number): number {
    let advantage = 0
    const maxTime = 5
    const dt = 0.1
    const stepCount = Math.ceil(maxTime / dt)
    const reachRange = this.reach - Torso.radius
    let time = 0
    const playerPosition = player.position
    const guardPosition = this.position
    let playerVelocity = player.velocity
    let guardVelocity = this.velocity
    range(0, stepCount).some(() => {
      const distance = Vec2.distance(guardPosition, playerPosition)
      if (distance < reachRange) {
        const playerAngle = player.angle + time * player.spin
        const guardAngle = this.angle + time * this.spin
        const playerTargetAngle = vecToAngle(dirFromTo(playerPosition, guardPosition))
        const guardTargetAngle = vecToAngle(dirFromTo(guardPosition, playerPosition))
        const playerSwingTime = this.getSwingTime(playerAngle, playerTargetAngle, player.spin)
        const guardSwingTime = this.getSwingTime(guardAngle, guardTargetAngle, this.spin)
        advantage = playerSwingTime - guardSwingTime
        return true
      }
      const playerToGuard = dirFromTo(playerPosition, guardPosition)
      const guardToPlayer = dirFromTo(guardPosition, playerPosition)
      const playerTargetVelocity = Vec2.combine(1, guardVelocity, playerAdvance * this.maxSpeed, playerToGuard)
      const guardTargetVelocity = Vec2.combine(1, playerVelocity, guardAdvance * this.maxSpeed, guardToPlayer)
      const playerMove = dirFromTo(playerVelocity, playerTargetVelocity)
      const guardMove = dirFromTo(guardVelocity, guardTargetVelocity)
      playerVelocity.x += playerMove.x * dt
      playerVelocity.y += playerMove.y * dt
      guardVelocity.x += guardMove.x * dt
      guardVelocity.y += guardMove.y * dt
      playerVelocity = clampVec(playerVelocity, player.maxSpeed)
      guardVelocity = clampVec(guardVelocity, this.maxSpeed)
      playerPosition.x += playerVelocity.x * dt
      playerPosition.y += playerVelocity.y * dt
      guardPosition.x += guardVelocity.x * dt
      guardPosition.y += guardVelocity.y * dt
      time += dt
      return false
    })
    return advantage
  }

  spinIsSlow (): boolean {
    return Math.abs(this.spin) < 1.5
  }

  getSwingTime (angle: number, targetAngle: number, spin: number): number {
    const angleDifference = getAngleDiff(targetAngle, angle)
    const smallAngleDistance = Math.abs(angleDifference)
    const largeAngleDistance = twoPi - smallAngleDistance
    const angleDistance = spin * angleDifference > 0 ? smallAngleDistance : largeAngleDistance
    return angleDistance / Math.abs(spin)
  }

  getSwingMove (): Vec2 {
    const distance = Vec2.distance(this.weapon.position, this.position)
    if (distance === 0) return randomDir()
    const toWeaponDir = dirFromTo(this.position, this.weapon.position)
    const sideDir = rotate(toWeaponDir, 0.5 * Math.PI)
    const spinVec = Vec2.mul(-1, project(this.weapon.velocity, sideDir))
    const swingMove = spinVec.length() === 0 ? this.randomDir : spinVec
    return this.avoidWalls(swingMove)
  }

  getTargetPlayer (): Player | null {
    const players = [...this.guardArea.players.values()]
    const livingPlayers = players.filter(player => !player.dead)
    if (livingPlayers.length === 0) return null
    const distances = livingPlayers.map(player => {
      return Vec2.distance(player.position, this.position)
    })
    return livingPlayers[whichMin(distances)]
  }

  getNearestPlayer (): Player | null {
    const players = [...this.game.players.values()]
    const livingPlayers = players.filter(player => !player.dead)
    if (livingPlayers.length === 0) return null
    const distances = livingPlayers.map(player => {
      return Vec2.distance(player.position, this.position)
    })
    return livingPlayers[whichMin(distances)]
  }

  remove (): void {
    super.remove()
    this.dead = true
    this.game.guards.delete(this.id)
  }
}
