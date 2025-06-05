from flask import Flask, jsonify, send_from_directory, request, send_file, session
import requests
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fpdf import FPDF
import re
import uuid
import json
from langdetect import detect
from db import SessionLocal, init_db
from models import (
    User,
    CaseStudy,
    SolutionProviderInterview,
    ClientInterview,
    InviteToken,
    Label,
    Feedback
)
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.exc import IntegrityError
from functools import wraps
from flask_jwt_extended import jwt_required, get_jwt_identity


load_dotenv()
app = Flask(__name__, static_folder='../frontend', static_url_path='')

# JWT configuration
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev_jwt_secret")  # Use a strong secret in production!
app.config["JWT_TOKEN_LOCATION"] = ["headers"]  # Tell Flask-JWT-Extended to look for JWTs in headers

init_db()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Security configurations
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=24),
    MAX_LOGIN_ATTEMPTS=5,
    LOGIN_LOCKOUT_DURATION=timedelta(minutes=15)
)

app.secret_key = os.getenv("SECRET_KEY", "dev_secret_key")  # Use a strong secret in production!

openai_config = {
    "model": "gpt-4",
    "temperature": 0.5,        # Balanced creativity for conversational flow
    "top_p": 0.9,              # Allows controlled variation
    "presence_penalty": 0.2,   # Slightly discourages repetition
    "frequency_penalty": 0.2   # Keeps phrasing varied
}

# Initialize feedback sessions dictionary
feedback_sessions = {}

def clean_text(text):
    return (
        text.replace("•", "-")  
            .replace("—", "-")
            .replace("–", "-")
            .replace(""", '"')
            .replace(""", '"')
            .replace("'", "'")
            .replace("'", "'")
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
    return send_from_directory(app.static_folder, "login.html")

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

from langdetect import detect

def detect_language(text):
    try:
        # Get the language code
        lang_code = detect(text)
        
        # Map language codes to full names
        language_map = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'ar': 'Arabic',
            'hi': 'Hindi',
            'pl': 'Polish',
            'sq': 'Albanian',  # Added Albanian
            # Add more languages as needed
        }
        
        return language_map.get(lang_code, 'English')  # Default to English if language not in map
    except:
        return 'English'  # Default to English if detection fails

