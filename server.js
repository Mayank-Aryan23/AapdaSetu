require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Serve HTML files directly from the CURRENT folder (No 'public' folder needed!)
app.use(express.static(__dirname));

// 2. SECURE PROXY ROUTE: Chatbot (Used in citizen.html)
app.post('/api/ai-chat', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // HIDDEN KEY!
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// At the top of server.js, add this line:
const multer = require('multer');
const upload = multer(); // Keeps the audio file in memory so we don't save it to your disk

// ... (Your other app.post routes are here) ...

// 4. SECURE PROXY ROUTE: Audio Transcription (Used in citizen.html)
app.post('/api/ai-transcribe', upload.single('file'), async (req, res) => {
    try {
        // Build the outgoing form data for OpenAI
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');

        const response = await fetch('https://api.openai.com/v1/audio/translations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // HIDDEN KEY!
            },
            body: formData
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. SECURE PROXY ROUTE: Dispatcher (Used in resource_allocation.html)
app.post('/api/ai-dispatch', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // HIDDEN KEY!
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ AapdaSetu Web Server running on port ${PORT}`);
});
