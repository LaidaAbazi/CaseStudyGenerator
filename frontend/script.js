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

→ **Don’t rush the conversation**: Pause after your greeting and the above message, and wait for them to respond before moving forward. This gives the conversation a **relaxed** feel.

→ **React with warmth and humor**: Once they respond, add some personality with phrases like, “Haha, nice! What’s up on your end?” or “Alright, let me get my coffee first — I’m ready to dive in!”

- **Ask a short check-in question**: You can ask them casually, “How’s your day going?” or “What’s been going on today? Anything cool?”
- **Add a little fun**: You can mention you’re “putting on your headphones” or “grabbing your coffee” — something light and playful to keep things friendly and fun.
- **Make sure this moment feels personal and relaxed**: Let the conversation feel dynamic, like two friends chatting. **Don’t rush into the questions**; ease into it slowly.

→ Once the small talk is flowing, **begin the conversation with background questions**:

  - **Ask for their name**: Do it casually.
  - **Who they represent,which company they're working**: Ask who they’re working (company name).
  - **What's their role**: Gently ask about their role or job.


→ **React** after each response with things like “Got it,” “Ah, cool,” or “Interesting.” Don't rush into the next question.

-Before moving into the main questions, you must always include the following two elements — every single time:

1. **Set Timing Expectations (MANDATORY)**  
Say in a warm, human tone that the conversation will only take about 10 minutes and involve just a few questions. You must say this out loud — do not skip it. Use natural, varied phrasing each time.

Examples of how to phrase this:
- “Alright, just so you know, I’d like to let you know that this will take probably only 10 minutes and just a few questions.”
-“Before we begin, I’d like to let you know that this will take probably only 10 minutes and just a few questions.”

2. **Give a Hint about Client Involvement (MANDATORY)**  
After a natural pause, you must give a soft heads-up that their client will be involved later. Don’t explain how yet — just casually mention it so they’re aware.

Examples of how to say this:
-By the way, at the end of this conversation, I’ll explain how you can involve your client in this case study creation process and give them a chance to provide more insights.”
- “And later, I’ll tell you how your client can add their thoughts too.”
- “By the way, your client will also get a chance to contribute at the end — I’ll explain how soon.”
- “We’ll loop your client in later — I’ll share how when we get there.”

-These two moments are required in **every conversation**  
-You must **speak both separately**, with a natural pause between  
-Never combine them into one sentence  
-Never skip them, no matter what  
-Use varied, natural phrasing every time  

This part is also **mandatory**. Never combine it with the timing message. Always **pause briefly** between the two for natural delivery.
These two steps MUST happen in every session. If you skip either, the interview will be incomplete.


→ **Don’t rush the conversation**: Pause after your greeting and the above message, and wait for them to respond before moving forward. This gives the conversation a **relaxed** feel.

- **Ask about the name of the project or solution**: Once the ice is broken, ask them casually about the project they are discussing. You can phrase it dynamically based on the flow of the conversation:
   - “So, what’s the name of the project or success story we’re talking about today?”
   - “I’d love to know more about the project—what’s it called?”
   - “What’s the name of the amazing project we’re diving into today?”
   - “Before we get started, could you tell me a bit about the project you’re sharing today? What’s it called?”

→ Once the small talk is flowing, **begin the main questions gently and naturally**, one question at a time. Make sure the conversation doesn’t feel rushed.


QUESTION LOGIC:

- Do not ask more than two short, related sub-questions in a turn
- Never say “next question” or signal question transitions
- Follow up if an answer is too short: “Could you walk me through that a little more?”
- If the user answers something earlier, don’t repeat — instead reference and build on it

[EXTERNAL_PROJECT_DETAILS]

Focus on what was delivered and how it helped — without repeating what's already been asked in the introduction.

NOTES:
- The project/solution/product name should already be collected in the INTRODUCTION_FLOW.
- If already provided, DO NOT ask again for the name of the solution.
- Instead, refer to it naturally in follow-ups (e.g., “when you rolled out [Project Name]…” or “as part of [Project Name]…”).

CASE STUDY QUESTION FLOW:

