from flask import Flask, jsonify, send_from_directory, request, send_file
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
from fpdf import FPDF
import re
import uuid
import json
from db import SessionLocal, init_db
from models import (
    User,
    CaseStudy,
    SolutionProviderInterview,
    ClientInterview,
    InviteToken
)


load_dotenv()
app = Flask(__name__, static_folder='../frontend', static_url_path='')

init_db()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

openai_config = {
    "model": "gpt-4",
    "temperature": 0.5,        # Balanced creativity for conversational flow
    "top_p": 0.9,              # Allows controlled variation
    "presence_penalty": 0.2,   # Slightly discourages repetition
    "frequency_penalty": 0.2   # Keeps phrasing varied
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
    session = SessionLocal()
    try:
        raw_transcript = request.get_json()
        transcript_lines = []
        buffer = {"ai": "", "user": ""}
        last_speaker = None

        for entry in raw_transcript:
            speaker = entry.get("speaker", "").lower()
            text = entry.get("text", "").strip()
            if not text:
                continue
            if speaker != last_speaker and last_speaker is not None:
                if buffer[last_speaker]:
                    transcript_lines.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")
                    buffer[last_speaker] = ""
            buffer[speaker] += " " + text
            last_speaker = speaker

        if last_speaker and buffer[last_speaker]:
            transcript_lines.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")

        full_transcript = "\n".join(transcript_lines)

        # ⚠️ Assume provider_session_id is passed from frontend!
        provider_session_id = request.args.get("provider_session_id")
        if not provider_session_id:
            return jsonify({"status": "error", "message": "Missing provider_session_id"}), 400

        # Store in DB
        interview = session.query(SolutionProviderInterview).filter_by(session_id=provider_session_id).first()
        if interview:
            interview.transcript = full_transcript
            session.commit()

        return jsonify({"status": "success", "message": "Transcript saved to DB"})

    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()


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
        provider_session_id = str(uuid.uuid4())
        case_study_id = store_solution_provider_session(provider_session_id, cleaned_case_study)
        client_token = create_client_session(case_study_id)

        if client_token:
            print(f"Client session created with token: {client_token}")
        else:
            print(f"Failed to create client session.")

        # Return the cleaned case study, extracted names, and the client session token to the frontend
        return jsonify({
        "status": "success",
        "text": cleaned_case_study,
        "names": extracted_names,
        "provider_session_id": provider_session_id,  # (UUID, not used for linking)
        "case_study_id": case_study_id,              # (INT, for DB operations)
        "client_token": client_token
    })


    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/save_client_transcript", methods=["POST"])
def save_client_transcript():
    session = SessionLocal()
    try:
        raw_transcript = request.get_json()
        transcript_lines = []
        buffer = {"ai": "", "user": ""}
        last_speaker = None

        for entry in raw_transcript:
            speaker = entry.get("speaker", "").lower()
            text = entry.get("text", "").strip()
            if not text:
                continue
            if speaker != last_speaker and last_speaker is not None:
                if buffer[last_speaker]:
                    transcript_lines.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")
                    buffer[last_speaker] = ""
            buffer[speaker] += " " + text
            last_speaker = speaker

        if last_speaker and buffer[last_speaker]:
            transcript_lines.append(f"{last_speaker.upper()}: {buffer[last_speaker].strip()}")

        full_transcript = "\n".join(transcript_lines)

        # ⚠️ Get token from query string
        token = request.args.get("token")
        if not token:
            return jsonify({"status": "error", "message": "Missing token"}), 400

        # Get case_study_id from token
        invite = session.query(InviteToken).filter_by(token=token).first()
        if not invite:
            return jsonify({"status": "error", "message": "Invalid token"}), 404

        # Create or update ClientInterview
        client_session_id = str(uuid.uuid4())
        interview = session.query(ClientInterview).filter_by(case_study_id=invite.case_study_id).first()

        if interview:
            interview.transcript = full_transcript
        else:
            interview = ClientInterview(
                case_study_id=invite.case_study_id,
                session_id=client_session_id,
                transcript=full_transcript
            )
            session.add(interview)

        session.commit()
        return jsonify({"status": "success", "message": "Client transcript saved", "session_id": client_session_id})

    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()


@app.route("/generate_client_summary", methods=["POST"])
def generate_client_summary():
    session = SessionLocal()
    try:
        data = request.get_json()
        transcript = data.get("transcript", "")
        token = request.args.get("token")

        if not transcript:
            return jsonify({"status": "error", "message": "Transcript is missing."}), 400
        if not token:
            return jsonify({"status": "error", "message": "Missing token"}), 400

        prompt = f"""
You are a professional case study writer. Your job is to generate a **rich, human-style client perspective** on a project delivered by a solution provider.

This is a **client voice** case study — the transcript you're given is from the client who received the solution. You will create a short, structured reflection based entirely on what they shared.

---

✅ Use only the information provided in the transcript  
❌ Do NOT invent or assume missing details

---

### Structure:

**Section 1 – Project Reflection (Client Voice)**  
A warm, professional 3–5 sentence paragraph that shares:  
- What the project was  
- What the client’s experience was like  
- The results or value they got  
- A light personal note if they gave one

---

**Section 2 – Client Quote**  
Include a short quote from the client (verbatim if given, otherwise craft one from the content).  
Make it feel authentic, appreciative, and aligned with their actual words.

---

🎯 GOAL:  
Provide a simple, balanced, human-sounding reflection from the client that complements the full case study.

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
        summary = result["choices"][0]["message"]["content"]
        cleaned = clean_text(summary)

        invite = session.query(InviteToken).filter_by(token=token).first()
        if not invite:
            return jsonify({"status": "error", "message": "Invalid token"}), 404

        client_interview = session.query(ClientInterview).filter_by(case_study_id=invite.case_study_id).first()
        if client_interview:
            client_interview.summary = cleaned
            session.commit()

        return jsonify({"status": "success", "text": cleaned})

    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

def store_client_summary(case_study_id, client_summary):
    session = SessionLocal()
    try:
        client_interview = session.query(ClientInterview).filter_by(case_study_id=case_study_id).first()
        if client_interview:
            client_interview.summary = client_summary
            session.commit()
    except Exception as e:
        session.rollback()
        print("❌ Error saving client summary:", str(e))
    finally:
        session.close()


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
    session = SessionLocal()
    try:
        extracted_names = extract_names_from_case_study(cleaned_case_study)
        # For demo, just get first user (for real app, use logged-in user)
        user = session.query(User).first()
        if not user:
            # Demo: create a user if doesn't exist (production: require login!)
            user = User(
                first_name="Demo",
                last_name="User",
                email=f"demo_{uuid.uuid4()}@test.com",
                password_hash="hashedpassword",
                company_name=extracted_names['lead_entity']
            )
            session.add(user)
            session.commit()

        # Create the CaseStudy (links to user)
        case_study = CaseStudy(
            user_id=user.id,
            title=f"{extracted_names['lead_entity']} x {extracted_names['partner_entity']}: {extracted_names['project_title']}",
            final_summary=None  # We fill this later, after full doc is generated
        )
        session.add(case_study)
        session.commit()

        # Create the SolutionProviderInterview
        provider_interview = SolutionProviderInterview(
            case_study_id=case_study.id,
            session_id=provider_session_id,
            transcript="",  # You can store transcript here later if needed
            summary=cleaned_case_study
        )
        session.add(provider_interview)
        session.commit()
        print(f"✅ Solution provider interview saved (ID: {provider_session_id})")

        return case_study.id  # Return case_study.id to be used for next step

    except Exception as e:
        session.rollback()
        print("❌ Error saving provider session:", str(e))
        raise
    finally:
        session.close()



def create_client_session(case_study_id):
    session = SessionLocal()
    try:
        token = str(uuid.uuid4())
        invite_token = InviteToken(
            case_study_id=case_study_id,
            token=token,
            used=False
        )
        session.add(invite_token)
        session.commit()
        print(f"✅ Client invite token created: {token}")
        return token
    except Exception as e:
        session.rollback()
        print("❌ Error creating client invite token:", str(e))
        return None
    finally:
        session.close()

    



@app.route("/client-interview/<token>", methods=["GET"])
def client_interview(token):
    session = SessionLocal()
    try:
        # 1. Fetch InviteToken by token
        invite = session.query(InviteToken).filter_by(token=token).first()
        if not invite or invite.used:
            return jsonify({"status": "error", "message": "Invalid or expired link"}), 404

        # 2. Fetch CaseStudy and linked SolutionProviderInterview
        case_study = session.query(CaseStudy).filter_by(id=invite.case_study_id).first()
        if not case_study:
            return jsonify({"status": "error", "message": "Case study not found"}), 404

        provider_interview = case_study.solution_provider_interview
        if not provider_interview:
            return jsonify({"status": "error", "message": "Provider interview not found"}), 404

        # 3. Mark the invite token as used
        invite.used = True
        session.commit()

        # 4. Extract info
        provider_name = provider_interview.summary  # or parse for name, or add a name field
        client_name = case_study.title.split(" x ")[1].split(":")[0] if " x " in case_study.title else ""
        project_name = case_study.title.split(":")[-1].strip() if ":" in case_study.title else ""
        provider_summary = provider_interview.summary

        return jsonify({
            "status": "success",
            "provider_name": provider_name,
            "client_name": client_name,
            "project_name": project_name,
            "provider_summary": provider_summary
        })
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

@app.route("/client/<token>")
def serve_client_interview(token):
    return send_from_directory(app.static_folder, "client.html")



@app.route("/generate_client_interview_link", methods=["POST"])
def generate_client_interview_link():
    session = SessionLocal()
    try:
        data = request.get_json()
        case_study_id = data.get("case_study_id")
        if not case_study_id:
            return jsonify({"status": "error", "message": "Missing case_study_id."}), 400

        # Make sure this case study exists
        case_study = session.query(CaseStudy).filter_by(id=case_study_id).first()
        if not case_study:
            return jsonify({"status": "error", "message": "Invalid case study ID."}), 400

        token = create_client_session(case_study_id)
        if not token:
            return jsonify({"status": "error", "message": "Failed to create client session."}), 500

        interview_link = f"http://127.0.0.1:10000/client/{token}"
        return jsonify({"status": "success", "interview_link": interview_link})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

@app.route("/generate_full_case_study", methods=["POST"])
def generate_full_case_study():
    session = SessionLocal()
    try:
        data = request.get_json()
        case_study_id = data.get("case_study_id")

        if not case_study_id:
            return jsonify({"status": "error", "message": "Missing case_study_id"}), 400

        case_study = session.query(CaseStudy).filter_by(id=case_study_id).first()
        if not case_study:
            return jsonify({"status": "error", "message": "Case study not found"}), 404

        provider_interview = case_study.solution_provider_interview
        client_interview = case_study.client_interview

        if not provider_interview or not client_interview:
            return jsonify({"status": "error", "message": "Both summaries are required."}), 400

        provider_summary = provider_interview.summary or ""
        client_summary = client_interview.summary or ""
        full_prompt = f"""
You are a professional business writer. You are given two text summaries:

1. A detailed, structured case study from the solution provider.
2. A short, human-style reflection from the client.

Your job is to merge these into one **powerful, narrative-driven case study** that includes both perspectives and follows a clear structure.

---

🎯 GOAL:  
Create a complete case study with both technical and emotional depth — reflecting the provider's delivery and the client's outcome.

---

📌 **Format:**
- Title (as-is from provider summary)
- Hero Paragraph (use both sides)
- The Challenge
- The Solution
- Implementation & Collaboration
- Results & Impact
- Client Reflection (from client summary)
- Quote (from client summary if available)
- Closing Thoughts

---

Provider Summary:
{provider_summary}

Client Summary:
{client_summary}
"""

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": openai_config["model"],
            "messages": [
                {"role": "system", "content": full_prompt},
            ],
            "temperature": 0.5,
            "top_p": 0.9
        }

        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        result = response.json()
        case_study = result["choices"][0]["message"]["content"]
        cleaned = clean_text(case_study)

        return jsonify({"status": "success", "text": cleaned})

    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)