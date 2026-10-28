import React, { useEffect, useRef } from 'react';
import {
  WORLD_CONFIG,
  ZONES,
  getInitials,
  updatePlayerPosition,
  getCurrentZone,
} from '../../utils/movement';

/**
 * VirtualOffice Component
 * 
 * HTML5 Canvas 2D spatial workspace rendering:
 * - Local player avatar with initials, username, and "YOU" badge.
 * - Smooth frame-rate independent movement via WASD and Arrow Keys.
 * - Diagonal velocity normalization.
 * - World boundary clamping.
 * - High-DPI canvas crispness via devicePixelRatio.
 * - Independent world coordinates (1600x900) vs display/CSS viewport.
 * - Zero React state updates on the 60fps animation loop.
 */
export default function VirtualOffice({ username = 'Anonymous', onZoneChange }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Local player state (kept outside React state for high-frequency rendering)
  const playerRef = useRef({
    id: 'local',
    username: username,
    x: WORLD_CONFIG.width / 2,
    y: WORLD_CONFIG.height / 2,
    radius: WORLD_CONFIG.playerRadius,
    speed: WORLD_CONFIG.playerSpeed,
  });

  // Keep username updated if prop changes
  useEffect(() => {
    playerRef.current.username = username;
  }, [username]);

  // Key tracking state
  const keysRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  // Expose for runtime inspection and automated verification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__proxispeak_player__ = playerRef.current;
      window.__proxispeak_keys__ = keysRef.current;
    }
  }, []);

  // Viewport dimensions in CSS pixels & devicePixelRatio
  const viewportRef = useRef({
    width: 800,
    height: 600,
    dpr: window.devicePixelRatio || 1,
  });

  const lastZoneIdRef = useRef('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let lastTime = performance.now();

    // Resize handling: update display size and backing canvas buffer for high-DPI
    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(300, Math.floor(rect.width));
      const height = Math.max(300, Math.floor(rect.height));

      viewportRef.current = { width, height, dpr };

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(container);
    updateCanvasSize();

    // Focus canvas on mount
    canvas.focus();

    // ----------------------------------------------------
    // Keyboard Event Handling
    // ----------------------------------------------------
    const handleKeyDown = (e) => {
      // Don't capture keys if typing in an input element
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      let handled = false;

      if (code === 'KeyW' || code === 'ArrowUp' || key === 'w' || key === 'arrowup') {
        keysRef.current.up = true;
        handled = true;
      }
      if (code === 'KeyS' || code === 'ArrowDown' || key === 's' || key === 'arrowdown') {
        keysRef.current.down = true;
        handled = true;
      }
      if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a' || key === 'arrowleft') {
        keysRef.current.left = true;
        handled = true;
      }
      if (code === 'KeyD' || code === 'ArrowRight' || key === 'd' || key === 'arrowright') {
        keysRef.current.right = true;
        handled = true;
      }

      // Prevent page scrolling on arrow keys
      if (handled) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';

      if (code === 'KeyW' || code === 'ArrowUp' || key === 'w' || key === 'arrowup') {
        keysRef.current.up = false;
      }
      if (code === 'KeyS' || code === 'ArrowDown' || key === 's' || key === 'arrowdown') {
        keysRef.current.down = false;
      }
      if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a' || key === 'arrowleft') {
        keysRef.current.left = false;
      }
      if (code === 'KeyD' || code === 'ArrowRight' || key === 'd' || key === 'arrowright') {
        keysRef.current.right = false;
      }
    };

    // Reset keys if document is hidden (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        keysRef.current.up = false;
        keysRef.current.down = false;
        keysRef.current.left = false;
        keysRef.current.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    canvas.addEventListener('keydown', handleKeyDown, { passive: false });
    canvas.addEventListener('keyup', handleKeyUp, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ----------------------------------------------------
    // Main Render Loop (Canvas 2D + requestAnimationFrame)
    // ----------------------------------------------------
    const render = (currentTime) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const player = playerRef.current;
      const keys = keysRef.current;
      const { width: viewW, height: viewH, dpr } = viewportRef.current;

      // 1. Update movement (frame-rate independent & normalized diagonal)
      const moved = updatePlayerPosition(
        player,
        keys,
        dt,
        WORLD_CONFIG.width,
        WORLD_CONFIG.height
      );

      // Check current zone for UI notification
      if (moved && onZoneChange) {
        const currentZone = getCurrentZone(player.x, player.y);
        if (currentZone.id !== lastZoneIdRef.current) {
          lastZoneIdRef.current = currentZone.id;
          onZoneChange(currentZone);
        }
      }

      // 2. Camera calculation (Centers world when viewport is large, follows player when small)
      let camX = 0;
      let camY = 0;

      if (viewW >= WORLD_CONFIG.width) {
        camX = (viewW - WORLD_CONFIG.width) / 2;
      } else {
        const targetCamX = viewW / 2 - player.x;
        camX = Math.max(viewW - WORLD_CONFIG.width, Math.min(0, targetCamX));
      }

      if (viewH >= WORLD_CONFIG.height) {
        camY = (viewH - WORLD_CONFIG.height) / 2;
      } else {
        const targetCamY = viewH / 2 - player.y;
        camY = Math.max(viewH - WORLD_CONFIG.height, Math.min(0, targetCamY));
      }

      // 3. Clear and set up coordinate transforms
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Scale for device pixel density
      ctx.scale(dpr, dpr);

      // Translate camera
      ctx.translate(Math.round(camX), Math.round(camY));

      // ----------------------------------------------------
      // DRAW CANVAS WORLD
      // ----------------------------------------------------

      // A. World Floor
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, WORLD_CONFIG.width, WORLD_CONFIG.height);

      // B. Subtle Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_CONFIG.width; x += WORLD_CONFIG.gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_CONFIG.height);
      }
      for (let y = 0; y <= WORLD_CONFIG.height; y += WORLD_CONFIG.gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_CONFIG.width, y);
      }
      ctx.stroke();

      // C. Central Plaza / Atrium Ambient Elements
      const centerX = WORLD_CONFIG.width / 2;
      const centerY = WORLD_CONFIG.height / 2;

      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.06)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 180, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center crosshair marker
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX - 16, centerY);
      ctx.lineTo(centerX + 16, centerY);
      ctx.moveTo(centerX, centerY - 16);
      ctx.lineTo(centerX, centerY + 16);
      ctx.stroke();

      // Plaza label
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MAIN ATRIUM', centerX, centerY + 30);
      ctx.restore();

      // D. Visual Zones / Placeholders
      ZONES.forEach((zone) => {
        ctx.save();

        // Zone background tint
        ctx.fillStyle = zone.bg;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 12);
          ctx.fill();
        } else {
          ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        }

        // Zone dashed border
        ctx.strokeStyle = zone.border;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 12);
          ctx.stroke();
        } else {
          ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
        }
        ctx.setLineDash([]);

        // Zone Header / Title
        ctx.font = '700 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = zone.accent;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(zone.name, zone.x + 22, zone.y + 20);

        // Zone Subtitle
        ctx.font = '400 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.fillText(zone.subtitle, zone.x + 22, zone.y + 38);

        // Simple placeholder interior markers (tables / pods)
        ctx.strokeStyle = zone.border;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        const innerX = zone.x + 25;
        const innerY = zone.y + 65;
        const innerW = zone.width - 50;
        const innerH = zone.height - 85;

        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(innerX, innerY, innerW, innerH, 8);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(innerX, innerY, innerW, innerH);
          ctx.strokeRect(innerX, innerY, innerW, innerH);
        }

        // Placeholder tag in center of inner zone
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          'Workspace Zone Placeholder',
          innerX + innerW / 2,
          innerY + innerH / 2
        );

        ctx.restore();
      });

      // E. Outer World Boundaries (visible boundary wall)
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, WORLD_CONFIG.width, WORLD_CONFIG.height);

      // Boundary corner accent marks
      const cornerSize = 18;
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(0, cornerSize);
      ctx.lineTo(0, 0);
      ctx.lineTo(cornerSize, 0);
      // Top-Right
      ctx.moveTo(WORLD_CONFIG.width - cornerSize, 0);
      ctx.lineTo(WORLD_CONFIG.width, 0);
      ctx.lineTo(WORLD_CONFIG.width, cornerSize);
      // Bottom-Left
      ctx.moveTo(0, WORLD_CONFIG.height - cornerSize);
      ctx.lineTo(0, WORLD_CONFIG.height);
      ctx.lineTo(cornerSize, WORLD_CONFIG.height);
      // Bottom-Right
      ctx.moveTo(WORLD_CONFIG.width - cornerSize, WORLD_CONFIG.height);
      ctx.lineTo(WORLD_CONFIG.width, WORLD_CONFIG.height);
      ctx.lineTo(WORLD_CONFIG.width, WORLD_CONFIG.height - cornerSize);
      ctx.stroke();
      ctx.restore();

      // ----------------------------------------------------
      // DRAW LOCAL PLAYER
      // ----------------------------------------------------
      const px = player.x;
      const py = player.y;
      const r = player.radius;

      ctx.save();

      // 1. Subtle drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.9, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Avatar Circular Body
      const gradient = ctx.createLinearGradient(px - r, py - r, px + r, py + r);
      gradient.addColorStop(0, '#6366f1'); // Indigo accent
      gradient.addColorStop(1, '#4338ca'); // Deep indigo
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Avatar crisp border
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 3. User Initials inside avatar
      const initials = getInitials(player.username);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, px, py + 0.5);

      // 4. Subtle Online Presence Dot (bottom-right edge of avatar)
      const dotAngle = Math.PI / 4; // 45 degrees
      const dotX = px + Math.cos(dotAngle) * (r - 2);
      const dotY = py + Math.sin(dotAngle) * (r - 2);

      // Outer dark ring
      ctx.fillStyle = '#0b0f19';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Emerald presence dot
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 5. Visual "YOU" Badge and Username above avatar
      // Avatar top edge is py - r (py - 22)
      // Username text
      const nameY = py - r - 8;
      ctx.font = '600 12.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Soft text halo for high contrast readability
      ctx.strokeStyle = 'rgba(11, 15, 25, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(player.username, px, nameY);

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(player.username, px, nameY);

      // "YOU" Badge above username (non-overlapping)
      const badgeH = 13;
      const badgeW = 28;
      const badgeY = nameY - 14 - badgeH - 2;
      const badgeX = px - badgeW / 2;

      ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.strokeStyle = 'rgba(165, 180, 252, 0.4)';
      ctx.lineWidth = 1;

      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
      }

      ctx.font = '700 8.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#c7d2fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU', px, badgeY + badgeH / 2);

      ctx.restore();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onZoneChange]);

  return (
    <div
      className="virtual-office-container"
      ref={containerRef}
      onClick={() => canvasRef.current?.focus()}
    >
      <canvas
        ref={canvasRef}
        className="virtual-office-canvas"
        tabIndex={0}
        aria-label="ProxiSpeak 2D Virtual Office Canvas"
      />
    </div>
  );
}
