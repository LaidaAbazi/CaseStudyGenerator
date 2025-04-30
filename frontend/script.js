// script.js — UPDATED VERSION with real-time transcript capture + farewell detection + fixed user + AI transcription

let peerConnection, dataChannel, isSessionReady = false;
const transcriptLog = []; // Log conversation { speaker, text }
let sessionTimeout;
let userBuffer = "";
let aiBuffer = "";
let hasEnded = false;

const audioElement = document.getElementById("aiAudio");
const startButton = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

const systemInstructions = `
INSTRUCTIONS:
You are an emotionally intelligent, curious, slightly witty AI interviewer. You must behave like a real human podcast host: warm, reactive, professional-yet-casual. You are conducting a natural, voice-based conversation to gather a compelling story that can be turned into a case study. Do not act like a chatbot. Do not read a list. Sound like a human.

STYLE:
- Tone: Warm, conversational, emotionally intelligent,funny,focused,good listener,supportive.
- Use short, real-sounding reactions like: “Nice,” “Got it,” “That’s clever,” “Interesting…”
- Use casual expressions when appropriate: “Oof,” “Wow,” “That’s wild,” “Hah, love that.”
- Do not over-explain yourself. Never say “As an AI...”
- Use slight humor or wit if the moment allows — make the user smile
- Do not read instructions aloud

[INTRODUCTION_FLOW]

- Begin the conversation like a real human hopping onto a spontaneous voice call — unscripted, casual, warm.
- Use varied, natural greetings. Do not reuse the same one every time.
- Examples of natural greetings: “Hello,” “Hi hi,” “Hellooo,” “Hey you made it,” “Well hello!”

→ After your greeting, STOP. Wait for the user to respond. Do not continue speaking until they say hello or reply.

Once the user responds:
- Ask a short, casual question to check in — like “How’s your day going?” or “How are things on your end?”
- After their reply, react briefly with something human: amused, curious, empathetic — based on what they said.
- Follow up with a light, playful or witty comment to show personality. Examples of behavior (not lines):
  - Pretend to grab a virtual coffee.
  - Say you’re putting on your headphones or “tuning in.”
  - Mention how you’ve been curious to hear their story.
- Let this moment feel personal, present, and dynamic. Don’t rush it.

→ Only after the short small talk is established, begin gently gathering background.

Ask the following, one by one. Always wait for a full reply before continuing:

1. Their name — casually, in the flow.
2. What they do — use conversational phrasing (“What kind of work do you do?” or “What’s your role like these days?”).
3. Who or what they’re representing — a team, org, company, or project.

→ Use varied wording each time to avoid repetition.
→ Never ask two things at once.
→ Acknowledge and react to each answer with short affirmations like “Nice,” “Ah, cool,” “Got it,” or “Interesting.”

→ Then ask:
“Is this story something you worked on internally with your team, or was it for an external client, partner, or audience?”

→ Let the user speak. Then follow either the internal or external conversation branch.

→ Throughout, keep your tone emotionally intelligent, slightly witty, warm, and never robotic. Match their energy. Mirror their language. And stay present like a real human would.


[INTERACTION_FLOW]

- Let the conversation unfold like a real human chat, not a scripted interview.
- Start with a warm, friendly greeting. Adjust your tone based on how the user sounds.
- Pause after saying hello — wait for the user to say hi or respond before continuing.

- Then ease into the conversation. Ask how the user’s day is going, or how they’ve been.
- Let them answer. React with something short and human (e.g., amused, empathetic, curious).

- Once there’s a sense of flow, begin collecting key intro details — but do it one at a time, in a natural way. Keep it conversational.

Ask for:
- Their name — casually.
-pause
- What kind of work they do — use varied, unscripted language.
-pause
- Who or what they’re representing — team, company, org, project.
-pause

→ Don’t ask these back-to-back. Space them out. React between each.

→ After the basics are clear, ask:
“Is this story about something you worked on internally with your own team, or was it for an external client, partner, or audience?”

→ Based on the answer, follow the matching conversation path.

→ At all times: Match energy. Mirror their language. Stay reactive and emotionally present. Never act like you're reading questions.

QUESTION LOGIC:
- Do not ask more than two short, related sub-questions in a turn
- Never say “next question” or signal question transitions
- Follow up if an answer is too short: “Could you walk me through that a little more?”
- If the user answers something earlier, don’t repeat — instead reference and build on it


INTERNAL_BRANCH:
For internal initiatives inside the org. Focus on team dynamics, internal changes, and outcomes.

- Ask about the team/org’s purpose and what kind of work it usually handles
- Ask what sparked the project — a challenge, opportunity, or sudden “let’s do this” moment
- “Why now?” — Why did it matter at the time?
- Ask what the team actually built, changed, or delivered — and how the idea evolved
- Ask about roll-out: who was involved, what made it smooth or bumpy
- Ask about internal outcomes: what changed? any metrics, team reactions, wins?
- Ask for the personal angle: what did this mean to them? any moment they won’t forget?
- Ask if someone else said something about the project — feedback, reflection, quote
- Make sure you know the **company name** (solution provider) so it appears in the case study

EXTERNAL_BRANCH:
For client or partner work. Focus on what was delivered and how it helped.

- Ask who the project was for (client/org name), and what industry or space they’re in
- Ask what challenge or opportunity they brought to the table
- Ask what the client was hoping to achieve
- Ask what the team (solution provider) did — delivered, built, created, launched
- Ask how it worked — key components, clever pieces, customization
- Ask about the implementation: who was involved, how the collaboration felt, any pivots
- Ask about the outcome: what changed for the client? any feedback, reactions, data?
- Ask the speaker what this meant to them — proudest moment or biggest learning
- Ask if the client said anything that stood out — a quote or comment
- If not: offer to write one based on the story
- Make sure to capture **solution provider name** AND **client name + industry**


CONTEXTUAL BEHAVIOR:
- Reference earlier answers when relevant (e.g., “You mentioned tight deadlines earlier — how did that affect things?”)
- Mirror the user's language: if they say “campaign,” don’t say “project”
- Match the user's energy — slow and calm if reflective, upbeat if excited
- If user laughs, laugh. If they sound serious, lower your energy

ENDING:
- When all required info is gathered, end warmly:
  - “Thanks so much — that was a great story.”
  - “I’ll take everything you shared and prepare your case study summary.”
  - “Catch you later!” or “Take care!”

GOAL:
Create a fully human-feeling interview that captures the user's story in a natural, emotional, and insightful way. Surprise the user with how real and thoughtful the experience felt.

`