@app.route("/generate_summary", methods=["POST"])
def generate_summary():
    try:
        data = request.get_json()
        transcript = data.get("transcript", "")

        if not transcript:
            return jsonify({"status": "error", "message": "Transcript is missing."}), 400

        # Detect language from transcript
        detected_language = detect_language(transcript)
        print(detected_language)
        
        # Use the detected language in the prompt
        prompt = f"""
        You are a professional case study writer. Your job is to generate a **rich, structured, human-style business case study** from a transcript of a real voice interview.

        IMPORTANT: Write the entire case study in {detected_language}. This includes all sections, quotes, and any additional content.
        This is an **external project**: the speaker is the solution provider describing a project they delivered to a client. Your task is to write a clear, emotionally intelligent case study from their perspective—based **ONLY** on what's in the transcript.

        --- 

        ❌ **DO NOT INVENT ANYTHING**  
        - Do NOT fabricate dialogue or add made-up details  
        - Do NOT simulate the interview format  
        - Do NOT assume or imagine info not explicitly said  

        ✅ **USE ONLY what's really in the transcript.** If a piece of information (like a client quote) wasn't provided, **craft** a brief, realistic-sounding quote that captures the client's sentiment based on what they did say.

        --- 

        ### ✍️ CASE STUDY STRUCTURE (MANDATORY)

        **Title** (first line only—no extra formatting):Format: **[Solution Provider] x [Client]: [Project/product/service/strategy]**

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
        - Include any real metrics (e.g., "40% faster onboarding")  
        - Mention qualitative feedback if shared

        --- 

        **Section 5 – Client Quote**  
        - If the transcript contains a **direct, verbatim quote** from the client or solution provider, include it as spoken.  
        - If no direct quote is present, compose **one elegant sentence** in quotation marks from the client's or provider's perspective. Use only language, tone, and key points found in the transcript to craft a testimonial that feels genuine, highlights the solution's impact, and reads like a professional endorsement.

        --- 

        **Section 6 – Reflections & Closing**  
        - What did this mean for the provider's team?  
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
            "messages": [{"role": "system", "content": prompt}],
            "temperature": openai_config["temperature"],
            "top_p": openai_config["top_p"],
            "presence_penalty": openai_config["presence_penalty"],
            "frequency_penalty": openai_config["frequency_penalty"]
        }

        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        result = response.json()
        case_study = result["choices"][0]["message"]["content"]
        cleaned = clean_text(case_study)
        names = extract_names_from_case_study(cleaned)
        # First save to DB and get case_study_id
        provider_session_id = str(uuid.uuid4())  # 🔁 Generate a session ID now
        case_study_id = store_solution_provider_session(provider_session_id, cleaned)

        return jsonify({
            "status": "success",
            "text": cleaned,
            "names": names,
            "provider_session_id": provider_session_id,
            "case_study_id": case_study_id
        })




    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/save_provider_summary", methods=["POST"])
def save_provider_summary():
    session = SessionLocal()
    try:
        data = request.get_json()
        provider_session_id = data.get("provider_session_id")
        updated_summary = data.get("summary")

        if not provider_session_id or not updated_summary:
            return jsonify({"status": "error", "message": "Missing data"}), 400

        # Get interview from DB
        interview = session.query(SolutionProviderInterview).filter_by(session_id=provider_session_id).first()
        if not interview:
            return jsonify({"status": "error", "message": "Session not found"}), 404

        # ✅ Update summary
        interview.summary = updated_summary

        # ✅ Extract names from the new summary
        names = extract_names_from_case_study(updated_summary)
        lead_entity = names["lead_entity"]
        partner_entity = names["partner_entity"]
        project_title = names["project_title"]
        new_title = f"{lead_entity} x {partner_entity}: {project_title}"

        # ✅ Update CaseStudy title too
        case_study = session.query(CaseStudy).filter_by(id=interview.case_study_id).first()
        if case_study:
            case_study.title = new_title

        session.commit()

        return jsonify({
            "status": "success",
            "message": "Summary and title updated",
            "names": names,
            "case_study_id": case_study.id,
            "provider_session_id": provider_session_id
        })

    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()


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


@app.route("/extract_names", methods=["POST"])
def extract_names():
    try:
        data = request.get_json()
        summary = data.get("summary", "")
        if not summary:
            return jsonify({"status": "error", "message": "Missing summary"}), 400

        names = extract_names_from_case_study(summary)
        return jsonify({"status": "success", "names": names})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
        detected_language = detect_language(transcript)
        print(detected_language)
        

        prompt = f"""
You are a professional case study writer. Your job is to generate a **rich, human-style client perspective** on a project delivered by a solution provider.
IMPORTANT: Write the entire case study in {detected_language}. This includes all sections, quotes, and any additional content.
        - DO NOT include the transcript itself in the output.

This is a **client voice** case study — the transcript you're given is from the client who received the solution. You will create a short, structured reflection based entirely on what they shared.

---

✅ Use only the information provided in the transcript  
❌ Do NOT invent or assume missing details

---

### Structure:

**Section 1 – Project Reflection (Client Voice)**  
A warm, professional 3–5 sentence paragraph that shares:  
- What the project was  
- What the client's experience was like  
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

        return jsonify({
            "status": "success",
            "text": cleaned,
            "case_study_id": invite.case_study_id  # ✅ added
        })


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



@app.route("/download/<filename>")
def download_pdf(filename):
    return send_file(os.path.join("generated_pdfs", filename), as_attachment=True)

