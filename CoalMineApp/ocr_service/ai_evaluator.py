import os
import json
from groq import Groq
from dotenv import load_dotenv

# Load .env from the service directory, then fallback to parent directory.
_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         
load_dotenv(os.path.join(_service_dir, '..', '.env'))   

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = None
if GROQ_API_KEY:
    client = Groq(api_key=GROQ_API_KEY)

def predict_hazard_compliance(hazard_text: str) -> dict:
    if not client:
        return {
            "severity": "UNKNOWN",
            "category": "Unclassified",
            "statutory_violation": False,
            "dgms_regulation_tag": "N/A",
            "recommended_action": "Error contacting AI prediction engine: GROQ_API_KEY is missing."
        }

    try:
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": 'You are an automated DGMS Coal Mine Statutory Compliance Engine. Analyze the incoming observation and return ONLY valid JSON with keys: "severity" (CRITICAL, HIGH, MEDIUM, LOW), "category" (string), "statutory_violation" (boolean), "dgms_regulation_tag" (string), "recommended_action" (string).'
                },
                {
                    "role": "user", 
                    "content": f"Hazard Observation: {hazard_text}"
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.0
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {
            "severity": "UNKNOWN",
            "category": "Unclassified",
            "statutory_violation": False,
            "dgms_regulation_tag": "N/A",
            "recommended_action": f"Groq Error: {str(e)}"
        }

def generate_eod_report(hazards_list: list) -> dict:
    if not hazards_list:
        return {
            "safety_rating": "A+",
            "executive_summary": "No hazards reported today. Excellent compliance.",
            "key_trends": ["Zero incidents"],
            "action_items": ["Maintain current safety protocols."]
        }
        
    simplified_hazards = [
        f"[{h.get('timestamp', 'Time Unknown')}] {h.get('hazard_type', 'Unknown')}: {h.get('description', '')} (Severity: {h.get('severity', 'Unknown')})"
        for h in hazards_list
    ]
    hazards_text = "\n".join(simplified_hazards)

    if not client:
        return {
            "safety_rating": "UNKNOWN",
            "executive_summary": "Error generating report: GROQ_API_KEY is missing.",
            "key_trends": ["N/A"],
            "action_items": ["N/A"]
        }

    try:
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": 'You are the Chief Safety Inspector for a Coal Mine. Analyze the hazards and provide an End of Day Summary. Return ONLY valid JSON with exactly these keys: "safety_rating" (A+, A, B, C, D, F), "executive_summary" (string), "key_trends" (array of strings), "action_items" (array of strings).'
                },
                {
                    "role": "user", 
                    "content": f"Today's Hazards:\n{hazards_text}"
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.3
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {
            "safety_rating": "UNKNOWN",
            "executive_summary": f"Groq Error: {str(e)}",
            "key_trends": ["N/A"],
            "action_items": ["N/A"]
        }
