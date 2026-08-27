const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // نسمح بس بطلبات POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // نسمح بأي origin (تقدر تضيقها بعدين لدومين موقعك بس لو حبيت)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { publicId } = req.body || {};

    if (!publicId || typeof publicId !== 'string') {
      return res.status(400).json({ error: 'publicId is required' });
    }

    // أمان: نتأكد إن الـ publicId بتاع أفاتار بس (avatars/...)
    // عشان محدش يقدر يستخدم الفنكشن دي يمسح حاجة تانية في الحساب
    if (!publicId.startsWith('avatars/')) {
      return res.status(400).json({ error: 'Invalid publicId' });
    }

    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (!apiKey || !apiSecret || !cloudName) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary بتطلب توقيع (signature) مبني على الباراميترات + الـ secret
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

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
      return res.status(500).json({ error: 'Cloudinary deletion failed', details: data });
    }

    return res.status(200).json({ success: true, result: data.result });
  } catch (err) {
    console.error('delete-old-avatar error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
