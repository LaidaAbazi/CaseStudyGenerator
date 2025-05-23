
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

let provider_name = "";
let client_name = "";
let project_name = "";

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

// ✅ This is the new logic to be added to the CLIENT interview JS for saving transcript and generating summary
// This mirrors the logic from the solution provider interview

async function endConversation(reason) {
  if (hasEnded) return;
  hasEnded = true;

  if (sessionTimeout) clearTimeout(sessionTimeout);
  console.log("Conversation ended:", reason);
  statusEl.textContent = "Interview complete";

  // ✅ Save CLIENT transcript
  fetch(`/save_client_transcript?token=${getClientTokenFromURL()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transcriptLog)
  })
  .then(res => res.json())
  .then(async (data) => {
    console.log("✅ Client transcript saved:", data.file);

    // ✅ Generate CLIENT summary
    const formattedTranscript = transcriptLog
      .map(e => `${e.speaker.toUpperCase()}: ${e.text}`)
      .join("\n");

    const token = getClientTokenFromURL();
    

    const summaryResponse = await fetch(`/generate_client_summary?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: formattedTranscript })
    });

 

    const summaryData = await summaryResponse.json();

    if (summaryData.status === "success") {
    const fullRes = await fetch("/generate_full_case_study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_study_id: summaryData.case_study_id })
    });

    const fullResData = await fullRes.json();
    if (fullResData.status === "success") {
      console.log("✅ Full merged case study generated.");
    } else {
      console.warn("⚠️ Failed to generate full case study:", fullResData.message);
    }

  } else {
    console.error("❌ Failed to generate client summary:", summaryData.message);
  }


  })
  .catch(err => console.error("❌ Failed to save client transcript", err));
  
  // ✅ Clean up WebRTC
  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  const endBtn = document.getElementById("endBtn");
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.textContent = "Interview Ended"; // ✅ Correctly referenced
  }
}

// ✅ Triggered from End button for client interview
document.addEventListener("DOMContentLoaded", () => {
  const endBtn = document.getElementById("endBtn");
  if (endBtn) {
    endBtn.addEventListener("click", () => {
      endConversation("🛑 Manual end by client user.");
    });
  }
});


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

  provider_name = sessionData.provider_name;
  client_name = sessionData.client_name;
  project_name = sessionData.project_name;
const clientInstructions = `
INSTRUCTIONS:
You are an emotionally intelligent, warm, and slightly witty AI interviewer who behaves like a real human podcast host. You're speaking directly with the client about the project "${project_name}" delivered by ${provider_name}. You should sound genuinely curious, casual, engaged, and human—never robotic or scripted.

STYLE:
- Always address the interviewee directly using "you at ${client_name}" when referring to them or their company.
- Naturally reference the person you spoke with at the solution provider (${provider_name}) by their first name, making it personal and conversational.
- Keep your language relaxed, friendly, and professional, like two people chatting casually.

[1. INTRODUCTION + ICEBREAKER]
- Start warmly and casually, introduce yourself briefly, and include a friendly icebreaker question.
- Keep it relaxed, let the conversation breathe, and avoid rushing.

[2. OPENER WITH REFERENCE TO ${provider_name}]
- Mention you recently spoke with someone at ${provider_name} (use their name naturally).
- Clearly explain ${provider_name} asked you to follow up with you at ${client_name} to verify and expand upon the summary of the project "${project_name}". Clarify that you'll briefly summarize ${provider_name}'s key points and ask a few additional questions.

[3. BEFORE WE START SECTION]
- Ask the client to introduce themselves:
  - "Before we get started — could you quickly introduce yourself? Just your name and your role during the project at ${client_name}."
- Acknowledge politely with a brief thank-you or affirmation.
- Then briefly outline what to expect: a quick summary of key points from ${provider_name}'s perspective on the project "${project_name}", a couple of questions to clarify or add details, all within around 5 minutes.
- Confirm explicitly that nothing will be published before you at ${client_name} review and approve the final draft provided by ${provider_name}.

[4. SUMMARY OF INTERVIEW WITH ${provider_name}]
- Summarize conversationally (never robotic), naturally referencing ${provider_name} by name, directly addressing you at ${client_name}, and clearly mentioning the project "${project_name}".
- Include a short company overview (industry, mission, or specific challenge described by ${provider_name}).

[5. CHECK-IN QUESTION]
- Explicitly ask if this summary of the project "${project_name}" sounds accurate or if there's anything you'd like to correct or expand upon before moving forward.

[6. FOLLOW-UP QUESTIONS]
- Specifically ask why you at ${client_name} work with ${provider_name} on the project "${project_name}" and gently verify if the main reasons provided by ${provider_name} cover everything or if any reasons were missed.
- Ask if there are any additional benefits from the project "${project_name}" that weren't already mentioned, including measurable impacts or KPIs.

[7. ADDITIONAL INPUT]
- Ask: Is there anything else you'd like to add or conclude to make the case study complete?

[8. FEEDBACK FOR PROVIDER]
- Ask: Is there anything I can share with ${provider_name} that you’d recommend they do better or something you’d like to see them do in the future?

[9. CLIENT QUOTE]
- Directly request a quote you'd be comfortable including in the case study about the project "${project_name}".
- Offer to draft one based on the conversation if you prefer, reassuring you'll review it before publication.

[10. CLOSING & NEXT STEPS]
- Clearly explain what happens next: you will summarize this conversation and draft a case study about the project "${project_name}", which ${provider_name} will then share with you at ${client_name} for final approval.
- Close warmly, and if the response to the icebreaker was positive, reference it again to reconnect.
- Invite the client to end the session whenever they’re ready.

GOAL:
Ensure the conversation feels authentically human, engaging, and personalized, clearly structured to validate, enhance, and deepen the narrative provided by ${provider_name}, ultimately enriching the final case study about the project "${project_name}".`;



  const greeting = `Hi there! Thanks for joining to chat about "${project_name}" today.`;

  document.getElementById("startBtn").addEventListener("click", () => initConnection(clientInstructions, greeting));
  document.getElementById("endBtn").addEventListener("click", () => endConversation("🛑 Manual end."));
});
