import os
import json
import base64
from io import BytesIO
from PIL import Image
from groq import Groq
from dotenv import load_dotenv

_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         
load_dotenv(os.path.join(_service_dir, '..', '.env'))   

def optimize_image(image_bytes: bytes) -> bytes:
    try:
        img = Image.open(BytesIO(image_bytes))
        img.thumbnail((800, 800))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        out = BytesIO()
        img.save(out, format='JPEG', quality=80)
        return out.getvalue()
    except Exception:
        return image_bytes

def process_legacy_document(image_bytes: bytes) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("GROQ_API_KEY not found in .env")
        return get_mock_data()
        
    try:
        client = Groq(api_key=api_key)
        
        optimized_bytes = optimize_image(image_bytes)
        base64_image = base64.b64encode(optimized_bytes).decode('utf-8')
        
        prompt = 'You are a highly accurate mining safety digitizer. Read the ENTIRE handwritten text from this historical mining log. Output ONLY JSON with exactly these keys: "report_date" (string), "time" (string), "pit_seam_id" (string), "gas_concentration_ch4" (string), "equipment_status" (string), "full_narrative" (string), "critical_violations" (array of strings).'
        
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                            },
                        },
                    ],
                }
            ],
            model="llama-3.2-90b-vision-preview",
            response_format={"type": "json_object"},
            temperature=0.0
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Groq OCR failed: {e}")
        return get_mock_data()

def get_mock_data():
    return {
        "report_date": "14/09/2026",
        "pit_seam_id": "PIT-ALPHA",
        "gas_concentration_ch4": "1.2%",
        "critical_violations": ["Crack", "Loose Stone (Mock)"]
    }
