
// Client-side logic for AI Case Study Client Interview
let peerConnection, dataChannel, isSessionReady = false;
const transcriptLog = [];
let sessionTimeout;
let userBuffer = "";
let aiBuffer = "";
let hasEnded = false;
let isInstructionsApplied = false;

const audioElement = document.getElementById("aiAudio");
const startButton = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

const farewellPhrases = ["goodbye", "see you", "talk to you later", "i have to go"];

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

function getClientTokenFromURL() {
  const pathParts = window.location.pathname.split('/');
  const clientIndex = pathParts.indexOf('client');
  if (clientIndex !== -1 && pathParts.length > clientIndex + 1) {
    return pathParts[clientIndex + 1];
  }
  return null;
}

async function fetchClientSessionData(token) {
  const response = await fetch(`/client-interview/${token}`);
  const data = await response.json();
  if (data.status === "success") {
    return data;
  } else {
    alert("Failed to fetch client session data");
    return null;
  }
}

async function endConversation(reason) {
  if (hasEnded) return;
  hasEnded = true;

  if (sessionTimeout) clearTimeout(sessionTimeout);
  console.log("Conversation ended:", reason);
  statusEl.textContent = "Interview complete";

  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  document.getElementById("endBtn").disabled = true;
}

async function initConnection(clientInstructions, clientGreeting) {
    try {
      const res = await fetch("/session");
      const data = await res.json();
      const EPHEMERAL_KEY = data.client_secret.value;
  
      peerConnection = new RTCPeerConnection();
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = localStream.getAudioTracks()[0];
      peerConnection.addTrack(audioTrack, localStream);
  
      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        const remoteOnly = new MediaStream();
        remoteStream.getAudioTracks().forEach(track => {
          if (track.kind === "audio" && track.label !== "Microphone") {
            remoteOnly.addTrack(track);
          }
        });
        audioElement.srcObject = remoteOnly;
      };
  
      dataChannel = peerConnection.createDataChannel("openai-events");
  
      // Send instructions when ready
      dataChannel.onopen = () => {
        dataChannel.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: clientInstructions,
            voice: "verse",
            modalities: ["audio", "text"],
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: { type: "server_vad" }
          }
        }));
      };
  
      dataChannel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(event);
  
        // ✅ Only greet after instructions are applied
        if (msg.type === "session.updated" && !isInstructionsApplied) {
          isInstructionsApplied = true;
          statusEl.textContent = "✅ Instructions loaded. AI is ready.";
  
          dataChannel.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              input: [
                {
                  type: "message",
                  role: "user",
                  content: [
                    { type: "input_text", text: clientGreeting.trim() }
                  ]
                }
              ]
            }
          }));
  
          sessionTimeout = setTimeout(() => {
            endConversation("⏱️ 10-minute limit reached.");
          }, 10 * 60 * 1000);
        }
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
      statusEl.textContent = "🔄 Connecting to AI...";
      document.getElementById("endBtn").classList.remove("hidden");

  
    } catch (err) {
      statusEl.textContent = "❌ Failed to start session.";
      console.error(err);
    }
  }
  
