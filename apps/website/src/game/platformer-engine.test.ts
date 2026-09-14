import assert from "node:assert/strict";
import test from "node:test";

import level from "../../../game/maps/level-1.json";
import levelTwo from "../../../game/maps/level-2.json";
import levelThree from "../../../game/maps/level-3.json";
import levelFour from "../../../game/maps/level-4.json";
import levelFive from "../../../game/maps/level-5.json";
import physics from "../../../game/game-physics/platformer_small_01.json";
import shortSword from "../../../game/weapon-specs/short_sword_v1.json";
import {
  MAP_COMPLETION_DELAY_SECONDS,
  nextCampaignMapIndex,
} from "./platformer/campaign";
import {
  BOSS_HIT_REACTION_TICKS,
  COLLECTIBLE_POOF_FRAME_COUNT,
  COLLECTIBLE_POOF_FPS,
  createInitialState,
  DEFAULT_PLATFORM_SPRING_LAUNCH_SPEED,
  DEATH_ANIMATION_TICKS,
  DEFAULT_DEATH_RESPAWN_DELAY_SECONDS,
  EXTRA_LIFE_FADE_TICKS,
  EXTRA_LIFE_FIREWORK_FRAME_COUNT,
  EXTRA_LIFE_FIREWORK_FPS,
  FIXED_TICK_RATE,
  FIXED_DELTA_SECONDS,
  interpolatePlatformerState,
  clampEditorCamera,
  canStepEditorZoom,
  centerEditorCameraOnCell,
  editorHeroCell,
  editorHeroPlacementForCell,
  editorViewportForScale,
  fitEditorViewport,
  minimumEditorZoomScale,
  stepEditorZoomScale,
  translateHeroWithEditorCamera,
  withEditorSessionSpawn,
  resolveEditorPlaySpawn,
  zoomEditorCamera,
  resolveEnemyFacingDirection,
  resolveEnemyProjectilePosition,
  resolveEnemyViewMusicCue,
  resolveCollectiblePoofFrame,
  resolvePlatformerCamera,
  resolvePlatformSpringCompressionFrame,
  snapPlatformerStateToGrid,
  resolveDeathRespawnDelayTicks,
  resolveWorldBottomBackgroundOffset,
  resolvePhysics,
  resolveExtraLifeOpacity,
  resolveExtraLifeFireworkFrame,
  resolveVisualBobOffset,
  resolveVisualMotionOffset,
  stepPlatformer,
} from "./platformer/engine";
import {
  drawBossHealthBar,
  resolveBossHealthBar,
} from "./platformer/boss-health-bar";
import type {
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  PlatformerState,
  WeaponSpec,
} from "./platformer/types";

const map = level as unknown as PlatformerMapSpec;
const spec = physics as unknown as PlatformerPhysicsSpec;
const weapon = shortSword as unknown as WeaponSpec;
const campaignMaps = [level, levelTwo, levelThree, levelFour, levelFive] as unknown as PlatformerMapSpec[];
const orbitalMap = campaignMaps[1];
const graveyardMap = campaignMaps[2];
const emberkeepMap = campaignMaps[3];
const idleInput = {
  moveX: 0,
  moveY: 0,
  jumpPressed: false,
  jumpHeld: false,
  weaponPressed: false,
};

test("campaign maps advance after the three-second completion window", () => {
  assert.equal(MAP_COMPLETION_DELAY_SECONDS, 3);
  assert.equal(nextCampaignMapIndex(0, campaignMaps.length), 1);
  assert.equal(nextCampaignMapIndex(2, campaignMaps.length), 3);
  assert.equal(nextCampaignMapIndex(3, campaignMaps.length), 4);
  assert.equal(nextCampaignMapIndex(4, campaignMaps.length), null);
});

test("boss artwork turns with its patrol movement direction", () => {
  const initial = createInitialState(map);
  const boss = initial.enemies.find((enemy) => enemy.role === "boss");
  assert.ok(boss);
  const rightBound = boss.startX + boss.patrolRightTiles * map.tileSize;
  let state: PlatformerState = {
    ...initial,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, x: rightBound, direction: "right" as const }
        : enemy
    )),
  };

  state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  const turnedBoss = state.enemies.find((enemy) => enemy.id === boss.id);
  assert.ok(turnedBoss);
  assert.equal(turnedBoss.direction, "left");
  assert.equal(resolveEnemyFacingDirection(turnedBoss), "left");

  state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  const walkingBoss = state.enemies.find((enemy) => enemy.id === boss.id);
  assert.ok(walkingBoss);
  assert.equal(walkingBoss.moving, true);
  assert.ok(walkingBoss.x < turnedBoss.x);
  assert.equal(resolveEnemyFacingDirection(walkingBoss), "left");
});

test("the checked-in boss draws its remaining health above its sprite", () => {
  const state = createInitialState(map);
  const boss = state.enemies.find((enemy) => enemy.role === "boss");
  assert.ok(boss);
  const bossObject = map.objects.find((object) => object.id === boss.id);
  const damagedBoss = { ...boss, hitsRemaining: 4 };
  const bar = resolveBossHealthBar(damagedBoss, bossObject, map.tileSize);

  assert.ok(bar);
  assert.equal(bar.remainingHealth, 4);
  assert.equal(bar.maximumHealth, 5);
  assert.ok(bar.y + bar.height < boss.y - 120);

  const fillRects: Array<[number, number, number, number]> = [];
  const labels: string[] = [];
  const context = {
    save() {},
    restore() {},
    fillRect(x: number, y: number, width: number, height: number) {
      fillRects.push([x, y, width, height]);
    },
    strokeRect() {},
    fillText(label: string) {
      labels.push(label);
    },
  } as unknown as CanvasRenderingContext2D;

  assert.equal(drawBossHealthBar(context, damagedBoss, bossObject, map.tileSize), true);
  assert.deepEqual(labels, ["4/5"]);
  assert.equal(fillRects.length, 2);
  assert.ok(
    Math.abs(fillRects[1][2] - (bar.width - bar.lineWidth * 2) * 0.8) < 0.001,
  );
});

test("boss music follows a living boss entering and leaving the camera viewport", () => {
  const state = createInitialState(map);
  const boss = state.enemies.find((enemy) => enemy.role === "boss");
  assert.ok(boss);
  assert.equal(boss.viewMusicCue, "boss");

  const bossCamera = {
    x: boss.x - map.camera.columns * map.tileSize / 2,
    y: boss.y - map.camera.rows * map.tileSize / 2,
  };
  assert.equal(resolveEnemyViewMusicCue(map, state, bossCamera), "boss");
  assert.equal(resolveEnemyViewMusicCue(map, state, { x: 0, y: 0 }), null);
  assert.equal(
    resolveEnemyViewMusicCue(map, {
      enemies: state.enemies.map((enemy) => (
        enemy.id === boss.id ? { ...enemy, defeated: true } : enemy
      )),
    }, bossCamera),
    null,
  );
});

test("the checked-in graveyard boss lobs a flaming pumpkin along a map-authored arc", () => {
  const bossObject = graveyardMap.objects.find((object) => object.id === "boss_1");
  assert.ok(bossObject);
  assert.deepEqual(bossObject.rangedAttack, {
    type: "lobbed_projectile",
    projectileAssetId: "haunted_graveyard_flaming_pumpkin_01",
    rangeTiles: 6,
    cooldownMs: 2500,
    arcHeightTiles: 3,
  });

  const attackMap: PlatformerMapSpec = {
    ...graveyardMap,
    objects: graveyardMap.objects.map((object) => (
      object.id === "boss_1"
        ? {
            ...object,
            motion: {
              version: 1 as const,
              travel: { type: "behavior" as const },
              visual: { type: "none" as const },
            },
          }
        : object
    )),
  };
  const initial = createInitialState(attackMap);
  const boss = initial.enemies.find((enemy) => enemy.id === "boss_1");
  assert.ok(boss);
  const targetX = boss.x - attackMap.tileSize * 2;
  const targetY = boss.y;
  const ready: PlatformerState = {
    ...initial,
    x: targetX,
    y: targetY,
    previousY: targetY,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, direction: "left" as const, nextRangedAttackTick: 1 }
        : enemy
    )),
  };

  const result = stepPlatformer(attackMap, spec, ready, idleInput, weapon);
  const pumpkin = result.state.projectiles.find((projectile) => projectile.enemyId === boss.id);
  assert.ok(pumpkin);
  assert.equal(pumpkin.attackType, "lobbed_projectile");
  assert.equal(pumpkin.assetId, "haunted_graveyard_flaming_pumpkin_01");
  assert.equal(pumpkin.targetX, targetX);
  assert.ok(Math.abs(pumpkin.targetY - (targetY - 24)) < 0.01);
  assert.equal(pumpkin.arcHeight, attackMap.tileSize * 3);
  assert.deepEqual(result.events, [{ type: "fire", objectId: boss.id }]);

  const halfway = resolveEnemyProjectilePosition({
    ...pumpkin,
    ageTicks: pumpkin.durationTicks / 2,
  });
  const straightMidpointY = (pumpkin.startY + pumpkin.targetY) / 2;
  assert.equal(halfway.x, (pumpkin.startX + pumpkin.targetX) / 2);
  assert.equal(halfway.y, straightMidpointY - pumpkin.arcHeight);

  const impact = stepPlatformer(attackMap, spec, {
    ...result.state,
    projectiles: [{
      ...pumpkin,
      ageTicks: pumpkin.durationTicks - 1,
    }],
  }, idleInput, weapon);
  assert.equal(impact.state.status, "dying");
  assert.equal(impact.state.lives, result.state.lives - 1);
  assert.equal(impact.state.projectiles.length, 0);
  assert.equal(impact.events.some((event) => event.type === "player_damage"), true);
});

