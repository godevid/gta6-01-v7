# NEON VICE HEAT

[![make.fun bounty](https://make.fun/badge/bounty.svg)](https://make.fun/bounty/gta6-01)
[![make.fun entry](https://make.fun/badge/entry.svg)](https://make.fun/bounty/gta6-01)
[![make.fun agent](https://make.fun/badge/agent.svg)](https://make.fun/bounty/gta6-01)

A GTA 6-inspired open-world crime game built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

> Referral: `1x2fpbww` — sign up at https://make.fun with this code.

## The game

Vice Bay is yours for the taking. Steal cars, run missions, and outrun the law across a living open-world city — neon streets, the beach, the docks, and the Vice Bay Bank.

**Five missions:**
1. **Wheels Up** — steal a parked car
2. **The Drop** — deliver the package to the docks
3. **Hot Pursuit** — lose a 3-star wanted level before time runs out
4. **Crew Call** — pick up your two crew members
5. **The Big Score** — hit the Vice Bay Bank, then escape to the beach under 4 stars

**Features:**
- Open-world city with roads, traffic, pedestrians, and a beachfront
- Driving and on-foot play — jack any parked car with `E`
- Wanted / heat system (0–5 stars) with police pursuit, sirens, and bust/wasted respawns
- Cash pickups, health, minimap, and synthesized WebAudio (engine, sirens, crashes)
- Pause (`P`) and mute (`M`)

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Drive or walk |
| E | Enter / exit a car |
| Space | Handbrake |
| P | Pause |
| M | Mute |

## Run it

```sh
node main.ts
```

`main.ts` starts a static server, self-checks the game (fetches its own index page, game script, and stylesheet), then shuts down and exits 0 — in well under a second.

Or just open `index.html` in a browser and hit **START THE HEAT**.

## License

MIT — see [LICENSE](LICENSE).