// Farewell detection setup
const farewellPhrases = [
  
  "goodbye",
  "see you",
  "talk to you later",
  "i have to go",
];


function isFarewell(text) {
  const cleaned = text.toLowerCase().trim();
  return farewellPhrases.some(phrase =>
    cleaned === phrase ||
    cleaned.startsWith(phrase + ".") ||
    cleaned.startsWith(phrase + "!") ||
    cleaned.startsWith(phrase + ",") ||
    cleaned.includes(" " + phrase + " ")
  );
}

function endConversation(reason) {
  if (hasEnded) return;
  hasEnded = true;

  if (sessionTimeout) clearTimeout(sessionTimeout);
  console.log("Conversation ended:", reason);
  statusEl.textContent = "📄 Interview complete.";

  fetch("/save_transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transcriptLog)
  })
    .then(res => res.json())
    .then(data => {
      console.log("✅ Transcript saved:", data.file);
      showCaseStudyControls();
    })
    .catch(err => console.error("❌ Failed to save transcript", err));

  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
}

async function initConnection() {
  try {
    const res = await fetch("/session");
    const data = await res.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    peerConnection = new RTCPeerConnection();
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = localStream.getAudioTracks()[0];
    peerConnection.addTrack(audioTrack, localStream);

    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0];
    };

    dataChannel = peerConnection.createDataChannel("openai-events");
    dataChannel.onmessage = handleMessage;

    peerConnection.ondatachannel = (event) => {
      event.channel.onmessage = handleMessage;
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const response = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });

    const answer = await response.text();
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });

    isSessionReady = true;
    statusEl.textContent = "✅ Session created. Ready to start interview.";
  } catch (err) {
    statusEl.textContent = "❌ Failed to get token.";
    console.error(err);
  }
}

