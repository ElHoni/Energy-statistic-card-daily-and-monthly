# Energy-statistic-card-daily-and-monthly
Have a look to your energy and compare with last year
Monthly energy consumption with year-on-year comparison

I have created the card as a custom card in `energy-yoy-card.js`.

Installation

Copy the file to `/config/www/energy-yoy-card.js`.
Under Settings → Dashboards → Resources, add the URL `/local/energy-yoy-card.js` as a JavaScript module.
Reload your browser or app and add the card using the "Add card" option.

Example configuration
type: custom:energy-yoy-card
title: Verbrauch
entities:
  - sensor.strom_gesamt
  - sensor.gas_zaehler
  - sensor.wasser_zaehler

What the card does

Entity selection: If multiple entries are provided under `entities`, a selection menu appears at the top. The most recent selection is remembered. If no entity is specified, the card automatically searches for energy, gas, and water sensors with a `state_class` of `total` or `total_increasing`.
Comparison: Each bar represents a single day, with a fainter bar behind it showing the corresponding calendar day from the previous year. Above the bars, the totals for both periods are displayed, along with the percentage difference. Lower consumption is shown in green, higher consumption in red.
Details: Tapping on a specific day reveals the value for that day, the value from the previous year, and the difference between them.


Important

The data is sourced from long-term statistics. Therefore, the entity must have a `state_class` and at least one year of history; otherwise, the year-over-year comparison will not be available.
Data for the current day is incomplete, which will result in a lower value.
You can adjust the time frame by using the `days` parameter (e.g., `days: 14`).

The chart uses color as follows:

Daily bars: Red if the value for the day is higher than that of the same day in the previous year; green if it is lower. If no prior-year value is available, the bar remains in the primary color.
Overall comparison: The percentage variance shown at the top is also displayed in red or green.
Details: When you tap on a specific day, the value is shown in the corresponding color.

The bar for the previous year remains visible behind the current bar as a neutral shade of gray.



Yearly energy consumption with year-on-year comparison

The monthly card is available as a new file: `energy-yoy-monthly-card.js`.

Installation is the same as for the first card: copy it to `/config/www/` and add it under Resources as `/local/energy-yoy-monthly-card.js` (JavaScript module).

Example configuration
type: custom:energy-yoy-monthly-card
entity: sensor.gas_zaehler
title: Gas

The chart displays the last 12 months, with each month compared to the corresponding month from the previous year. The color coding functions the same way as in the daily chart:

Monthly bars: Red indicates higher consumption, while green indicates lower consumption compared to the same month in the previous year. The data for the previous year is shown as a gray bar behind the current one.
Header: This displays the total for the 12-month period, the total for the preceding 12-month period, and the percentage variance—also color-coded in red or green.
Details: Tapping on a specific month reveals the current value, the value from the previous year, the difference, and the percentage change.
Number of months: You can adjust the time frame by changing the number of months (e.g., to 6 or another value).
The current month is not yet complete, which is why it typically appears green. Consequently, the total variance mentioned above may initially appear somewhat more favorable than it actually is, until the month has concluded.