test("the pumpkin boss waits until the hero enters its authored view before throwing", () => {
  const initial = createInitialState(graveyardMap);
  const boss = initial.enemies.find((enemy) => enemy.id === "boss_1");
  assert.ok(boss);
  const ready = {
    ...initial,
    x: boss.startX - graveyardMap.tileSize * 5,
    y: boss.y,
    previousY: boss.y,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, direction: "left" as const, nextRangedAttackTick: 1 }
        : enemy
    )),
  };
  const result = stepPlatformer(graveyardMap, spec, ready, idleInput, weapon);
  assert.equal(result.state.projectiles.length, 0);
  assert.equal(result.events.some((event) => event.type === "fire"), false);
});

test("the checked-in Orbital Sentinel fires a continuous chest laser", () => {
  const bossObject = orbitalMap.objects.find((object) => object.id === "boss_1");
  assert.ok(bossObject);
  assert.equal(bossObject.assetId, "space_boss_01");
  assert.deepEqual(bossObject.rangedAttack, {
    type: "laser_beam",
    rangeTiles: 6,
    cooldownMs: 3000,
    chargeMs: 1000,
    durationMs: 800,
  });

  const attackMap: PlatformerMapSpec = {
    ...orbitalMap,
    objects: orbitalMap.objects.map((object) => (
      object.id === "boss_1"
        ? {
            ...object,
            motion: {
              version: 1 as const,
              travel: { type: "behavior" as const },
              visual: { type: "none" as const },
            },
          }
        : object
    )),
  };
  const initial = createInitialState(attackMap);
  const boss = initial.enemies.find((enemy) => enemy.id === "boss_1");
  assert.ok(boss);
  const ready: PlatformerState = {
    ...initial,
    x: boss.x - attackMap.tileSize * 2,
    y: boss.y,
    previousY: boss.y,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, direction: "left" as const, nextRangedAttackTick: 1 }
        : enemy
    )),
  };

  const fired = stepPlatformer(attackMap, spec, ready, idleInput, weapon);
  assert.equal(fired.state.projectiles.length, 0);
  assert.equal(fired.state.laserBeams.length, 1);
  const beam = fired.state.laserBeams[0];
  assert.equal(beam.enemyId, boss.id);
  assert.equal(beam.direction, "left");
  assert.equal(beam.startY, boss.y - 55);
  assert.equal(beam.endX, beam.startX);
  assert.equal(beam.chargeTicks, 60);
  assert.equal(beam.durationTicks, 48);
  assert.deepEqual(fired.events, []);

  let charged = fired.state;
  for (let tick = 1; tick < beam.chargeTicks; tick += 1) {
    const charging = stepPlatformer(attackMap, spec, charged, idleInput, weapon);
    assert.equal(charging.state.status, "playing");
    assert.equal(charging.events.some((event) => event.type === "player_damage"), false);
    charged = charging.state;
  }
  assert.equal(charged.laserBeams[0].ageTicks, beam.chargeTicks - 1);

  const impact = stepPlatformer(attackMap, spec, charged, idleInput, weapon);
  assert.equal(impact.state.status, "dying");
  assert.equal(impact.state.lives, charged.lives - 1);
  assert.equal(impact.state.laserBeams.length, 1);
  assert.equal(impact.state.laserBeams[0].ageTicks, beam.chargeTicks);
  assert.equal(impact.events.some((event) => event.type === "fire"), true);
  assert.equal(impact.events.some((event) => event.type === "player_damage"), true);

  const escaped = stepPlatformer(
    attackMap,
    spec,
    {
      ...charged,
      y: charged.y - attackMap.tileSize * 1.5,
      previousY: charged.y - attackMap.tileSize * 1.5,
      vy: 0,
      grounded: false,
    },
    idleInput,
    weapon,
  );
  assert.equal(escaped.state.status, "playing");
  assert.equal(escaped.events.some((event) => event.type === "fire"), true);
  assert.equal(escaped.events.some((event) => event.type === "player_damage"), false);
});

test("the checked-in Cindermaw boss shoots double-sized fireballs", () => {
  const bossObject = emberkeepMap.objects.find((object) => object.id === "boss_1");
  assert.ok(bossObject);
  assert.equal(bossObject.assetId, "dragons_emberkeep_boss_01");
  assert.deepEqual(bossObject.rangedAttack, {
    type: "fireball",
    projectileAssetId: "dragons_emberkeep_fireball_01",
    rangeTiles: 6,
    cooldownMs: 2000,
    sizeScale: 2,
  });

  const attackMap: PlatformerMapSpec = {
    ...emberkeepMap,
    objects: emberkeepMap.objects.map((object) => (
      object.id === "boss_1"
        ? {
            ...object,
            motion: {
              version: 1 as const,
              travel: { type: "stationary" as const },
              visual: { type: "none" as const },
            },
          }
        : object
    )),
  };
  const initial = createInitialState(attackMap);
  const boss = initial.enemies.find((enemy) => enemy.id === "boss_1");
  assert.ok(boss);
  const ready: PlatformerState = {
    ...initial,
    x: boss.x - attackMap.tileSize * 2,
    y: boss.y,
    previousY: boss.y,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, direction: "left" as const, nextRangedAttackTick: 1 }
        : enemy
    )),
  };

  const fired = stepPlatformer(attackMap, spec, ready, idleInput, weapon);
  const fireball = fired.state.projectiles.find((projectile) => projectile.enemyId === boss.id);
  assert.ok(fireball);
  assert.equal(fireball.attackType, "fireball");
  assert.equal(fireball.sizeScale, 2);
  assert.equal(fireball.startX, boss.x - 48);
  assert.equal(fireball.startY, boss.y - 55);
  assert.equal(fired.events.some((event) => event.type === "fire"), true);
});

test("resolves the checked-in semantic jump tuning", () => {
  const resolved = resolvePhysics(spec, map.tileSize);
  assert.ok(Math.abs(resolved.maximumRunSpeed - 320) < 0.001);
  assert.ok(Math.abs(resolved.gravity - 2000) < 0.001);
  assert.ok(Math.abs(resolved.jumpVelocity + 760) < 0.001);
});

test("the checked-in /build map controls hero speed", () => {
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  assert.equal(spawn?.speedPxPerSecond, 320);

  const slowerMap = structuredClone(map);
  const slowerSpawn = slowerMap.objects.find((object) => object.type === "player_spawn");
  assert.ok(slowerSpawn);
  slowerSpawn.speedPxPerSecond = 160;
  const input = { ...idleInput, moveX: 1 };
  const normal = stepPlatformer(map, spec, createInitialState(map), input).state;
  const slower = stepPlatformer(slowerMap, spec, createInitialState(slowerMap), input).state;

  assert.ok(normal.vx > slower.vx);
  assert.equal(normal.vx, slower.vx * 2);
});

test("each map scales gravity without weakening the shared jump impulse", () => {
  const normal = resolvePhysics(spec, map.tileSize, map.physics.gravityScale);
  const space = resolvePhysics(spec, campaignMaps[1].tileSize, campaignMaps[1].physics.gravityScale);

  assert.equal(map.physics.gravityScale, 1);
  assert.equal(campaignMaps[1].physics.gravityScale, 0.5);
  assert.ok(Math.abs(space.gravity - normal.gravity * 0.5) < 0.001);
  assert.ok(Math.abs(space.jumpVelocity - normal.jumpVelocity) < 0.001);
});

