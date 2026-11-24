---
title: M3 Energy Flow Card
type: m3-energy-flow-card
category: energy
display: Energy Flow
summary: Node diagram of today's solar/grid/home flows
table_order: 3
section_order: 6
---

A node diagram of today's energy flows between solar, grid, battery, and
home, with animated flow dots along the connection lines and a
self-sufficiency bar below.

<img src="docs/images/energy-flow-card.png" alt="Energy Flow Card" width="440">

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-energy-flow-card
source: energy
```

### Data sources

- **`source: energy`** (default): reads solar, grid import/export, and
  battery statistics directly from the HA Energy dashboard.
- **`source: entities`**: `solar_entity`, `grid_import_entity`,
  `grid_export_entity`, `battery_entity` are freely chosen — useful when
  no full Energy dashboard is set up or individual sources need to be
  replaced. The values update as the sensors change.

### The battery

With your own sensors `battery_entity` follows Home Assistant's convention:
**positive discharges, negative charges**. A sensor that counts the other way
round (many balcony batteries report charging as positive) takes
`battery_invert: true`. Daily energy usually comes as two sensors, "charged
today" and "discharged today": put the first in `battery_charge_entity` and
the second in `battery_entity`.

The home is what comes in (solar, import, discharge) less what goes elsewhere
(export, charge). That holds with `show_battery: never` too: a hidden battery
still keeps its charge out of the home's figure. If you have a consumption
sensor of your own, `home_entity` shows it instead.

```yaml
type: custom:m3-energy-flow-card
source: entities
solar_entity: sensor.solar_power
grid_import_entity: sensor.grid_import_power
battery_entity: sensor.battery_power # +9 W while charging
battery_invert: true
battery_soc_entity: sensor.battery_level
```

### Export

The grid node shows whichever way the grid is running: while the house feeds
in, its number is the export, its icon points out and its name reads
"Export". Over a day both happen — then the larger one is the number and the
other a small line under the name ("Import 3.1"). A single grid sensor that
goes negative on export works as `grid_entity`.

### Compact

`layout: compact` puts the nodes side by side — solar, grid, home, battery —
in one row about as tall as a weather or status tile, for a half-width slot.
A small arrow under each value says which way it runs relative to the home
tile, the home tile carries the self-sufficiency, and the battery icon fills
with its state of charge. The header is off unless `show_header: true`.

<img src="docs/images/energy-flow-compact.png" alt="Energy Flow Card, layout: compact — exporting and charging above, drawing from the grid below" width="400">

```yaml
type: custom:m3-energy-flow-card
layout: compact
source: entities
solar_entity: sensor.solar_power
grid_entity: sensor.grid_power        # negative while exporting
battery_entity: sensor.battery_power
battery_soc_entity: sensor.battery_level
```

### Compact power station (EcoFlow and similar)

Use `layout: power-station` for a compact two-row view. The top row reads live
solar input, AC input (including grid charging), and AC output directly from
your sensors, keeping their reported units. The bottom row shows the combined,
main, and extra battery percentages from the sensors you pick. No Energy dashboard
or battery power sensor is required; the card does not estimate battery watts or
calculate a combined percentage. Zero is shown as zero, and unavailable readings
are shown as `—`. Unconfigured battery tiles are omitted. This layout does not
show flow animations or a self-sufficiency estimate.
Tap any configured tile with an existing entity to open Home Assistant's
More info dialog and see that sensor's history.

In the visual editor, choose **Power station: two rows** under Content → Layout,
then pick your sensors under Entities. Replace the sample entity IDs below with yours.
The header is hidden by default; set `show_header: true` if you want a title.

```yaml
type: custom:m3-energy-flow-card
layout: power-station
solar_entity: sensor.ecoflow_solar_input
grid_import_entity: sensor.ecoflow_ac_input
home_entity: sensor.ecoflow_ac_output
battery_soc_entity: sensor.ecoflow_combined_battery
main_battery_soc_entity: sensor.ecoflow_main_battery
extra_battery_soc_entity: sensor.ecoflow_extra_battery
```

### Water flow gauge (Flume and similar)

Add a second M3 Energy Flow card and choose **Content → Layout → Water: flow gauge**.
Under **Entities**, select Flume's **Current** water flow sensor (not its daily or
monthly usage total). The card displays the current rate in the sensor's own units,
with waves that move while the rate is positive and stay still at zero or when
the sensor is unavailable. Tap the gauge to open the sensor's More info and history.

To show usage under the gauge, set **Daily water usage sensor** to Flume's
**Current day** and **Monthly water usage sensor** to **Current month**. Use the
period totals, not the rolling **24 hours** or **30 days** sensors. Either field
can be left blank. Each total keeps its own unit, shows `—` if unavailable, and
opens its sensor details when tapped. The card does not calculate these totals.

```yaml
type: custom:m3-energy-flow-card
layout: water
name: Flume Water Flow
water_entity: sensor.flume_current_flow # replace with your current-flow entity
water_daily_entity: sensor.flume_current_day # optional; replace with your daily total
water_monthly_entity: sensor.flume_current_month # optional; replace with your monthly total
water_max: 10 # scale maximum in the sensor's units, e.g. 10 gal/min
```

Set **Gauge maximum** (optional, default `10`) to a useful upper end for your
normal use. A rate above it still displays the full reading. Set `animation: "off"`
to keep the waves still; the card also respects reduced motion. No Energy Dashboard
setup is needed. The card updates as Home Assistant receives new sensor readings.

### Energy or power

With your own sensors the card follows their unit. Energy sensors (Wh,
kWh, MWh) show the day: "Today", `· kWh`, "Self-sufficiency today". If
every sensor reports **power** (W or kW), the card shows the flow right
now instead: "Now", `· W` (`· kW` from 1000 W) and "Self-sufficiency now".

Names, unit and subtitle can be set yourself:

```yaml
type: custom:m3-energy-flow-card
source: entities
solar_entity: sensor.pv_power
grid_import_entity: sensor.grid_import_power
grid_export_entity: sensor.grid_export_power
pv_name: Roof
grid_name: Grid
home_name: Flat
subtitle: Live
unit: W              # W, kW, Wh, kWh, MWh convert the numbers; other text is a label
```

The battery node automatically appears only if a battery source is
configured (`show_battery: auto`, default) — `always`/`never` force its
visibility regardless.

### Animation

The flow dots run via a CSS animation along the lines
(`flow_speed: slow | normal | fast`) and are omitted entirely (not just
paused) when `animation: "off"` or `prefers-reduced-motion` is active.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `energy` \| `entities` | `energy` | Data source |
| `solar_entity` / `grid_import_entity` / `grid_export_entity` / `battery_entity` | string | – | For `source: entities`; `power-station` uses only solar and grid import from this group. See [The battery](#the-battery) for the sign of `battery_entity` |
| `grid_entity` | string | – | Only for `source: entities` — one signed grid sensor instead of the import/export pair: positive draws from the grid, negative feeds in |
| `grid_invert` | boolean | `false` | `grid_entity` counts export as positive |
| `layout` | `full` \| `compact` \| `power-station` \| `water` | `full` | `compact`: one row of flow nodes. `power-station`: direct sensor readings. `water`: current water flow gauge. Both direct layouts are independent of `source` |
| `water_entity` | string | – | Current water flow rate sensor used in `water` |
| `water_daily_entity` | string | – | Optional volume used today, shown in `water` |
| `water_monthly_entity` | string | – | Optional volume used this month, shown in `water` |
| `water_max` | number | `10` | Water gauge maximum, in the sensor's own units |
| `detail_mode` | `more_info` \| `sheet` | `more_info` | Details opened when tapping a sensor in `power-station` or `water` |
| `show_header` | boolean | `true` for `full` only | The header with name and subtitle |
| `battery_invert` | boolean | `false` | `battery_entity` counts charging as positive |
| `battery_charge_entity` | string | – | A separate charge sensor; `battery_entity` is then the discharge alone |
| `battery_soc_entity` | string | – | State of charge in %, or the combined battery level in `power-station` |
| `main_battery_soc_entity` / `extra_battery_soc_entity` | string | – | Individual battery charge percentages in `power-station` |
| `home_entity` | string | – | Measured consumption for `source: entities`, or measured AC output for `power-station` |
| `name` | string | "Energy Flow" | Displayed name |
| `subtitle` | string | "Today", or "Now" for power sensors | Line under the name |
| `pv_name` / `grid_name` / `home_name` / `battery_name` | string | Solar / Grid / Home / Battery | Node names |
| `unit` | string | kWh, or W/kW for power sensors | Unit under the nodes; W, kW, Wh, kWh and MWh also convert the numbers |
| `icon` | string | `mdi:transmission-tower` | Icon in the icon tile |
| `show_self_sufficiency` | boolean | `true` | Show the self-sufficiency bar |
| `show_battery` | `auto` \| `always` \| `never` | `auto` | Battery node visibility |
| `flow_speed` | `slow` \| `normal` \| `fast` | `normal` | Flow dot speed |
| `pv_color` / `grid_color` / `home_color` / `battery_color` | string | theme default | Node colors |
| `self_sufficiency_color` | string | `#81c784` | Self-sufficiency bar color |
| `text_color` / `secondary_text_color` | string | theme default | Name / node labels |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Flow-dot or water-wave animation; `auto`/`on` respect `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
