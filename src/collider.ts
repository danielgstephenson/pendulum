import { Contact, Vec2 } from 'planck'
import { Game } from './game'
import { Feature } from './features/feature'
import { Fighter } from './actors/fighter'
import { Star } from './actors/star'
import { Player } from './actors/player'
import { Torso } from './features/torso'
import { GuardArea } from './features/guardArea'
import { Bob } from './features/bob'
import { Halo } from './features/halo'
import { Boundary } from './features/boundary'

export class Collider {
  game: Game

  constructor (game: Game) {
    this.game = game
    this.game.world.on('pre-solve', contact => this.preSolve(contact))
    this.game.world.on('begin-contact', contact => this.beginContact(contact))
    this.game.world.on('end-contact', contact => this.endContact(contact))
  }

  beginContact (contact: Contact): void {
    const a = contact.getFixtureA().getUserData() as Feature
    const b = contact.getFixtureB().getUserData() as Feature
    const pairs = [[a, b], [b, a]]
    pairs.forEach(pair => {
      const featureA = pair[0]
      const featureB = pair[1]
      const actorA = featureA.actor
      const actorB = featureB.actor
      if (actorA instanceof Player && featureA instanceof Torso && actorB instanceof Star) {
        actorA.spawnPoint = actorB.position
      }
      if (actorA instanceof Player && featureA instanceof Torso && featureB instanceof GuardArea) {
        featureB.players.set(actorA.id, actorA)
      }
    })
  }

  endContact (contact: Contact): void {
    const a = contact.getFixtureA().getUserData() as Feature
    const b = contact.getFixtureB().getUserData() as Feature
    const pairs = [[a, b], [b, a]]
    pairs.forEach(pair => {
      const featureA = pair[0]
      const featureB = pair[1]
      const actorA = featureA.actor
      if (actorA instanceof Player && featureA instanceof Torso && featureB instanceof GuardArea) {
        featureB.players.delete(actorA.id)
      }
    })
  }

  preSolve (contact: Contact): void {
    const a = contact.getFixtureA().getUserData() as Feature
    const b = contact.getFixtureB().getUserData() as Feature
    const pairs = [[a, b], [b, a]]
    pairs.forEach(pair => {
      const featureA = pair[0]
      const featureB = pair[1]
      const actorA = featureA.actor
      const actorB = featureB.actor
      if (actorA instanceof Star || actorB instanceof Star) {
        contact.setEnabled(false)
        return
      }
      if (actorA instanceof Fighter && actorA.dead) {
        contact.setEnabled(false)
        return
      }
      if (actorB instanceof Fighter && actorB.dead) {
        contact.setEnabled(false)
        return
      }
      if (featureA instanceof Bob || featureB instanceof Bob) {
        contact.setEnabled(false)
      }
      if (featureA instanceof Halo || featureB instanceof Halo) {
        contact.setEnabled(false)
      }
      if (featureA instanceof Halo && featureB instanceof Boundary) {
        const worldManifold = contact.getWorldManifold(null)
        if (worldManifold == null) return
        const wallPoint = Vec2(worldManifold.points[0])
        featureA.wallPoints.push(wallPoint)
      }
      if (featureA instanceof Bob && featureB instanceof Torso) {
        const fighterA = featureA.fighter
        const fighterB = featureB.fighter
        if (fighterA.dead || fighterB.dead) return
        if (fighterA.team !== fighterB.team) {
          fighterB.die()
        }
      }
    })
  }
}