test("the Ice World map scales grounded acceleration and braking without changing air control", () => {
  const iceMap = campaignMaps[4];
  const normalPhysics = resolvePhysics(spec, map.tileSize, 1, 1);
  const icePhysics = resolvePhysics(
    spec,
    iceMap.tileSize,
    iceMap.physics.gravityScale,
    iceMap.physics.groundTractionScale,
  );

  assert.equal(iceMap.physics.groundTractionScale, 0.15);
  assert.ok(Math.abs(icePhysics.groundAcceleration - normalPhysics.groundAcceleration * 0.15) < 0.001);
  assert.ok(Math.abs(icePhysics.groundDeceleration - normalPhysics.groundDeceleration * 0.15) < 0.001);
  assert.equal(icePhysics.airAcceleration, normalPhysics.airAcceleration);

  const movingInput = { ...idleInput, moveX: 1 };
  const normalStep = stepPlatformer(map, spec, createInitialState(map), movingInput).state;
  const iceStep = stepPlatformer(iceMap, spec, createInitialState(iceMap), movingInput).state;
  assert.ok(Math.abs(iceStep.vx - normalStep.vx * 0.15) < 0.001);

  const normalCoast = stepPlatformer(
    map,
    spec,
    { ...createInitialState(map), vx: 320 },
    idleInput,
  ).state;
  const iceCoast = stepPlatformer(
    iceMap,
    spec,
    { ...createInitialState(iceMap), vx: 320 },
    idleInput,
  ).state;
  assert.ok(iceCoast.vx > normalCoast.vx);
});

test("checked-in themed platform springs launch high while preserving incoming horizontal direction", () => {
  for (const { map, assetId } of [
    { map: campaignMaps[2], assetId: "haunted_graveyard_platformer_spring_01" },
    { map: campaignMaps[4], assetId: "ice_world_platformer_spring_01" },
  ]) {
    const spring = map.objects.find((object) => object.type === "platform_spring");
    assert.ok(spring);
    assert.equal(spring.assetId, assetId);
    assert.equal(spring.launchSpeedPxPerSecond, DEFAULT_PLATFORM_SPRING_LAUNCH_SPEED);

    for (const incomingVx of [-320, 0, 320]) {
      const initial = createInitialState(map);
      const positioned: PlatformerState = {
        ...initial,
        x: (spring.x + 0.5) * map.tileSize,
        y: spring.y * map.tileSize - 1,
        previousY: spring.y * map.tileSize - 1,
        vx: incomingVx,
        vy: 600,
        grounded: false,
      };
      const input = { ...idleInput, moveX: Math.sign(incomingVx) };
      const result = stepPlatformer(map, spec, positioned, input, weapon);

      assert.equal(result.state.vy, -DEFAULT_PLATFORM_SPRING_LAUNCH_SPEED);
      assert.equal(result.state.vx, incomingVx);
      assert.equal(result.state.grounded, false);
      assert.deepEqual(
        result.events.find((event) => event.type === "platform_spring"),
        { type: "platform_spring", objectId: spring.id },
      );
      assert.equal(resolvePlatformSpringCompressionFrame(result.state, spring.id), 0);
    }
  }
});

test("the platform spring compression animation returns to its expanded state", () => {
  const state = {
    ...createInitialState(campaignMaps[4]),
    tick: 100,
    springCompressedAtTick: { platform_spring_1: 100 },
  };
  assert.equal(resolvePlatformSpringCompressionFrame(state, "platform_spring_1"), 0);
  assert.equal(resolvePlatformSpringCompressionFrame({ ...state, tick: 105 }, "platform_spring_1"), 1);
  assert.equal(resolvePlatformSpringCompressionFrame({ ...state, tick: 120 }, "platform_spring_1"), null);
});

test("the checked-in Ice World boss lobs spinning crystal sprites along its authored arc", () => {
  const iceMap = levelFive as PlatformerMapSpec;
  const bossObject = iceMap.objects.find((object) => object.id === "boss_1");
  assert.ok(bossObject);
  assert.equal(bossObject.assetId, "ice_world_boss_01");
  assert.deepEqual(bossObject.rangedAttack, {
    type: "lobbed_projectile",
    projectileAssetId: "ice_world_crystal_projectile_01",
    rangeTiles: 6,
    cooldownMs: 2000,
    arcHeightTiles: 3,
  });

  const initial = createInitialState(iceMap);
  const boss = initial.enemies.find((enemy) => enemy.id === "boss_1");
  assert.ok(boss);
  const targetX = boss.x - iceMap.tileSize * 2;
  const ready: PlatformerState = {
    ...initial,
    x: targetX,
    y: boss.y,
    previousY: boss.y,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === boss.id
        ? { ...enemy, direction: "left" as const, nextRangedAttackTick: 1 }
        : enemy
    )),
  };

  const result = stepPlatformer(iceMap, spec, ready, idleInput, weapon);
  const crystal = result.state.projectiles.find((projectile) => projectile.enemyId === boss.id);
  assert.ok(crystal);
  assert.equal(crystal.attackType, "lobbed_projectile");
  assert.equal(crystal.assetId, "ice_world_crystal_projectile_01");
  assert.equal(crystal.arcHeight, iceMap.tileSize * 3);
  const halfway = resolveEnemyProjectilePosition({
    ...crystal,
    ageTicks: crystal.durationTicks / 2,
  });
  assert.equal(halfway.y, (crystal.startY + crystal.targetY) / 2 - crystal.arcHeight);
});

test("the space map applies its lower gravity during the fixed-step simulation", () => {
  const normalMap = campaignMaps[0];
  const spaceMap = campaignMaps[1];
  const jumpInput = { ...idleInput, jumpPressed: true, jumpHeld: true };
  const normalJump = stepPlatformer(
    normalMap,
    spec,
    createInitialState(normalMap),
    jumpInput,
  ).state;
  const spaceJump = stepPlatformer(
    spaceMap,
    spec,
    createInitialState(spaceMap),
    jumpInput,
  ).state;

  assert.ok(spaceJump.vy < normalJump.vy);
});

test("render interpolation smooths continuous motion but snaps large state changes", () => {
  const initial = createInitialState(map);
  const previous = { ...initial, x: 2_000 };
  const moving = {
    ...previous,
    x: previous.x + 4,
    y: previous.y - 6,
    enemies: previous.enemies.map((enemy, index) =>
      index === 0 ? { ...enemy, x: enemy.x + 2 } : enemy,
    ),
  };
  const halfway = interpolatePlatformerState(previous, moving, 0.5, map.tileSize);
  assert.equal(halfway.x, previous.x + 2);
  assert.equal(halfway.y, previous.y - 3);
  assert.equal(halfway.enemies[0]?.x, previous.enemies[0]?.x + 1);
  const previousCamera = resolvePlatformerCamera(map, previous);
  const currentCamera = resolvePlatformerCamera(map, moving);
  const halfwayCamera = resolvePlatformerCamera(map, halfway);
  assert.equal(halfwayCamera.x, (previousCamera.x + currentCamera.x) / 2);

  const knockedBack = {
    ...moving,
    enemies: moving.enemies.map((enemy, index) =>
      index === 0 ? { ...enemy, x: enemy.x + map.tileSize } : enemy,
    ),
  };
  const snapped = interpolatePlatformerState(moving, knockedBack, 0.25, map.tileSize);
  assert.equal(snapped.enemies[0]?.x, knockedBack.enemies[0]?.x);
});

test("pausing settles the player and moving actors onto block boundaries", () => {
  const initial = createInitialState(map);
  const enemy = initial.enemies[0];
  const flyingObject = initial.flyingObjects[0];
  assert.ok(enemy);
  assert.ok(flyingObject);
  const moving = {
    ...initial,
    x: initial.x + map.tileSize * 0.34,
    y: initial.y - map.tileSize * 0.42,
    vx: 218,
    vy: -91,
    grounded: false,
    enemies: initial.enemies.map((candidate, index) => index === 0
      ? { ...candidate, x: candidate.x + map.tileSize * 0.41, moving: true }
      : candidate),
    flyingObjects: initial.flyingObjects.map((candidate, index) => index === 0
      ? {
          ...candidate,
          phase: "active" as const,
          x: candidate.x + map.tileSize * 0.38,
          y: candidate.y - map.tileSize * 0.43,
        }
      : candidate),
  };

  const settled = snapPlatformerStateToGrid(map, moving);

  assert.equal((settled.x / map.tileSize) % 1, 0.5);
  assert.equal(settled.y % map.tileSize, 0);
  assert.equal(settled.vx, 0);
  assert.equal(settled.vy, 0);
  assert.equal((settled.enemies[0].x / map.tileSize) % 1, 0.5);
  assert.equal(settled.enemies[0].y % map.tileSize, 0);
  assert.equal(settled.enemies[0].moving, false);
  assert.equal((settled.flyingObjects[0].x / map.tileSize) % 1, 0.5);
  assert.equal((settled.flyingObjects[0].y / map.tileSize) % 1, 0.5);
});

