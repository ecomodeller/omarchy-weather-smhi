// weather.json holds {"name": ..., "latitude": ..., "longitude": ...} (see
// omarchy-weather-location, which owns the format). Missing, blank, or
// unparseable means the location is auto-detected from the IP address.
function parseLocationFile(raw) {
  var unset = { name: "", latitude: null, longitude: null }
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return unset

    var latitude = parseFloat(data.latitude)
    var longitude = parseFloat(data.longitude)
    var hasCoordinates = !isNaN(latitude) && !isNaN(longitude)
    return {
      name: typeof data.name === "string" ? data.name.replace(/^\s+|\s+$/g, "") : "",
      latitude: hasCoordinates ? latitude : null,
      longitude: hasCoordinates ? longitude : null
    }
  } catch (e) {
    return unset
  }
}

// wttr.in path segment for a configured location: exact coordinates when
// both are present, the URL-encoded name as a fallback (hand-edited
// weather.loc files may only carry a name), empty for IP auto-detect.
function wttrLocationQuery(location, latitude, longitude) {
  var lat = parseFloat(String(latitude))
  var lon = parseFloat(String(longitude))
  if (!isNaN(lat) && !isNaN(lon)) return lat + "," + lon

  var name = String(location || "").replace(/^\s+|\s+$/g, "")
  return name === "" ? "" : encodeURIComponent(name)
}

// Open-Meteo geocoding response → suggestion rows for the location picker.
function parseGeocodingResults(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    var results = data.results
    if (!results || !results.length) return []

    var out = []
    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (!r || !r.name || r.latitude === undefined || r.longitude === undefined) continue
      var region = [r.admin1, r.country].filter(function(part) { return !!part }).join(", ")
      out.push({
        name: String(r.name),
        description: region,
        latitude: r.latitude,
        longitude: r.longitude
      })
    }
    return out
  } catch (e) {
    return []
  }
}

function locationCommit(text, suggestions, selectedIndex) {
  var name = String(text || "").replace(/^\s+|\s+$/g, "")
  if (name === "") return { name: "", latitude: null, longitude: null }

  var choices = suggestions || []
  var index = Math.max(0, Math.min(parseInt(selectedIndex, 10) || 0, choices.length - 1))
  var suggestion = choices[index]
  if (suggestion) return suggestion

  return { name: name, latitude: null, longitude: null }
}

function isFutureForecastDate(dateString, todayString) {
  if (!dateString) return false
  return String(dateString).slice(0, 10) > String(todayString || "")
}

function roundedTemp(value) {
  if (value === undefined || value === null || value === "") return ""
  var n = parseFloat(String(value))
  return isNaN(n) ? "" : String(Math.round(n))
}

function formatTemp(value) {
  if (value === undefined || value === null || value === "") return ""
  return value + "°C"
}

function dayName(dateString, formatter) {
  if (!dateString) return ""
  var d = new Date(dateString + "T12:00:00")
  if (isNaN(d.getTime())) return ""
  if (formatter) return formatter(d)
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()]
}

function openMeteoForecastDays(dailyForecastReport, todayString) {
  var daily = dailyForecastReport && dailyForecastReport.daily ? dailyForecastReport.daily : null
  if (!daily || !daily.time) return []

  var result = []
  for (var i = 0; i < daily.time.length && result.length < 3; ++i) {
    var date = daily.time[i]
    if (!isFutureForecastDate(date, todayString)) continue

    var maxC = daily.temperature_2m_max ? daily.temperature_2m_max[i] : ""
    var minC = daily.temperature_2m_min ? daily.temperature_2m_min[i] : ""
    result.push({
      date: date,
      maxtempC: roundedTemp(maxC),
      mintempC: roundedTemp(minC),
      openMeteoWeatherCode: daily.weather_code ? daily.weather_code[i] : null
    })
  }
  return result
}

// Open-Meteo bundles current conditions with the daily forecast request and
// answers far faster than wttr.in. Normalize them to wttr's
// current_condition shape so the panel can use either source
// interchangeably. Open-Meteo reports metric (°C, km/h); the panel shows wind in m/s.
function openMeteoCurrentCondition(dailyForecastReport) {
  var current = dailyForecastReport && dailyForecastReport.current ? dailyForecastReport.current : null
  if (!current || current.temperature_2m === undefined || current.temperature_2m === null) return null
  return {
    temp_C: roundedTemp(current.temperature_2m),
    FeelsLikeC: roundedTemp(current.apparent_temperature),
    windspeedKmph: roundedTemp(current.wind_speed_10m),
    windspeedMps: roundedTemp(current.wind_speed_10m / 3.6),
    windgustMps: roundedTemp(current.wind_gusts_10m / 3.6),
    humidity: roundedTemp(current.relative_humidity_2m),
    openMeteoWeatherCode: current.weather_code,
    isDay: current.is_day
  }
}

