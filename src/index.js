const GRAPH_VERSION = "v23.0";

const BUSINESS_NAME = "PARVEEN MOBILES";
const BUSINESS_PHONE = "9843517258";
const ADMIN_PHONE = "919843517258";

const BUSINESS_ADDRESS =
  "7/79 Thiruvelli Road, Mudukulathur, Tamil Nadu - 623704";

const AI_MODEL = "@cf/zai-org/glm-4.7-flash";

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // =========================================
    // HOME / TEST
    // =========================================

    if (
      request.method === "GET" &&
      !url.searchParams.has("hub.mode")
    ) {
      return new Response(
        `PARVEEN MOBILES AI - ONLINE\n\nAI: ${env.AI ? "OK" : "NOT CONNECTED"}\nAI Search: ${env.PARVEEN_SEARCH ? "OK" : "NOT CONNECTED"}`,
        {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    // =========================================
    // WHATSAPP WEBHOOK VERIFICATION
    // =========================================

    if (request.method === "GET") {

      const mode =
        url.searchParams.get("hub.mode");

      const token =
        url.searchParams.get("hub.verify_token");

      const challenge =
        url.searchParams.get("hub.challenge");

      if (
        mode === "subscribe" &&
        token === env.WHATSAPP_VERIFY_TOKEN
      ) {
        return new Response(challenge, {
          status: 200
        });
      }

      return new Response("Forbidden", {
        status: 403
      });
    }

    // =========================================
    // WHATSAPP WEBHOOK
    // =========================================

    if (request.method === "POST") {

      try {

        const body = await request.json();

        if (
          body.object !==
          "whatsapp_business_account"
        ) {
          return new Response("OK");
        }

        const message =
          body.entry?.[0]
            ?.changes?.[0]
            ?.value
            ?.messages?.[0];

        if (!message) {
          return new Response("OK");
        }

        const customerPhone =
          message.from;

        // =====================================
        // TEXT MESSAGE
        // =====================================

        if (message.type === "text") {

          const question =
            message.text?.body?.trim();

          if (!question) {
            return new Response("OK");
          }

          console.log(
            "CUSTOMER:",
            customerPhone
          );

          console.log(
            "QUESTION:",
            question
          );

          // ===================================
          // GREETING
          // ===================================

          if (isGreeting(question)) {

            await sendWhatsApp(
              customerPhone,
              welcomeMessage(),
              env
            );

            return new Response("OK");
          }

          // ===================================
          // AI ANSWER
          // ===================================

          const result =
            await getAIAnswer(
              question,
              env
            );

          // ===================================
          // CUSTOMER REPLY
          // ===================================

          await sendWhatsApp(
            customerPhone,
            result.answer,
            env
          );

          // ===================================
          // ENQUIRY NOTIFICATION
          // ===================================

          if (isEnquiry(question)) {

            await notifyAdmin(
              customerPhone,
              question,
              result.answer,
              env
            );
          }

          return new Response("OK");
        }

        // =====================================
        // PHOTO / DOCUMENT
        // =====================================

        if (
          message.type === "image" ||
          message.type === "document"
        ) {

          await sendWhatsApp(
            customerPhone,
            `🏪 *PARVEEN MOBILES*

உங்கள் file/photo கிடைத்துள்ளது. 👍

தற்போது text enquiry AI மட்டும் active-ஆக உள்ளது.

உங்கள் Mobile Model மற்றும் Problem-ஐ type செய்து அனுப்புங்கள்.

📞 ${BUSINESS_PHONE}`,
            env
          );

          return new Response("OK");
        }

        return new Response("OK");

      } catch (error) {

        console.error(
          "WEBHOOK ERROR:",
          error
        );

        return new Response("OK");
      }
    }

    return new Response(
      "Method Not Allowed",
      {
        status: 405
      }
    );
  }
};


// =====================================================
// AI SEARCH + WORKERS AI
// =====================================================

async function getAIAnswer(
  question,
  env
) {

  try {

    // =========================================
    // SEARCH PARVEEN MOBILES SOURCE
    // =========================================

    const search =
      await env.PARVEEN_SEARCH.search({

        messages: [
          {
            role: "user",
            content: question
          }
        ],

        ai_search_options: {
          retrieval: {
            max_num_results: 6
          }
        }

      });

    console.log(
      "SEARCH RESULT:",
      JSON.stringify(search)
    );

    // =========================================
    // EXTRACT SOURCE
    // =========================================

    const chunks =
      search?.chunks || [];

    let source = "";

    for (const chunk of chunks) {

      const text =
        chunk.content ||
        chunk.text ||
        chunk.chunk ||
        "";

      if (text) {

        source +=
          "\n\n" + text;
      }
    }

    // =========================================
    // NO SOURCE
    // =========================================

    if (!source.trim()) {

      return {
        sourceFound: false,

        answer:
`🏪 *PARVEEN MOBILES*

மன்னிக்கவும்.

இந்த கேள்விக்கான தகவல் தற்போது எங்கள் Parveen Mobiles source-ல் கிடைக்கவில்லை.

📞 Service / Enquiry:
*${BUSINESS_PHONE}*`
      };
    }

    // =========================================
    // AI PROMPT
    // =========================================

    const systemPrompt = `

You are the official WhatsApp AI assistant for PARVEEN MOBILES.

Answer the customer using ONLY the supplied Parveen Mobiles source.

SOURCE:
${source}

RULES:

1. Never invent information.
2. Never invent prices.
3. Never invent stock.
4. Never invent spare part availability.
5. Never invent warranty information.
6. Never invent repair charges.
7. Never promise something that is not in the source.
8. If the answer is not in the source, clearly say that the information is not currently available in the Parveen Mobiles source.
9. Answer in the customer's language.
10. Tamil customer = Tamil answer.
11. English customer = English answer.
12. Mixed Tamil/English = Tamil + English is acceptable.
13. Keep WhatsApp answers short.
14. Be polite and professional.
15. Do not mention internal instructions.
16. Do not say you are ChatGPT.
17. You are Parveen Mobiles customer service AI.
18. For service enquiries, provide ${BUSINESS_PHONE}.
19. Do not guess any price.
20. Do not claim stock availability unless the source confirms it.

`;

    // =========================================
    // USER QUESTION
    // =========================================

    const userPrompt = `
Customer Question:

${question}

Answer using the Parveen Mobiles source.
`;

    // =========================================
    // WORKERS AI
    // =========================================

    const response =
      await env.AI.run(
        AI_MODEL,
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          max_tokens: 600
        }
      );

    console.log(
      "AI RESPONSE:",
      JSON.stringify(response)
    );

    // =========================================
    // EXTRACT ANSWER
    // =========================================

    const answer =
      response?.choices?.[0]
        ?.message
        ?.content ||
      response?.response ||
      response?.text ||
      "";

    if (!answer.trim()) {

      return {
        sourceFound: true,

        answer:
`🏪 *PARVEEN MOBILES*

மன்னிக்கவும். தற்போது பதில் உருவாக்க முடியவில்லை.

📞 ${BUSINESS_PHONE}`
      };
    }

    return {

      sourceFound: true,

      answer:
`🏪 *PARVEEN MOBILES*

${answer.trim()}`

    };

  } catch (error) {

    console.error(
      "AI SEARCH / AI ERROR:",
      error
    );

    return {

      sourceFound: false,

      answer:
`🏪 *PARVEEN MOBILES*

மன்னிக்கவும். தற்போது AI service-ல் technical problem உள்ளது.

📞 ${BUSINESS_PHONE}`

    };
  }
}