test("the checked-in /build map keeps the hero from running off either screen edge", () => {
  const viewportWidth = map.camera.columns * map.tileSize;
  const worldWidth = map.size.columns * map.tileSize;
  const halfWidth = 16;
  const run = (start: PlatformerState, moveX: number) => {
    let state = start;
    for (let tick = 0; tick < FIXED_TICK_RATE * 2; tick += 1) {
      state = stepPlatformer(map, spec, state, { ...idleInput, moveX }).state;
    }
    return state;
  };
  const staysOnScreen = (state: PlatformerState) => {
    const camera = resolvePlatformerCamera(map, state);
    assert.equal(state.status, "playing");
    assert.equal(state.lives, createInitialState(map).lives);
    assert.ok(state.x - halfWidth >= camera.x);
    assert.ok(state.x + halfWidth <= camera.x + viewportWidth);
  };

  const left = run(createInitialState(map), -1);
  staysOnScreen(left);
  assert.equal(left.x, halfWidth);
  assert.equal(left.vx, 0);
  assert.equal(left.grounded, true);

  const right = run({
    ...createInitialState(map),
    x: worldWidth - map.tileSize / 2,
  }, 1);
  staysOnScreen(right);
  assert.equal(right.x, worldWidth - halfWidth);
  assert.equal(right.vx, 0);
  assert.equal(right.grounded, true);
});

test("camera follows the interpolated render position without a second catch-up timeline", () => {
  const initial = createInitialState(map);
  const viewportWidth = map.camera.columns * map.tileSize;
  const followThreshold = viewportWidth * 0.38;
  const previous = {
    ...initial,
    x: followThreshold + map.tileSize / 4,
  };
  const current = { ...previous, x: previous.x + 8 };
  const halfway = interpolatePlatformerState(previous, current, 0.5, map.tileSize);
  const previousCamera = resolvePlatformerCamera(map, previous);
  const halfwayCamera = resolvePlatformerCamera(map, halfway);
  const currentCamera = resolvePlatformerCamera(map, current);

  assert.equal(previousCamera.x, map.tileSize / 4);
  assert.equal(halfwayCamera.x, previousCamera.x + 4);
  assert.equal(currentCamera.x, previousCamera.x + 8);
  assert.equal(halfway.x - halfwayCamera.x, current.x - currentCamera.x);
});

test("panning the editor camera keeps the hero at the same viewport offset on a build map", () => {
  const initial = createInitialState(map);
  const camera = resolvePlatformerCamera(map, initial);
  const offsetX = initial.x - camera.x;
  const offsetY = initial.y - camera.y;
  const panned = clampEditorCamera(map, {
    x: camera.x + map.tileSize * 6,
    y: camera.y - map.tileSize,
  });
  const hero = translateHeroWithEditorCamera(map, initial, camera, panned);

  assert.ok(panned.x > camera.x);
  assert.equal(hero.x - panned.x, offsetX);
  assert.equal(hero.y - panned.y, offsetY);
});

test("clamped editor panning does not slide the hero across the viewport", () => {
  const initial = createInitialState(map);
  const camera = resolvePlatformerCamera(map, initial);
  const offsetX = initial.x - camera.x;
  const inward = clampEditorCamera(map, { x: camera.x + map.tileSize * 8, y: camera.y });
  const inwardHero = translateHeroWithEditorCamera(map, initial, camera, inward);
  const leftEdge = clampEditorCamera(map, {
    x: inward.x - map.tileSize * 20,
    y: inward.y,
  });
  const hero = translateHeroWithEditorCamera(map, inwardHero, inward, leftEdge);

  assert.equal(leftEdge.x, 0);
  assert.equal(inwardHero.x - inward.x, offsetX);
  assert.equal(hero.x - leftEdge.x, offsetX);
  assert.equal(hero.y, initial.y);
});

test("an editor session spawn is the death return point until the authored spawn is restored", () => {
  const initial = createInitialState(map);
  const camera = resolvePlatformerCamera(map, initial);
  const panned = clampEditorCamera(map, {
    x: camera.x + map.tileSize * 6,
    y: camera.y,
  });
  const hero = translateHeroWithEditorCamera(map, initial, camera, panned);
  const session = withEditorSessionSpawn(initial, hero);

  assert.notEqual(hero.x, initial.spawnX);
  assert.equal(session.x, hero.x);
  assert.equal(session.spawnX, hero.x);
  assert.equal(session.spawnY, hero.y);
  assert.equal(session.checkpointX, hero.x);
  assert.equal(session.checkpointY, hero.y);
  assert.equal(session.latestCheckpointId, null);
  assert.equal(createInitialState(map).spawnX, initial.spawnX);

  const onHazard = {
    ...session,
    x: (14 + 0.5) * 64,
    y: 12 * 64,
    grounded: false,
  };
  let state = stepPlatformer(map, spec, onHazard, idleInput, weapon).state;
  for (let index = 0; index < state.deathTicksTotal; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  }

  assert.equal(state.status, "playing");
  assert.equal(state.x, hero.x);
  assert.equal(state.y, hero.y);
  assert.notEqual(state.x, initial.spawnX);
});

function editorPlayStandingCell(map: PlatformerMapSpec, x: number, y: number) {
  return {
    column: Math.floor(x / map.tileSize),
    row: Math.floor((y - 0.001) / map.tileSize),
  };
}

test("Play after an editor pan moves a buried hero to the nearest open in-bounds tile", () => {
  const initial = createInitialState(map);
  const buried = {
    ...initial,
    x: (5 + 0.5) * map.tileSize,
    y: map.size.rows * map.tileSize,
  };
  const safe = resolveEditorPlaySpawn(map, buried);
  const authored = { x: initial.spawnX, y: initial.spawnY };
  const buriedDistance = (left: { x: number; y: number }) => (
    (left.x - buried.x) ** 2 + (left.y - buried.y) ** 2
  );

  assert.ok(safe.x >= map.tileSize / 2);
  assert.ok(safe.x <= map.size.columns * map.tileSize - map.tileSize / 2);
  assert.ok(safe.y >= map.tileSize);
  assert.ok(safe.y <= map.size.rows * map.tileSize);
  assert.ok(buriedDistance(safe) < buriedDistance(authored));
  assert.equal(createInitialState(map).spawnX, initial.spawnX);

  const standing = editorPlayStandingCell(map, safe.x, safe.y);
  const terrain = map.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
  const symbol = terrain[standing.row]?.[standing.column] ?? ".";
  assert.equal(map.legend[symbol]?.collision, "none");
});

test("Play after an editor pan does not start the hero on or beside a living enemy", () => {
  const initial = createInitialState(map);
  const enemy = initial.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(enemy);
  const dropped = {
    ...initial,
    x: enemy.x,
    y: enemy.y,
  };
  const safe = resolveEditorPlaySpawn(map, dropped);
  const standing = editorPlayStandingCell(map, safe.x, safe.y);
  const enemyCell = editorPlayStandingCell(map, enemy.x, enemy.y);
  const columnDistance = Math.abs(standing.column - enemyCell.column);
  const rowDistance = Math.abs(standing.row - enemyCell.row);

  assert.equal(createInitialState(map).spawnX, initial.spawnX);
  assert.ok(!(columnDistance === 0 && rowDistance === 0));
  assert.ok(!(columnDistance + rowDistance === 1));
});

test("the nearest background remains anchored to the world bottom during vertical camera movement", () => {
  const bottomCameraY = map.size.rows * map.tileSize - map.camera.rows * map.tileSize;
  assert.equal(resolveWorldBottomBackgroundOffset(map, bottomCameraY), 0);
  assert.equal(resolveWorldBottomBackgroundOffset(map, bottomCameraY - 48), 48);
});

test("editor zoom scale 1 matches the checked-in /build map camera", () => {
  assert.deepEqual(map.camera, { columns: 16, rows: 9 });
  assert.deepEqual(editorViewportForScale(map, 1), map.camera);
});

test("minimum editor zoom fits the checked-in /build map in the camera aspect", () => {
  const viewport = fitEditorViewport(map);
  assert.equal(viewport.columns, map.size.columns);
  assert.ok(viewport.rows >= map.size.rows);
  assert.equal(viewport.columns / viewport.rows, map.camera.columns / map.camera.rows);
  const scale = minimumEditorZoomScale(map);
  assert.deepEqual(editorViewportForScale(map, scale), viewport);
  assert.equal(canStepEditorZoom(map, scale, "out"), false);
  assert.equal(canStepEditorZoom(map, 1, "in"), false);
});

test("editor zoom steps stop at the designed viewpoint and the full-map fit", () => {
  assert.equal(stepEditorZoomScale(map, 1, "in"), 1);
  assert.equal(stepEditorZoomScale(map, minimumEditorZoomScale(map), "out"), minimumEditorZoomScale(map));
  const zoomedOut = stepEditorZoomScale(map, 1, "out");
  assert.ok(zoomedOut < 1);
  assert.ok(canStepEditorZoom(map, zoomedOut, "in"));
  const zoomedIn = stepEditorZoomScale(map, zoomedOut, "in");
  assert.equal(zoomedIn, 1);
});

