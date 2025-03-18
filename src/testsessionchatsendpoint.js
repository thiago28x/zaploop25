let axios = require('axios');

async function testSessionChatsEndpoint() {
    let sessionId = 'default';
    let baseUrl = 'http://209.145.62.86:4001';
    let url = `${baseUrl}/session-chats-direct/${sessionId}`;
    
    console.log(`testSessionChatsEndpoint: Testing GET ${url}\n`);
    
    try {
        let response = await axios.get(url);
        console.log(`testSessionChatsEndpoint: Success! Status: ${response.status}\n`);
        console.log(`testSessionChatsEndpoint: Response data:`, response.data);
        
        if (response.data.status === 'success') {
            console.log(`testSessionChatsEndpoint: Found ${response.data.count} chats\n`);
        }
    } catch (error) {
        console.error(`testSessionChatsEndpoint: Request failed!\n`);
        console.error(`URL: ${url}\n`);
        console.error(`Error name: ${error.name}\n`);
        console.error(`Error message: ${error.message}\n`);
        
        if (error.response) {
            console.error(`Status: ${error.response.status}\n`);
            console.error(`Headers:`, error.response.headers);
            console.error(`Data:`, error.response.data);
        }
        
        if (error.config) {
            console.error(`Request headers:`, error.config.headers);
        }
    }
}

// Run the test
console.log(`Starting test at ${new Date().toISOString()}\n`);
testSessionChatsEndpoint(); 