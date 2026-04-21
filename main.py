# main.py
import cv2
import os
import time
import threading
import httpx
from ultralytics import YOLO
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STATE ---
dvr_thread = None
is_running = False
current_status = "idle"
ESP32_STREAM_URL = "http://192.168.68.116:81/stream"


# --- BACKGROUND DELETION ---
def schedule_deletion(filepath, delay_seconds):
    def delete_task():
        time.sleep(delay_seconds)
        if os.path.exists(filepath):
            os.remove(filepath)
            print(f"Auto-deleted: {os.path.basename(filepath)}")
    threading.Thread(target=delete_task, daemon=True).start()


# --- DVR LOOP ---
def dvr_loop():
    global is_running, current_status

    model = YOLO('yolov8n.pt')
    cap = cv2.VideoCapture(ESP32_STREAM_URL)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        current_status = "error: stream unavailable"
        is_running = False
        return

    SAVE_DIR = 'cat_videos'
    os.makedirs(SAVE_DIR, exist_ok=True)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = 10.0
    fourcc = cv2.VideoWriter.fourcc(*'XVID')

    is_recording = False
    out = None
    frames_missing = 0
    COOLDOWN_FRAMES = 30
    current_status = "waiting"

    while is_running:
        ret, frame = cap.read()
        if not ret:
            current_status = "error: stream lost"
            break

        results = model(frame, conf=0.5, classes=[15])
        annotated_frame = results[0].plot()
        cat_in_frame = len(results[0].boxes) > 0

        if cat_in_frame:
            frames_missing = 0
            if not is_recording:
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                save_path = os.path.join(SAVE_DIR, f'litter_event_{timestamp}.avi')
                out = cv2.VideoWriter(save_path, fourcc, fps, (frame_width, frame_height))
                is_recording = True
                current_status = "recording"
                print(f"CAT DETECTED! Recording: {save_path}")
        else:
            if is_recording:
                frames_missing += 1
                if frames_missing > COOLDOWN_FRAMES:
                    out.release()
                    is_recording = False
                    current_status = "waiting"
                    print(f"Cat left. Saved: {os.path.abspath(save_path)}")
                    schedule_deletion(save_path, 120)

        if is_recording:
            out.write(annotated_frame)

    if is_recording and out:
        out.release()
    cap.release()
    current_status = "idle"
    print("DVR stopped.")


# --- STREAM PROXY ---
@app.get("/stream")
async def proxy_stream():
    async def stream_generator():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", ESP32_STREAM_URL) as response:
                async for chunk in response.aiter_bytes(chunk_size=1024):
                    yield chunk

    return StreamingResponse(
        stream_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# --- DVR ENDPOINTS ---
@app.post("/dvr/start")
def start_dvr():
    global dvr_thread, is_running
    if is_running:
        return {"message": "DVR already running", "status": current_status}
    is_running = True
    dvr_thread = threading.Thread(target=dvr_loop, daemon=True)
    dvr_thread.start()
    return {"message": "DVR started"}

@app.post("/dvr/stop")
def stop_dvr():
    global is_running
    is_running = False
    return {"message": "DVR stopping..."}

@app.get("/dvr/status")
def get_status():
    return {"status": current_status}

@app.get("/")
def root():
    return {"message": "LitterSense API is online"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)