test("zoomed-out editor camera bottom-aligns the checked-in /build map", () => {
  const viewport = fitEditorViewport(map);
  const camera = clampEditorCamera(map, { x: 0, y: 0 }, viewport);
  const worldHeight = map.size.rows * map.tileSize;
  const viewportHeight = viewport.rows * map.tileSize;
  assert.equal(camera.x, 0);
  assert.equal(camera.y, worldHeight - viewportHeight);
  assert.ok(camera.y < 0);
  assert.equal(resolveWorldBottomBackgroundOffset(map, camera.y, viewport), 0);
});

test("editor zoom keeps the visible world centered on a build map", () => {
  const play = map.camera;
  const start = clampEditorCamera(map, {
    x: map.tileSize * 20,
    y: map.tileSize,
  });
  const fit = fitEditorViewport(map);
  const zoomedOut = zoomEditorCamera(map, start, play, fit);
  const zoomedIn = zoomEditorCamera(map, zoomedOut, fit, play);
  const playHeight = play.rows * map.tileSize;
  assert.equal(zoomedOut.x, 0);
  assert.equal(zoomedOut.y, map.size.rows * map.tileSize - fit.rows * map.tileSize);
  assert.ok(zoomedIn.x > 0);
  assert.ok(zoomedIn.y >= 0);
  assert.ok(zoomedIn.y <= map.size.rows * map.tileSize - playHeight);
});

test("editor zoom with a focus cell centers the play camera on that cell", () => {
  const play = map.camera;
  const fit = fitEditorViewport(map);
  const focus = { x: map.size.columns - 2, y: map.size.rows - 2 };
  const start = clampEditorCamera(map, { x: 0, y: 0 }, fit);
  const zoomedIn = zoomEditorCamera(map, start, fit, play, focus);
  const expected = centerEditorCameraOnCell(map, focus, play);
  const playWidth = play.columns * map.tileSize;
  const playHeight = play.rows * map.tileSize;
  const cellCenterX = focus.x * map.tileSize + map.tileSize / 2;
  const cellCenterY = focus.y * map.tileSize + map.tileSize / 2;

  assert.deepEqual(zoomedIn, expected);
  assert.ok(zoomedIn.x > 0);
  assert.ok(cellCenterX >= zoomedIn.x);
  assert.ok(cellCenterX <= zoomedIn.x + playWidth);
  assert.ok(cellCenterY >= zoomedIn.y);
  assert.ok(cellCenterY <= zoomedIn.y + playHeight);
});

test("clicking a zoomed-out cell stands the hero in that cell", () => {
  const clicked = { x: 5, y: 10 };
  const hero = editorHeroPlacementForCell(map, createInitialState(map), clicked);

  assert.deepEqual(editorHeroCell(map, hero), clicked);
  assert.equal(hero.x, (clicked.x + 0.5) * map.tileSize);
  assert.equal(hero.y, (clicked.y + 1) * map.tileSize);
});

test("clicking a blocked cell slides the hero to the nearest legal spot", () => {
  const insideGround = { x: 20, y: map.size.rows - 1 };
  const hero = editorHeroPlacementForCell(map, createInitialState(map), insideGround);
  const cell = editorHeroCell(map, hero);

  assert.notDeepEqual(cell, insideGround);
  assert.ok(cell.y < insideGround.y);
  assert.ok(Math.abs(cell.x - insideGround.x) <= 1);
});

test("zooming in frames the hero the builder placed while zoomed out", () => {
  const play = map.camera;
  const fit = fitEditorViewport(map);
  const clicked = { x: map.size.columns - 20, y: map.size.rows - 2 };
  const hero = editorHeroPlacementForCell(map, createInitialState(map), clicked);
  const startCamera = clampEditorCamera(map, { x: 0, y: 0 }, fit);
  const zoomedIn = zoomEditorCamera(map, startCamera, fit, play, editorHeroCell(map, hero));
  const playWidth = play.columns * map.tileSize;
  const playHeight = play.rows * map.tileSize;

  assert.ok(zoomedIn.x > 0);
  assert.ok(hero.x >= zoomedIn.x);
  assert.ok(hero.x <= zoomedIn.x + playWidth);
  assert.ok(hero.y >= zoomedIn.y);
  assert.ok(hero.y <= zoomedIn.y + playHeight);
});

test("the player lands on semantic solid terrain", () => {
  let state = { ...createInitialState(map), y: 680, grounded: false, vy: 600 };
  for (let index = 0; index < 30 && !state.grounded; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput).state;
  }
  assert.equal(state.grounded, true);
  assert.ok(Math.abs(state.y - (11 * 64 - 0.001)) < 0.01);
});

test("a buffered grounded jump uses a fixed simulation tick", () => {
  const initial = createInitialState(map);
  const result = stepPlatformer(map, spec, initial, {
    moveX: 1,
    moveY: 0,
    jumpPressed: true,
    jumpHeld: true,
    weaponPressed: false,
  });
  assert.equal(result.state.tick, 1);
  assert.ok(result.state.x > initial.x);
  assert.ok(result.state.y < initial.y);
  assert.ok(result.state.vy < 0);
  assert.ok(Math.abs(result.state.vx - 2400 * FIXED_DELTA_SECONDS) < 0.001);
  assert.deepEqual(result.events.map((event) => event.type), ["jump"]);
});

test("hazards play the death state before returning the player to the active spawn", () => {
  const initial = createInitialState(map);
  const onHazard = {
    ...initial,
    x: (14 + 0.5) * 64,
    y: 12 * 64,
    grounded: false,
  };
  const death = stepPlatformer(map, spec, onHazard, idleInput, weapon);
  assert.equal(death.state.lives, 2);
  assert.equal(death.state.status, "dying");
  assert.equal(death.state.x, onHazard.x);
  assert.equal(map.rules.respawnDelaySeconds, DEFAULT_DEATH_RESPAWN_DELAY_SECONDS);
  assert.equal(death.state.deathTicksTotal, resolveDeathRespawnDelayTicks(map));
  assert.equal(death.state.deathTicksTotal, FIXED_TICK_RATE * 2);
  assert.equal(death.state.deathAnimationTicksTotal, DEATH_ANIMATION_TICKS);
  assert.deepEqual(death.events.map((event) => event.type), ["player_damage", "player_death"]);

  let state = death.state;
  const events: string[] = [];
  for (let index = 0; index < death.state.deathTicksTotal; index += 1) {
    const result = stepPlatformer(map, spec, state, idleInput, weapon);
    state = result.state;
    events.push(...result.events.map((event) => event.type));
    if (index < death.state.deathTicksTotal - 1) {
      assert.equal(state.status, "dying");
      assert.ok(!result.events.some((event) => event.type === "respawn"));
    }
  }
  assert.equal(state.status, "playing");
  assert.equal(state.x, initial.spawnX);
  assert.equal(state.y, initial.spawnY);
  assert.deepEqual(events, ["respawn"]);
});

test("respawning puts every enemy back on the board at its starting position", () => {
  const initial = createInitialState(map);
  const enemy = initial.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(enemy);

  let state: PlatformerState = {
    ...initial,
    x: enemy.x - 60,
    y: enemy.y,
    previousY: enemy.y,
    grounded: true,
    facing: "right" as const,
  };
  for (let index = 0; index < 30; index += 1) {
    state = stepPlatformer(
      map,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    ).state;
  }
  assert.equal(state.enemies.find((candidate) => candidate.id === "enemy_1")?.defeated, true);
  assert.ok(state.enemies.some((candidate) => (
    candidate.x !== initial.enemies.find((start) => start.id === candidate.id)?.x
  )));

  const death = stepPlatformer(
    map,
    spec,
    { ...state, x: (14 + 0.5) * 64, y: 12 * 64, grounded: false },
    idleInput,
    weapon,
  );
  assert.equal(death.state.status, "dying");
  assert.equal(death.state.enemies.find((candidate) => candidate.id === "enemy_1")?.defeated, true);

  let respawned = death.state;
  for (let index = 0; index < death.state.deathTicksTotal; index += 1) {
    respawned = stepPlatformer(map, spec, respawned, idleInput, weapon).state;
  }

  assert.equal(respawned.status, "playing");
  const enemySnapshot = (snapshot: PlatformerState) => snapshot.enemies.map((candidate) => ({
    id: candidate.id,
    x: candidate.x,
    y: candidate.y,
    direction: candidate.direction,
    hitsRemaining: candidate.hitsRemaining,
    defeated: candidate.defeated,
  }));
  assert.deepEqual(enemySnapshot(respawned), enemySnapshot(initial));
});

