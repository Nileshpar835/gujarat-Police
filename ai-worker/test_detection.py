import os
import cv2
from detector import VehicleDetector
from anpr import read_plate

from urllib.parse import quote

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
host = os.getenv("SENTINEL_HOST", "103.250.160.189")
user = quote(os.getenv("SENTINEL_USERNAME", ""), safe="")
password = quote(os.getenv("SENTINEL_PASSWORD", ""), safe="")
cam = os.getenv("SENTINEL_TEST_CAMERA", "cam01")
url = f"rtsp://{user}:{password}@{host}:8554/stream/{cam}" if user and password else f"rtsp://{host}:8554/stream/{cam}"
print("Connecting to:", url.split("@")[-1])
cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
ok, frame = cap.read()
if not ok:
    print('Failed to read frame')
else:
    print('Frame read successfully, shape:', frame.shape)
    det = VehicleDetector()
    vehicles = det.detect(frame)
    print(f'Detected {len(vehicles)} vehicles in frame')
    for v in vehicles:
        print(f'  Class: {v.class_name}, Conf: {v.confidence:.2f}, Box: {v.bbox}')
        res = read_plate(frame, v.bbox)
        if res:
            print(f'    -> Plate OCR: \"{res.raw_text}\", Conf: {res.ocr_confidence:.2f}')
        else:
            print('    -> No plate read')
cap.release()

