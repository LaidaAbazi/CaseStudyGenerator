from flask import Flask, jsonify, send_from_directory, request, send_file
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
from fpdf import FPDF
import re
import uuid

load_dotenv()
app = Flask(__name__, static_folder='../frontend', static_url_path='')

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

openai_config = {
    "model": "gpt-4",
    "temperature": 0.5,        # Balanced creativity for conversational flow
    "top_p": 0.9,              # Allows controlled variation
    "presence_penalty": 0.2,   # Slightly discourages repetition
    "frequency_penalty": 0.2   # Keeps phrasing varied
}

# Mock database to store solution provider and client data
mock_db = {
    "solution_provider_sessions": {},  # Store solution provider sessions
    "client_sessions": {}             # Store client session links
}




def clean_text(text):
    return (
        text.replace("•", "-")  
            .replace("—", "-")
            .replace("–", "-")
            .replace("“", '"')
            .replace("”", '"')
            .replace("‘", "'")
            .replace("’", "'")
            .replace("£", "GBP ")
    )

def extract_names_from_case_study(text):
    # normalize dashes
    text = text.replace("—", "-").replace("–", "-")
    lines = text.splitlines()
    if lines:
        first = lines[0].strip()
        # strip markdown bold if present
        if first.startswith("**") and first.endswith("**"):
            first = first[2:-2].strip()

        # now expect "Provider x Client: Project Name"
        if ":" in first:
            left, proj = first.split(":", 1)
            proj = proj.strip()
            if " x " in left:
                provider, client = left.split(" x ", 1)
            else:
                provider, client = left.strip(), ""
            return {
                "lead_entity": provider.strip() or "Unknown",
                "partner_entity": client.strip(),
                "project_title": proj or "Unknown Project"
            }

    # fallback to old logic (if you really need it)
    return {
        "lead_entity": "Unknown",
        "partner_entity": "",
        "project_title": "Unknown Project"
    }


@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/session")
def create_session():
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "gpt-4o-realtime-preview-2024-12-17",
        "voice": "verse"
    }
    response = requests.post("https://api.openai.com/v1/realtime/sessions", headers=headers, json=data)
    return jsonify(response.json())

@app.route("/save_transcript", methods=["POST"])
def save_transcript():
    try:
        raw_transcript = request.get_json()
        combined_transcript = []
        buffer = {"ai": "", "user": ""}
        last_speaker = None

        for entry in raw_transcript:
            speaker = entry.get("speaker", "").lower()
            text = entry.get("text", "").strip()
            if not text:
                continue
            if speaker != last_speaker and last_speaker is not None:
                if buffer[last_speaker]:
                    combined_transcript.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")
                    buffer[last_speaker] = ""
            buffer[speaker] += " " + text
            last_speaker = speaker

        if last_speaker and buffer[last_speaker]:
            combined_transcript.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs("transcripts", exist_ok=True)
        filename = f"transcripts/session_{timestamp}.txt"

        with open(filename, "w", encoding="utf-8") as f:
            f.write("\n".join(combined_transcript))

        return jsonify({"status": "success", "message": "Transcript saved", "file": filename})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/generate_summary", methods=["POST"])
