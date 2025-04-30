from flask import Flask, jsonify, send_from_directory, request, send_file
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
from fpdf import FPDF
import re

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
    text = text.replace("—", "-").replace("–", "-")

    # Try to extract from explicit identifiers first
    id_block = re.search(r"\[IDENTIFIERS\](.*?)\[/IDENTIFIERS\]", text, re.DOTALL)
    if id_block:
        block = id_block.group(1)
        lead = re.search(r"Solution Provider:\s*(.+)", block)
        collab = re.search(r"Collaborator:\s*(.+)", block)
        project = re.search(r"Project:\s*(.+)", block)
        return {
            "lead_entity": lead.group(1).strip() if lead else "Unknown",
            "partner_entity": collab.group(1).strip() if collab else "",
            "project_title": project.group(1).strip() if project else "Unknown Project"
        }

    # Fallback to title line parsing
    pattern = r"(?i)^([A-Z][\w\s&.-]+?)\s*(?:x\s*([A-Z][\w\s&.-]+?))?\s*[:：-]\s*(.+?)\n"
    match = re.search(pattern, text, re.MULTILINE)
    if match:
        return {
            "lead_entity": match.group(1).strip(),
            "partner_entity": match.group(2).strip() if match.group(2) else "",
            "project_title": match.group(3).strip()
        }

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
        "voice": "coral"
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

        # Same prompt as before
        prompt = f"""
You are a professional case study writer. Your task is to generate a **rich, detailed, brand-style case study** from the transcript of a human voice interview. The final case study should read like a real success story published by a modern brand (like Spotify, Chipotle, or Taylor Guitars).

---

🎯 FIRST: DETERMINE THE CONTEXT TYPE

Based on the transcript, decide whether the story is:
1. An **Internal initiative** (built for the speaker's own team/org, internal process, academic project, nonprofit, or startup journey)
2. An **External collaboration** (delivered to a client, partner, customer, or public audience)

Use clear signals in the transcript (e.g., “client,” “internal team,” “partner,” “we built it for them,” etc.) to determine which format to follow. If unclear, default to **internal**.

---

## ✍️ SHARED WRITING INSTRUCTIONS

- **DO NOT invent or assume facts**. Use only what’s present in the transcript.
- The writing should feel like a human wrote it — vivid, emotionally intelligent, professional, and not robotic or templated.
- Stay true to the interviewee’s tone. Mirror casual or serious energy. Echo their expressions and voice when possible.
- Tell the full story: where things started, what changed, what was delivered, and why it mattered.
- Use real business or project language if the speaker did — otherwise keep it simple and clear.
- You may structure your story in **paragraph sections** with headings or blocks — but the tone should remain fluent and easy to read.

---
---
📌 STRUCTURED IDENTIFIERS

In addition to writing the full case study, return the **true values** for:

- Solution Provider (who built the solution)
- Collaborator or Client (who the project was for)
- Project Name or Outcome (short label for the work done)


→ These values must be short and accurate names, NOT descriptions or industries.
→ Do NOT make them up. Use what the speaker said.
→ Only fill Collaborator if it’s an external story.

## 🔁 CASE STUDY FORMAT: INTERNAL INITIATIVE

**Title:**  
Format: [Team/Org] x [Dept/Audience]: [Project Name]  
Example: StudioOps x Product Team: Simplifying Asset Reviews at Scale

**Hero Paragraph (Intro without a header):**  
Open with a high-level narrative hook: What was the team trying to do? What problem or ambition kicked this off? Mention their mission or values if shared. Make it sound like a brand story.

**Section 1 – The Challenge**  
- What was broken or inefficient before?  
- Was there a specific moment or trigger to start this initiative?  
- Why now? What was at stake?

**Section 2 – The Solution**  
- What was built, changed, or reimagined?  
- Break the solution into components if needed (tool, process, system, design, etc.)  
- Highlight clever decisions, technical wins, or any improvisation that made it work

**Section 3 – The Impact**  
- What changed internally?  
- Time savings, culture shifts, clarity, reduced friction, better output, team alignment — anything real  
- Add real metrics if mentioned (e.g. “Saved 8 hours per week per team,” “Cut cycle time by 40%,” etc.)

**Section 4 – Reflection (Optional but recommended)**  
- What did the team learn? What was meaningful about this work?  
- Include a quote if the speaker reflected emotionally or strategically.

**Closing:**  
End with a confident wrap-up. Show pride, future intent, or advice. Keep it grounded in what was actually said.

---

## 🤝 CASE STUDY FORMAT: EXTERNAL COLLABORATION

**Title:**  
Format: [Solution Provider] x [Client Name]: [Project or Outcome]  
Example: BrightCloud x EcoFoods: Transforming Farm Data Into Daily Insights

**Hero Paragraph (Intro without a header):**  
Open with a brief description of the client and their industry, followed by the challenge or opportunity they faced. Then introduce the speaker’s company and the solution they provided.

**Section 1 – The Challenge**  
- What was the client trying to solve, improve, or unlock?  
- What made this moment urgent or important?  
- Was the old solution broken? Were they trying something new?

**Section 2 – The Solution**  
- Describe what was delivered: product, service, strategy, campaign, system  
- Break it down into digestible parts  
- Mention any collaboration moments, pivots, clever fixes, personalization, or innovation

**Section 3 – The Results**  
- What changed for the client? Include both qualitative and quantitative outcomes  
- Use bullet-point KPIs (if provided), like:  
  • 40% faster onboarding  
  • 53% increase in engagement  
  • $1M in new revenue  
- Highlight client satisfaction, feedback, or repeat business

**Section 4 – The Relationship**  
- How did the collaboration feel?  
- Were there standout moments, tough obstacles, or a moment of pride?  
- Include a quote if the speaker shared one from the client — otherwise create a natural-sounding one based on their words

**Closing:**  
Conclude by showing why this project was meaningful to the speaker’s team — and what others might learn from it.

---

🏁 Final Goal:

Generate a story-rich, emotionally compelling, and clearly structured case study that reflects the **real journey and voice** of the speaker. Use natural language, adapt your phrasing based on tone, and emphasize clarity, results, and insight.

Be specific. Be human. Be faithful to the transcript.

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

        return jsonify({
            "status": "success",
            "text": cleaned_case_study,
            "names": extracted_names
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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
