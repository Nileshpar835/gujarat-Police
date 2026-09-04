# Uses the official MediaMTX image directly rather than rebuilding the
# binary — MediaMTX has no build-time customisation needs for our use case,
# only runtime config (mediamtx.yml).
FROM bluenviron/mediamtx:latest

COPY mediamtx.yml /mediamtx.yml

# RTSP, RTMP, HLS, WebRTC(+ICE), API
EXPOSE 8554 1935 8888 8889 8189/udp 9997