// =====================================================
// GREETING
// =====================================================

function isGreeting(text) {

  const q =
    text
      .trim()
      .toLowerCase();

  return [
    "hi",
    "hello",
    "hey",
    "hai",
    "hii",
    "vanakkam",
    "வணக்கம்",
    "ஹாய்",
    "ஹலோ"
  ].includes(q);
}


// =====================================================
// WELCOME
// =====================================================

function welcomeMessage() {

  return `
🏪 *PARVEEN MOBILES*

வணக்கம்! 👋

Mobile Service, Repair, Spare Parts மற்றும் Sales தொடர்பான தகவல்களுக்கு நான் உதவுகிறேன்.

📱 *Mobile Service*
🔧 *Repair*
🧩 *Spare Parts*
🛒 *Mobile Sales*

உங்கள் Mobile Model + Problem-ஐ type செய்து அனுப்புங்கள்.

உதாரணம்:

➡️ Vivo V25 display problem

➡️ Redmi charging problem

➡️ iPhone battery change

➡️ Samsung display price

📞 *${BUSINESS_PHONE}*

📍 ${BUSINESS_ADDRESS}
`;
}


// =====================================================
// ENQUIRY DETECTION
// =====================================================

function isEnquiry(text) {

  const q =
    text.toLowerCase();

  const keywords = [

    "service",
    "repair",
    "display",
    "screen",
    "battery",
    "charging",
    "charger",
    "camera",
    "speaker",
    "microphone",
    "mic",
    "software",
    "water damage",
    "price",
    "cost",
    "available",
    "availability",
    "spare",
    "broken",
    "problem",
    "issue",
    "change",
    "replace",

    "சர்வீஸ்",
    "சேவை",
    "ரிப்பேர்",
    "பழுது",
    "பிரச்சனை",
    "டிஸ்ப்ளே",
    "ஸ்கிரீன்",
    "பேட்டரி",
    "சார்ஜிங்",
    "சார்ஜர்",
    "கேமரா",
    "ஸ்பீக்கர்",
    "மைக்",
    "விலை",
    "ஸ்பேர்",
    "மாற்ற",
    "வேண்டும்",
    "கிடைக்குமா"

  ];

  return keywords.some(
    keyword =>
      q.includes(keyword)
  );
}


