import os
import json
from openai import OpenAI
from dotenv import load_dotenv

_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         
load_dotenv(os.path.join(_service_dir, '..', '.env'))   

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)

def predict_hazard_compliance(hazard_text: str) -> dict:
    if not client:
        raise Exception("OPENAI_API_KEY is missing from environment variables.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
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
        response_format={"type": "json_object"},
        temperature=0.0
    )
    return json.loads(response.choices[0].message.content)

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
        raise Exception("OPENAI_API_KEY is missing from environment variables.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
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
        response_format={"type": "json_object"},
        temperature=0.3
    )
    return json.loads(response.choices[0].message.content)
