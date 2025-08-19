// api/telegram.js — Vercel serverless webhook (NO polling, NO fs)
import { Bot, webhookCallback } from "grammy";
import axios from "axios";

const bot = new Bot(process.env.BOT_TOKEN);

// --- IG helperlar (insta-url-direct) ---
async function getIgDirectFn() {
  const mod = await import("instagram-url-direct");
  const cand = mod?.default ?? mod;
  if (typeof cand === "function") return cand;
  const fn =
    (cand && typeof cand.instagramGetUrl === "function" && cand.instagramGetUrl) ||
    (cand && typeof cand.getInstagramUrl === "function" && cand.getInstagramUrl) ||
    (cand && typeof cand.instagram === "function" && cand.instagram) ||
    (cand && typeof cand.getUrl === "function" && cand.getUrl);
  if (typeof fn === "function") return fn;
  throw new Error("instagram-url-direct: chaqiriladigan funksiya topilmadi");
}

function normalizeIgResult(res) {  
  const out = new Set();
  const push = (u) => { if (u && typeof u === "string") out.add(u); };
  if (!res) return [];

  if (Array.isArray(res)) {
    for (const x of res) push(typeof x === "string" ? x : (x?.url || x?.src || x?.link));
    return [...out];
  }
  if (Array.isArray(res.url_list)) res.url_list.forEach(push);
  if (Array.isArray(res.links))    res.links.forEach(push);
  if (Array.isArray(res.result))   res.result.forEach(x => push(typeof x === "string" ? x : (x?.url || x?.src || x?.link)));
  if (Array.isArray(res.results))  res.results.forEach(x => push(typeof x === "string" ? x : (x?.url || x?.src || x?.link)));
  if (Array.isArray(res.items))    res.items.forEach(x => push(typeof x === "string" ? x : (x?.url || x?.src || x?.link)));
  push(res.url); push(res.src); push(res.link);

  return [...out].filter(u => /^https?:\/\//i.test(u));
}

async function headContentType(url) {
  try {
    const r = await axios.head(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
        Accept: "*/*",
      },
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 400,
    });
    return String(r.headers["content-type"] || "");
  } catch {
    return "";
  }
}

// --- Bot xulqi ---
const IG = /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/\S+/i;

bot.command("start", (ctx) =>
  ctx.reply("Salom! Instagram link yuboring (reel/post/carousel). Public bo‘lsa — yuborib beraman. 🚀")
);

bot.on("message:text", async (ctx) => {
  const m = ctx.message.text.match(IG);
  if (!m) return ctx.reply("Instagram link yuboring 🙂");
  const url = m[0];

  try {
    const igDirect = await getIgDirectFn();
    let res = await igDirect(url);
    if (!res) { await new Promise(r=>setTimeout(r,500)); res = await igDirect(url); }
    const urls = normalizeIgResult(res);

    if (!urls.length) {
      return ctx.reply("⚠️ Media topilmadi. Post private/age-gated bo‘lishi mumkin.", {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    let sent = 0;
    for (const mediaUrl of urls) {
      try {
        const ctype = await headContentType(mediaUrl);
        const isVideo = (ctype && ctype.startsWith("video/")) || /\.mp4(\?|$)/i.test(mediaUrl);

        // Vercel’da disk yo‘q: to‘g‘ridan URL bilan yuboramiz.
        if (isVideo) {
          await ctx.replyWithVideo(mediaUrl, { reply_parameters: { message_id: ctx.message.message_id } });
        } else {
          try {
            await ctx.replyWithPhoto(mediaUrl, { reply_parameters: { message_id: ctx.message.message_id } });
          } catch {
            // Photo sifatida bo'lmasa, document qilib urinib ko'ramiz
            await ctx.replyWithDocument(mediaUrl, { reply_parameters: { message_id: ctx.message.message_id } });
          }
        }
        sent++;
      } catch {
        await ctx.reply("❌ Elementni yuborishda muammo. Keyingisini sinayapman.", {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
    }

    if (!sent) {
      await ctx.reply("⚠️ Hech narsa yuborilmadi. Boshqa PUBLIC link yuboring.", {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
  } catch (e) {
    console.error(e);
    await ctx.reply("❌ Xatolik. Public linkda qayta urinib ko‘ring.", {
      reply_parameters: { message_id: ctx.message.message_id },
    });
  }
});

// --- Vercel serverless handler
const handleUpdate = webhookCallback(bot, "http");

export default async function handler(req, res) {
  if (req.method === "POST") {
    return handleUpdate(req, res);
  }
  // Health-check / GET
  res.status(200).send("ok");
}