test("respawned enemies rearm their ranged attacks from the respawn tick", () => {
  const initial = createInitialState(emberkeepMap);
  const firstRanged = initial.enemies.find((candidate) => candidate.id === "enemy_2");
  assert.ok(firstRanged);
  assert.equal(firstRanged.nextRangedAttackTick, FIXED_TICK_RATE * 4);

  const death = stepPlatformer(
    emberkeepMap,
    spec,
    {
      ...initial,
      tick: 600,
      y: (emberkeepMap.size.rows + 3) * emberkeepMap.tileSize,
      grounded: false,
    },
    idleInput,
    weapon,
  );
  assert.equal(death.state.status, "dying");

  let respawned = death.state;
  for (let index = 0; index < death.state.deathTicksTotal; index += 1) {
    respawned = stepPlatformer(emberkeepMap, spec, respawned, idleInput, weapon).state;
  }

  assert.equal(respawned.status, "playing");
  assert.equal(
    respawned.enemies.find((candidate) => candidate.id === "enemy_2")?.nextRangedAttackTick,
    respawned.tick + FIXED_TICK_RATE * 4,
  );
});

test("each map can configure its bounded death-to-respawn delay", () => {
  const quickRespawnMap: PlatformerMapSpec = {
    ...map,
    rules: { respawnDelaySeconds: 1.5 },
  };
  const initial = createInitialState(quickRespawnMap);
  const death = stepPlatformer(
    quickRespawnMap,
    spec,
    { ...initial, x: (14 + 0.5) * 64, y: 12 * 64, grounded: false },
    idleInput,
    weapon,
  );

  assert.equal(resolveDeathRespawnDelayTicks(quickRespawnMap), FIXED_TICK_RATE * 1.5);
  assert.equal(death.state.deathTicksTotal, FIXED_TICK_RATE * 1.5);
});

test("an extra-life pickup increments lives once and fades out over fixed ticks", () => {
  const extraLifeMap: PlatformerMapSpec = {
    ...map,
    objects: [
      ...map.objects,
      // On the spawn cell, like the coin test: a tile away the hitboxes never
      // overlap, so an idle player would walk no distance and collect nothing.
      { id: "extra_life_test", type: "extra_life", x: 1, y: 10 },
    ],
  };
  const initial = createInitialState(extraLifeMap);
  const collected = stepPlatformer(extraLifeMap, spec, initial, idleInput, weapon);

  assert.equal(collected.state.lives, 4);
  assert.equal(collected.state.extraLifeCollectedAtTick.extra_life_test, 1);
  assert.deepEqual(collected.events, [{ type: "extra_life", objectId: "extra_life_test" }]);
  assert.equal(resolveExtraLifeOpacity(collected.state, "extra_life_test"), 1);
  assert.equal(resolveExtraLifeFireworkFrame(collected.state, "extra_life_test"), 0);

  const halfway = {
    ...collected.state,
    tick: collected.state.tick + EXTRA_LIFE_FADE_TICKS / 2,
  };
  assert.equal(resolveExtraLifeOpacity(halfway, "extra_life_test"), 0.5);

  const halfwayThroughFirework = {
    ...collected.state,
    tick: collected.state.tick
      + (EXTRA_LIFE_FIREWORK_FRAME_COUNT / 2) * (FIXED_TICK_RATE / EXTRA_LIFE_FIREWORK_FPS),
  };
  assert.equal(
    resolveExtraLifeFireworkFrame(halfwayThroughFirework, "extra_life_test"),
    EXTRA_LIFE_FIREWORK_FRAME_COUNT / 2,
  );

  const faded = {
    ...collected.state,
    tick: collected.state.tick + EXTRA_LIFE_FADE_TICKS,
  };
  assert.equal(resolveExtraLifeOpacity(faded, "extra_life_test"), 0);

  const fireworkFinished = {
    ...collected.state,
    tick: collected.state.tick
      + EXTRA_LIFE_FIREWORK_FRAME_COUNT * (FIXED_TICK_RATE / EXTRA_LIFE_FIREWORK_FPS),
  };
  assert.equal(resolveExtraLifeFireworkFrame(fireworkFinished, "extra_life_test"), null);

  const repeated = stepPlatformer(extraLifeMap, spec, collected.state, idleInput, weapon);
  assert.equal(repeated.state.lives, 4);
  assert.equal(repeated.events.some((event) => event.type === "extra_life"), false);
});

test("a collected coin records and completes its four-frame poof animation", () => {
  const collectibleMap: PlatformerMapSpec = {
    ...map,
    objects: [
      ...map.objects.filter(
        (object) => object.type !== "collectible" && object.type !== "extra_life",
      ),
      { id: "coin_test", type: "collectible", x: 1, y: 10, pointValue: 1 },
    ],
  };
  const collected = stepPlatformer(
    collectibleMap,
    spec,
    createInitialState(collectibleMap),
    idleInput,
    weapon,
  );

  assert.equal(COLLECTIBLE_POOF_FRAME_COUNT, 4);
  assert.equal(COLLECTIBLE_POOF_FPS, 12);
  assert.equal(collected.state.collectibleCollectedAtTick.coin_test, 1);
  assert.equal(resolveCollectiblePoofFrame(collected.state, "coin_test"), 0);
  assert.equal(
    resolveCollectiblePoofFrame({
      ...collected.state,
      tick: collected.state.tick + FIXED_TICK_RATE / COLLECTIBLE_POOF_FPS,
    }, "coin_test"),
    1,
  );
  assert.equal(
    resolveCollectiblePoofFrame({
      ...collected.state,
      tick: collected.state.tick
        + FIXED_TICK_RATE * (COLLECTIBLE_POOF_FRAME_COUNT / COLLECTIBLE_POOF_FPS),
    }, "coin_test"),
    null,
  );
});

test("a sword swing defeats a weapon-only enemy during its active frames", () => {
  const initial = createInitialState(map);
  const enemy = initial.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(enemy);
  let state: PlatformerState = {
    ...initial,
    x: enemy.x - 60,
    y: enemy.y,
    previousY: enemy.y,
    grounded: true,
    facing: "right" as const,
  };
  const eventTypes: string[] = [];

  for (let index = 0; index < 8; index += 1) {
    const result = stepPlatformer(
      map,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    );
    state = result.state;
    eventTypes.push(...result.events.map((event) => event.type));
  }

  assert.equal(state.status, "playing");
  assert.equal(state.enemies.find((candidate) => candidate.id === "enemy_1")?.defeated, true);
  assert.ok(eventTypes.includes("weapon_swing"));
  assert.ok(eventTypes.includes("weapon_hit"));
  assert.ok(eventTypes.includes("enemy_defeat"));
});

test("a surviving boss backs away one tile, blinks, and pauses before resuming its path", () => {
  const initial = createInitialState(map);
  const boss = initial.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(boss);
  assert.equal(boss.role, "boss");
  let state: PlatformerState = {
    ...initial,
    x: boss.x - 80,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
    facing: "right" as const,
  };

  let hitStartX = boss.x;
  for (let index = 0; index < 8; index += 1) {
    const bossBeforeStep = state.enemies.find((candidate) => candidate.id === "boss_1");
    assert.ok(bossBeforeStep);
    const result = stepPlatformer(
      map,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    );
    state = result.state;
    if (result.events.some((event) => event.type === "weapon_hit")) {
      hitStartX = bossBeforeStep.x;
      break;
    }
  }

  const hitBoss = state.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(hitBoss);
  assert.equal(hitBoss.hitsRemaining, 4);
  assert.equal(hitBoss.defeated, false);
  assert.equal(hitBoss.hitReactionTicksRemaining, BOSS_HIT_REACTION_TICKS);
  assert.equal(hitBoss.moving, false);
  assert.ok(hitBoss.x - hitStartX > map.tileSize - 1);

  const knockedBackX = hitBoss.x;
  for (let index = 0; index < BOSS_HIT_REACTION_TICKS; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
    assert.equal(
      state.enemies.find((candidate) => candidate.id === "boss_1")?.x,
      knockedBackX,
    );
  }
  assert.equal(
    state.enemies.find((candidate) => candidate.id === "boss_1")?.hitReactionTicksRemaining,
    0,
  );

  state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  const resumedBoss = state.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(resumedBoss);
  assert.ok(resumedBoss.x < knockedBackX);
  assert.equal(resumedBoss.moving, true);
});

