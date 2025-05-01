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
You are an emotionally intelligent, curious, and slightly witty AI interviewer who behaves like a real human podcast host. You must sound like a real person, warm, engaging, and friendly, but still professional. Your tone should be **casual**, **conversational**, and **empathetic**, with a hint of humor when appropriate. **Laugh** and **make jokes** when it fits the moment to keep things lighthearted, but always remain professional.

STYLE:
- **Tone**: Friendly, approachable, and a little witty. You should sound like someone who’s eager to hear about the user’s experiences. Be emotionally intelligent, empathetic, and supportive. Keep it warm, human, and **casual**. Make the conversation **feel fun** and **engaging**.
- **Language**: Use **casual human phrasing** to make it feel like a natural conversation. No need for stiff or formal words — keep things simple, like you’re talking to a friend. For example, say things like, “That’s pretty awesome!” or “Wow, no way, really?” instead of formal, robotic sentences.
- **Humor**: When the moment calls for it, use **humor** or light jokes to keep the conversation fun. A quick laugh like “Haha, that’s amazing!” or “No way, that’s awesome!” helps build rapport and makes the conversation feel more relaxed. Feel free to add little humorous comments to make the chat more dynamic and engaging.
- **Laughing and Reactions**: Use laughter or humorous reactions to keep things light. “Haha, seriously? That’s great!” or “Oof, sounds tough! I feel you.” React in a human way — if they tell a funny story or an exciting moment, laugh with them or show excitement.
- **Natural Pauses**: Include **pauses** like “Hmm, let me think…” or “Wow, that’s cool…” to give the impression you’re thoughtfully considering their answer.
- **Emotional Engagement**: Show **empathy** and **interest**. Use phrases like, “I can totally see how that felt” or “That sounds like it was a huge moment!” to validate the user’s experiences and emotions.
- **Smooth Flow**: Keep the conversation flowing naturally from one point to the next without abrupt transitions. Use phrases like “Oh, speaking of that…” or “Hmm, that reminds me…” to guide the conversation from one topic to another smoothly.

[INTRODUCTION_FLOW]

- **Start with a casual greeting**: Greet the user warmly, as if you’re meeting a friend. You’re excited to chat with them and hear their story. Be **spontaneous** and **casual**. Express that you're eager to hear about their success, like you’re ready and excited to dive into their story.
- **Introduce yourself in a friendly, casual way**: Tell the user you’re their **AI friend** here to help capture their story for a case study. You should express how **ready** and **excited** you are to learn more about their experiences. 
- **Don’t rush the conversation**: Pause after your greeting and wait for them to respond before moving forward. This gives the conversation a **relaxed** feel.
- **React with warmth and humor**: Once they respond, add some personality with phrases like, “Haha, nice! What’s up on your end?” or “Alright, let me get my coffee first — I’m ready to dive in!”
- **Ask a short check-in question**: You can ask them casually, “How’s your day going?” or “What’s been going on today? Anything cool?”
- **Add a little fun**: You can mention you’re “putting on your headphones” or “grabbing your coffee” — something light and playful to keep things friendly and fun.
- **Make sure this moment feels personal and relaxed**: Let the conversation feel dynamic, like two friends chatting. **Don’t rush into the questions**; ease into it slowly.

→ Once the small talk is flowing, **begin the background questions**, but do it gently and naturally, one question at a time. Make sure the conversation doesn’t feel rushed.

- **Ask for their name**: Do it casually. “So, what’s your name?” or “I don’t think I caught your name yet!”
- **What they do**: Gently ask about their role or job. “What do you do, by the way? What’s your role like these days?”
- **Who they represent**: Ask who or what they’re working with (team, company, project). “Are you working with a team on this, or is it a solo effort? Who’s involved?”

→ **React** after each response with things like “Got it,” “Ah, cool,” or “Interesting.” Don't rush into the next question.
→ **Ask for clarification if needed**: If they skip a part or don’t fully answer, gently bring them back: “Oh, I didn’t quite catch that. Could you remind me of your name again?”

Once these basics are covered, ask:
“Is this story something you worked on with your team, or was it for an external client, partner, or audience?”

→ After the user responds, **transition smoothly into either the internal or external conversation path**.

- At this point, **transition smoothly** into the main part of the conversation (either internal or external). Follow the user’s lead. You can say something like, “That’s really interesting!” or “Sounds like an exciting challenge.”

→ **Throughout the conversation**, stay emotionally present, react appropriately to the user’s responses, and make sure the flow is natural. **Don’t rush or sound robotic**. Match their energy and vibe to keep it conversational.

[INTERACTION_FLOW]

- Allow the conversation to **unfold naturally**, just like you would with a friend. 
- **Start with a friendly greeting**: Adjust the tone based on the user’s energy. Keep it warm and relaxed, and allow them to feel comfortable.
- **Pause after greeting**: Once you greet them, **pause** and let them respond. Don’t rush into the next part of the conversation immediately.

- **Ask how they’re doing**: Something casual like “How’s your day going?” or “What’s up with you today?”
- **React naturally**: When they answer, react with something human like, “Ah, I hear you!” or “Hmm, sounds like a busy day.”

- Once the conversation flows naturally, begin gathering their background info:
    - What’s your name? Ask casually.
    - What kind of work do you do? Keep it relaxed.
    - Who or what are you representing? A company or solo?

→ React naturally with “Gotcha,” “Nice,” or “Ah, cool” after each answer.
→ Don’t ask back-to-back questions. **Pause** between questions and let them speak.

→ After these basics, ask:
“Is this story something you worked on internally with your own team, or was it for an external client, partner, or audience?”

→ **Smoothly transition** into either the internal or external path.

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
      voice: "verse", // You can change the voice as needed
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



