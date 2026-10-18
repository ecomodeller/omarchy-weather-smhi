# omarchy-weather-smhi

An Omarchy shell weather plugin that shows SMHI point forecasts in the bar's weather panel.
SMHI's vocabulary (the `snow1g` API) and Omarchy's (the inherited `omarchy.weather` plugin) meet here; terms owned by either are linked, not redefined.

## Language

### Forecast

**Point forecast**:
SMHI's forecast timeseries for one grid point, as returned by one `snow1g` request.
_Avoid_: weather report (wttr.in's word for its own response), forecast data

**Grid point**:
The SMHI model grid location a point forecast is actually computed for; the nearest one to the requested coordinates.
_Avoid_: station (that is an observation site, not a model point)

**Timestep**:
One entry of a point forecast's `timeSeries`, valid at one time.
_Avoid_: time step, interval, period

**Hourly series**:
The 13 consecutive one-hour timesteps starting at the current hour that the 12-hour charts plot.
_Avoid_: hourly forecast, next hours

**Daily forecast**:
A local calendar day's high, low and condition, aggregated from the timesteps that fall on it.
_Avoid_: day forecast, forecast day (the inherited code's word for one entry)

### Conditions

**Weather symbol**:
SMHI's `symbol_code` (Wsymb2, 1–27) describing a timestep's conditions.
_Avoid_: icon, weather type

**Weather code**:
The WMO 4677 code a weather symbol is mapped to, which selects the icon.
_Avoid_: condition code, Open-Meteo code

**Apparent temperature**:
The temperature computed from air temperature, relative humidity and wind speed with Steadman's formula; shown in the panel as "feels".
_Avoid_: feels-like (UI label only), wind chill (a different quantity)

### Plugin

**Location**:
The stored `{name, latitude, longitude}` the forecast is fetched for.
_Avoid_: place, city, area (wttr.in's `nearest_area`)

**Data source**:
The service that answered the last point-forecast fetch; always SMHI in this plugin.
_Avoid_: provider (see *Flagged ambiguities*)

## Relationships

- A **location** resolves to one **grid point**; one **point forecast** belongs to that grid point.
- A **point forecast** has many **timesteps**; each timestep has one **weather symbol**, which maps to one **weather code**.
- The **hourly series** is the first 13 hourly **timesteps** from now; a **daily forecast** aggregates all timesteps on one local date.

## Inherited vocabulary

- From SMHI's [`snow1g` parameter list](https://opendata.smhi.se/metfcst/snow1gv1/parameters): `air_temperature`, `precipitation_amount_mean`, `probability_of_precipitation`, `wind_speed`, `symbol_code`.
- From the Omarchy shell (upstream plugin `omarchy.weather`): **bar widget**, **panel**, **plugin**, **clone**.

## Flagged ambiguities

### Resolved

- **Open-Meteo names in code.** The panel's internals (`openMeteoCurrent`, `iconForOpenMeteoCode`) keep upstream's names because SMHI data is converted to that response format. They name a format, not a data source.

### Open

- **Data source vs provider.** The DHI family hasn't settled whether a data-publishing service is a *Provider* or a *Source* (see marine-observations' `GLOSSARY.md`). This repo says *data source* in prose and code (`dataSource`). Cost of switching later: one property and the README.
