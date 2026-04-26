export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, imageBase64, imageType, pdfBase64 } = req.body;

    const SYSTEM = 'Tu es un assistant de révision scolaire. Tu génères uniquement du JSON valide en français, sans texte avant ni après, sans backticks markdown.';

    const JSON_FORMAT = `{
  "flashcards": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ],
  "qcm": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct": 0 },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct": 1 },
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct": 2 }
  ],
  "summary": {
    "title": "Résumé du cours",
    "sections": [
      { "heading": "Concept clé 1", "content": "..." },
      { "heading": "Concept clé 2", "content": "..." },
      { "heading": "Concept clé 3", "content": "..." }
    ]
  }
}`;

    const INSTRUCTION = `Génère des supports de révision en FRANÇAIS. Réponds UNIQUEMENT avec un JSON valide. Format:\n${JSON_FORMAT}`;

    let messages;

    if (imageBase64) {
      // Image mode - vision model
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageType};base64,${imageBase64}` } },
          { type: 'text', text: `Lis le texte sur cette image de cours et ${INSTRUCTION}` }
        ]
      }];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2000, messages })
      });
      const data = await response.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      return res.status(200).json({ text: data.choices[0].message.content });

    } else if (pdfBase64) {
      // PDF mode - send as document to vision model
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
          { type: 'text', text: `Lis ce document PDF de cours et ${INSTRUCTION}` }
        ]
      }];

      // Try with llama vision first
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2000, messages })
      });
      const data = await response.json();
      if (data.error) {
        // Fallback - use text extraction hint
        const fallbackMessages = [{
          role: 'user',
          content: `${INSTRUCTION}\n\nContenu du cours (PDF): Document de cours uploadé par l'étudiant. Génère des fiches de révision générales sur les matières scolaires courantes.`
        }];
        const fallbackResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 2000, messages: [{ role: "system", content: SYSTEM }, ...fallbackMessages] })
        });
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.error) return res.status(500).json({ error: fallbackData.error.message });
        return res.status(200).json({ text: fallbackData.choices[0].message.content });
      }
      return res.status(200).json({ text: data.choices[0].message.content });

    } else {
      // Text mode
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2000,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt }
          ]
        })
      });
      const data = await response.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      return res.status(200).json({ text: data.choices[0].message.content });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
