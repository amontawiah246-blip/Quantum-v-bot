# Live chart test (Pocket Option SSID)

## Bridge (Python)
cd bridge && pip install -r requirements.txt
POCKET_SSID='<paste full SSID string, demo first>' uvicorn server:app --port 8000

## Frontend (React)
cd web && npm install && npm run dev   # open http://localhost:5173

The header shows updates/second, which answers the "is it tick by tick?" question.
The grey lines under the chart show the first raw messages from the library.
