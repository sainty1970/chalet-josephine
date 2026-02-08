/**
 * Cloudflare Worker: Contact Form Handler
 *
 * Deployment instructions:
 * 1. Go to Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. Name it "chalet-josephine-contact"
 * 3. Paste this code into the editor
 * 4. Add environment variable: TO_EMAIL = your-email@example.com
 * 5. Save and deploy
 * 6. Update WORKER_URL in contact.astro with your worker URL
 *
 * Email delivery uses MailChannels (free on Cloudflare Workers).
 * You may need to add a DNS TXT record for SPF:
 *   Type: TXT, Name: @, Value: v=spf1 a mx include:relay.mailchannels.net ~all
 */

const ALLOWED_ORIGIN = 'https://www.chalet-josephine.com';

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request),
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, request);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400, request);
    }

    // Validate required fields
    const required = ['first_name', 'last_name', 'email', 'arrival_date', 'departure_date', 'guests'];
    for (const field of required) {
      if (!data[field]?.trim()) {
        return jsonResponse({ error: `Missing required field: ${field}` }, 400, request);
      }
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return jsonResponse({ error: 'Invalid email address' }, 400, request);
    }

    const toEmail = env.TO_EMAIL || 'info@chalet-josephine.com';

    // Send email via MailChannels
    const emailResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: toEmail, name: 'Chalet Josephine' }],
          reply_to: { email: data.email, name: `${data.first_name} ${data.last_name}` },
        }],
        from: { email: 'noreply@chalet-josephine.com', name: 'Chalet Josephine Website' },
        subject: `Booking Enquiry: ${data.first_name} ${data.last_name} — ${data.arrival_date} to ${data.departure_date}`,
        content: [{
          type: 'text/html',
          value: buildEmailHtml(data),
        }],
      }),
    });

    if (!emailResponse.ok) {
      console.error('MailChannels error:', await emailResponse.text());
      return jsonResponse({ error: 'Failed to send enquiry. Please try again or contact us directly.' }, 500, request);
    }

    // Send confirmation to guest
    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: data.email, name: `${data.first_name} ${data.last_name}` }] }],
        from: { email: 'noreply@chalet-josephine.com', name: 'Chalet Josephine' },
        subject: 'Thank you for your enquiry — Chalet Josephine',
        content: [{
          type: 'text/html',
          value: buildConfirmationHtml(data),
        }],
      }),
    });

    return jsonResponse({ success: true, message: 'Enquiry received. We will respond within 24 hours.' }, 200, request);
  },
};

function buildEmailHtml(data) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B7355;">New Booking Enquiry</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.first_name} ${data.last_name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${data.email}">${data.email}</a></td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.phone || 'Not provided'}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Arrival:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.arrival_date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Departure:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.departure_date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Guests:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.guests}</td></tr>
        <tr><td style="padding: 8px;" valign="top"><strong>Message:</strong></td><td style="padding: 8px;">${data.message || 'No message provided'}</td></tr>
      </table>
    </div>
  `;
}

function buildConfirmationHtml(data) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B7355;">Thank You, ${data.first_name}!</h2>
      <p>We have received your enquiry for Chalet Josephine and will be in touch within 24 hours.</p>
      <h3>Your Enquiry Details:</h3>
      <ul>
        <li><strong>Arrival:</strong> ${data.arrival_date}</li>
        <li><strong>Departure:</strong> ${data.departure_date}</li>
        <li><strong>Guests:</strong> ${data.guests}</li>
      </ul>
      <p>If you have any urgent questions, please contact us at <a href="mailto:info@chalet-josephine.com">info@chalet-josephine.com</a>.</p>
      <p>Warm regards,<br>The Chalet Josephine Team<br>Managed by Chamonix Prestige</p>
    </div>
  `;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith('.chalet-josephine.com');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
