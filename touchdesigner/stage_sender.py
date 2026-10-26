# Stage Visuals: send a TOP to the bridge's LED walls as live JPEG frames.
#
# 1. Add a WebSocket DAT. Network Address: localhost, Network Port: 8080 (the bridge's port), Active: On.
# 2. Add an Execute DAT, paste this script into it and turn on its Frame End toggle.
# 3. Set SOURCE to the TOP you want on the walls and WEBSOCKET to the WebSocket DAT's name.
#
# Size SOURCE to the wall's pixel resolution (shown in the visualizer's LED wall panel) with a Fit TOP;
# sending more pixels than the wall has only costs bandwidth.

SOURCE = 'out1'          # TOP to send
WEBSOCKET = 'websocket1'  # WebSocket DAT connected to the bridge
EVERY = 1                 # send every Nth frame; 2 halves the load when TouchDesigner runs at 60 fps


def onFrameEnd(frame):
	if EVERY > 1 and frame % EVERY:
		return
	ws = op(WEBSOCKET)
	top = op(SOURCE)
	if ws is None or top is None or not ws.par.active:
		return
	ws.sendBinary(top.saveByteArray('.jpg'))
	return