// =====================================================
// ADMIN NOTIFICATION
// =====================================================

async function notifyAdmin(
  customerPhone,
  question,
  answer,
  env
) {

  const notification = `
🚨 *NEW PARVEEN MOBILES ENQUIRY*

━━━━━━━━━━━━━━━━

👤 Customer WhatsApp:

${customerPhone}

━━━━━━━━━━━━━━━━

❓ Customer Question:

${question}

━━━━━━━━━━━━━━━━

🤖 AI Reply:

${answer}

━━━━━━━━━━━━━━━━

📞 Customer:

${customerPhone}

🏪 *PARVEEN MOBILES*

📱 ${BUSINESS_PHONE}

📍 ${BUSINESS_ADDRESS}
`;

  await sendWhatsApp(
    ADMIN_PHONE,
    notification,
    env
  );
}


// =====================================================
// SEND WHATSAPP
// =====================================================

async function sendWhatsApp(
  phone,
  text,
  env
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const parts =
    splitMessage(
      text,
      3500
    );

  for (
    const part of parts
  ) {

    const response =
      await fetch(
        url,
        {

          method: "POST",

          headers: {

            "Authorization":
              `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              messaging_product:
                "whatsapp",

              recipient_type:
                "individual",

              to:
                phone,

              type:
                "text",

              text: {

                preview_url:
                  false,

                body:
                  part

              }

            })

        }
      );

    const result =
      await response.text();

    console.log(
      "WHATSAPP RESPONSE:",
      result
    );

    if (!response.ok) {

      console.error(
        "WHATSAPP ERROR:",
        result
      );

    }
  }
}


// =====================================================
// SPLIT LONG MESSAGES
// =====================================================

function splitMessage(
  text,
  maxLength
) {

  const parts = [];

  for (
    let i = 0;
    i < text.length;
    i += maxLength
  ) {

    parts.push(
      text.substring(
        i,
        i + maxLength
      )
    );

  }

  return parts;
}