// script.js — UPDATED VERSION with real-time transcript capture + farewell detection + fixed user + AI transcription

let peerConnection, dataChannel, isSessionReady = false;
const transcriptLog = []; // Log conversation { speaker, text }
let sessionTimeout;
let userBuffer = "";
let aiBuffer = "";
let hasEnded = false;
let isInstructionsApplied = false;

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

→ Once the small talk is flowing, **begin the conversation with background questions**,(MANDATORY):

  - **Ask for their name**: Do it casually.
  - **Who they represent,which company they're working**: Ask who they’re working (company name).
  - **What's their role**: Gently ask about their role or job.


→ **React** after each response with things like “Got it,” “Ah, cool,” or “Interesting.” Don't rush into the next question.

-Before moving into the main questions, you must always include the following two elements — every single time:

1. **Set Timing Expectations (MANDATORY)**  
Say in a warm, human tone that the conversation will only take about 5 to 10 minutes and involve just a few questions. You must say this out loud — do not skip it. Use natural, varied phrasing each time.

Examples of how to phrase this:
- “Alright, just so you know, this will only take about 5-10 minutes — just a few questions.”
-“Before we begin, this should take around 5-10 minutes — just a few of questions.”

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
   - If not, offer help: “Want me to draft one based on our conversation? If so, I’ll show you the quote in the summary at the end — it’s just a starting point and can be edited by you or your client later.”


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

When the interview is nearly complete and all key project details are gathered, gently shift into wrapping up the conversation. The AI must sound warm, human, and calm — never robotic or rushed. This section is **mandatory** and must always happen before the conversation ends.

Follow these six steps in order, and insert a small pause between each — like you're casually finishing a friendly call.

---

1. **Start Wrap-Up Naturally**  
Begin with a light, casual transition to signal the conversation is wrapping up.
Say something like:
- “Okay, this has been super insightful… I just have one last thing I want to share before we wrap up.”  
- “We’re almost done — but before I let you go, there’s one more quick thing.”  
→ *[Pause briefly. Let the user respond if they want to. Acknowledge with warmth.]*

---

2. **Mention the Client Involvement**  
Casually bring up how the client will be invited afterward. For example:
- “So — just a heads-up — I’ll prepare a little link and share it with you…”  
- “You’ll be able to forward that to your client when you’re ready.”  
→ *[Pause briefly after this to keep things relaxed.]*

---

3. **Explain What the Client Link Does**  
Describe the purpose of that link:
- “That link will let them hear a quick summary of our chat…”  
- “And I’ll ask them just a couple of lightweight follow-ups so they can add their side to the story.”  
- “Nothing too long — just helps us get their voice in too.”  
→ *[Let it land. Pause again.]*

---

4. **Explain the Summary and What Happens Next**  
Make this feel relaxed and helpful:
- “Once we’re done here, I’ll write up a little summary of our chat — that usually takes just a couple of minutes…”  
- “You’ll see it pop up right here on the screen — an editable version of everything we talked about.”  
- “And there’ll be simple instructions on how to invite your client to that follow-up, if you want to.”  
→ *[Let the user absorb this.]*

---

5. **Reassure About Control and Edits**  
Make sure they feel confident and in charge:
- “After the client finishes their part, you’ll have full control to make edits to anything before it’s finalized.”
- “Nothing gets sent without your review — and you can tweak it however you like, together with your client.”  
→ *[Say this warmly, then pause.]*

---

6. **End the Conversation Clearly and Kindly**  
Finish with a friendly, polite sign-off:
- “Thanks again for chatting — this was genuinely great.”  
- “If you’re all good, you can go ahead and click the button to hang up…”  
- “Alright — talk soon and take care!”  
→ *[Wait a moment. Then gracefully end the session.]*

---

