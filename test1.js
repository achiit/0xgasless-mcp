// simple-test.js
const dotenv = require('dotenv');
dotenv.config();

const { getOrCreateAgent } = require('./build/lib/agent.js');

async function main() {
  try {
    console.log('Initializing agent...');
    const privateKey = process.env.PRIVATE_KEY;
    const { agent, config } = await getOrCreateAgent(privateKey);
    
    // Using a simple direct question
    const question = "What is my wallet address?";
    console.log(`\nSending question: "${question}"`);
    
    // Use invoke instead of stream
    const response = await agent.invoke({ input: question }, config);
    
    // Print the entire response for inspection
    console.log('\nCOMPLETE RESPONSE OBJECT:');
    console.log(JSON.stringify(response, null, 2));
    
    // Try to extract the message content
    if (response.messages) {
      console.log('\nMESSAGES:');
      response.messages.forEach((msg, i) => {
        console.log(`Message ${i + 1}:`, JSON.stringify(msg, null, 2));
      });
    }
    
    console.log('\nTest completed');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();