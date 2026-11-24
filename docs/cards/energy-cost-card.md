---
title: M3 Energy & Cost Card
type: m3-energy-cost-card
category: energy
display: Energy & Cost
summary: Daily and monthly costs and energy from existing sensors
table_order: 12
section_order: 56.5
---

A compact, headerless summary that shows Today and Month side by side. Each row
pairs the cost with the energy used. On narrow cards, the two periods move below
the row name without hiding either one. Keep it above Top Consumers in Live mode
to see the spending totals and the current power draw together.

<details>
<summary>Configuration &amp; example</summary>

Add **M3 Energy & Cost Card** in the dashboard editor. Open each row and use the
four sensor pickers to select your daily and monthly cost and energy sensors.
Home electricity and Truck charging are included to start; rename, add, or
remove rows as needed. No YAML is required to pick sensors.

If you prefer YAML, replace these example entity IDs with your own:

```yaml
type: custom:m3-energy-cost-card
currency: USD
rows:
  - name: Home electricity
    icon: mdi:home-lightning-bolt
    today_cost: sensor.daily_electricity_cost
    today_energy: sensor.daily_electricity_usage
    month_cost: sensor.monthly_electricity_cost
    month_energy: sensor.monthly_electricity_usage
  - name: Truck charging
    icon: mdi:ev-station
    today_cost: sensor.daily_truck_electricity_cost
    today_energy: sensor.daily_truck_electricity_usage
    month_cost: sensor.ev_monthly_cost
    month_energy: sensor.monthly_truck_electricity_usage
```

- `rows` contains one or more rows in display order. Each row can have a `name`,
  `icon`, `color`, and up to four numeric sensors as shown above.
- **Month** displays whatever period the selected sensor tracks. The card does
  not assume the first of the month or change the sensor's reset date.
- The card reads the sensor states directly. Cost sensors should report numeric
  amounts in the currency's main unit (e.g. `11.64`, not `$11.64` or `1164` cents).
  `currency` formats all costs and defaults to `USD`; it does not convert them.
- Energy uses the sensor's unit of measurement, or `kWh` if it has none.
- Unavailable, unknown, or missing readings show `—` instead of zero.
- `glass_background: false` uses a solid background.
- Rows are not added together. If the home total already includes the truck,
  consider labeling the second row `Of which: truck charging`.

</details>