def generate_summary():
    try:
        data = request.get_json()
        transcript = data.get("transcript", "")

        if not transcript:
            return jsonify({"status": "error", "message": "Transcript is missing."}), 400

        # Same prompt as before, making sure the GPT model returns a case study summary
        prompt = f"""
        You are a professional case study writer. Your job is to generate a **rich, structured, human-style business case study** from a transcript of a real voice interview.

        This is an **external project**: the speaker is the solution provider describing a project they delivered to a client. Your task is to write a clear, emotionally intelligent case study from their perspective—based **ONLY** on what’s in the transcript.

        --- 

        ❌ **DO NOT INVENT ANYTHING**  
        - Do NOT fabricate dialogue or add made-up details  
        - Do NOT simulate the interview format  
        - Do NOT assume or imagine info not explicitly said  

        ✅ **USE ONLY what’s really in the transcript.** If a piece of information (like a client quote) wasn’t provided, **craft** a brief, realistic-sounding quote that captures the client’s sentiment based on what they did say.

        --- 

        ### ✍️ CASE STUDY STRUCTURE (MANDATORY)

        **Title** (first line only—no extra formatting):  
        Format: **[Solution Provider] x [Client]: [Project or Outcome]**

        --- 

        **Hero Paragraph (no header)**  
        3–4 sentences introducing the client, their industry, and their challenge; then introduce the provider and summarize the delivery.

        --- 

        **Section 1 – The Challenge**  
        - What problem was the client solving?  
        - Why was it important?  
        - Any context on scale, goals, or mission

        --- 

        **Section 2 – The Solution**  
        - Describe the delivered product/service/strategy  
        - Break down key components and clever features

        --- 

        **Section 3 – Implementation & Collaboration**  
        - How was it rolled out?  
        - What was the teamwork like?  
        - Any turning points or lessons learned

        --- 

        **Section 4 – Results & Impact**  
        - What changed for the client?  
        - Include any real metrics (e.g., “40% faster onboarding”)  
        - Mention qualitative feedback if shared

        --- 

        **Section 5 – Client Quote**  
        - If the transcript contains a **direct, verbatim quote** from the client or solution provider, include it as spoken.  
        - If no direct quote is present, compose **one elegant sentence** in quotation marks from the client’s or provider’s perspective. Use only language, tone, and key points found in the transcript to craft a testimonial that feels genuine, highlights the solution’s impact, and reads like a professional endorsement.

        --- 

        **Section 6 – Reflections & Closing**  
        - What did this mean for the provider’s team?  
        - End with a warm, forward-looking sentence.

        --- 

        🎯 **GOAL:**  
        A vivid, accurate, human-sounding case study grounded entirely in the transcript.

        Transcript:
        {transcript}
        """

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": openai_config["model"],
            "messages": [
                {"role": "system", "content": prompt},
            ],
            "temperature": openai_config["temperature"],
            "top_p": openai_config["top_p"],
            "presence_penalty": openai_config["presence_penalty"],
            "frequency_penalty": openai_config["frequency_penalty"]
        }

        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        result = response.json()
        case_study = result["choices"][0]["message"]["content"]
        cleaned_case_study = clean_text(case_study)

        extracted_names = extract_names_from_case_study(cleaned_case_study)

        # Generate the provider session ID (this is where you generate a UUID)
        provider_session_id = str(uuid.uuid4())  # Generate a unique ID for the provider session
        store_solution_provider_session(provider_session_id, cleaned_case_study)  # Store only the case study summary

        # Now create a client session that links to the solution provider's session
        client_token = create_client_session(provider_session_id)

        if client_token:
            print(f"Client session created with token: {client_token}")
        else:
            print(f"Failed to create client session.")

        # Return the cleaned case study, extracted names, and the client session token to the frontend
        return jsonify({
            "status": "success",
            "text": cleaned_case_study,
            "names": extracted_names,
            "provider_session_id": provider_session_id,  # Send provider session ID here
            "client_token": client_token  # Return the client session token
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/finalize_pdf", methods=["POST"])
def finalize_pdf():
    try:
        data = request.get_json()
        final_text = clean_text(data.get("text", ""))

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_path = f"generated_pdfs/final_case_study_{timestamp}.pdf"
        os.makedirs("generated_pdfs", exist_ok=True)

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.set_font("Arial", size=12)

        for line in final_text.split("\n"):
            pdf.multi_cell(0, 10, line)

        pdf.output(pdf_path)

        return jsonify({"status": "success", "pdf_url": f"/download/{os.path.basename(pdf_path)}"})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/download/<filename>")
def download_pdf(filename):
    return send_file(os.path.join("generated_pdfs", filename), as_attachment=True)

def store_solution_provider_session(provider_session_id, cleaned_case_study):
    extracted_names = extract_names_from_case_study(cleaned_case_study)
    print(f"Storing provider session with ID: {provider_session_id}")  # Debugging line

    mock_db["solution_provider_sessions"][provider_session_id] = {
        "summary": cleaned_case_study,
        "provider_name": extracted_names["lead_entity"],
        "client_name": extracted_names["partner_entity"],
        "project_name": extracted_names["project_title"],
    }

    print("Provider Sessions after storing:", mock_db["solution_provider_sessions"])  # Debugging line


def create_client_session(provider_session_id):
    token = str(uuid.uuid4())  # Generate a unique token for the client session
    print(f"Creating client session with provider session ID: {provider_session_id}")  # Debugging line

    # Ensure the provider session exists
    if provider_session_id not in mock_db["solution_provider_sessions"]:
        print(f"ERROR: Provider session {provider_session_id} not found.")  # Debugging line
        return None  # or raise an exception as needed

    mock_db["client_sessions"][token] = {
        "provider_session_id": provider_session_id,  # Link the client session to the provider session
        "used": False
    }

    print(f"Client session {token} created and linked to provider session {provider_session_id}")  # Debugging line
    print("Current client sessions:", mock_db["client_sessions"])  # Debugging line

    return token


@app.route("/client-interview/<token>", methods=["GET"])
def client_interview(token):
    try:
        # Retrieve the client session by token from the mock DB
        session_link = mock_db["client_sessions"].get(token)
        if not session_link or session_link["used"]:
            return jsonify({"status": "error", "message": "Invalid or expired link"}), 404

        # Fetch the solution provider's session data using provider_session_id
        provider_session = mock_db["solution_provider_sessions"].get(session_link["provider_session_id"])
        if not provider_session:
            return jsonify({"status": "error", "message": "Provider session not found"}), 404

        # Mark the client session as used (to prevent reuse)
        session_link["used"] = True

        # Retrieve provider name, client name, project name, and the solution provider's summary
        provider_name = provider_session.get("provider_name", "Unknown Provider")
        client_name = provider_session.get("client_name", "Unknown Client")
        project_name = provider_session.get("project_name", "Unknown Project")
        provider_summary = provider_session.get("summary", "No summary available.")

        # Send the extracted data to the frontend
        return jsonify({
            "status": "success",
            "provider_name": provider_name,
            "client_name": client_name,
            "project_name": project_name,
            "provider_summary": provider_summary
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/client/<token>")
def serve_client_interview(token):
    return send_from_directory(app.static_folder, "client.html")



@app.route("/generate_client_interview_link", methods=["POST"])
def generate_client_interview_link():
    try:
        data = request.get_json()

        # Retrieve provider_session_id from the request payload
        provider_session_id = data.get("provider_session_id")
        if not provider_session_id or provider_session_id not in mock_db["solution_provider_sessions"]:
            return jsonify({"status": "error", "message": "Invalid provider session ID."}), 400

        # Generate a client session with the valid provider session ID
        token = create_client_session(provider_session_id)
        if not token:
            return jsonify({"status": "error", "message": "Failed to create client session."}), 500

        interview_link = f"http://127.0.0.1:10000/client/{token}"


        return jsonify({"status": "success", "interview_link": interview_link})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)