test("a boss struck from behind turns toward the attacker before resuming its patrol", () => {
  const initial = createInitialState(map);
  const boss = initial.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(boss);
  assert.equal(boss.direction, "left");
  let state: PlatformerState = {
    ...initial,
    x: boss.x + 80,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
    facing: "left" as const,
  };

  let weaponHit = false;
  for (let index = 0; index < 8; index += 1) {
    const result = stepPlatformer(
      map,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    );
    state = result.state;
    if (result.events.some((event) => event.type === "weapon_hit")) {
      weaponHit = true;
      break;
    }
  }

  assert.equal(weaponHit, true);
  const turnedBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(turnedBoss);
  assert.equal(turnedBoss.defeated, false);
  assert.equal(turnedBoss.direction, "right");
  assert.equal(turnedBoss.moving, false);

  const reactionX = turnedBoss.x;
  for (let index = 0; index < BOSS_HIT_REACTION_TICKS; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  }
  state = stepPlatformer(map, spec, state, idleInput, weapon).state;

  const resumedBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(resumedBoss);
  assert.equal(resumedBoss.direction, "right");
  assert.equal(resumedBoss.moving, true);
  assert.ok(resumedBoss.x > reactionX);
});

test("ramming travel pauses, charges its configured distance, then resumes patrol", () => {
  const rammingMap: PlatformerMapSpec = {
    ...map,
    objects: map.objects.map((object) => (
      object.id === "boss_1"
        ? {
            ...object,
            motion: {
              version: 1 as const,
              travel: {
                type: "ramming" as const,
                chargeDelayMs: 100,
                distanceTiles: 1,
              },
              visual: { type: "none" as const },
            },
          }
        : object
    )),
  };
  const initial = createInitialState(rammingMap);
  const boss = initial.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(boss);
  let state: PlatformerState = {
    ...initial,
    x: boss.x - 3 * rammingMap.tileSize,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
  };

  state = stepPlatformer(rammingMap, spec, state, idleInput, weapon).state;
  assert.equal(state.enemies.find((candidate) => candidate.id === boss.id)?.ramPhase, "windup");
  for (let index = 0; index < 6; index += 1) {
    state = stepPlatformer(rammingMap, spec, state, idleInput, weapon).state;
    assert.equal(state.enemies.find((candidate) => candidate.id === boss.id)?.x, boss.x);
  }

  for (let index = 0; index < 20; index += 1) {
    state = stepPlatformer(rammingMap, spec, state, idleInput, weapon).state;
    if (state.enemies.find((candidate) => candidate.id === boss.id)?.ramPhase === "idle") break;
  }
  const chargedBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(chargedBoss);
  assert.ok(Math.abs(chargedBoss.x - (boss.x - rammingMap.tileSize)) < 0.01);
  assert.equal(chargedBoss.ramArmed, false);

  state = stepPlatformer(rammingMap, spec, state, idleInput, weapon).state;
  const resumedBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(resumedBoss);
  assert.equal(resumedBoss.ramPhase, "idle");
  assert.equal(resumedBoss.moving, true);
  assert.ok(resumedBoss.x < chargedBoss.x);
});

test("ramming travel does not trigger while the character is behind the enemy", () => {
  const rammingMap: PlatformerMapSpec = {
    ...map,
    objects: map.objects.map((object) => (
      object.id === "boss_1"
        ? {
            ...object,
            motion: {
              version: 1 as const,
              travel: { type: "ramming" as const, chargeDelayMs: 100, distanceTiles: 1 },
              visual: { type: "none" as const },
            },
          }
        : object
    )),
  };
  const initial = createInitialState(rammingMap);
  const boss = initial.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(boss);
  const state = stepPlatformer(rammingMap, spec, {
    ...initial,
    x: boss.x + 2 * rammingMap.tileSize,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
  }, idleInput, weapon).state;
  const movingBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(movingBoss);
  assert.equal(movingBoss.ramPhase, "idle");
  assert.equal(movingBoss.moving, true);
  assert.ok(movingBoss.x < boss.x);
});

test("a defeating weapon hit does not leave a boss in its surviving hit reaction", () => {
  const initial = createInitialState(map);
  const boss = initial.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(boss);
  let state: PlatformerState = {
    ...initial,
    x: boss.x - 80,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
    facing: "right" as const,
    enemies: initial.enemies.map((enemy) =>
      enemy.id === boss.id ? { ...enemy, hitsRemaining: 1 } : enemy,
    ),
  };

  for (let index = 0; index < 8; index += 1) {
    const result = stepPlatformer(
      map,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    );
    state = result.state;
    if (result.events.some((event) => event.type === "weapon_hit")) break;
  }

  const defeatedBoss = state.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(defeatedBoss);
  assert.equal(defeatedBoss.defeated, true);
  assert.equal(defeatedBoss.hitReactionTicksRemaining, 0);
  assert.equal(state.status, "won");
});

test("stomping a boss consumes each configured hit instead of defeating it immediately", () => {
  let state = createInitialState(map);
  const startingBoss = state.enemies.find((candidate) => candidate.id === "boss_1");
  assert.ok(startingBoss);

  for (let hit = 1; hit <= 5; hit += 1) {
    const boss = state.enemies.find((candidate) => candidate.id === "boss_1");
    assert.ok(boss);
    state = {
      ...state,
      status: "playing",
      x: boss.x,
      y: boss.y - 113,
      previousY: boss.y - 113,
      vy: 100,
      grounded: false,
    };
    const result = stepPlatformer(map, spec, state, idleInput, weapon);
    state = result.state;
    const hitBoss = state.enemies.find((candidate) => candidate.id === "boss_1");
    assert.ok(hitBoss);
    assert.equal(hitBoss.hitsRemaining, 5 - hit);
    assert.equal(hitBoss.defeated, hit === 5);
    assert.equal(result.events.some((event) => event.type === "enemy_defeat"), hit === 5);
    assert.equal(state.status, hit === 5 ? "won" : "playing");
  }
});

test("boss knockback stops at solid terrain", () => {
  const blockedMap: PlatformerMapSpec = {
    ...map,
    id: "boss_knockback_collision_test",
    size: { columns: 6, rows: 4 },
    camera: { columns: 6, rows: 4 },
    layers: [
      {
        id: "terrain",
        rows: ["......", "....#.", "....#.", "######"],
      },
    ],
    objects: [
      { id: "spawn_test", type: "player_spawn", x: 0.8, y: 2 },
      {
        id: "boss_test",
        type: "enemy_spawn",
        role: "boss",
        x: 2,
        y: 2,
        behavior: "patroller",
        direction: "left",
        speedPxPerSecond: 0,
        defeatMode: "weapon",
        hitsToDefeat: 2,
      },
    ],
  };
  let state = createInitialState(blockedMap);

  for (let index = 0; index < 8; index += 1) {
    const result = stepPlatformer(
      blockedMap,
      spec,
      state,
      { ...idleInput, weaponPressed: index === 0 },
      weapon,
    );
    state = result.state;
    if (result.events.some((event) => event.type === "weapon_hit")) break;
  }

  const boss = state.enemies.find((candidate) => candidate.id === "boss_test");
  assert.ok(boss);
  assert.ok(Math.abs(boss.x - (4 * blockedMap.tileSize - 48 - 0.001)) < 0.01);
});

test("a patroller follows its authored bounds and reverses direction", () => {
  let state = createInitialState(map);
  const initialEnemy = state.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(initialEnemy);

  state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  const movingEnemy = state.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(movingEnemy);
  assert.ok(movingEnemy.x > initialEnemy.x);
  assert.equal(movingEnemy.moving, true);

  for (let index = 0; index < 400; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  }
  const reversedEnemy = state.enemies.find((candidate) => candidate.id === "enemy_1");
  assert.ok(reversedEnemy);
  assert.equal(reversedEnemy.direction, "left");
  assert.ok(reversedEnemy.x <= reversedEnemy.startX + reversedEnemy.patrolRightTiles * map.tileSize);
});

test("a /build chaser patrols its view area, chases the hero, then resumes patrolling", () => {
  const initial = createInitialState(graveyardMap);
  const chaser = initial.enemies.find((candidate) => candidate.id === "enemy_2");
  assert.ok(chaser);

  const outsideViewX = chaser.startX - (chaser.viewLeftTiles + 1) * graveyardMap.tileSize;
  const patrollingState = stepPlatformer(
    graveyardMap,
    spec,
    { ...initial, x: outsideViewX, y: graveyardMap.tileSize },
    idleInput,
    weapon,
  ).state;
  const patrollingChaser = patrollingState.enemies.find((candidate) => candidate.id === chaser.id);
  assert.ok(patrollingChaser);
  assert.ok(patrollingChaser.x < chaser.x);
  assert.equal(patrollingChaser.moving, true);

  const aboveViewState = stepPlatformer(
    graveyardMap,
    spec,
    {
      ...initial,
      x: chaser.startX + graveyardMap.tileSize,
      y: chaser.y - graveyardMap.tileSize,
    },
    idleInput,
    weapon,
  ).state;
  const aboveViewChaser = aboveViewState.enemies.find((candidate) => candidate.id === chaser.id);
  assert.ok(aboveViewChaser);
  assert.ok(aboveViewChaser.x < chaser.x);

  const chasingState = stepPlatformer(
    graveyardMap,
    spec,
    { ...initial, x: chaser.startX + graveyardMap.tileSize, y: chaser.y },
    idleInput,
    weapon,
  ).state;
  const chasingChaser = chasingState.enemies.find((candidate) => candidate.id === chaser.id);
  assert.ok(chasingChaser);
  assert.equal(chasingChaser.direction, "right");
  assert.ok(chasingChaser.x > chaser.x);

  const rightBound = chaser.startX + chaser.viewRightTiles * graveyardMap.tileSize;
  let resumedState: PlatformerState = {
    ...initial,
    x: outsideViewX,
    y: graveyardMap.tileSize,
    enemies: initial.enemies.map((enemy) => (
      enemy.id === chaser.id
        ? { ...enemy, x: rightBound, direction: "right" as const }
        : enemy
    )),
  };
  resumedState = stepPlatformer(graveyardMap, spec, resumedState, idleInput, weapon).state;
  resumedState = stepPlatformer(graveyardMap, spec, resumedState, idleInput, weapon).state;
  const resumedChaser = resumedState.enemies.find((candidate) => candidate.id === chaser.id);
  assert.ok(resumedChaser);
  assert.equal(resumedChaser.direction, "left");
  assert.ok(resumedChaser.x < rightBound);
  assert.equal(resumedChaser.moving, true);
});

