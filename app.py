from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mediapipe as mp
import cv2, numpy as np, joblib, base64

# ── App setup ──────────────────────────────────────────
app = Flask(__name__, static_folder='frontend')
CORS(app)

# ── Load trained model, scaler, encoder ───────────────
model   = joblib.load("model.pkl")
scaler  = joblib.load("scaler.pkl")
encoder = joblib.load("encoder.pkl")

# ── MediaPipe Hands ───────────────────────────────────
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.5
)

# ── Serve frontend ────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('frontend', path)

# ── Ping ──────────────────────────────────────────────
@app.route('/ping')
def ping():
    return jsonify({'status': 'ok'})

# ── Predict ───────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    data = request.json.get('image', '')

    if ',' in data:
        data = data.split(',')[1]

    img_bytes = base64.b64decode(data)
    img_array = np.frombuffer(img_bytes, np.uint8)
    img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        return jsonify({'error': 'could not decode image'}), 400

    img = cv2.resize(img, (224, 224))
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    result = hands.process(rgb)

    if not result.multi_hand_landmarks:
        return jsonify({'error': 'no hand detected'})

    hand   = result.multi_hand_landmarks[0]
    base_x = hand.landmark[0].x
    base_y = hand.landmark[0].y
    base_z = hand.landmark[0].z

    landmarks_normalized = []
    landmarks_raw        = []

    for lm in hand.landmark:
        landmarks_normalized.extend([
            lm.x - base_x,
            lm.y - base_y,
            lm.z - base_z
        ])
        landmarks_raw.extend([lm.x, lm.y, lm.z])

    if len(landmarks_normalized) != 63:
        return jsonify({'error': 'incomplete landmarks'}), 400

    X     = scaler.transform([landmarks_normalized])
    proba = model.predict_proba(X)[0]

    top3_idx = proba.argsort()[-3:][::-1]
    top3 = [
        {
            'letter':     encoder.classes_[i],
            'confidence': round(float(proba[i]) * 100, 1)
        }
        for i in top3_idx
    ]

    return jsonify({
        'letter':     top3[0]['letter'],
        'confidence': top3[0]['confidence'],
        'top3':       top3,
        'landmarks':  landmarks_raw
    })

# ── Run ───────────────────────────────────────────────
if __name__ == '__main__':
    print("Starting server...")
    print("Open browser at: http://localhost:5000")
    app.run(port=5000, debug=False)