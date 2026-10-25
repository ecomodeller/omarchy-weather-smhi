import QtQuick
import qs.Commons
import "Model.js" as Model

// Next 12 hours from the SMHI hourly series: condition icons every third hour,
// a temperature line and precipitation bars on one shared time axis. Each chart
// has its own scale; hovering reads out every value for that hour.
Item {
  id: root

  // [{time, temperature, precipitation, precipitationProbability, windSpeed, windGust, weatherCode, isDay}]
  property var hours: []
  property color foreground: Color.foreground
  property string fontFamily: ""

  readonly property color mutedColor: Qt.darker(foreground, 1.5)
  readonly property int count: hours ? hours.length : 0
  readonly property real padX: Style.space(14)
  readonly property real stepX: count > 1 ? (width - 2 * padX) / (count - 1) : 0
  readonly property real tempHeight: Style.space(56)
  readonly property real precipHeight: Style.space(30)
  readonly property real labelRoom: Style.space(16)
  property int hoverIndex: -1

  readonly property var temps: hours.map(function(h) { return h.temperature })
  readonly property real tempMax: Math.max.apply(null, temps)
  readonly property real tempMin: Math.min.apply(null, temps)
  readonly property int tempMaxIndex: temps.indexOf(tempMax)
  readonly property int tempMinIndex: temps.indexOf(tempMin)
  // Light rain should look light: the bar scale never drops below 1 mm/h.
  readonly property real precipScale: Math.max(1, Math.max.apply(null, hours.map(function(h) { return h.precipitation })))
  readonly property real precipTotal: hours.slice(1).reduce(function(sum, h) { return sum + h.precipitation }, 0)

  implicitHeight: column.implicitHeight

  function xFor(i) { return padX + i * stepX }

  function hourLabel(i) {
    return Qt.formatTime(new Date(hours[i].time), "HH")
  }

  function readout(i) {
    var h = hours[i]
    var parts = [Qt.formatTime(new Date(h.time), "HH:mm"),
                 Math.round(h.temperature) + "°",
                 h.precipitation.toFixed(1) + " mm"]
    if (h.precipitationProbability !== undefined) parts.push(h.precipitationProbability + "%")
    parts.push(Math.round(h.windSpeed) + (h.windGust !== undefined ? " (" + Math.round(h.windGust) + ")" : "") + " m/s")
    return parts.join("  ·  ")
  }

  onHoursChanged: { tempCanvas.requestPaint(); precipCanvas.requestPaint() }
  onWidthChanged: { tempCanvas.requestPaint(); precipCanvas.requestPaint() }
  onHoverIndexChanged: { tempCanvas.requestPaint(); precipCanvas.requestPaint() }
  onForegroundChanged: { tempCanvas.requestPaint(); precipCanvas.requestPaint() }

  Column {
    id: column
    width: parent.width
    spacing: Style.space(6)

    // Title, replaced by the hovered hour's values.
    Text {
      width: parent.width
      text: root.hoverIndex >= 0 ? root.readout(root.hoverIndex) : "NEXT 12 HOURS"
      color: root.hoverIndex >= 0 ? root.foreground : root.mutedColor
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.letterSpacing: root.hoverIndex >= 0 ? 0 : 1
    }

    Item {
      width: parent.width
      height: iconRow.height + root.tempHeight + root.precipHeight + root.labelRoom + Style.space(4)

      // Condition icon every third hour.
      Item {
        id: iconRow
        width: parent.width
        height: Style.space(20)
        Repeater {
          model: root.count
          Text {
            visible: index % 3 === 0
            x: root.xFor(index) - width / 2
            text: Model.iconForOpenMeteoCode(root.hours[index].weatherCode, root.hours[index].isDay === 0)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
          }
        }
      }

      Canvas {
        id: tempCanvas
        y: iconRow.height
        width: parent.width
        height: root.tempHeight
        renderStrategy: Canvas.Cooperative

        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          if (root.count < 2) return

          var labelPad = Style.font.bodySmall + 4
          var top = labelPad
          var bottom = height - labelPad
          var lo = root.tempMin, hi = root.tempMax
          if (hi - lo < 2) { var mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1 }
          function yFor(t) { return bottom - (t - lo) / (hi - lo) * (bottom - top) }

          if (root.hoverIndex >= 0) {
            ctx.strokeStyle = Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25)
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(Math.round(root.xFor(root.hoverIndex)) + 0.5, 0)
            ctx.lineTo(Math.round(root.xFor(root.hoverIndex)) + 0.5, height)
            ctx.stroke()
          }

          ctx.strokeStyle = root.foreground
          ctx.lineWidth = 2
          ctx.lineJoin = "round"
          ctx.lineCap = "round"
          ctx.beginPath()
          for (var i = 0; i < root.count; i++) {
            var x = root.xFor(i), y = yFor(root.temps[i])
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.stroke()

          // Direct labels on the extremes only; a marker on the hovered hour.
          ctx.font = Style.font.bodySmall + "px \"" + root.fontFamily + "\""
          ctx.textAlign = "center"
          function label(i, above) {
            var x = Math.min(Math.max(root.xFor(i), 12), width - 12)
            var y = yFor(root.temps[i])
            ctx.fillStyle = root.foreground
            ctx.textBaseline = above ? "bottom" : "top"
            ctx.fillText(Math.round(root.temps[i]) + "°", x, above ? y - 4 : y + 4)
          }
          if (root.tempMax !== root.tempMin) {
            label(root.tempMaxIndex, true)
            label(root.tempMinIndex, false)
          } else {
            label(0, true)
          }

          if (root.hoverIndex >= 0) {
            ctx.fillStyle = root.foreground
            ctx.beginPath()
            ctx.arc(root.xFor(root.hoverIndex), yFor(root.temps[root.hoverIndex]), 4, 0, 2 * Math.PI)
            ctx.fill()
          }
        }
      }

      Canvas {
        id: precipCanvas
        y: iconRow.height + root.tempHeight + Style.space(4)
        width: parent.width
        height: root.precipHeight
        renderStrategy: Canvas.Cooperative

        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          if (root.count < 2) return

          var fg = root.foreground
          // Baseline, recessive.
          ctx.fillStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.15)
          ctx.fillRect(0, height - 1, width, 1)

          var barWidth = Math.max(2, Math.min(root.stepX - 2, 12))
          for (var i = 0; i < root.count; i++) {
            var p = root.hours[i].precipitation
            if (p <= 0) continue
            var h = Math.max(2, p / root.precipScale * (height - 2))
            var x = root.xFor(i) - barWidth / 2
            var y = height - 1 - h
            var r = Math.min(2, barWidth / 2, h)
            ctx.fillStyle = Qt.rgba(fg.r, fg.g, fg.b, i === root.hoverIndex ? 0.9 : 0.55)
            ctx.beginPath()
            ctx.moveTo(x, height - 1)
            ctx.lineTo(x, y + r)
            ctx.arcTo(x, y, x + r, y, r)
            ctx.lineTo(x + barWidth - r, y)
            ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r)
            ctx.lineTo(x + barWidth, height - 1)
            ctx.closePath()
            ctx.fill()
          }
        }

        Text {
          anchors.right: parent.right
          anchors.top: parent.top
          text: root.precipTotal >= 0.05 ? root.precipTotal.toFixed(1) + " mm total" : "No precipitation"
          color: root.mutedColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
      }

      // Hour labels every third hour.
      Repeater {
        model: root.count
        Text {
          visible: index % 3 === 0
          x: Math.min(Math.max(root.xFor(index) - width / 2, 0), root.width - width)
          y: iconRow.height + root.tempHeight + root.precipHeight + Style.space(8)
          text: root.hourLabel(index)
          color: root.mutedColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
      }

      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.NoButton
        onPositionChanged: function(mouse) {
          if (root.count < 2) return
          root.hoverIndex = Math.max(0, Math.min(root.count - 1, Math.round((mouse.x - root.padX) / root.stepX)))
        }
        onExited: root.hoverIndex = -1
      }
    }
  }
}
