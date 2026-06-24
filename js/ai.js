import { CONFIG } from './config.js';

const BASE_SYSTEM_PROMPT = `คุณคือ "AI Mate" คู่หูนำเที่ยวที่เชี่ยวชาญด้านการแนะนำสถานที่ท่องเที่ยวและร้านอาหาร 
คุณจะคอยให้คำแนะนำเกี่ยวกับสถานที่ต่างๆ ในรูปแบบที่เป็นมิตร สนุกสนาน และกระตือรือร้นเหมือนเพื่อนสนิทพาเที่ยว 
ตอบคำถามสั้นๆ กระชับ เข้าใจง่าย และใช้ภาษาไทยเป็นหลัก 
ถ้าผู้ใช้ถามถึงสถานที่เจาะจง ให้ข้อมูลเกี่ยวกับบรรยากาศ จุดเด่น และข้อแนะนำในการไปเยือน`;

let chatHistory = [
    { role: "system", content: BASE_SYSTEM_PROMPT }
];

export function updateAIContextLocation(address, lat, lng) {
    const locationContext = `\n\n[ข้อมูลระบบ: ขณะนี้ผู้ใช้งานอยู่ที่ตำแหน่ง/บริเวณ "${address}" (Lat: ${lat}, Lng: ${lng}) ให้แนะนำสถานที่บริเวณนี้หากผู้ใช้ถามหาสถานที่ใกล้เคียง]`;
    chatHistory[0].content = BASE_SYSTEM_PROMPT + locationContext;
}

export async function askAI(message, onMessageReceived, onError) {
    // Add user message to history
    chatHistory.push({ role: "user", content: message });

    try {
        const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: chatHistory,
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Failed to fetch response from DeepSeek API");
        }

        const data = await response.json();
        const aiMessage = data.choices[0].message.content;
        
        // Add AI response to history
        chatHistory.push({ role: "assistant", content: aiMessage });
        
        onMessageReceived(aiMessage);
    } catch (error) {
        console.error("AI Error:", error);
        // Remove the failed user message from history so they can retry
        chatHistory.pop();
        if (onError) onError(error.message);
    }
}

export function clearChatHistory() {
    const currentSystemPrompt = chatHistory[0].content;
    chatHistory = [
        { role: "system", content: currentSystemPrompt }
    ];
}
