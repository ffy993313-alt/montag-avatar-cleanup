export default {
  async fetch(request, env) {
    // نسمح بس بطلبات POST
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    };

    try {
      const body = await request.json();
      const publicId = body && body.publicId;

      if (!publicId || typeof publicId !== 'string') {
        return new Response(JSON.stringify({ error: 'publicId is required' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // أمان: نتأكد إن الـ publicId بتاع أفاتار بس (avatars/...)
      if (!publicId.startsWith('avatars/')) {
        return new Response(JSON.stringify({ error: 'Invalid publicId' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const apiKey = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      const cloudName = env.CLOUDINARY_CLOUD_NAME;

      if (!apiKey || !apiSecret || !cloudName) {
        return new Response(JSON.stringify({ error: 'Server not configured' }), {
          status: 500,
          headers: corsHeaders
        });
      }

      const timestamp = Math.floor(Date.now() / 1000);

      // Cloudinary بتطلب توقيع (signature) مبني على الباراميترات + الـ secret
      const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      const signature = await sha1(paramsToSign);

      const formData = new URLSearchParams();
      formData.append('public_id', publicId);
      formData.append('timestamp', timestamp);
      formData.append('api_key', apiKey);
      formData.append('signature', signature);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        }
      );

      const data = await cloudinaryRes.json();

      if (data.result !== 'ok' && data.result !== 'not found') {
        return new Response(JSON.stringify({ error: 'Cloudinary deletion failed', details: data }), {
          status: 500,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ success: true, result: data.result }), {
        status: 200,
        headers: corsHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal server error', message: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// دالة حساب SHA1 باستخدام Web Crypto API (متاحة في بيئة Cloudflare Workers)
async function sha1(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
