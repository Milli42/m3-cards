---
title: M3 Openings Card
type: m3-openings-card
category: presence
display: Openings
summary: Windows and doors — what is open, for how long, and a warning when it is cold outside
table_order: 4
section_order: 49
---

Track windows, doors, gates, garages and locks in one card. Open and unlocked
items show how long they have held that state. When everything is closed and
locked, the card folds to one line.

<img src="docs/images/openings-card.png" alt="Openings Card" width="440">

<details>
<summary>Configuration, examples & options</summary>

### Find them yourself

```yaml
type: custom:m3-openings-card
outdoor_temperature: sensor.outdoor_temperature
```

Without `entities` the card finds binary sensors of class `door`, `window`,
`opening` or `garage_door`, covers of class `garage`, `gate` or `door`, and
all locks. `include_area`, `include_label` and `exclude_entities` narrow
discovery. In discovery mode, entries under `entities` customize the matching
entities. When a listed cover shares a device with a listed binary sensor, the
cover represents that device.

### Or name them

```yaml
type: custom:m3-openings-card
title: Windows and doors
entities:
  - binary_sensor.bathroom_window          # the bare id works
  - cover.garage_door
  - lock.front_door
  - entity: binary_sensor.balcony_door
    name: Balcony door
    icon: mdi:door-sliding
    tap_action:
      action: navigate
      navigation_path: /lovelace/balcony
outdoor_temperature: sensor.outdoor_temperature
warn_after_minutes: 15
cold_below: 10
max_chips: 4
```

A list turns discovery off; `auto_discover: true` turns it back on.

### What it shows

- **Open or unlocked:** the header counts closed covers, closed sensors and
  locked locks together. Rows show how long each item has been open or
  unlocked, using recorder history when available. Covers show Opening or
  Closing while moving. Use **Close** or **Lock** to act directly from the row.
- **Cold warning:** a door or window binary sensor, or a door, gate or garage
  cover, shows an outdoor-temperature pill after `warn_after_minutes` when
  the reading is below `cold_below`. Without a usable outdoor reading,
  eligible rows highlight the duration on time alone.
- **Closed or locked:** green chips show closed sensors and covers with a check
  and locked locks with a lock icon. Unreachable and jammed items appear first
  with a warning icon and are excluded from the closed count.
- **All closed or secure:** the card shows one line with an **All closed** pill,
  or **All secure** when the list includes a cover or lock. Tap the secure
  header to reveal **Open** and **Unlock** controls, then tap it again to fold
  them away. Device buttons send their commands immediately and separately
  from the row's tap action.
- Tap a row or chip to open details or run the configured `tap_action`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `entities` | — | Binary sensors, covers and locks, as ids or `{entity, name, icon, tap_action}` |
| `auto_discover` | `true` without `entities` | Discover opening sensors, eligible covers and locks |
| `include_area`, `include_label`, `exclude_entities` | — | Narrow discovery |
| `include_covers` | `true` | Discover garage, gate and door covers |
| `include_locks` | `true` | Discover lock entities |
| `show_open_controls` | `true` | Let the secure header expand to show Open and Unlock buttons |
| `title`, `icon` | "Windows and doors", by state | Header |
| `outdoor_temperature` | — | Temperature sensor for the cold warning |
| `warn_after_minutes` | `15` | Minutes open before a row warns |
| `cold_below` | `10` | Outdoor temperature below which it warns |
| `max_chips` | `4` | Chips before "+N" |
| `tap_action` | `more-info` | For every row and chip |
| `color_open`, `color_warn`, `color_closed` | amber, red, green | The three states |
| `card_background`, `text_color`, `secondary_text_color` | — | The card's own colours |
| `animation`, `haptics`, `glass_background`, `radius`, `corners`, `detail_mode` | — | The usual shared options |

</details>