✔ Keep the flow natural  
✔ Always pause briefly between these steps  
✔ Adjust your energy to match the user’s tone  
✔ Never rush or combine these into one long monologue  

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
  statusEl.textContent = "Interview complete";

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
  const endBtn = document.getElementById("endBtn");
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.textContent = "Interview Ended";
  }

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
      const [remoteStream] = event.streams;
      const remoteOnly = new MediaStream();

      remoteStream.getAudioTracks().forEach(track => {
        // Only play tracks that are not the user's mic
        if (track.kind === "audio" && track.label !== "Microphone") {
          remoteOnly.addTrack(track);
        }
      });

      audioElement.srcObject = remoteOnly;

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

      // ✅ Send systemInstructions only after session is created
      dataChannel.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: systemInstructions,
          voice: "verse",
          modalities: ["audio", "text"],
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: { type: "server_vad" }
        }
      }));
      break;

    case "session.updated":
      // ✅ When instructions are applied, start greeting
      if (!isInstructionsApplied) {
        isInstructionsApplied = true;
        beginGreeting(); // custom function
      }
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

startButton.onclick = async () => {
  if (peerConnection || dataChannel) {
    alert("Session is already running.");
    return;
  }

  // ✅ Now initialize everything only on click
  await initConnection();

  if (!dataChannel) {
    alert("Session is not ready yet. Please wait.");
    return;
  }

  startButton.disabled = true;
  statusEl.textContent = "Interview started";
  document.getElementById("endBtn").classList.remove("hidden");

  const greeting = `
    Hello, this is your AI Case Study Generator. Thanks for joining me today.
  `;

  dataChannel.send(JSON.stringify({
    type: "session.update",
    session: {
      instructions: systemInstructions,
      voice: "verse",
      modalities: ["audio", "text"],
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: { type: "server_vad" }
    }
  }));

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

  sessionTimeout = setTimeout(() => {
    endConversation("⏱️ 10-minute limit reached.");
  }, 10 * 60 * 1000);
};

function beginGreeting() {
  statusEl.textContent = "Interview started";

  const greeting = `
    Hello, this is your AI Case Study Generator. Thanks for joining me today.
  `;

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

  
}





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
    "Solution Provider": originalNames.lead_entity || "",
    "Client": originalNames.partner_entity || "",
    "Project": originalNames.project_title || ""
  };
  
  
  
  

  const inputs = {};
  const labelStyle = "display:block;margin-top:10px;font-weight:bold";

  for (const labelText in nameMap) {
    const label = document.createElement("label");
    label.textContent = labelText + ":";
    label.setAttribute("style", labelStyle);
  
    const input = document.createElement("input");
    input.type = "text";
    input.value = nameMap[labelText];
    input.style.marginBottom = "10px";
    input.style.width = "100%";
    inputs[labelText] = input;
  
    container.appendChild(label);
    container.appendChild(input);
  }
  

  // ✅ FIXED Apply Button
  const applyChangesBtn = document.createElement("button");
  applyChangesBtn.textContent = " Apply Name Changes";
  applyChangesBtn.style.marginTop = "10px";
  applyChangesBtn.onclick = () => {
    let updatedText = textarea.value;
  
    for (const labelText in nameMap) {
      const original = nameMap[labelText];
      const current = inputs[labelText].value.trim();
  
      if (!original || original === current) continue;
  
      // More robust: match quotes, apostrophes, capitalization, possessives
      const variants = [
        original,
        `"${original}"`, `'${original}'`,
        original.toLowerCase(), original.toUpperCase(),
        original.replace(/’/g, "'"),  // smart quote to normal
        original + "'s",              // possessive
        original + "’s"
      ];
  
      variants.forEach(variant => {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, "gi");
        updatedText = updatedText.replace(regex, current);
      });
  
      nameMap[labelText] = current;
    }
  
    textarea.value = updatedText;
  };
  

  const finalizeBtn = document.createElement("button");
finalizeBtn.textContent = "Generate Case Study PDF";
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
  generateBtn.textContent = " Generate Summary";
  generateBtn.onclick = async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = " Generating...";

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
    generateBtn.textContent = " Generate Summary";
  };


  controlsDiv.appendChild(generateBtn);
  document.body.appendChild(controlsDiv);
}
document.addEventListener("DOMContentLoaded", () => {
  const endBtn = document.getElementById("endBtn");
  if (endBtn) {
    endBtn.addEventListener("click", () => {
      endConversation("🛑 Manual end by user.");
    });
  }
});

