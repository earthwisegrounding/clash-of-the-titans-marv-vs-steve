# Clash of the Titans: Marv vs Steve

A standalone edition of the Marv Reeves game: one-on-one combat against Steve on the Bremerton waterfront. Both fighters dance on the title screen through all three supplied dances each.

## Play

WASD / arrows move, Shift runs, J punches, K kicks, Space jumps, drag turns the camera, Escape pauses. Touch movement and action buttons are included.

Marv has 100 health. Steve has 600 health, pursues Marv, blocks attacks, and winds up a charged strike for 22 damage. Jump or retreat, then counterattack. Punches deal 38 damage and cost 13 stamina; kicks deal 62 and cost 24. Retreat beyond 6 meters for 5 seconds to regenerate health. Win, lose, pause, replay, and return to the dancing title screen.

## Development

Node 24 recommended. Run `npm ci`, `npm test`, `npm run dev`, or `npm run build`. GitHub Actions publishes `dist` to GitHub Pages on main.

Tests load the real character meshes and animations, check all eight Steve clips, both title dancers at five viewport sizes, blocking, damage, evasion, pursuit, victory, defeat and replay. Music lifecycle tests cover autoplay fallback, gestures, mute and cleanup.

## Assets

Marv, Steve, their animations, and the music are supplied project assets. Steve was consolidated from bigdaddy.zip with Blender, reducing duplicate skins and textures. The original game remains separate. Environment texture credits are in public/assets/texture-credits.json.
