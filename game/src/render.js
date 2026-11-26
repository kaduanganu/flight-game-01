// The look of Sky Courier: a voxel-terrain chase view over the Coral Islands,
// a lit instrument panel, and the screens. The terrain is drawn at half
// resolution into an offscreen buffer (one vertical pass per column, nearer
// ground hiding farther ground), then scaled up; the plane, rings and HUD are
// drawn over it at full resolution.
import { FIELD, PALETTE, RINGS, RUNWAY } from './config.js';
import { createRandom } from './random.js';
import { terrainColourAt, terrainHeightAt } from './terrain.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_LANDED = 4;
export const SCREEN_CRASHED = 5;

const HALF_W = 640;
const HALF_H = 360;
const FOV = (75 * Math.PI) / 180;
const FOCAL_HALF = (HALF_W / 2) / Math.tan(FOV / 2);
const FOCAL_FULL = (FIELD.width / 2) / Math.tan(FOV / 2);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function headingName(heading) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(((heading % 360) + 360) % 360 / 22.5) % 16];
}

export function createRenderer(canvas, terrain) {
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  low.width = HALF_W;
  low.height = HALF_H;
  const lowCtx = low.getContext('2d');
  const image = lowCtx.createImageData(HALF_W, HALF_H);
  const pixels = image.data;
  const clouds = [];
  const rng = createRandom(11);
  for (let i = 0; i < 12; i += 1) {
    clouds.push({ angle: rng.range(0, 360), y: rng.range(30, 160), size: rng.range(36, 95), speed: rng.range(0.2, 0.7) });
  }
  const fogR = 207;
  const fogG = 232;
  const fogB = 247;

  function drawSky(state, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height * 0.55);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.6, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Sun, fixed in the south-east sky.
    const sunRel = ((140 - state.heading + 540) % 360) - 180;
    if (Math.abs(sunRel) < 95) {
      const sx = FIELD.width / 2 + (sunRel / 95) * FIELD.width * 0.62;
      const sy = 92 - state.pitch * 4;
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120);
      glow.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 226, 140, 0.55)');
      glow.addColorStop(1, 'rgba(255, 226, 140, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 130, sy - 130, 260, 260);
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(sx, sy, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Clouds drift with heading: turning the plane sweeps them across the sky.
    for (const cloud of clouds) {
      const rel = ((cloud.angle - state.heading + 540) % 360) - 180;
      const cx = FIELD.width / 2 + (rel / 180) * FIELD.width * 1.15 + time * cloud.speed * 2;
      const wrapped = ((cx % (FIELD.width + 400)) + FIELD.width + 400) % (FIELD.width + 400) - 200;
      const cy = cloud.y - state.pitch * 3;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.ellipse(wrapped, cy, cloud.size, cloud.size * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped + cloud.size * 0.5, cy + 8, cloud.size * 0.6, cloud.size * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped - cloud.size * 0.5, cy + 6, cloud.size * 0.55, cloud.size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain(state, time) {
    const headingRad = (state.heading * Math.PI) / 180;
    const horizonY = 150 - state.pitch * 2.2;
    const camAlt = Math.max(30, state.altitude);
    pixels.fill(0);
    const halfFov = FOV / 2;
    for (let col = 0; col < HALF_W; col += 1) {
      const ray = headingRad + ((col - HALF_W / 2) / (HALF_W / 2)) * halfFov;
      const dirX = Math.sin(ray);
      const dirZ = -Math.cos(ray);
      let maxY = HALF_H;
      let prevR = 0;
      let prevG = 0;
      let prevB = 0;
      let firstSpan = true;
      let d = 25;
      for (let step = 0; step < 220 && d < 12000; step += 1) {
        const wx = state.x + dirX * d;
        const wz = state.z + dirZ * d;
        if (wx < -6000 || wx > 6000 || wz < -6000 || wz > 6000) {
          d *= 1.04;
          continue;
        }
        const h = terrainHeightAt(terrain, wx, wz);
        const screenY = horizonY - ((h - camAlt) * FOCAL_HALF) / d;
        if (screenY < maxY) {
          const c = terrainColourAt(terrain, wx, wz);
          const fog = Math.min(0.5, d / 12000);
          let r = c[0] + (fogR - c[0]) * fog;
          let g = c[1] + (fogG - c[1]) * fog;
          let b = c[2] + (fogB - c[2]) * fog;
          if (h < 0) {
            const shimmer = Math.sin(wx * 0.05 + wz * 0.04 + time * 1.6) * 9;
            r += shimmer;
            g += shimmer;
            b += shimmer * 1.4;
          }
          // Floor/ceil so neighbouring depth bands overlap by a pixel: with
          // ceil/floor the other way, fractional screen heights leave 1 px
          // gaps that show the sky through the ground.
          const y0 = Math.max(0, Math.floor(screenY));
          const y1 = Math.min(HALF_H, Math.ceil(maxY));
          if (firstSpan) {
            prevR = r;
            prevG = g;
            prevB = b;
            firstSpan = false;
          }
          // Shade the band from this sample's colour at its top edge to the
          // nearer sample's colour at its bottom, so distance reads as a
          // smooth slope instead of contour lines.
          const span = Math.max(1, y1 - y0);
          for (let y = y0; y < y1; y += 1) {
            const t = (y - y0) / span;
            const base = (y * HALF_W + col) * 4;
            pixels[base] = r + (prevR - r) * t;
            pixels[base + 1] = g + (prevG - g) * t;
            pixels[base + 2] = b + (prevB - b) * t;
            pixels[base + 3] = 255;
          }
          prevR = r;
          prevG = g;
          prevB = b;
          maxY = screenY;
          if (maxY <= horizonY) break;
        }
        d *= 1.025;
      }
    }
    lowCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(low, 0, 0, FIELD.width, FIELD.height);
    // A haze band on the horizon softens the far terrain's jagged edge.
    const horizonFull = FIELD.height * 0.42 - state.pitch * 8;
    const haze = ctx.createLinearGradient(0, horizonFull - 16, 0, horizonFull + 16);
    haze.addColorStop(0, 'rgba(207, 232, 247, 0)');
    haze.addColorStop(0.5, 'rgba(207, 232, 247, 0.55)');
    haze.addColorStop(1, 'rgba(207, 232, 247, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonFull - 16, FIELD.width, 32);
  }

  function project(state, x, y, z) {
    const headingRad = (state.heading * Math.PI) / 180;
    const dx = x - state.x;
    const dy = y - state.altitude;
    const dz = z - state.z;
    const fwd = dx * Math.sin(headingRad) + dz * -Math.cos(headingRad);
    const lat = dx * Math.cos(headingRad) + dz * Math.sin(headingRad);
    if (fwd < 40) return null;
    const horizonY = FIELD.height * 0.42 - state.pitch * 8;
    return {
      x: FIELD.width / 2 + (lat / fwd) * FOCAL_FULL,
      y: horizonY - (dy / fwd) * FOCAL_FULL,
      radius: (140 / fwd) * FOCAL_FULL,
      dist: fwd,
    };
  }

  function drawRings(state) {
    for (let i = 0; i < RINGS.length; i += 1) {
      if (state.ringsHit[i]) continue;
      const ring = RINGS[i];
      const p = project(state, ring.x, ring.y, ring.z);
      if (!p || p.radius < 4 || p.x < -200 || p.x > FIELD.width + 200) continue;
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
      ctx.save();
      ctx.lineWidth = Math.max(3, p.radius * 0.09);
      ctx.strokeStyle = `rgba(255, 170, 40, ${pulse})`;
      ctx.shadowColor = '#ffaa28';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe9a8';
      ctx.font = `bold ${Math.max(13, Math.min(26, p.radius * 0.22))}px ${'system-ui, sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}  ·  ${Math.round(p.dist)} ft`, p.x, p.y - p.radius - 10);
      ctx.restore();
    }
  }

  function drawPlane(state, offsetY = 0) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.66 - state.pitch * 2.5 + offsetY;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-state.roll * Math.PI) / 180 * 0.85);
    ctx.scale(1, 1);
    // Soft shadow on the ground far below is skipped; the plane is the hero.
    // Wings
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-150, 6);
    ctx.lineTo(-26, -14);
    ctx.lineTo(-22, 10);
    ctx.lineTo(-150, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(150, 6);
    ctx.lineTo(26, -14);
    ctx.lineTo(22, 10);
    ctx.lineTo(150, 26);
    ctx.closePath();
    ctx.fill();
    // Orange wingtips
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.beginPath();
    ctx.moveTo(-150, 6);
    ctx.lineTo(-128, 2);
    ctx.lineTo(-128, 24);
    ctx.lineTo(-150, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(150, 6);
    ctx.lineTo(128, 2);
    ctx.lineTo(128, 24);
    ctx.lineTo(150, 26);
    ctx.closePath();
    ctx.fill();
    // Tail fin and stabilisers
    ctx.fillStyle = PALETTE.planeTail;
    ctx.beginPath();
    ctx.moveTo(-16, -58);
    ctx.lineTo(0, -96);
    ctx.lineTo(16, -58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-64, -52);
    ctx.lineTo(-14, -62);
    ctx.lineTo(-12, -46);
    ctx.lineTo(-64, -38);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, -52);
    ctx.lineTo(14, -62);
    ctx.lineTo(12, -46);
    ctx.lineTo(64, -38);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind and above
    const body = ctx.createLinearGradient(-26, 0, 26, 0);
    body.addColorStop(0, '#c9d4dc');
    body.addColorStop(0.5, '#ffffff');
    body.addColorStop(1, '#c9d4dc');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-24, 34);
    ctx.quadraticCurveTo(-30, -30, -16, -62);
    ctx.lineTo(16, -62);
    ctx.quadraticCurveTo(30, -30, 24, 34);
    ctx.quadraticCurveTo(0, 46, -24, 34);
    ctx.closePath();
    ctx.fill();
    // Blue cheatline and lit windows
    ctx.fillStyle = PALETTE.planeTail;
    ctx.fillRect(-25, -6, 50, 7);
    ctx.fillStyle = '#8be9ff';
    ctx.fillRect(-18, -34, 36, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-18, -34, 36, 3);
    // Registration on the tail
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SC-07', 0, -66);
    // Navigation lights
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-150, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34e07a';
    ctx.beginPath();
    ctx.arc(150, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -96, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function bar(x, y, w, h, frac, colour, label) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y - 5);
  }

  function drawHud(state, best, target) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.82)';
    ctx.fillRect(0, 0, FIELD.width, 64);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SKY COURIER', 16, 26);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4c8';
    ctx.fillText('CORAL ISLAND RUN', 16, 46);
    const readouts = [
      [`ALT`, `${Math.round(state.altitude)} ft`],
      [`SPD`, `${Math.round(state.speed)} kt`],
      [`HDG`, `${String(Math.round(state.heading)).padStart(3, '0')}° ${headingName(state.heading)}`],
      [`V/S`, `${state.verticalSpeed >= 0 ? '+' : ''}${Math.round(state.verticalSpeed)} fpm`],
    ];
    let rx = 250;
    for (const [label, value] of readouts) {
      ctx.fillStyle = '#9fb4c8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(label, rx, 22);
      ctx.fillStyle = PALETTE.hudGreen;
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillText(value, rx, 48);
      rx += 150;
    }
    bar(850, 30, 110, 12, state.throttle / 100, '#ffb020', 'THR');
    bar(975, 30, 110, 12, state.fuel / 100, state.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen, 'FUEL');
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${state.score}`, FIELD.width - 16, 26);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4c8';
    ctx.fillText(`RINGS ${state.ringsDone}/8   LIVES ${state.lives}   BEST ${best}`, FIELD.width - 16, 48);
    ctx.textAlign = 'left';
    // Stage + objective
    ctx.fillStyle = 'rgba(8, 12, 18, 0.66)';
    ctx.fillRect(16, 76, 430, 44);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`STAGE ${state.stage + 1}/3 — ${['TAKEOFF', 'RING RUN', 'LANDING'][state.stage]}`, 28, 96);
    ctx.fillStyle = '#dfe9f2';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(state.message, 28, 114);
    // Target pointer: where the next objective is, and how far.
    if (target) {
      const p = project(state, target.x, target.y, target.z);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      if (p) {
        ctx.fillText(`▸ ${target.label}  ${Math.round(p.dist)} ft`, clamp(p.x, 120, FIELD.width - 120), 140);
      } else {
        const headingRad = (state.heading * Math.PI) / 180;
        const dx = target.x - state.x;
        const dz = target.z - state.z;
        const want = (Math.atan2(dx, -dz) * 180) / Math.PI;
        const err = ((want - state.heading + 540) % 360) - 180;
        ctx.fillText(err > 0 ? `▸ ${target.label} — turn right` : `▸ ${target.label} — turn left`, FIELD.width / 2, 140);
      }
      ctx.textAlign = 'left';
    }
    drawInstruments(state);
  }

  function gauge(cx, cy, r, label, valueText) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 233, 168, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -r + 16);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudGreen;
    ctx.fillText(valueText, 0, r - 12);
    ctx.restore();
  }

  function drawInstruments(state) {
    // Attitude indicator: sky and ground halves, rolled with the plane.
    const cx = 92;
    const cy = FIELD.height - 84;
    const r = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate((-state.roll * Math.PI) / 180);
    ctx.translate(0, state.pitch * 2.2);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r, -2, r * 2, 4);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255, 233, 168, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    gauge(215, FIELD.height - 84, 48, 'ALT', `${Math.round(state.altitude)}`);
    gauge(315, FIELD.height - 84, 48, 'SPD', `${Math.round(state.speed)}`);
    gauge(415, FIELD.height - 84, 48, 'HDG', `${String(Math.round(state.heading)).padStart(3, '0')}°`);
    // Runway reminder on final approach
    if (state.stage === 2) {
      ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
      ctx.fillRect(FIELD.width - 330, FIELD.height - 132, 314, 44);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('FINAL — runway 18 ahead, gear down,', FIELD.width - 318, FIELD.height - 112);
      ctx.fillText('touch down under 130 kt, wings level.', FIELD.width - 318, FIELD.height - 96);
    }
  }

  function overlay(title, lines, accent) {
    // A centred panel, not a full-screen dim: the runway and islands stay visible.
    ctx.fillStyle = 'rgba(6, 10, 16, 0.55)';
    ctx.fillRect(FIELD.width / 2 - 460, 120, 920, 300);
    ctx.strokeStyle = 'rgba(255, 233, 168, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD.width / 2 - 460, 120, 920, 300);
    ctx.fillStyle = accent;
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, 195);
    ctx.fillStyle = '#eef4f8';
    ctx.font = '19px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 245 + i * 30));
    ctx.textAlign = 'left';
  }

  function draw(state, screen, best, time, target) {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    drawSky(state, time);
    drawTerrain(state, time);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CRASHED) drawRings(state);
    drawPlane(state, screen === SCREEN_TITLE ? 55 : 0);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CRASHED) drawHud(state, best, target);
    if (screen === SCREEN_TITLE) {
      overlay('SKY COURIER', ['Coral Island Run — a flight game over the islands', 'Take off, fly all 8 rings, land on runway 18', '', '↑ ↓ pitch   ← → bank & turn   Shift / Ctrl throttle   Space start · P pause · M mute', 'Mouse: drag to steer   ·   Click to start'], '#ffe9a8');
      ctx.fillStyle = '#7dffb0';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(best > 0 ? `BEST SCORE ${best} — press SPACE or click to fly` : 'Press SPACE or click to fly', FIELD.width / 2, 405);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or Space to keep flying'], '#ffe9a8');
    } else if (screen === SCREEN_CRASHED) {
      overlay(state.lives > 0 ? 'CRASHED' : 'OUT OF LIVES', [state.message, `Score ${state.score}   ·   Lives left ${state.lives}`, state.lives > 0 ? 'Press SPACE to fly again' : 'Press SPACE to start over'], PALETTE.hudRed);
    } else if (screen === SCREEN_OVER) {
      overlay('OUT OF LIVES', [`Final score ${state.score}`, `Best ${best}`, 'Press SPACE to fly again'], PALETTE.hudRed);
    } else if (screen === SCREEN_LANDED) {
      overlay('MISSION COMPLETE', [`Landed on runway 18 — +1000`, `Final score ${state.score}`, `Best ${Math.max(best, state.score)}`, 'Press SPACE to fly again'], PALETTE.hudGreen);
    }
  }

  return { draw, project };
}