def store_solution_provider_session(provider_session_id, cleaned_case_study):
    session_db = SessionLocal()
    try:
        extracted_names = extract_names_from_case_study(cleaned_case_study)
        # Use the currently logged-in user
        from flask import session as flask_session
        user_id = flask_session.get('user_id')
        if not user_id:
            raise Exception('No user is logged in.')
        user = session_db.query(User).filter_by(id=user_id).first()
        if not user:
            raise Exception('Logged-in user not found.')

        # Create the CaseStudy (links to user)
        case_study = CaseStudy(
            user_id=user.id,
            title=f"{extracted_names['lead_entity']} x {extracted_names['partner_entity']}: {extracted_names['project_title']}",
            final_summary=None  # We fill this later, after full doc is generated
        )
        session_db.add(case_study)
        session_db.commit()

        # Create the SolutionProviderInterview
        provider_interview = SolutionProviderInterview(
            case_study_id=case_study.id,
            session_id=provider_session_id,
            transcript="",  # You can store transcript here later if needed
            summary=cleaned_case_study
        )
        session_db.add(provider_interview)
        session_db.commit()
        print(f"✅ Solution provider interview saved (ID: {provider_session_id})")

        return case_study.id  # Return case_study.id to be used for next step

    except Exception as e:
        session_db.rollback()
        print("❌ Error saving provider session:", str(e))
        raise
    finally:
        session_db.close()



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
        provider_interview = session.query(SolutionProviderInterview).filter_by(case_study_id=case_study_id).first()
        if provider_interview:
            provider_interview.client_link_url = interview_link
            session.commit()

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
        detected_language = detect_language(provider_summary)
        print(detected_language)
        full_prompt = f"""
        You are a top-tier business case study writer, creating professional, detailed, and visually attractive stories for web or PDF (inspired by Storydoc, Adobe, and top SaaS companies).

        IMPORTANT: Write the entire case study in {detected_language}. This includes all sections, quotes, and any additional content.

        Your job is to read the full Solution Provider and Client summaries below, and **merge them into a single, rich, multi-perspective case study**—not just by pasting, but by synthesizing their insights, stories, and data into one engaging narrative.

        ---

        **Instructions:**
        - The **Solution Provider version is your base**; the Client version should *enhance, correct, or add* to it.
        - If the client provides a correction, update, or different number/fact for something from the provider, ALWAYS use the client's corrected version in the main story (unless it is unclear; then flag for review).
        - In the "Corrected & Conflicted Replies" section, list each specific fact, number, or point that the client corrected, changed, or disagreed with.
        - Accuracy is CRITICAL: Double-check every fact, number, quote, and piece of information. Do NOT make any mistakes or subtle errors in the summary. Every detail must match the input summaries exactly unless you are synthesizing clearly from both. If you are unsure about a detail, do NOT invent or guess; either omit or flag it for clarification.
        - If the Client provided information that contradicts, corrects, or expands on the Provider's version, **create a special section titled "Corrected & Conflicted Replies"**. In this section, briefly and clearly list the key areas where the Client said something different, added, corrected, or removed a point. This should be a concise summary (bullets or short sentences) so the provider can easily see what changed.
        - In the main story, **merge and synthesize all available details and insights** from both the Solution Provider and Client summaries: background, challenges, solutions, process, collaboration, data, quotes, and results. Do not repeat information—combine and paraphrase to build a seamless narrative.
        - **Quotes:**  
            - Whenever you are prompted to include a quote (from either side), do so.
            - Additionally, act as an expert quote-finder: review both full interviews and *proactively* identify 2–3 additional, meaningful, and positive quotes from anywhere in the transcripts—especially those that reveal key insights, excitement, or real value—even if they were not explicitly provided as "quotes". This ensures the best soundbites aren't missed.
            - Quote both the provider and client if possible, using their actual words when available.
        - Write in clear, engaging business English. Use a mix of paragraphs, bold section headers, and bullet points.
        - Include real numbers, testimonials, collaboration stories, and unique project details whenever possible.
        - Start with a punchy title and bold hero statement summarizing the main impact.
        - Make each section distinct and visually scannable (use bold, bullet points, metrics, and quotes).
        - Make the results section full of specifics: show metrics, improvements, and qualitative outcomes.
        - End with a call to action for future collaboration, demo, or contact.
        - DO NOT use asterisks or Markdown stars (**) in your output. Section headers should be in ALL CAPS or plain text only.


        ---

        **CASE STUDY STRUCTURE:**

        1. **Logo & Title Block**
        - [Logo or company name]
        - Title: [Provider] & [Client]: [Project or Transformation]
        - Date (Month, Year)
        - Avg. Reading Time (if provided)

        2. **Hero Statement / Banner**
        - One-sentence summary of the most important impact or achievement.

        3. **Introduction**
        - 2–3 sentence overview, combining both perspectives. Who are the companies? What problem did they tackle together? What was the outcome?

        4. **Methodology** (optional)
        - Brief on how the project was researched, developed, or analyzed (interviews, surveys, analytics, etc).

        5. **Background**
        - The client's story, their industry, goals, and challenges before the project.
        - Why did they choose the solution provider? Add context from both summaries.

        6. **Challenges**
        - List the main problems the client faced (use bullet points).
        - Include quantitative data and qualitative pain points from both perspectives.

        7. **The Solution (Provider's Perspective)**
        - Detail what was delivered, how it worked, and what made it unique.
        - Include technical innovations, special features, and design choices.
        - Reference the provider's process, methods, and expertise.

        8. **Implementation & Collaboration (Process)**
        - Describe how both teams worked together: communication style, project management, user testing, sprints, workshops, etc.
        - Highlight teamwork, feedback, and any challenges overcome together.
        - Use insights and anecdotes from both provider and client summaries.

        9. **Results & Impact**
        - Specific metrics (growth, satisfaction, time saved, revenue, etc) and qualitative outcomes.
        - Make this section detailed: include before/after numbers, quotes, and proof points.
        - Summarize what changed for the client, and what the provider is proud of.

        10. **Customer/Client Reflection**
            - One paragraph (from the client summary) about their experience, feelings, and results in their own words.
            - Include a client quote if provided.

        11. **Testimonial/Provider Reflection**
            - Provider's own short reflection or quote about the partnership and success.

        12. **Corrected & Conflicted Replies**
            - *(Only for the solution provider's view, not in the published story for the client.)*
            - Briefly summarize any specific facts, numbers, or perspectives that the client corrected, contradicted, or added, compared to the provider's summary.
            - Use a bulleted list or short sentences:  
            - "Client stated project delivered in 7 weeks, not 6."  
            - "Client mentioned additional integration with Shopify, not noted by provider."  
            - "Provider said client satisfaction 95%, client said 89%."  
            - "Client removed/clarified certain benefits."
            - This is a quick-reference "diff" so the provider can see at a glance where their and the client's stories differ or align.

        13. **Quotes Highlights**
            - At the end, provide a section listing 2–3 of the most impactful, positive, and contextually relevant quotes found anywhere in either interview transcript (even if not submitted as a "quote").  
            - Label the quotes with who said them.  
            - Example:  
            - **Provider:** "What surprised us most was the speed of adoption."  
            - **Client:** "I finally got real-time data I could actually use."  
            - Only include direct words or close paraphrases.

        14. **Call to Action**
            - Friendly invitation to book a meeting, see a demo, or contact for partnership.
            - Include links or contact info if available.

        ---

        **Style Notes:**

        - Make it detailed—avoid generic statements.
        - Merge, paraphrase, and connect ideas to create a seamless, compelling story from both sides.
        - Use real data and anecdotes whenever possible.
        - Bold section headers, bullet points for lists, and visual cues for metrics.
        - Ensure the story flows logically and keeps the reader engaged.
        - The output should be ready for use as a visually attractive PDF or web story.

        ---

        **INPUT DATA:**

        Now, generate the complete, detailed case study as described above, using both summaries in every section, following these instructions exactly.

        **Provider Summary:**  
        {provider_summary}

        ---

        **Client Summary:**  
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
        case_study_text = result["choices"][0]["message"]["content"]
        cleaned = clean_text(case_study_text)

        # ✅ STORE the final summary in the DB
        # ✅ STORE the final summary AND generate PDF
        case_study.final_summary = cleaned

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_filename = f"final_case_study_{timestamp}.pdf"
        pdf_path = os.path.join("generated_pdfs", pdf_filename)
        os.makedirs("generated_pdfs", exist_ok=True)

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.set_font("Arial", size=12)
        for line in cleaned.split("\n"):
            pdf.multi_cell(0, 10, line)

        pdf.output(pdf_path)

        # ✅ Save path to DB
        case_study.final_summary_pdf_path = pdf_path
        session.commit()

        return jsonify({
            "status": "success",
            "text": cleaned,
            "pdf_url": f"/download/{pdf_filename}"
        })


    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

@app.route("/download_full_summary_pdf")
def download_full_summary_pdf():
    case_study_id = request.args.get("case_study_id")
    if not case_study_id:
        return jsonify({"status": "error", "message": "Missing case_study_id"}), 400

    session = SessionLocal()
    try:
        case_study = session.query(CaseStudy).filter_by(id=case_study_id).first()

        # ✅ Check path existence
        if not case_study or not case_study.final_summary_pdf_path or not os.path.exists(case_study.final_summary_pdf_path):
            return jsonify({"status": "error", "message": "Final summary PDF not available"}), 404

        return jsonify({
            "status": "success",
            "pdf_url": f"/download/{os.path.basename(case_study.final_summary_pdf_path)}"
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

def validate_password(password):
    """Validate password strength."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    return True, ""

