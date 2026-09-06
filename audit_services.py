import httpx
import json
import sys

print('=' * 60)
print('COMPREHENSIVE SERVICES & DASHBOARD HEALTH AUDIT')
print('=' * 60)

passed = 0
failed = 0

def check(name, ok, details=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  [PASS] {name}: {details}')
    else:
        failed += 1
        print(f'  [FAIL] {name}: {details}')

# 1. Backend Health
try:
    r = httpx.get('http://localhost:8000/health', timeout=5.0)
    check('Backend /health', r.status_code == 200, f'HTTP {r.status_code}: {r.json()}')
except Exception as e:
    check('Backend /health', False, str(e))

# 2. Auth Login & Token
token = None
try:
    r = httpx.post('http://localhost:8000/api/v1/auth/login', data={'username': 'admin', 'password': 'admin123'}, timeout=5.0)
    check('Auth Login (/auth/login)', r.status_code == 200, f'HTTP {r.status_code}')
    token = r.json().get('access_token')
except Exception as e:
    check('Auth Login (/auth/login)', False, str(e))

auth_headers = {'Authorization': f'Bearer {token}'} if token else {}

# 3. Auth Me
try:
    r = httpx.get('http://localhost:8000/api/v1/auth/me', headers=auth_headers, timeout=5.0)
    user_data = r.json()
    check('Current User (/auth/me)', r.status_code == 200, f"User: {user_data.get('username')} ({user_data.get('role')})")
except Exception as e:
    check('Current User (/auth/me)', False, str(e))

# 4. Cameras List (GIS)
try:
    r = httpx.get('http://localhost:8000/api/v1/cameras/gis', headers=auth_headers, timeout=5.0)
    cams = r.json()
    check('Cameras GIS (/cameras/gis)', r.status_code == 200 and len(cams) >= 30, f'{len(cams)} cameras loaded with coordinates')
except Exception as e:
    check('Cameras GIS (/cameras/gis)', False, str(e))

# 5. Dynamic Catalogue Sync
try:
    r = httpx.post('http://localhost:8000/api/v1/cameras/sync-catalogue', headers={'X-API-Key': 'hackathon-local-ai-worker-key'}, timeout=10.0)
    check('Dynamic Catalogue Sync', r.status_code == 200, f"{r.json().get('synced')} cameras synced from upstream catalogue")
except Exception as e:
    check('Dynamic Catalogue Sync', False, str(e))

# 6. WHEP Signaling via Backend Proxy
lines = [
    'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=video 9 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'a=rtcp:9 IN IP4 0.0.0.0',
    'a=ice-ufrag:testufrag', 'a=ice-pwd:testpwdtestpwdtestpwdtestpwd',
    'a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
    'a=setup:actpass', 'a=mid:0', 'a=recvonly', 'a=rtcp-mux', 'a=rtpmap:96 H264/90000', ''
]
sdp_offer = '\r\n'.join(lines)
try:
    r = httpx.post('http://localhost:8000/api/v1/cameras/SENTINEL-cam01/whep', content=sdp_offer, headers={'Content-Type': 'application/sdp'}, timeout=10.0)
    loc = r.headers.get('location')
    check('Backend WHEP Proxy (/cameras/SENTINEL-cam01/whep)', r.status_code == 201, f'HTTP {r.status_code}, Session Location: {loc}')
    if loc:
        r_del = httpx.delete(f'http://localhost:8000{loc}', timeout=5.0)
        check('Backend WHEP Session Cleanup (DELETE)', r_del.status_code in (200, 204), f'HTTP {r_del.status_code}')
except Exception as e:
    check('Backend WHEP Proxy', False, str(e))

# 7. Alerts API
try:
    r = httpx.get('http://localhost:8000/api/v1/alerts', headers=auth_headers, timeout=5.0)
    check('Alerts API (/alerts)', r.status_code == 200, f'{len(r.json())} alerts in database')
except Exception as e:
    check('Alerts API (/alerts)', False, str(e))

# 8. Watchlists API
try:
    r = httpx.get('http://localhost:8000/api/v1/watchlists', headers=auth_headers, timeout=5.0)
    check('Watchlists API (/watchlists)', r.status_code == 200, f'{len(r.json())} active watchlists')
except Exception as e:
    check('Watchlists API (/watchlists)', False, str(e))

# 9. Vehicle Route Search (GIS Tracking)
try:
    r = httpx.get('http://localhost:8000/api/v1/vehicles/GJ01AB1234/route', headers=auth_headers, timeout=5.0)
    data = r.json()
    check('Vehicle Route API (/vehicles/GJ01AB1234/route)', r.status_code == 200, f"Vehicle: {data.get('registration_number')}, Route stops: {len(data.get('route', []))}")
except Exception as e:
    check('Vehicle Route API', False, str(e))

# 10. MediaMTX Control API
try:
    r = httpx.get('http://localhost:9997/v3/config/paths/list', timeout=5.0)
    paths = r.json().get('items', [])
    check('MediaMTX Stream Gateway (:9997)', r.status_code == 200 and len(paths) >= 30, f'{len(paths)} camera paths registered')
except Exception as e:
    check('MediaMTX Stream Gateway (:9997)', False, str(e))

# 11. Dashboard Frontend (:5173)
try:
    r = httpx.get('http://localhost:5173/', timeout=5.0)
    check('Dashboard Frontend (:5173)', r.status_code == 200 and '<div id="root">' in r.text, f'HTTP {r.status_code}')
except Exception as e:
    check('Dashboard Frontend (:5173)', False, str(e))

# 12. Dashboard Vite Proxy to Backend
try:
    r = httpx.get('http://localhost:5173/api/v1/health', timeout=5.0)
    check('Dashboard Vite Proxy -> Backend (/api)', r.status_code == 200, f'HTTP {r.status_code}: {r.json()}')
except Exception as e:
    check('Dashboard Vite Proxy -> Backend', False, str(e))

# 13. Dashboard Vite Proxy to Sentinel WHEP
try:
    r = httpx.options('http://localhost:5173/sentinel-whep/stream/cam01/whep', timeout=5.0)
    check('Dashboard Vite Proxy -> Sentinel WHEP (/sentinel-whep)', r.status_code == 204, f"HTTP {r.status_code}, Accept-Post: {r.headers.get('accept-post')}")
except Exception as e:
    check('Dashboard Vite Proxy -> Sentinel WHEP', False, str(e))

# 14. Dashboard Vite Proxy to Sentinel HLS
try:
    r = httpx.get('http://localhost:5173/sentinel-hls/cam01/index.m3u8', timeout=10.0)
    check('Dashboard Vite Proxy -> Sentinel HLS (/sentinel-hls)', r.status_code == 200 and '#EXTM3U' in r.text, f'HTTP {r.status_code}, HLS Manifest OK')
except Exception as e:
    check('Dashboard Vite Proxy -> Sentinel HLS', False, str(e))

print('=' * 60)
print(f'SUMMARY: {passed} PASSED, {failed} FAILED')
print('=' * 60)

if failed > 0:
    sys.exit(1)