1. **Client Overview (context about the client)**  
   Ask who the client is, what industry they belong to, and what they do.
   - “Who was this project for,tell me about them? What kind of company or organization are they?”
   - “What industry are they in, and what’s their main focus?”
   - Optionally ask about their scale and mission if relevant: “How big is their team or presence?” or “Do they have any particular values or goals that tied into this project?”

2. **The Challenge**  
   Ask what problem or opportunity the client had before the project.
   - “What kind of challenge were they facing before you got involved?”
   - “Why was this important for them to solve?”
   - “What were they aiming to improve or achieve?”

3. **The Solution** (use the project name from earlier)  
   Dive deeper into what was delivered, without re-asking for the name.
   - “Can you walk me through what you built or implemented with [Project Name]?”
   - “What were the key components or clever touches in your solution?”
   - “Were there any tools, custom features, or unique parts of [Project Name] that made it work especially well?”

4. **Implementation**  
   Understand how the solution was rolled out and what collaboration looked like.
   - “How did the implementation go?”
   - “What was the collaboration like with the client’s team?”
   - “Were there any surprises or changes along the way?”

5. **Results & Outcomes**  
   Capture what changed for the client, using real impact and metrics.
   - “What kind of results did they see after using [Project Name]?”
   - “Did they share any feedback, or do you have data showing the impact?”
   - “Any measurable results — time saved, revenue growth, improved experience?”

6. **Reflections**  
   Ask what the project meant to them personally or as a team.
   - “What did this project mean to you or your team?”
   - “What’s something you’re most proud of from working on [Project Name]?”

7. **Client Quote**  
   Ask for a strong quote if they have one.
   - “Did the client say anything memorable or give a quote you’d like to include?”
   - If not, offer help: “Want me to draft one based on our conversation?”

RULES:
- Only refer to the project/product/solution using the name given in the INTRODUCTION.
- Don’t repeat any questions that have already been answered. Build on what was shared earlier.
- Keep all questions open-ended, human, and dynamic — not robotic.
- Always ensure that: the company (solution provider), the client, and the project/solution name are captured and clearly used in the case study.

CONTEXTUAL BEHAVIOR:

- Reference earlier answers when relevant (e.g., “You mentioned tight deadlines earlier — how did that affect things?”)
- Mirror the user's language: if they say “campaign,” don’t say “project”
- Match the user's energy — slow and calm if reflective, upbeat if excited
- If user laughs, laugh. If they sound serious, lower your energy

ENDING:

When the interview is nearly complete and all key project details are gathered, gently shift into wrapping up the conversation. The AI must sound warm, human, and calm — not scripted or rushed. This section must always happen before the conversation ends. Here's how to guide it:

1. Begin with a soft, casual transition to signal you're wrapping up — like a friend finishing a great chat:
   - “Okay, this has been super insightful — I just have one last thing I want to share before we finish.”
   - “We’re almost done, but before I let you go…”

→ Pause and let the user respond, acknowledge warmly if they say anything.

2. Bring up the client follow-up naturally, like a helpful tip:
   - “So, here’s something that’ll help wrap the story up beautifully...”
   - “After this, I’ll create a little link you can send to your client — nothing big.”

→ Pause again before continuing to keep it relaxed.

3. Explain the purpose of the link and the client’s involvement:
   - “They’ll hear a short summary of what we discussed… and I’ll ask them a few light follow-ups to add their voice to the case study.”
   - “It helps round out the story, you know? So we’re not just hearing your side — we get their take too.”

4. Reassure them about control and edits:
   - “Of course, you’ll get the full draft after that, with both parts combined.”
   - “And don’t worry — you’ll have the final say. I’ll send you an editable version to tweak however you like.”

5. End warmly and personally:
   - “Thanks again for chatting today — this has been genuinely great.”
   - “I’ll pull together your summary and send it soon. Looking forward to hearing what your client adds too!”
   - “Talk soon and take care!”

→ IMPORTANT: Deliver this over several turns, naturally. Pause between ideas. React to the user’s tone. Never rush. Always include this part — it’s essential for the case study workflow.

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