def validate_email(email):
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def sanitize_input(text):
    """Sanitize user input."""
    if not text:
        return ""
    # Remove any HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Remove any script tags
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.DOTALL)
    return text.strip()

@app.route('/api/signup', methods=['POST'])
def api_signup():
    data = request.get_json()
    print("DEBUG SIGNUP DATA:", data)
    required = ['first_name', 'last_name', 'email', 'company', 'password']
    if not all(data.get(f) for f in required):
        print("DEBUG: Missing field in", data)
        for f in required:
            print(f"  {f}: {data.get(f) if data else None}")
        return jsonify({'success': False, 'message': 'All fields are required.'}), 400
    session_db = SessionLocal()
    try:
        user = User(
            first_name=data['first_name'].strip(),
            last_name=data['last_name'].strip(),
            email=data['email'].strip().lower(),
            company_name=data['company'].strip(),
            password_hash=generate_password_hash(data['password'])
        )
        session_db.add(user)
        session_db.commit()
        session['user_id'] = user.id
        session.permanent = True
        return jsonify({'success': True})
    except IntegrityError:
        session_db.rollback()
        return jsonify({'success': False, 'message': 'Email already registered.'}), 409
    except Exception as e:
        session_db.rollback()
        print("DEBUG: Exception during signup:", e)
        return jsonify({'success': False, 'message': 'An error occurred during signup.'}), 500
    finally:
        session_db.close()

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password are required.'}), 400

    session_db = SessionLocal()
    try:
        user = session_db.query(User).filter_by(email=email).first()
        
        # Check if account is locked
        if user and user.account_locked_until and user.account_locked_until > datetime.now():
            remaining_time = (user.account_locked_until - datetime.now()).seconds // 60
            return jsonify({
                'success': False, 
                'message': f'Account is locked. Try again in {remaining_time} minutes.'
            }), 401

        if user and check_password_hash(user.password_hash, password):
            # Reset failed attempts on successful login
            user.failed_login_attempts = 0
            user.last_login = datetime.now()
            user.account_locked_until = None
            session_db.commit()
            
            session['user_id'] = user.id
            session.permanent = True
            return jsonify({'success': True})
        else:
            if user:
                # Increment failed attempts
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= app.config['MAX_LOGIN_ATTEMPTS']:
                    user.account_locked_until = datetime.now() + app.config['LOGIN_LOCKOUT_DURATION']
                session_db.commit()
            
            return jsonify({'success': False, 'message': 'Invalid email or password.'}), 401
    finally:
        session_db.close()

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/case_studies')
def api_case_studies():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    label_id = request.args.get('label', type=int)
    db_session = SessionLocal()
    try:
        query = db_session.query(CaseStudy).filter_by(user_id=user_id)
        if label_id:
            query = query.join(CaseStudy.labels).filter(Label.id == label_id)
        case_studies = query.all()
        result = []
        for cs in case_studies:
            result.append({
                'id': cs.id,
                'title': cs.title,
                'solution_provider_summary': getattr(cs.solution_provider_interview, 'summary', None),
                'client_summary': getattr(cs.client_interview, 'summary', None),
                'final_summary': cs.final_summary,
                'labels': [{'id': l.id, 'name': l.name} for l in cs.labels],
                'client_link_url': getattr(cs.solution_provider_interview, 'client_link_url', None),  
            })
        return jsonify({'success': True, 'case_studies': result})
    finally:
        db_session.close()

