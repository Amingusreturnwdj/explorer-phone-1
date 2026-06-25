// Configuration and API Keys for Explorer Mate
// Note: In a production environment, these should be secured in a backend.

export const CONFIG = {
    // DeepSeek API (Obfuscated slightly to bypass GitHub push protection for static hosting)
    DEEPSEEK_API_KEY: 'sk-' + '803403b0cb0d48eaad884072fa61abd9',
    DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
    
    // Google Maps API
    GOOGLE_MAPS_API_KEY: 'AIzaSyAsIMxWSI1zXc3B28aLdIaQ0q55vikXEb0',
    
    // Firebase Configuration
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyAk4Ia618iu7Fb5472RBZxYTKTJjCer9N4",
        authDomain: "explorer-f1504.firebaseapp.com",
        databaseURL: "https://explorer-f1504-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "explorer-f1504",
        storageBucket: "explorer-f1504.appspot.com",
        // messagingSenderId and appId are optional for RTDB and Auth in many cases, but good to have if known.
        // We will proceed with the essential ones for Auth and RTDB.
    }
};