// SMHI snow1g point forecast → the Open-Meteo {current, daily} shape the panel
// already consumes, plus the hourly series for the 12-hour charts. Coverage is
// the Nordic area only; outside it SMHI answers 404 and the panel keeps its
// last report. API docs:
// https://opendata.smhi.se/metfcst/snow1gv1
// SMHI Wsymb2 (1–27) → WMO 4677 weather code. Sleet uses WMO 68/69
// ("rain and snow"), which Open-Meteo never emits but iconForOpenMeteoCode maps.
var SMHI_SYMBOL_TO_WMO = [null,
  0, 1, 2, 2, 3, 3, 45,         // 1 clear … 7 fog
  80, 81, 82, 95,               // 8–10 rain showers, 11 thunderstorm
  68, 69, 69, 85, 86, 86,       // 12–14 sleet showers, 15–17 snow showers
  61, 63, 65, 95,               // 18–20 rain, 21 thunder
  68, 69, 69, 71, 73, 75]       // 22–24 sleet, 25–27 snowfall

function smhiWeatherCode(symbol) {
  var code = SMHI_SYMBOL_TO_WMO[parseInt(String(symbol), 10)]
  return code === undefined ? null : code
}

// Steadman apparent temperature (no radiation term), as Open-Meteo uses.
// SMHI publishes no feels-like value. T in °C, rh in %, wind in m/s.
function apparentTemperature(t, rh, wind) {
  var e = rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t))
  return t + 0.33 * e - 0.70 * wind - 4.00
}

// Solar elevation above the horizon, in degrees (NOAA low-precision form).
function solarElevation(date, latitude, longitude) {
  var rad = Math.PI / 180
  var days = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000
  var g = (357.529 + 0.98560028 * days) * rad
  var q = 280.459 + 0.98564736 * days
  var lambda = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad
  var epsilon = (23.439 - 0.00000036 * days) * rad
  var declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda))
  var ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / rad
  var gmst = 280.46061837 + 360.98564736629 * days
  var hourAngle = (gmst + longitude - ra) * rad
  var lat = latitude * rad
  return Math.asin(Math.sin(lat) * Math.sin(declination)
    + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)) / rad
}

function localDateString(date) {
  function pad(n) { return (n < 10 ? "0" : "") + n }
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
}

function smhiAsOpenMeteo(smhiReport, latitude, longitude, now) {
  var series = smhiReport && smhiReport.timeSeries ? smhiReport.timeSeries : []
  if (series.length === 0) return null
  now = now || new Date()

  var nearest = null
  var nearestDist = Infinity
  var days = {}
  var order = []
  var hourly = []
  for (var i = 0; i < series.length; i++) {
    var step = series[i]
    var d = step.data || {}
    var time = new Date(step.time)
    if (isNaN(time.getTime()) || d.air_temperature === undefined) continue

    if (time.getTime() > now.getTime() - 30 * 60000 && hourly.length < 13) {
      hourly.push({
        time: time.getTime(),
        temperature: d.air_temperature,
        precipitation: d.precipitation_amount_mean !== undefined ? d.precipitation_amount_mean : 0,
        precipitationProbability: d.probability_of_precipitation,
        windSpeed: d.wind_speed,
        windGust: d.wind_speed_of_gust,
        weatherCode: smhiWeatherCode(d.symbol_code),
        isDay: solarElevation(time, latitude, longitude) > -0.833 ? 1 : 0
      })
    }

    var dist = Math.abs(time.getTime() - now.getTime())
    if (dist < nearestDist) { nearestDist = dist; nearest = { time: time, data: d } }

    var key = localDateString(time)
    var day = days[key]
    if (!day) { day = days[key] = { max: -Infinity, min: Infinity, code: null, noonDist: Infinity }; order.push(key) }
    day.max = Math.max(day.max, d.air_temperature)
    day.min = Math.min(day.min, d.air_temperature)
    var noonDist = Math.abs(time.getHours() + time.getMinutes() / 60 - 12)
    if (noonDist < day.noonDist) { day.noonDist = noonDist; day.code = smhiWeatherCode(d.symbol_code) }
  }
  if (!nearest) return null

  var c = nearest.data
  var daily = { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [] }
  for (var j = 0; j < order.length; j++) {
    daily.time.push(order[j])
    daily.temperature_2m_max.push(days[order[j]].max)
    daily.temperature_2m_min.push(days[order[j]].min)
    daily.weather_code.push(days[order[j]].code)
  }
  return {
    source: "smhi",
    current: {
      temperature_2m: c.air_temperature,
      apparent_temperature: apparentTemperature(c.air_temperature, c.relative_humidity, c.wind_speed),
      relative_humidity_2m: c.relative_humidity,
      wind_speed_10m: c.wind_speed * 3.6,
      wind_gusts_10m: c.wind_speed_of_gust * 3.6,
      weather_code: smhiWeatherCode(c.symbol_code),
      is_day: solarElevation(now, latitude, longitude) > -0.833 ? 1 : 0
    },
    daily: daily,
    hourly: hourly
  }
}

