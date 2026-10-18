# Prompts

These are the prompts that built this plugin, quoted word for word (typos kept) in the order they were sent. They come from one Claude Code session (Claude Opus 5.5) on 18 October 2026. The first one called Omarchy's `/omarchy` skill.

"Mid-task" means the prompt was sent while the agent was still working on the previous one. "Interrupt" means it stopped the agent's current step.

| # | When | Prompt | Result |
|---|---|---|---|
| 1 | Start | `/omarchy` the weather widget, where does it get it's data from? I want to use SMHI | Found the sources (Open-Meteo, plus wttr.in as backup), cloned `omarchy.weather` and added the SMHI `snow1g` adapter in `Model.js` |
| 2 | Mid-task | I want a tiny SMHI logo in the widget | Put the logo in the bar |
| 3 | Mid-task | the logo should be visible when open the widget not in the top bar | Moved the logo to the panel footer and restored the original `BarWidget.qml` |
| 4 | Mid-task | create repo on ecomodeller | Started; halted by prompt 5 |
| 5 | Interrupt | I think the weather widget could provide more detail for the coming 12 hours. Some simple charts. Clean but informative. | `HourlyChart.qml`: temperature line and precipitation bars |
| 6 | Interrupt | Humidity is not relevant | Removed the humidity column; humidity left out of the charts |
| 7 | Interrupt | we are not using Open-meteo, we are using SMHI | Removed the Open-Meteo forecast fallback; SMHI is the only forecast source |
| 8 | Mid-task | I need a Amazon method style Readme explaining the value of this widget | [`README.md`](../README.md) in press-release/FAQ form |
| 9 | Start | create the repo, then create a draft linkedin post about the value of open data, AI and the power to customize your own environment | This repository (private) and [`GLOSSARY.md`](../GLOSSARY.md); the LinkedIn draft stayed in the chat |
| 10 | Start | save the prompts in the repo | This file |