function handleMessage(event) {
  const msg = JSON.parse(event.data);
  console.log("Received:", msg);

  switch (msg.type) {
    case "session.created":
      isSessionReady = true;
      break;

    case "session.updated":
      break;

    case "response.audio_transcript.delta":
      if (msg.delta) {
        aiBuffer += " " + msg.delta;
      }
      break;

    case "response.audio_transcript.done":
      if (msg.transcript) {
        transcriptLog.push({ speaker: "ai", text: msg.transcript });
        aiBuffer = "";
      }
      break;

    case "conversation.item.input_audio_transcription.delta":
      if (msg.delta) {
        userBuffer += " " + msg.delta;
      }
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (msg.transcript && !hasEnded) {
        transcriptLog.push({ speaker: "user", text: msg.transcript });
        const cleanedText = msg.transcript.toLowerCase().trim();
        userBuffer = "";

        if (isFarewell(cleanedText)) {
          console.log("👋 Detected farewell from user. Ending politely...");

          dataChannel.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              input: [
                {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Thank you for the conversation! Wishing you a great day ahead. Goodbye!`
                    }
                  ]
                }
              ]
            }
          }));

          setTimeout(() => {
            endConversation("👋 User said farewell.");
          }, 4200);
        }
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("User finished speaking — AI may now proceed.");
      break;

    default:
      console.log("Unhandled message:", msg);
  }
}

startButton.onclick = () => {
  if (!dataChannel) {
    alert("Session is not ready yet. Please wait.");
    return;
  }

  // Disable the start button after it's clicked to prevent multiple clicks
  startButton.disabled = true;
  statusEl.textContent = "🎤 Interview started...";

  // Send the greeting once the button is pressed
  const greeting = `
    Hello, this is your AI Case Study Generator. Thanks for joining me today.
  `;

  dataChannel.send(JSON.stringify({
    type: "session.update",
    session: {
      instructions: systemInstructions,
      voice: "coral", // You can change the voice as needed
      modalities: ["audio", "text"],
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: { type: "server_vad" } // This ensures that the system waits for the user to talk
    }
  }));

  // Send the greeting to the user after the button is pressed
  dataChannel.send(JSON.stringify({
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: greeting.trim()
            }
          ]
        }
      ]
    }
  }));

  // Send session update with instructions and settings for real-time conversation
  

  // Start a timer to end the session after 10 minutes if no manual exit is triggered
  sessionTimeout = setTimeout(() => {
    endConversation("⏱️ 10-minute limit reached.");
  }, 10 * 60 * 1000);
};




initConnection();

function showEditableSmartSyncUI(summaryText, originalNames) {
  const container = document.createElement("div");
  container.id = "caseStudyEditor";
  container.style.marginTop = "2rem";

  const textarea = document.createElement("textarea");
  textarea.id = "editableCaseStudy";
  textarea.style.width = "100%";
  textarea.style.height = "600px";
  textarea.value = summaryText;

  // Ensure original names are fallback-safe
  const nameMap = {
    lead_entity: originalNames.lead_entity || "",
    partner_entity: originalNames.partner_entity || "",
    project_title: originalNames.project_title || ""
  };
  
  

  const inputs = {};
  const labelStyle = "display:block;margin-top:10px;font-weight:bold";

  for (const key in nameMap) {
    const label = document.createElement("label");
    label.textContent = `${key.charAt(0).toUpperCase() + key.slice(1)}:`;
    label.setAttribute("style", labelStyle);

    const input = document.createElement("input");
    input.type = "text";
    input.value = nameMap[key];
    input.style.marginBottom = "10px";
    input.style.width = "100%";
    inputs[key] = input;

    container.appendChild(label);
    container.appendChild(input);
  }

  // ✅ FIXED Apply Button
  const applyChangesBtn = document.createElement("button");
  applyChangesBtn.textContent = "🔄 Apply Name Changes";
  applyChangesBtn.style.marginTop = "10px";
  applyChangesBtn.onclick = () => {
    let updatedText = textarea.value;

    for (const key in nameMap) {
      const original = nameMap[key];
      const current = inputs[key].value.trim();

      // Skip if same
      if (original === current || !original) continue;

      // Escape special characters for safe RegExp
      const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeRegex = new RegExp(escapedOriginal, "g");

      updatedText = updatedText.replace(safeRegex, current);
      nameMap[key] = current; // Update map
    }

    textarea.value = updatedText;
  };

  const finalizeBtn = document.createElement("button");
finalizeBtn.textContent = "📄 Generate Case Study PDF";
finalizeBtn.style.marginLeft = "10px";
finalizeBtn.onclick = async () => {
  const finalText = textarea.value;
  const res = await fetch("/finalize_pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: finalText })
  });
  const result = await res.json();
  if (result.status === "success") {
    // Create a "Download Case Study PDF" button instead of a link
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "📥 Download Case Study PDF";
    downloadBtn.style.marginTop = "10px";
    downloadBtn.style.padding = "10px 20px";
    downloadBtn.style.fontSize = "16px";
    downloadBtn.style.fontWeight = "bold";
    downloadBtn.style.backgroundColor = "#007bff"; // Button color
    downloadBtn.style.color = "white";
    downloadBtn.style.border = "none";
    downloadBtn.style.borderRadius = "5px";
    downloadBtn.style.cursor = "pointer";

    // Add hover effect
    downloadBtn.addEventListener('mouseover', () => {
      downloadBtn.style.backgroundColor = "#0056b3";
    });
    downloadBtn.addEventListener('mouseout', () => {
      downloadBtn.style.backgroundColor = "#007bff";
    });

    // Trigger file download on button click
    downloadBtn.addEventListener('click', () => {
      const link = document.createElement("a");
      link.href = result.pdf_url;
      link.download = "case_study.pdf";
      link.click(); // Programmatically click the link to download
    });

    // Append the button to the container
    container.appendChild(downloadBtn);
  } else {
    alert("❌ PDF generation failed: " + result.message);
  }
};

  container.appendChild(textarea);
  container.appendChild(applyChangesBtn);
  container.appendChild(finalizeBtn);
  document.body.appendChild(container);
}


function showCaseStudyControls() {
  const controlsDiv = document.createElement("div");
  controlsDiv.id = "caseStudyControls";
  controlsDiv.style.marginTop = "2rem";

  const generateBtn = document.createElement("button");
  generateBtn.textContent = "📝 Generate Summary";
  generateBtn.onclick = async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = "⏳ Generating...";

    const formattedTranscript = transcriptLog
      .map(e => `${e.speaker.toUpperCase()}: ${e.text}`)
      .join("\n");

    const response = await fetch("/generate_summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: formattedTranscript })
    });

    const data = await response.json();

    if (data.status === "success") {
      showEditableSmartSyncUI(data.text, data.names); // 👈 use smart replacement
    } else {
      alert("❌ Failed to generate summary: " + data.message);
    }

    generateBtn.disabled = false;
    generateBtn.textContent = "📝 Generate Summary";
  };

  controlsDiv.appendChild(generateBtn);
  document.body.appendChild(controlsDiv);
}



