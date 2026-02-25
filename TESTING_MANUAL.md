# Manual Verification Protocol

This document outlines the manual testing procedures for features that are difficult or impossible to automate reliably with current tooling (e.g., hardware access, subjective quality, native OS integration).

## 1. Voice Studio & Audio Features

### Voice Recording
- [ ] **Microphone Access**: Verify browser prompts for permission and access is granted.
- [ ] **Waveform Visualization**: Speak into the mic and ensure the waveform reacts to volume changes.
- [ ] **Silence Detection**: Stop speaking and verify the recording pauses or indicates silence efficiently.
- [ ] **Playback**: Listen to the recorded audio. Is it clear? Is the volume appropriate?

### Text-to-Speech (TTS)
- [ ] **Voice Quality**: Generate speech from text. Does it sound robotic or natural?
- [ ] **Latency**: measure time from "Generate" click to audio start. Should be < 2 seconds for short phrases.
- [ ] **Glitch Test**: Generate a long paragraph. Are there artifacts, cut-offs, or repeating loops?

## 2. Native Desktop Integration (Electron)

### System Tray & Window Management
- [ ] **Tray Icon**: Does the Keimenon icon appear in the system tray?
- [ ] **Context Menu**: Right-click the tray icon. Do "Open" and "Quit" work?
- [ ] **Minimize/Restore**: Minimize the window. Does it hide to tray? Clicking tray icon restores it?

### File System Integration
- [ ] **Drag-and-Drop Import**: Drag a `.json` or `.txt` file from the OS file explorer onto the application window. Does the import dialog appear?
- [ ] **Native Dialogs**: When "Save As" or "Open" is triggered, does the native OS dialog appear?

## 3. Visual & Semantic Aesthetics

### "Premium Feel" Check
- [ ] **Animations**: Are transitions smooth (e.g., opening a modal, side panel slide-in)? Any jank?
- [ ] **Typography**: Is the font rendering crisp? Are headings clearly distinct from body text?
- [ ] **Dark/Light Mode**: Toggle themes. Do any elements become invisible (e.g., dark text on dark background)?

### Canvas Physics
- [ ] **Node Settle**: Drag a node and release. Does it drift into place naturally or snap instantly?
- [ ] **Edge Routing**: Create complex connections. Do edges cross over nodes in an ugly way, or route around them?

## 4. AI Cognitive Quality

- [ ] **Helpfulness**: Ask "Help me organize my notes on project X". Does the AI propose a structure (e.g., "Create a Project node, link to Tasks")?
- [ ] **Context Awareness**: Select 3 nodes and ask "Summarize these". Does the answer actually reference the content of those specific nodes?
