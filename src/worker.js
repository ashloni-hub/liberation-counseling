const REQUIRED_FIELDS = ['name', 'email', 'phone', 'preferred', 'message'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, ctx) {
  const origin = new URL(request.url).origin;
  // Cloudflare's default html_handling strips .html from requests, so redirect
  // straight to the canonical extensionless path and skip the extra hop.
  const errorRedirect = Response.redirect(`${origin}/contact?error=1#reach`, 302);
  const successRedirect = Response.redirect(`${origin}/thank-you`, 302);

  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('Contact form: failed to parse form data', err);
    return errorRedirect;
  }

  // Honeypot: bots fill this hidden field, real visitors never see it.
  const honeypot = (formData.get('website') || '').toString().trim();
  if (honeypot !== '') {
    console.error('Contact form: honeypot triggered, silently discarding');
    return successRedirect;
  }

  const turnstileToken = formData.get('cf-turnstile-response');
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('Contact form: TURNSTILE_SECRET_KEY is not set');
    return errorRedirect;
  }
  if (!turnstileToken) {
    console.error('Contact form: missing Turnstile token');
    return errorRedirect;
  }

  const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, request);
  if (!turnstileOk) {
    console.error('Contact form: Turnstile verification failed');
    return errorRedirect;
  }

  const fields = {};
  for (const field of REQUIRED_FIELDS) {
    const value = (formData.get(field) || '').toString().trim();
    if (!value) {
      console.error(`Contact form: missing required field "${field}"`);
      return errorRedirect;
    }
    fields[field] = value;
  }

  if (!env.RESEND_API_KEY) {
    console.error('Contact form: RESEND_API_KEY is not set');
    return errorRedirect;
  }
  if (!env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    console.error('Contact form: CONTACT_TO_EMAIL or CONTACT_FROM_EMAIL is not set');
    return errorRedirect;
  }

  const notifyResult = await sendEmail(env, {
    to: env.CONTACT_TO_EMAIL,
    from: env.CONTACT_FROM_EMAIL,
    reply_to: fields.email,
    subject: `New inquiry from ${fields.name}`,
    text: [
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      `Phone: ${fields.phone}`,
      `Preferred contact method: ${fields.preferred}`,
      '',
      'Reason for reaching out:',
      fields.message,
    ].join('\n'),
  });

  if (!notifyResult.ok) {
    console.error('Contact form: Resend notification email failed', notifyResult.error);
    return errorRedirect;
  }

  ctx.waitUntil(
    sendEmail(env, {
      to: fields.email,
      from: env.CONTACT_FROM_EMAIL,
      subject: 'We received your message - Liberation Counseling & Consultation',
      text: `Hi ${fields.name},\n\nThank you for reaching out to Liberation Counseling & Consultation. I will follow up by the next business day.\n\nIf this is a crisis, please call or text 988, call 911, or go to the nearest emergency room.\n\n- Dr. Chris Coleman`,
    }).then((result) => {
      if (!result.ok) {
        console.error('Contact form: Resend auto-reply email failed', result.error);
      }
    })
  );

  return successRedirect;
}

async function verifyTurnstile(token, secretKey, request) {
  try {
    const body = new FormData();
    body.append('secret', secretKey);
    body.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Turnstile rejected token', data['error-codes']);
    }
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verification request failed', err);
    return false;
  }
}

async function sendEmail(env, { to, from, reply_to, subject, text }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from,
        ...(reply_to ? { reply_to } : {}),
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      return { ok: false, error: `Resend API ${res.status}: ${errorBody}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
