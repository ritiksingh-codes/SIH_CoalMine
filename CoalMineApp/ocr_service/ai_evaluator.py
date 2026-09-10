import os
import json
from groq import Groq

# Initialize client with your key
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "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")
client = Groq(api_key=GROQ_API_KEY)

def predict_hazard_compliance(hazard_text: str) -> dict:
    """
    Evaluates raw hazard text against DGMS statutory guidelines.
    Returns structured JSON with severity, category, and action required.
    """
    system_prompt = """
    You are an automated DGMS Coal Mine Statutory Compliance Engine.
    Analyze the incoming observation or OCR excerpt and return ONLY valid JSON matching this schema:
    {
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "category": "Strata Control" | "Ventilation & Gas" | "Haulage & Transport" | "General Compliance",
      "statutory_violation": true | false,
      "dgms_regulation_tag": "e.g., CMR Reg 111 (Roof Control) or CMR Reg 153 (Ventilation)",
      "recommended_action": "Clear, direct actionable mitigation instruction under 20 words."
    }
    """

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Hazard Observation: {hazard_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.0  # Zero temperature ensures deterministic, objective output
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        return {
            "severity": "UNKNOWN",
            "category": "Unclassified",
            "statutory_violation": False,
            "dgms_regulation_tag": "N/A",
            "recommended_action": f"Error contacting AI prediction engine: {str(e)}"
        }

def generate_eod_report(hazards_list: list) -> dict:
    """
    Acts as a Chief Safety Inspector to summarize the day's hazards.
    Returns structured JSON with an executive summary, key trends, and a safety rating.
    """
    if not hazards_list:
        return {
            "safety_rating": "A+",
            "executive_summary": "No hazards reported today. Excellent compliance.",
            "key_trends": ["Zero incidents"],
            "action_items": ["Maintain current safety protocols."]
        }
        
    system_prompt = """
    You are the Chief Safety Inspector for a Coal Mine governed by DGMS.
    Analyze the following list of hazards reported today and provide an End of Day Executive Summary.
    Return ONLY valid JSON matching this schema:
    {
      "safety_rating": "A+, A, B, C, D, or F based on severity",
      "executive_summary": "A 2-3 sentence overview of the day's safety performance.",
      "key_trends": ["List of 2-3 trends or recurring issues observed"],
      "action_items": ["List of 2-3 immediate actions for tomorrow's shift"]
    }
    """
    
    # Simplify the hazards list to save tokens
    simplified_hazards = [
        f"[{h.get('timestamp', 'Time Unknown')}] {h.get('hazard_type', 'Unknown')}: {h.get('description', '')} (Severity: {h.get('severity', 'Unknown')})"
        for h in hazards_list
    ]
    
    hazards_text = "\n".join(simplified_hazards)

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Today's Hazards:\n{hazards_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        return {
            "safety_rating": "UNKNOWN",
            "executive_summary": f"Error generating report: {str(e)}",
            "key_trends": ["N/A"],
            "action_items": ["N/A"]
        }
