# Live TouchDesigner video

TouchDesigner sends its output to the bridge as JPEG frames over a WebSocket. The bridge passes them to the visualizer at http://localhost:8080, which shows them on every LED surface. This works on macOS and Windows without Syphon, Spout or NDI.

1. Start the bridge: `npm start` in the repo folder.
2. In TouchDesigner, add a **WebSocket DAT**:
   - Network Address: `localhost`. If TouchDesigner is on another computer, use the bridge computer's IP and start the bridge with `--host 0.0.0.0`.
   - Network Port: `8080`
   - Active: On
3. Add an **Execute DAT**, paste in [stage_sender.py](stage_sender.py) and turn on **Frame End**. Set `SOURCE` to your output TOP.
4. Open http://localhost:8080. The LED wall switches to **TouchDesigner (live)** when the first frame arrives, and the panel shows the frame rate.

Notes:

- Fit your TOP to the wall's pixel resolution, which the LED wall panel lists, for example 4608 × 2304 for an 18 × 9 m wall at 3.9 mm. The page draws frames into a canvas up to 1280 px wide, so 1280 px wide is plenty for previs. Bigger frames only cost bandwidth.
- At 1280 × 720, a frame is roughly 100 to 200 kB, so 30 to 60 fps is fine on one machine. If the frame rate drops, set `EVERY = 2`.
- The bridge accepts any WebSocket on a path other than `/dmx` or `/video` as a video source, so other tools can send JPEG or PNG frames the same way.