@app.route('/api/labels', methods=['GET'])
def get_labels():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    db_session = SessionLocal()
    try:
        labels = db_session.query(Label).filter_by(user_id=user_id).all()
        return jsonify({'success': True, 'labels': [{'id': l.id, 'name': l.name} for l in labels]})
    finally:
        db_session.close()

@app.route('/api/labels', methods=['POST'])
def create_label():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Label name required'}), 400
    db_session = SessionLocal()
    try:
        label = Label(name=name, user_id=user_id)
        db_session.add(label)
        db_session.commit()
        return jsonify({'success': True, 'label': {'id': label.id, 'name': label.name}})
    finally:
        db_session.close()

@app.route('/api/labels/<int:label_id>', methods=['PATCH'])
def rename_label(label_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    data = request.get_json()
    new_name = data.get('name', '').strip()
    if not new_name:
        return jsonify({'success': False, 'message': 'New label name required'}), 400
    db_session = SessionLocal()
    try:
        label = db_session.query(Label).filter_by(id=label_id, user_id=user_id).first()
        if not label:
            return jsonify({'success': False, 'message': 'Label not found'}), 404
        label.name = new_name
        db_session.commit()
        return jsonify({'success': True, 'label': {'id': label.id, 'name': label.name}})
    finally:
        db_session.close()

@app.route('/api/labels/<int:label_id>', methods=['DELETE'])
def delete_label(label_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    db_session = SessionLocal()
    try:
        label = db_session.query(Label).filter_by(id=label_id, user_id=user_id).first()
        if not label:
            return jsonify({'success': False, 'message': 'Label not found'}), 404
        db_session.delete(label)
        db_session.commit()
        return jsonify({'success': True})
    finally:
        db_session.close()

@app.route('/api/case_studies/<int:case_study_id>/labels', methods=['POST'])
def add_labels_to_case_study(case_study_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    data = request.get_json()
    label_ids = data.get('label_ids', [])
    label_names = data.get('label_names', [])
    db_session = SessionLocal()
    try:
        case_study = db_session.query(CaseStudy).filter_by(id=case_study_id, user_id=user_id).first()
        if not case_study:
            return jsonify({'success': False, 'message': 'Case study not found'}), 404
        # Add by IDs
        for lid in label_ids:
            label = db_session.query(Label).filter_by(id=lid, user_id=user_id).first()
            if label and label not in case_study.labels:
                case_study.labels.append(label)
        # Add by names (create if not exist)
        for name in label_names:
            name = name.strip()
            if not name:
                continue
            label = db_session.query(Label).filter_by(name=name, user_id=user_id).first()
            if not label:
                label = Label(name=name, user_id=user_id)
                db_session.add(label)
                db_session.commit()
            if label not in case_study.labels:
                case_study.labels.append(label)
        db_session.commit()
        return jsonify({'success': True, 'labels': [{'id': l.id, 'name': l.name} for l in case_study.labels]})
    finally:
        db_session.close()

@app.route('/api/case_studies/<int:case_study_id>/labels/<int:label_id>', methods=['DELETE'])
def remove_label_from_case_study(case_study_id, label_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    db_session = SessionLocal()
    try:
        case_study = db_session.query(CaseStudy).filter_by(id=case_study_id, user_id=user_id).first()
        if not case_study:
            return jsonify({'success': False, 'message': 'Case study not found'}), 404
        label = db_session.query(Label).filter_by(id=label_id, user_id=user_id).first()
        if not label or label not in case_study.labels:
            return jsonify({'success': False, 'message': 'Label not found on this case study'}), 404
        case_study.labels.remove(label)
        db_session.commit()
        return jsonify({'success': True, 'labels': [{'id': l.id, 'name': l.name} for l in case_study.labels]})
    finally:
        db_session.close()

@app.route('/api/user')
def api_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    db_session = SessionLocal()
    try:
        user = db_session.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        return jsonify({
            'success': True,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email
        })
    finally:
        db_session.close()

@app.route('/api/feedback/start', methods=['POST'])
def start_feedback_session():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    session_id = str(uuid.uuid4())
    feedback_sessions[session_id] = {
        'user_id': user_id,
        'start_time': datetime.utcnow(),
        'transcript': [],
        'status': 'active'
    }
    return jsonify({'session_id': session_id, 'status': 'started'})

@app.route('/api/feedback/submit', methods=['POST'])
def submit_feedback():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    data = request.json
    session_db = SessionLocal()
    try:
        feedback = Feedback(
            user_id=user_id,
            content=data.get('content'),
            rating=data.get('rating'),
            feedback_type=data.get('feedback_type', 'general')
        )
        session_db.add(feedback)
        session_db.commit()
        return jsonify(feedback.to_dict())
    except Exception as e:
        session_db.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        session_db.close()

@app.route('/api/feedback/history', methods=['GET'])
def get_feedback_history():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    session_db = SessionLocal()
    try:
        feedbacks = session_db.query(Feedback).filter_by(user_id=user_id).order_by(Feedback.created_at.desc()).all()
        return jsonify([feedback.to_dict() for feedback in feedbacks])
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        session_db.close()

@app.route("/get_provider_transcript", methods=["GET"])
def get_provider_transcript():
    session = SessionLocal()
    try:
        token = request.args.get("token")
        if not token:
            return jsonify({"status": "error", "message": "Missing token"}), 400

        # Get case_study_id from token
        invite = session.query(InviteToken).filter_by(token=token).first()
        if not invite:
            return jsonify({"status": "error", "message": "Invalid token"}), 404

        # Get the provider interview transcript
        provider_interview = session.query(SolutionProviderInterview).filter_by(case_study_id=invite.case_study_id).first()
        if not provider_interview or not provider_interview.transcript:
            return jsonify({"status": "error", "message": "Provider transcript not found"}), 404

        return jsonify({
            "status": "success",
            "transcript": provider_interview.transcript
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)