---
title: M3 Switches Overview Card
type: m3-switches-overview-card
category: light
display: Switches Overview
summary: Switches and input booleans grouped by area, with individual controls in a room popup
table_order: 4.5
section_order: 36.5
---

A room-by-room overview of Home Assistant switches and input booleans. Each
room tile shows its on/off state and how many switches are on. The header
counts rooms with an active switch and the total number of active switches.

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-switches-overview-card
auto_discover: true
exclude_entities:
  - switch.coffee_machine
```

### Room controls

Tap or hold any room tile to open its popup, including rooms with a single
switch. Tap an individual switch tile in the popup or in the main card’s
`view: entities` mode to toggle that switch.

### Entity source and filters

Auto-discovery groups `switch.*` and `input_boolean.*` by their Home Assistant
area, using the device's area when the entity has no area of its own.
Use `include_area`, `exclude_area`, `include_labels`, `exclude_labels`,
`include_entities`, and `exclude_entities` to narrow the results. State
filters (`include_state` and `exclude_state`) update as entities change state.

Define `rooms` to group entities manually, including entities without an
area. Manual rooms support the entity ID and state filters.

```yaml
type: custom:m3-switches-overview-card
name: Utility switches
rooms:
  - name: Garage
    icon: mdi:garage
    entities:
      - switch.workbench
      - input_boolean.garage_notifications
  - name: Laundry
    entities:
      - switch.laundry_fan
```

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `auto_discover` | boolean | `true` | Find switches and input booleans assigned to areas |
| `rooms` | list | — | Manual rooms with `name`, optional `icon`, and `entities` |
| `include_area` / `exclude_area` | list | — | Filter by area ID |
| `include_labels` / `exclude_labels` | list | — | Filter by entity or device label ID |
| `include_entities` / `exclude_entities` | list | — | Filter by entity ID |
| `include_state` / `exclude_state` | list | — | Filter by current state |
| `view` | string | `rooms` | Choose `rooms` or `entities` for individual switch tiles |
| `sort` | string | `name` | Sort by `name`, `area`, or `on_first` |
| `name` / `icon` | string | Localized name and toggle icon | Override the header name or icon |
| `show_header` | boolean | `true` | Show the title and summary |
| `show_count` | boolean | `true` | Show the on/total count on room tiles |
| `show_area` | boolean | `true` | Show the room name in the entities view |
| `hide_empty_rooms` | boolean | `false` | Hide rooms without matching entities |
| `shape_by_state` | boolean | `false` | Round off tiles and square on tiles |
| `on_color` | string | `#4CAF50` | Active tile color as a theme color name or CSS color |
| `off_color` | string | Theme default | Off tile color as a theme color name or CSS color |
| `accent_color` | string | `on_color` | Header icon accent as a theme color name or CSS color |
| `tile_tint_opacity` / `accent_opacity` | number | — | Tile and header icon background tint percentages |
| `text_color` / `secondary_text_color` / `card_background` | string | Theme default | Override card text and background colors |
| `glass_background` | boolean | `true` | Enable the glass background |
| `radius` / `corners` | number / object | Theme default | Set the card radius or individual corners |
| `animation` | string | `auto` | Choose `auto`, `on`, or `off` |

</details>
