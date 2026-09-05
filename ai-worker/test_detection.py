import os
import cv2
from detector import VehicleDetector
from anpr import read_plate

os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
url = 'rtsp://nileshpar835%40gmail.com:NYA4-3ND8-4PGV@103.250.160.189:8554/stream/cam01'
print('Connecting to:', url)
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

