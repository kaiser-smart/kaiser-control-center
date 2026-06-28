import { getUsers, json, readJson, requireUserPermission } from "../../_lib/auth.js";
import { sendVersionNewsNotification } from "../../_lib/notification-service.js";

const RADIM_USER_ID = "radim-oplustil";
const MARTIN_USER_ID = "martin-konecek";

function cleanString(value) {
  return String(value ?? "").trim();
}

function sameId(left, right) {
  return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function versionNewsNotifyError(error) {
  console.error("version_news.notify_failed", { message: error.message });
  return json({ error: "E-mail s novinkou se nepodařilo odeslat.", apiStatus: "waiting" }, 500);
}

function userById(users, userId) {
  return users.find((item) => sameId(item.id, userId)) || null;
}

function recipientForAuthor(users, author) {
  if (sameId(author?.id, RADIM_USER_ID)) {
    return userById(users, MARTIN_USER_ID);
  }

  if (sameId(author?.id, MARTIN_USER_ID)) {
    return userById(users, RADIM_USER_ID);
  }

  return null;
}

function normalizeVersionNewsPayload(payload) {
  const title = cleanString(payload?.title);
  const text = cleanString(payload?.text);
  const version = cleanString(payload?.version);
  const id = cleanString(payload?.id || version || title);

  if (!title) {
    return { error: "Chybí název novinky." };
  }

  if (!text) {
    return { error: "Chybí text novinky." };
  }

  return {
    id,
    title,
    text,
    version,
    createdAt: cleanString(payload?.createdAt) || new Date().toISOString()
  };
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "settings", "manage");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const news = normalizeVersionNewsPayload(payload);

    if (news.error) {
      return json({ error: news.error }, 400);
    }

    const users = await getUsers(env);
    const author = userById(users, user.id) || user;
    const recipient = recipientForAuthor(users, author);

    if (!recipient) {
      return json({ error: "Notifikaci Co je nového může poslat jen Radim nebo Martin." }, 403);
    }

    const notification = await sendVersionNewsNotification(env, {
      ...news,
      authorId: author.id,
      authorName: author.name || author.email || "Uživatel"
    }, {
      recipientEmail: recipient.email || "",
      recipientName: recipient.name || recipient.email || "příjemce",
      fromName: "Radim Opluštil"
    });

    return json({
      notification,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email
      },
      apiStatus: "ready"
    });
  } catch (error) {
    return versionNewsNotifyError(error);
  }
}
