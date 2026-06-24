import { CONFIG } from './config.js';
import { t, currentLang } from './i18n.js';

let chatHistory = [
    { role: "system", content: t('ai_system_prompt') }
];

let aiContextState = {
    address: "ไม่ระบุตำแหน่ง",
    lat: null,
    lng: null,
    nearbyPlaces: [],
    customPlaces: []
};

export function updateAIContextLocation(address, lat, lng) {
    aiContextState.address = address;
    aiContextState.lat = lat;
    aiContextState.lng = lng;
    rebuildSystemPrompt();
}

export function updateAIContextPlaces(places) {
    aiContextState.nearbyPlaces = places.map(p => ({
        name: p.name,
        rating: p.rating || "ไม่มี"
    }));
    rebuildSystemPrompt();
}

export function updateAIContextCustomPlaces(places) {
    aiContextState.customPlaces = places.map(p => ({
        name: p.name,
        description: p.description || "ไม่มีรายละเอียด"
    }));
    rebuildSystemPrompt();
}

function rebuildSystemPrompt() {
    let context = `\n\n[System Data / ข้อมูลระบบ]:\n`;
    if (aiContextState.lat !== null) {
        context += `- Location / ตำแหน่งปัจจุบัน: "${aiContextState.address}" (Lat: ${aiContextState.lat}, Lng: ${aiContextState.lng})\n`;
    }
    
    context += `- Nearby places (Google Maps) / สถานที่รอบๆ:\n`;
    if (aiContextState.nearbyPlaces.length > 0) {
        aiContextState.nearbyPlaces.slice(0, 10).forEach((p, i) => {
            context += `  ${i+1}. ${p.name} (Rating: ${p.rating})\n`;
        });
    } else {
        context += `  (No data / กำลังค้นหา)\n`;
    }

    if (aiContextState.customPlaces.length > 0) {
        context += `- Local database places / สถานที่แนะนำพิเศษ:\n`;
        aiContextState.customPlaces.slice(0, 10).forEach((p, i) => {
            context += `  * ${p.name} (Detail: ${p.description})\n`;
        });
    }

    const pathumThaniBusData = `
[Pathum Thani Bus Routes / ข้อมูลสายรถเมล์ในปทุมธานี (รังสิต-ปทุมฯ)]:
- สาย 1138: รังสิต - ปทุมธานี (ผ่าน: ตลาดรังสิต, แฟลตปลาทอง, แยกบางพูน, รพ.เซนต์คาร์ลอส, ตลาดพูนทรัพย์, ม.ปทุมธานี, ตัวเมืองปทุมธานี)
- สาย 29, 510: มธ.รังสิต - อนุสาวรีย์ชัยฯ (ผ่าน: มธ.รังสิต, ม.กรุงเทพ, ฟิวเจอร์พาร์ค, ถ.วิภาวดีรังสิต)
- สาย 39, 520, 522: รังสิต - กรุงเทพ (ผ่าน: ถ.พหลโยธิน, เซียร์รังสิต, ม.รังสิตปากทาง)
- สาย 538: มทร.ธัญบุรี - อนุสาวรีย์ชัยฯ (ผ่าน: เส้นธัญบุรี คลอง 1-6, ดรีมเวิลด์, โทลล์เวย์)
- สาย 338: รังสิต - นวนคร (ผ่าน: ม.กรุงเทพ, มธ.รังสิต, นวนคร)
- สาย 680: รังสิต - บางใหญ่ (ผ่าน: ซ่อมสร้าง, บางกะดี, ข้ามแม่น้ำเจ้าพระยา)
- สาย 6250: รังสิต - คลอง 8 ลำลูกกา (ผ่าน: ถนนลำลูกกา)
* คำสั่งเพิ่มเติม 1: หากผู้ใช้ถามถึงการเดินทาง ให้ประเมินระยะทางและนำเสนอวิธีเดินทาง (รถเมล์/รถตู้) ที่ดีที่สุดและตอบโจทย์ที่สุด เป็นลำดับ 1, 2, 3... ก่อนเท่านั้น โดยอธิบายสั้นๆ ว่าทำไมถึงดีและเร็วที่สุด
* คำสั่งเพิ่มเติม 2: **สำคัญมาก** เมื่อคุณอธิบายเส้นทางเสร็จแล้ว ให้คุณพิมพ์แท็กบรรทัดสุดท้ายแบบนี้เป๊ะๆ: \`[ROUTE: ชื่อสถานที่ปลายทาง]\` (เช่น [ROUTE: ฟิวเจอร์พาร์ค รังสิต]) เพื่อให้ระบบวาดเส้นทางบนแผนที่อัตโนมัติ จากนั้นค่อยทิ้งท้ายว่า "หากต้องการเส้นทางอื่นๆ ถามเพิ่มได้เลยนะ!"
`;
    context += pathumThaniBusData;

    const commandTextEn = `\n**Important Command**: \n1. Recommend places primarily from the list above as they are physically near the user on the map.\n2. If the user asks about a specific place, give tips and atmosphere details. If it's in the list, strongly encourage visiting it.`;
    const commandTextTh = `\n**คำสั่งสำคัญ**: \n1. ให้คุณอ้างอิงรายชื่อสถานที่ด้านบนนี้ในการแนะนำผู้ใช้เป็นหลัก เพราะเป็นสถานที่ที่มีอยู่จริงบนแผนที่รอบๆ ตัวผู้ใช้\n2. หากผู้ใช้ถามถึงสถานที่เจาะจง ให้ข้อมูลบรรยากาศและข้อแนะนำ หากเป็นสถานที่ในรายการข้างต้นให้ชื่นชมและสนับสนุนให้ไป`;

    context += currentLang === 'en' ? commandTextEn : commandTextTh;
    
    chatHistory[0].content = t('ai_system_prompt') + context;
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
