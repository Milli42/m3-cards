---
title: M3 Top Consumers Card
type: m3-top-consumers-card
category: energy
display: Top Consumers
summary: Ranking of the largest consumers, by kWh or cost
table_order: 6
section_order: 10
---

Replaces the native `energy-devices-graph` card: shows the biggest
individual consumers for a time range as a ranking, by default fed from
the devices section of the HA Energy dashboard.

<img src="docs/images/top-consumers-card.png" alt="Top Consumers Card" width="440">

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-top-consumers-card
source: energy
period: today
top_count: 7
```

### Data source and time range

- **`source: energy`** (default): reads the configured device statistic
  IDs from `energy/get_prefs` and loads their consumption for the chosen
  `period` (`today`, `yesterday`, `week`, `month`) via
  `recorder/statistics_during_period`. The header total is the sum of the
  MEASURED devices, not necessarily the entire home consumption.
- **`source: entities`**: a manual list of energy sensors (kWh) via
  `entities`, for when no Energy dashboard is set up or a custom selection
  is desired.
- Refreshes every 15 minutes. Devices with 0 kWh in the period are omitted
  entirely.

### Live power

Choose **Live** in the period picker to rank devices by current power. A thin
bar above the rows uses the device colors to show their shares. Add a whole-home
consumption sensor to show its current reading and the untracked remainder.
Without one, the bar shows the mix of tracked devices only. If a whole-home
reading is unavailable or lower than the device sum, the card explains why
it is using tracked power for device shares instead.

```yaml
type: custom:m3-top-consumers-card
period: live
power_entity: sensor.house_power    # Optional; use home load, not net grid import
power_entities:
  - entity: sensor.heat_pump_power
  - entity: sensor.office_power
    name: Office
  - entity: sensor.fridge_power
```

Use power sensors in W or kW, not energy meters in kWh. Off, unavailable,
and negative device readings do not appear in the ranking. The gauge includes
all active devices, even if some rows are collapsed or hidden. The card updates
as Home Assistant receives new readings; it does not query Recorder in Live
mode. `source`, `entities`, and cost settings apply only to historical periods.

### Ranking, overflow row, name cleanup

- Sorted descending by consumption. `top_count` (default 3) devices are
  shown as full rows with share bars.
- All remaining devices land, depending on `rest_mode`, in a collapsible
  overflow row (`collapse`, default), are omitted entirely (`hide`), or
  are also shown as full rows (`show_all`).
- `name_strip` removes regex/text patterns from entity names (default:
  `^Plug \d+ - ` and ` Energy$`); overridable per device via `name` in
  `entities` (an override disables cleanup for that device).
- Device colors are assigned cyclically from `palette` (default: 8 tones
  from the project's color system), fixed per device via `color`.
- Reordering on data refresh is smoothly animated (respects
  `animation`/`prefers-reduced-motion`).

### `unit_mode: cost` — rank by cost instead of kWh

```yaml
type: custom:m3-top-consumers-card
source: energy
unit_mode: cost
price_source: energy_dashboard
```

Ranks devices by cost instead of consumption (value per device = kWh ×
price). The price source (`price_source`) works identically to the M3 Cost
Card further below — see there for details on
`energy_dashboard`/`input_number`/`fixed`. Since HA doesn't keep a separate
cost statistic per device (only for total grid import), with
`price_source: energy_dashboard` an effective price is derived from total
cost ÷ total grid-import consumption for the chosen period. The row
subtitle becomes two-part ("{kWh} kWh · {x}% of cost"), header total and
overflow row appear in `currency`.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `energy` \| `entities` | `energy` | Data source |
| `entities` | list | – | Only for `source: entities` — `entity`, optionally `name`/`icon`/`color` |
| `period` | `live` \| `today` \| `yesterday` \| `week` \| `month` | `today` | Live power or historical time range |
| `power_entity` | string | – | Optional whole-home power sensor for `period: live` |
| `power_entities` | list | – | Device power sensors for `period: live` — `entity`, optionally `name`/`icon`/`color` |
| `top_count` | number | `3` | Number of full rows before the overflow row |
| `rest_mode` | `collapse` \| `hide` \| `show_all` | `collapse` | Behavior for devices beyond `top_count` |
| `name_strip` | string[] | see above | Regex/text patterns removed from entity names |
| `unit_mode` | `energy` \| `cost` | `energy` | Rank by kWh or by cost |
| `price_source` / `price_entity` / `price` / `price_unit` / `currency` | see M3 Cost Card | `energy_dashboard` | Only for `unit_mode: cost` |
| `name` | string | "Top Consumers" | Displayed name |
| `icon` | string | `mdi:trophy-outline` | Icon in the icon tile |
| `subtitle` | string | "{period} · {n} devices" | Subtitle override |
| `accent_color` | string | `#85b7eb`; `primary` on a card added from the card picker | Color of the header total |
| `palette` | string[] | see above | Cyclically assigned device colors |
| `text_color` / `secondary_text_color` | string | theme default | Name / subtitle & percentage row |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Reorder animation; `auto`/`on` respect `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
