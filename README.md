<div align="center">

<img src="docs/assets/banner.svg" alt="Onsoku Advance — Sonic Advance, rebuilt for the browser" width="100%">

<br>
<br>

**A from-scratch front-end port of Sonic Advance for the Game Boy Advance.**<br>
No emulator and no game files in this repository: your own ROM, read on your machine, brought to life in the browser.

<br>

[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-ffd23f?style=for-the-badge&labelColor=0b1240)](#status)
[![Runs in the browser](https://img.shields.io/badge/runs_in-the_browser-4f86ff?style=for-the-badge&labelColor=0b1240)](#how-it-works)
[![No emulation](https://img.shields.io/badge/emulation-none-8fd3ff?style=for-the-badge&labelColor=0b1240)](#how-it-works)
[![Bring your own ROM](https://img.shields.io/badge/ROM-bring_your_own-ff8a3d?style=for-the-badge&labelColor=0b1240)](#getting-started)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-c5d4ff?style=for-the-badge&labelColor=0b1240)](LICENSE)

<br>

[Overview](#overview) &nbsp;·&nbsp; [Status](#status) &nbsp;·&nbsp; [How it works](#how-it-works) &nbsp;·&nbsp; [Getting started](#getting-started) &nbsp;·&nbsp; [Roadmap](#roadmap) &nbsp;·&nbsp; [Contributing](#contributing) &nbsp;·&nbsp; [Legal](#legal)

</div>

<br>

## Overview

*Onsoku* (音速) is Japanese for **"speed of sound"**. Onsoku Advance rebuilds Sonic Advance as a modern web app: the game logic is written from scratch in JavaScript and drawn on a canvas, while the graphics, palettes and level data come from the ROM you own, decoded on your machine.

<table>
<tr>
<td width="50%" valign="top">

**⚡ No emulation**<br>
<sub>The original machine code never runs. Movement, animation and camera are reimplemented as plain JavaScript that any modern browser runs natively.</sub>

</td>
<td width="50%" valign="top">

**🎮 Bring your own ROM**<br>
<sub>Nothing from the game is stored here. Sprites, palettes and tiles are extracted from your own copy, in your browser, and never uploaded.</sub>

</td>
</tr>
<tr>
<td width="50%" valign="top">

**🎯 Faithful by design**<br>
<sub>Physics constants, animation timing and camera rules follow the original game, as documented by the community decompilation.</sub>

</td>
<td width="50%" valign="top">

**🔍 Pixel-perfect**<br>
<sub>Native 240 × 160 output, scaled up in whole steps so every pixel stays sharp on any screen.</sub>

</td>
</tr>
</table>

## Status

> [!NOTE]
> **Pre-alpha: there is nothing to play in this repository yet.** A working movement prototype exists and moves in with [M1 — Playable prototype](https://github.com/NahuelGenchi/onsoku-advance/milestone/2): Sonic on a Neo Green Hill platform with the original walking, running, braking, turning, crouching, looking up, jumping, rolling and spin dash, and the original camera.

| Area | State | Tracked in |
| :--- | :--- | :--- |
| ROM extractor: sprites, palettes, tiles | 🟡 Prototype, moving in | [#4](https://github.com/NahuelGenchi/onsoku-advance/issues/4) |
| Movement, animations and camera | 🟡 Prototype, moving in | [#5](https://github.com/NahuelGenchi/onsoku-advance/issues/5) |
| Stage maps and collision | ⚪ Planned | [M2](https://github.com/NahuelGenchi/onsoku-advance/milestone/3) |
| Rings, objects and enemies | ⚪ Planned | [M2](https://github.com/NahuelGenchi/onsoku-advance/milestone/3) |
| Sound and music | ⚪ Planned | [M2](https://github.com/NahuelGenchi/onsoku-advance/milestone/3) |
| Hosted build and releases | ⚪ Planned | [M3](https://github.com/NahuelGenchi/onsoku-advance/milestone/4) |

## How it works

```mermaid
flowchart LR
    rom[("Your Sonic Advance ROM")]
    subgraph browser["Your browser"]
        direction LR
        ext["Extractor<br/>finds the sprite and<br/>tilemap tables"]
        data[("Sprites · palettes<br/>tiles · animations")]
        engine["Onsoku engine<br/>physics · animation · camera"]
        screen["240 × 160 canvas"]
        ext --> data --> engine --> screen
    end
    rom --> ext
```

1. **Extract.** You pick your ROM. The extractor locates the game's sprite and tilemap tables and decodes frames, palettes, tiles and animation scripts into memory. It is designed to run entirely in the browser: the ROM is read locally and nothing is uploaded.
2. **Simulate.** The engine steps 60 times per second with the original game's rules: acceleration, braking, gravity, jump height, roll friction, spin dash speeds and the camera's dead zones.
3. **Draw.** Sprites and layers are composed at the Game Boy Advance's own 240 × 160 resolution, including the per-line background scrolling the original uses for its sea and clouds.

## Getting started

Playable builds arrive with [M1 — Playable prototype](https://github.com/NahuelGenchi/onsoku-advance/milestone/2). You will need:

- A current desktop browser
- Your own Sonic Advance ROM, dumped from a cartridge you own

Supported ROM versions will be listed here, identified by checksum.

<details>
<summary><b>Controls in the prototype</b></summary>
<br>

| Action | Keyboard |
| :--- | :--- |
| Run | <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> |
| Jump | <kbd>Z</kbd> or <kbd>Space</kbd> |
| Crouch, or roll while moving | <kbd>↓</kbd> |
| Spin dash | <kbd>↓</kbd> + <kbd>Z</kbd> |
| Look up | <kbd>↑</kbd> |

On touch screens, on-screen buttons appear instead.

</details>

## Roadmap

| Milestone | Outcome | Progress |
| :--- | :--- | :--- |
| [M0 — Project foundation](https://github.com/NahuelGenchi/onsoku-advance/milestone/1) | Repository, documentation, tracking and presentation | ![M0 progress](https://img.shields.io/github/milestones/progress-percent/NahuelGenchi/onsoku-advance/1?style=flat-square&label=&color=4f86ff&labelColor=0b1240) |
| [M1 — Playable prototype](https://github.com/NahuelGenchi/onsoku-advance/milestone/2) | Sonic on a Neo Green Hill platform, assets from your own ROM | ![M1 progress](https://img.shields.io/github/milestones/progress-percent/NahuelGenchi/onsoku-advance/2?style=flat-square&label=&color=4f86ff&labelColor=0b1240) |
| [M2 — Stages and gameplay](https://github.com/NahuelGenchi/onsoku-advance/milestone/3) | Full stages with collision, rings, objects, enemies, sound and music | ![M2 progress](https://img.shields.io/github/milestones/progress-percent/NahuelGenchi/onsoku-advance/3?style=flat-square&label=&color=4f86ff&labelColor=0b1240) |
| [M3 — Release](https://github.com/NahuelGenchi/onsoku-advance/milestone/4) | A hosted build and versioned releases, with no game files | ![M3 progress](https://img.shields.io/github/milestones/progress-percent/NahuelGenchi/onsoku-advance/4?style=flat-square&label=&color=4f86ff&labelColor=0b1240) |

## Contributing

Every change follows one trail: **issue → branch → milestone → pull request**.

```mermaid
flowchart LR
    issue["Issue<br/>scope and done criteria"] --> branch["Branch<br/>type/issue-slug"] --> pr["Pull request<br/>Closes #issue"] --> milestone["Milestone<br/>M0 → M3"]
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/TRACKING.md](docs/TRACKING.md) before opening work. Bugs and ideas start as an [issue](https://github.com/NahuelGenchi/onsoku-advance/issues/new/choose). Never attach ROMs, save files or extracted game assets.

## Acknowledgements

- The [SAT-R](https://github.com/SAT-R) decompilation of Sonic Advance, the reference for the game's data formats, physics and camera behavior. None of its code or data is copied into this repository.

## Legal

Onsoku Advance is an unofficial fan project and is not affiliated with or endorsed by SEGA or Sonic Team. Sonic Advance and all related names, characters and assets belong to SEGA. This repository contains no copyrighted game assets: you need your own legally obtained ROM, and its graphics and sounds are extracted locally on your machine.

The project's own code, documentation and artwork are licensed under [GPL-3.0-or-later](LICENSE).

<br>

<div align="center">
<sub>Built by <a href="https://github.com/NahuelGenchi">Nahuel Genchi</a> &nbsp;·&nbsp; 音速</sub>
</div>