test("bobbing is a deterministic visual offset and does not alter enemy collision position", () => {
  const object = map.objects.find((candidate) => candidate.id === "enemy_1");
  assert.ok(object?.motion);
  const initial = createInitialState(map);
  const enemyY = initial.enemies.find((candidate) => candidate.id === "enemy_1")?.y;
  const offsetA = resolveVisualBobOffset(object.motion, object.id, 0, map.tileSize);
  const offsetB = resolveVisualBobOffset(object.motion, object.id, 24, map.tileSize);

  assert.notEqual(offsetA, offsetB);
  assert.equal(initial.enemies.find((candidate) => candidate.id === "enemy_1")?.y, enemyY);
});

test("the checked-in Haunted spirit orbs circle opposite ways around authored 9 by 9 grids", () => {
  const orbObjects = graveyardMap.objects.filter((object) => (
    object.type === "enemy_spawn" && object.assetId === "haunted_spirit_orb_01"
  ));
  assert.equal(orbObjects.length, 2);
  assert.deepEqual(
    orbObjects.map((object) => object.motion?.travel),
    [
      { type: "circle", gridSizeTiles: 9, direction: "clockwise", durationMs: 8000 },
      { type: "circle", gridSizeTiles: 9, direction: "counterclockwise", durationMs: 8000 },
    ],
  );

  let state = createInitialState(graveyardMap);
  for (let tick = 0; tick < FIXED_TICK_RATE * 2; tick += 1) {
    state = stepPlatformer(graveyardMap, spec, state, idleInput, weapon).state;
  }

  const radius = 4 * graveyardMap.tileSize;
  const clockwise = state.enemies.find((enemy) => enemy.id === orbObjects[0].id);
  const counterclockwise = state.enemies.find((enemy) => enemy.id === orbObjects[1].id);
  assert.ok(clockwise);
  assert.ok(counterclockwise);
  assert.ok(Math.abs(clockwise.x - (clockwise.startX - radius)) < 0.01);
  assert.ok(Math.abs(counterclockwise.x - (counterclockwise.startX + radius)) < 0.01);
  assert.ok(Math.abs(clockwise.y - (clockwise.startY - radius)) < 0.01);
  assert.ok(Math.abs(counterclockwise.y - (counterclockwise.startY - radius)) < 0.01);
  assert.equal(clockwise.direction, "left");
  assert.equal(counterclockwise.direction, "right");
});

test("the campaign maps loaded by /build preserve each boss's authored travel", () => {
  const expectedTravelByMap = new Map([
    ["green_hills_01", { type: "ramming", chargeDelayMs: 1000, distanceTiles: 3 }],
    ["space_01", { type: "ramming", chargeDelayMs: 1000, distanceTiles: 3 }],
    ["graveyard_01", { type: "ramming", chargeDelayMs: 1000, distanceTiles: 3 }],
    ["dragons_01", { type: "behavior" }],
    ["ice_world_01", { type: "behavior" }],
  ]);
  for (const campaignMap of campaignMaps) {
    const boss = campaignMap.objects.find((candidate) => candidate.role === "boss");
    assert.ok(boss?.motion, `${campaignMap.id} must contain a boss with authored motion`);
    assert.deepEqual(boss.motion.travel, expectedTravelByMap.get(campaignMap.id));
    assert.deepEqual(boss.motion.visual, { type: "none" });
    assert.equal(resolveVisualBobOffset(boss.motion, boss.id, 24, campaignMap.tileSize), 0);
  }
});

test("the /build campaign boss enters its authored ramming windup", () => {
  const campaignMap = campaignMaps[0];
  const initial = createInitialState(campaignMap);
  const boss = initial.enemies.find((candidate) => candidate.role === "boss");
  assert.ok(boss);
  const state = stepPlatformer(campaignMap, spec, {
    ...initial,
    x: boss.x - 3 * campaignMap.tileSize,
    y: boss.y,
    previousY: boss.y,
    grounded: true,
  }, idleInput, weapon).state;
  const chargingBoss = state.enemies.find((candidate) => candidate.id === boss.id);
  assert.ok(chargingBoss);
  assert.equal(chargingBoss.ramPhase, "windup");
  assert.equal(chargingBoss.ramWindupTicksRemaining, FIXED_TICK_RATE);
  assert.equal(chargingBoss.ramDistanceRemaining, 3 * campaignMap.tileSize);
});

test("the map-backed HUD places lives and coins in viewport cells", () => {
  assert.deepEqual(map.presentation.hud, [
    { id: "lives", type: "lives", column: 5, row: 0 },
    { id: "coins", type: "coins", column: 9, row: 0 },
  ]);
});

test("each campaign map includes one shared extra-life pickup", () => {
  for (const campaignMap of campaignMaps) {
    assert.equal(
      campaignMap.objects.filter((object) => object.type === "extra_life").length,
      1,
      campaignMap.id,
    );
  }
});

test("a camera-triggered flying object crosses the snapshotted viewport on its arc", () => {
  let state = createInitialState(map);
  state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  const started = state.flyingObjects.find((candidate) => candidate.id === "flying_1");
  assert.ok(started);
  assert.equal(started.phase, "active");
  const startX = started.x;
  const startY = started.y;

  for (let index = 0; index < 90; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  }
  const inFlight = state.flyingObjects.find((candidate) => candidate.id === "flying_1");
  assert.ok(inFlight);
  assert.equal(inFlight.phase, "active");
  assert.ok(inFlight.x < startX);
  assert.ok(inFlight.y < startY);

  for (let index = 0; index < 220; index += 1) {
    state = stepPlatformer(map, spec, state, idleInput, weapon).state;
  }
  assert.equal(
    state.flyingObjects.find((candidate) => candidate.id === "flying_1")?.phase,
    "complete",
  );
});

test("Dragon World flying fireballs reuse the Cooper fly-by arc", () => {
  const cooperFlyby = map.objects.find((object) => object.id === "flying_1");
  const fireballs = emberkeepMap.objects.filter((object) => object.type === "flying_object");
  assert.equal(fireballs.length, 2);
  assert.ok(cooperFlyby?.motion);
  for (const fireball of fireballs) {
    assert.equal(fireball.assetId, "dragons_emberkeep_flying_fireball_01");
    assert.deepEqual(fireball.motion, cooperFlyby.motion);
  }

  const first = fireballs[0];
  let state = createInitialState(emberkeepMap);
  state = {
    ...state,
    x: Math.max(state.x, (first.x - emberkeepMap.camera.columns / 2) * emberkeepMap.tileSize),
  };
  state = stepPlatformer(emberkeepMap, spec, state, idleInput, weapon).state;
  const started = state.flyingObjects.find((candidate) => candidate.id === first.id);
  assert.ok(started);
  assert.equal(started.assetId, "dragons_emberkeep_flying_fireball_01");
  assert.equal(started.phase, "active");
  const startX = started.x;
  const startY = started.y;

  for (let index = 0; index < 90; index += 1) {
    state = stepPlatformer(emberkeepMap, spec, state, idleInput, weapon).state;
  }
  const inFlight = state.flyingObjects.find((candidate) => candidate.id === first.id);
  assert.ok(inFlight);
  assert.equal(inFlight.phase, "active");
  assert.ok(inFlight.x < startX);
  assert.ok(inFlight.y < startY);

  for (let index = 0; index < 220; index += 1) {
    state = stepPlatformer(emberkeepMap, spec, state, idleInput, weapon).state;
  }
  assert.equal(
    state.flyingObjects.find((candidate) => candidate.id === first.id)?.phase,
    "complete",
  );
});
