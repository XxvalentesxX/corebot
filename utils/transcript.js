// utils/transcript.js

const CATEGORY_NAMES = {
  soporte:     "🎧 Soporte",
  recompensas: "🏆 Recompensas",
  apply:       "📋 Apply",
  ally:        "🤝 Alianzas",
  report:      "🚨 Reporte",
};

const COLORS = {
  soporte:     "#5865f2",
  recompensas: "#f1c40f",
  apply:       "#2ecc71",
  ally:        "#1abc9c",
  report:      "#e74c3c",
};

function formatDate(ts) {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function generateTranscript(ticket, channelName) {
  const color = COLORS[ticket.category] ?? "#5865f2";
  const categoryName = CATEGORY_NAMES[ticket.category] ?? ticket.category;
  const messages = ticket.messages ?? [];

  const messagesHtml = messages.length
    ? messages.map((m) => {
        const attachmentsHtml = m.attachments?.length
          ? m.attachments.map((url) =>
              url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                ? `<img src="${url}" class="attachment-img" alt="attachment">`
                : `<a href="${url}" class="attachment-link" target="_blank">📎 Adjunto</a>`
            ).join("")
          : "";

        return `
          <div class="message">
            <div class="message-header">
              <span class="author">${escapeHtml(m.author)}</span>
              <span class="timestamp">${formatDate(m.timestamp)}</span>
            </div>
            ${m.content ? `<div class="content">${escapeHtml(m.content)}</div>` : ""}
            ${attachmentsHtml ? `<div class="attachments">${attachmentsHtml}</div>` : ""}
          </div>`;
      }).join("")
    : `<div class="no-messages">No hay mensajes registrados.</div>`;

  const extraFieldsHtml = ticket.extraFields
    ? Object.entries(ticket.extraFields).map(([k, v]) => `
        <div class="field">
          <span class="field-label">${escapeHtml(k)}</span>
          <span class="field-value">${escapeHtml(String(v))}</span>
        </div>`).join("")
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript — Ticket #${ticket.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 860px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, ${color}22, ${color}44);
      border: 1px solid ${color}88;
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .header-accent {
      width: 6px;
      height: 80px;
      background: ${color};
      border-radius: 3px;
      flex-shrink: 0;
    }

    .header-info h1 {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.3rem;
    }

    .header-info .category {
      font-size: 1rem;
      color: ${color};
      font-weight: 600;
      margin-bottom: 0.8rem;
    }

    .header-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .meta-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #888;
    }

    .meta-value {
      font-size: 0.9rem;
      color: #ccc;
      font-weight: 500;
    }

    /* Campos del ticket */
    .fields-section {
      background: #16213e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .fields-section h2 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #888;
      margin-bottom: 1rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid #2a2a4a22;
    }

    .field:last-child { border-bottom: none; }

    .field-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${color};
      font-weight: 600;
    }

    .field-value {
      font-size: 0.95rem;
      color: #ddd;
      line-height: 1.5;
    }

    /* Mensajes */
    .messages-section {
      background: #16213e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      overflow: hidden;
    }

    .messages-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #2a2a4a;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #888;
    }

    .messages-body {
      padding: 0.5rem 0;
    }

    .message {
      padding: 0.75rem 1.5rem;
      transition: background 0.15s;
    }

    .message:hover { background: #1e2a4a22; }

    .message-header {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 0.3rem;
    }

    .author {
      font-weight: 700;
      color: ${color};
      font-size: 0.95rem;
    }

    .timestamp {
      font-size: 0.75rem;
      color: #666;
    }

    .content {
      font-size: 0.92rem;
      color: #ccc;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .attachments {
      margin-top: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .attachment-img {
      max-width: 300px;
      max-height: 200px;
      border-radius: 8px;
      border: 1px solid #2a2a4a;
      object-fit: cover;
    }

    .attachment-link {
      color: ${color};
      text-decoration: none;
      font-size: 0.85rem;
      padding: 0.3rem 0.8rem;
      border: 1px solid ${color}66;
      border-radius: 6px;
    }

    .attachment-link:hover { background: ${color}22; }

    .no-messages {
      padding: 2rem 1.5rem;
      color: #666;
      font-style: italic;
      text-align: center;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 1.5rem 0 0;
      font-size: 0.78rem;
      color: #555;
    }

    .footer span { color: ${color}; }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <div class="header-accent"></div>
      <div class="header-info">
        <div class="category">${categoryName}</div>
        <h1>Ticket #${ticket.number}</h1>
        <div class="header-meta">
          <div class="meta-item">
            <span class="meta-label">Canal</span>
            <span class="meta-value">#${escapeHtml(channelName)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Abierto</span>
            <span class="meta-value">${formatDate(ticket.createdAt)}</span>
          </div>
          ${ticket.closedAt ? `
          <div class="meta-item">
            <span class="meta-label">Cerrado</span>
            <span class="meta-value">${formatDate(ticket.closedAt)}</span>
          </div>` : ""}
          ${ticket.claimedBy ? `
          <div class="meta-item">
            <span class="meta-label">Atendido por</span>
            <span class="meta-value">${escapeHtml(ticket.claimedBy)}</span>
          </div>` : ""}
          <div class="meta-item">
            <span class="meta-label">Mensajes</span>
            <span class="meta-value">${messages.length}</span>
          </div>
        </div>
      </div>
    </div>

    ${extraFieldsHtml ? `
    <div class="fields-section">
      <h2>Información del ticket</h2>
      ${extraFieldsHtml}
    </div>` : ""}

    <div class="messages-section">
      <div class="messages-header">Mensajes (${messages.length})</div>
      <div class="messages-body">
        ${messagesHtml}
      </div>
    </div>

    <div class="footer">
      Transcript generado por <span>CORE</span> • ${formatDate(Date.now())}
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = { generateTranscript };