export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, imageBase64, imageType } = req.body;

    let messages;

    if (imageBase64) {
      // Mode image : on envoie l'image à un modèle vision
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageType};base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: `Tu es un assistant de révision scolaire. Lis le texte sur cette image de cours et génère des supports de révision en FRANÇAIS. Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans backticks. Format:
{
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
    "title": "Resume du cours",
    "sections": [
      { "heading": "Concept cle 1", "content": "..." },
      { "heading": "Concept cle 2", "content": "..." },
      { "heading": "Concept cle 3", "content": "..." }
    ]
  }
}`
            }
          ]
        }
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 2000,
          messages
        })
      });

      const data = await response.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      const text = data.choices[0].message.content;
      return res.status(200).json({ text });

    } else {
      // Mode texte normal
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2000,
          messages: [
            {
              role: 'system',
              content: 'Tu es un assistant de révision scolaire. Tu génères uniquement du JSON valide, sans texte avant ni après, sans backticks markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const data = await response.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      const text = data.choices[0].message.content;
      return res.status(200).json({ text });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