function handleMessage(event) {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "response.audio_transcript.done":
      if (msg.transcript) {
        transcriptLog.push({ speaker: "ai", text: msg.transcript });
        aiBuffer = "";
      }
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (msg.transcript && !hasEnded) {
        transcriptLog.push({ speaker: "user", text: msg.transcript });
        const cleanedText = msg.transcript.toLowerCase().trim();
        userBuffer = "";

        if (isFarewell(cleanedText)) {
          console.log("👋 Detected farewell from user.");
          endConversation("👋 User said farewell.");
        }
      }
      break;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = getClientTokenFromURL();
  if (!token) return;

  const sessionData = await fetchClientSessionData(token);
  if (!sessionData) return;

  const { provider_name, client_name, project_name, provider_summary } = sessionData;

  const clientInstructions = `
INSTRUCTIONS:
You are an emotionally intelligent, warm, and slightly witty AI interviewer who behaves like a real human podcast host. You're here to chat with the **client** about the project "${project_name}" delivered to them by **${provider_name}**. You should sound **curious**, **casual**, and **engaged** — like someone genuinely interested in hearing their side of the story.

STYLE:
- Your tone is friendly and professional — but also relaxed, like a real person chatting over coffee.
- Use light humor, natural pauses, and real reactions. Think “calm, clear, warm podcast energy.”
- Avoid robotic phrasing. Keep your sentences fluid and dynamic, not stiff.

[INTRODUCTION + ICEBREAKER]
- Begin with:  
  “Hey there! I’m the AI Case Study Generator — thanks so much for joining me today.”  
  Then a light icebreaker, like:  
  - **Ask a short check-in question**: You can ask them casually, “How’s your day going?” or “What’s been going on today? Anything cool?”
  - **Add a little fun**: You can mention you’re “putting on your headphones” or “grabbing your coffee” — something light and playful to keep things friendly and fun.
  - **Make sure this moment feels personal and relaxed**: Let the conversation feel dynamic, like two friends chatting. **Don’t rush into the questions**; ease into it slowly.


→ Pause for a beat, let them respond if they want.

- Then say:  
  “Earlier, I had a great chat with the team at **${provider_name}**. They told me about the work they did with you on a project called **${project_name}**, and I’d love to get your take on it.”

→ Ask:  
  “Before we get into it, could you tell me your name and your role during that project at **${client_name}**?”

→ Acknowledge warmly:  
  “Got it, thank you!” or “Perfect, that helps.”

---

[TELL THE STORY — IN YOUR OWN WORDS]
Now summarize what the solution provider shared — like you’re retelling a story to a friend. **Do NOT read their summary.** Instead:

- Tell it naturally and conversationally. Example phrasing:
  “So from what they shared, it sounds like your team at ${client_name} was facing [brief client challenge].”
  “The ${provider_name} folks came in with a [solution or strategy] that helped you [short impact].”
  “They talked about [any tools, collaboration style, or roll-out] and mentioned that it led to [results or outcomes].”

- Also include any **“client overview”** information they gave, such as:
  “They described your company as [size/industry/mission/etc.], with a focus on [goal or challenge].”

→ Then ask:
  - “Does that all sound accurate from your perspective?”
  - “Is there anything in how they described your company or the project that you’d adjust or expand on?”

---

[FOLLOW-UP QUESTIONS — Pick 3–5 Based on Flow]
These questions should feel like real, human curiosity — vary them based on their responses:

- “From your side, what impact did the solution have — in your day-to-day or team-wide?”
- “Were there any unexpected wins or outcomes that stood out?”
- “What was the collaboration like with the team at ${provider_name}?”
- “Was there anything you appreciated in how they handled things?”
- “Anything that surprised you — in a good or maybe challenging way?”
- “If someone asked you to sum up the whole experience in one line, what would you say?”

---

[CLIENT QUOTE]
Now gather something quotable:

- “If we were to include a short quote from you in the final case study — something you’d be happy to put your name to — what would you want it to say?”

→ If they hesitate:
  - “Totally fine — I can draft one later based on this chat, and you’ll get to review it.”

---

[WRAP-UP]
Close the conversation like a real person:

- “This has been awesome — really appreciate you taking the time.”
- “We’ll turn this into a short write-up that adds your voice to the story.”
- “You’ll get a chance to review and tweak it before anything’s finalized.”
- “When you’re ready, you can go ahead and hit the ‘End’ button.”

---

GOAL:
Make this a relaxed, human-feeling conversation that adds depth, warmth, and balance to the case study. Don’t sound like a chatbot — sound like a curious, thoughtful interviewer trying to tell the full story.
`;




  const greeting = `Hi there! Thanks for joining to chat about "${project_name}" today.`;

  document.getElementById("startBtn").addEventListener("click", () => initConnection(clientInstructions, greeting));
  document.getElementById("endBtn").addEventListener("click", () => endConversation("🛑 Manual end."));
});