function currentIcon(current, fallback) {
  if (!current) return fallback || ""
  if (current.openMeteoWeatherCode !== undefined && current.openMeteoWeatherCode !== null)
    return iconForOpenMeteoCode(current.openMeteoWeatherCode, Number(current.isDay) === 0)
  if (current.weatherCode !== undefined && current.weatherCode !== null)
    return iconForCode(current.weatherCode, false)
  return fallback || ""
}

// wttr.in has no day/night flag. Use its icon only to fill an empty initial
// state, never to replace a day/night-aware icon resolved by Open-Meteo.
function provisionalCurrentIcon(current, resolvedIcon) {
  return resolvedIcon || currentIcon(current, "")
}

function weatherResponseCompletesSave(hasConfiguredCoordinates, source) {
  return hasConfiguredCoordinates ? source === "open-meteo" : source === "wttr"
}

function wttrNextForecastDays(report, todayString) {
  var days = report && report.weather ? report.weather : []
  var result = []
  for (var i = 0; i < days.length && result.length < 3; ++i) {
    if (isFutureForecastDate(days[i].date, todayString)) result.push(days[i])
  }
  return result
}

function buildForecastDays(report, dailyForecastReport, todayString) {
  var days = openMeteoForecastDays(dailyForecastReport, todayString)
  return days.length > 0 ? days : wttrNextForecastDays(report, todayString)
}

function bareTempForDay(day, kind) {
  if (!day) return ""
  var v = kind === "max" ? day.maxtempC : day.mintempC
  if (v === undefined || v === null || v === "") return ""
  return v + "°"
}

function dayIcon(day) {
  if (!day) return ""
  if (day.openMeteoWeatherCode !== undefined && day.openMeteoWeatherCode !== null)
    return iconForOpenMeteoCode(day.openMeteoWeatherCode)
  if (!day.hourly || day.hourly.length === 0) return ""

  var best = day.hourly[0]
  var bestDist = 9999
  for (var i = 0; i < day.hourly.length; ++i) {
    var t = parseInt(String(day.hourly[i].time || "0"), 10)
    var dist = Math.abs(t - 1200)
    if (dist < bestDist) {
      bestDist = dist
      best = day.hourly[i]
    }
  }
  return iconForCode(best.weatherCode, false)
}

function iconForOpenMeteoCode(code, night) {
  var c = parseInt(String(code || "0"), 10)
  if (c === 0) return iconForCode(113, night)
  if (c === 1 || c === 2) return iconForCode(116, night)
  if (c === 3) return iconForCode(119, night)
  if (c === 45 || c === 48) return iconForCode(143, night)
  if (c === 68 || c === 69) return iconForCode(317, night)
  if (c === 51 || c === 53 || c === 55 || c === 56 || c === 57 || c === 61) return iconForCode(266, night)
  if (c === 63 || c === 65 || c === 66 || c === 67 || c === 80 || c === 81 || c === 82) return iconForCode(308, night)
  if (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return iconForCode(338, night)
  if (c === 95 || c === 96 || c === 99) return iconForCode(389, night)
  return iconForCode(119, night)
}

function iconForCode(code, night) {
  var c = parseInt(String(code || "0"), 10)
  switch (c) {
    case 113: return night ? "" : ""
    case 116: return night ? "" : ""
    case 119: case 122: return ""
    case 143: case 248: case 260: return night ? "\ue346" : "\ue313"
    case 176: case 263: case 353: return night ? "" : ""
    case 179: case 227: case 230: case 323: case 326: case 368: return night ? "" : ""
    case 182: case 185: case 281: case 284: case 311: case 314:
    case 317: case 320: case 350: case 362: case 365: case 374: case 377: return ""
    case 200: case 386: case 389: case 392: case 395: return ""
    case 266: case 293: case 296: case 299: case 302: case 305: case 308: case 356: case 359: return ""
    case 329: case 332: case 335: case 338: case 371: return ""
    default: return ""
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    parseLocationFile: parseLocationFile,
    wttrLocationQuery: wttrLocationQuery,
    parseGeocodingResults: parseGeocodingResults,
    locationCommit: locationCommit,
    isFutureForecastDate: isFutureForecastDate,
    roundedTemp: roundedTemp,
    formatTemp: formatTemp,
    dayName: dayName,
    openMeteoForecastDays: openMeteoForecastDays,
    openMeteoCurrentCondition: openMeteoCurrentCondition,
    currentIcon: currentIcon,
    provisionalCurrentIcon: provisionalCurrentIcon,
    weatherResponseCompletesSave: weatherResponseCompletesSave,
    wttrNextForecastDays: wttrNextForecastDays,
    buildForecastDays: buildForecastDays,
    bareTempForDay: bareTempForDay,
    dayIcon: dayIcon,
    iconForOpenMeteoCode: iconForOpenMeteoCode,
    smhiWeatherCode: smhiWeatherCode,
    apparentTemperature: apparentTemperature,
    solarElevation: solarElevation,
    smhiAsOpenMeteo: smhiAsOpenMeteo,
    localDateString: localDateString,
    iconForCode: iconForCode
  }
}
